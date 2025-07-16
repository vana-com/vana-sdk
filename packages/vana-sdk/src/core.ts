import type { VanaConfig, RuntimeConfig, VanaChainId } from "./types";
import { isWalletConfig, isChainConfig, isVanaChainId } from "./types";
import type { RelayerCallbacks } from "./types/config";
import { InvalidConfigurationError } from "./errors";
import {
  PermissionsController,
  ControllerContext,
} from "./controllers/permissions";
import { DataController } from "./controllers/data";
import { ServerController } from "./controllers/server";
import { ProtocolController } from "./controllers/protocol";
import { StorageManager, StorageProvider } from "./storage";
import { createWalletClient, createPublicClient, http } from "viem";
import { chains } from "./config/chains";
import { getChainConfig } from "./chains";
import type { VanaPlatformAdapter } from "./platform/interface";
import { encryptUserData, decryptUserData } from "./utils/encryption";

/**
 * Provides the core SDK functionality for interacting with the Vana network.
 *
 * @remarks
 * This environment-agnostic class contains all SDK logic and accepts a platform
 * adapter to handle environment-specific operations. It initializes all controllers
 * and manages shared context between them.
 *
 * For public usage, use the platform-specific Vana classes that extend this core:
 * - Use `new Vana(config)` from the main package import
 *
 * @example
 * ```typescript
 * // Direct instantiation (typically used internally)
 * const core = new VanaCore({
 *   walletClient: myWalletClient,
 * }, platformAdapter);
 * ```
 *
 * @category Core SDK
 */
export class VanaCore {
  /** Manages gasless data access permissions and trusted server registry. */
  public readonly permissions: PermissionsController;

  /** Handles user data file operations and schema management. */
  public readonly data: DataController;

  /** Provides personal server setup and trusted server interactions. */
  public readonly server: ServerController;

  /** Offers low-level access to Vana protocol smart contracts. */
  public readonly protocol: ProtocolController;

  /** Handles environment-specific operations like encryption and file systems. */
  protected platform: VanaPlatformAdapter;

  private readonly relayerCallbacks?: RelayerCallbacks;
  private readonly storageManager?: StorageManager;

  /**
   * Initializes a new VanaCore client instance with the provided configuration.
   *
   * @remarks
   * The constructor validates the configuration, initializes storage providers if configured,
   * creates wallet and public clients, and sets up all SDK controllers with shared context.
   *
   * @param platform - The platform adapter for environment-specific operations
   * @param config - The configuration object specifying wallet or chain settings
   * @throws {InvalidConfigurationError} When the configuration is invalid or incomplete
   *
   * @example
   * ```typescript
   * // Direct instantiation (consider using factory methods instead)
   * const vanaCore = new VanaCore(platformAdapter, {
   *   walletClient: myWalletClient,
   * });
   * ```
   */
  constructor(platform: VanaPlatformAdapter, config: VanaConfig) {
    // Store the platform adapter
    this.platform = platform;

    // Validate configuration
    this.validateConfig(config);

    // Store relayer callbacks if provided
    this.relayerCallbacks = config.relayerCallbacks;

    // Initialize storage manager if storage providers are provided
    if (config.storage?.providers) {
      this.storageManager = new StorageManager();

      // Register all provided storage providers
      for (const [name, provider] of Object.entries(config.storage.providers)) {
        const isDefault = name === config.storage.defaultProvider;
        this.storageManager.register(
          name,
          provider as StorageProvider,
          isDefault,
        );
      }

      // If no default was explicitly set but providers exist, use the first one
      if (
        !config.storage.defaultProvider &&
        Object.keys(config.storage.providers).length > 0
      ) {
        const firstProviderName = Object.keys(config.storage.providers)[0];
        this.storageManager.setDefaultProvider(firstProviderName);
      }
    }

    // Create wallet client based on configuration type
    let walletClient;

    if (isWalletConfig(config)) {
      // Direct wallet client configuration
      walletClient = config.walletClient;
    } else if (isChainConfig(config)) {
      // Chain configuration - create wallet client
      if (!config.account) {
        throw new InvalidConfigurationError(
          "Account is required when using ChainConfig",
        );
      }

      const chain = chains[config.chainId];
      if (!chain) {
        throw new InvalidConfigurationError(
          `Unsupported chain ID: ${config.chainId}`,
        );
      }

      walletClient = createWalletClient({
        chain,
        transport: http(config.rpcUrl || chain.rpcUrls.default.http[0]),
        account: config.account,
      });
    } else {
      throw new InvalidConfigurationError(
        "Invalid configuration: must be either WalletConfig or ChainConfig",
      );
    }

    // Create public client for reading contracts
    const publicClient = createPublicClient({
      chain: walletClient.chain,
      transport: http(),
    });

    // Get default subgraph URL if not provided in config
    const chainConfig = getChainConfig(walletClient.chain.id);
    const subgraphUrl = config.subgraphUrl || chainConfig?.subgraphUrl;

    // Create shared context for all controllers, now including the platform adapter
    const sharedContext: ControllerContext = {
      walletClient,
      publicClient,
      applicationClient: walletClient, // Using same wallet for now
      relayerCallbacks: this.relayerCallbacks,
      storageManager: this.storageManager,
      subgraphUrl,
      platform: this.platform, // Pass the platform adapter to controllers
    };

    // Initialize controllers
    this.permissions = new PermissionsController(sharedContext);
    this.data = new DataController(sharedContext);
    this.server = new ServerController(sharedContext);
    this.protocol = new ProtocolController(sharedContext);
  }

  /**
   * Validates the provided configuration object against all requirements.
   *
   * @remarks
   * This method performs comprehensive validation of wallet client configuration,
   * chain configuration, storage providers, and relayer callbacks.
   *
   * @param config - The configuration object to validate
   * @throws {InvalidConfigurationError} When any configuration parameter is invalid
   */
  private validateConfig(config: VanaConfig): void {
    if (!config) {
      throw new InvalidConfigurationError("Configuration object is required");
    }

    // Validate relayerCallbacks if provided
    if (config.relayerCallbacks !== undefined) {
      if (typeof config.relayerCallbacks !== "object") {
        throw new InvalidConfigurationError(
          "relayerCallbacks must be an object",
        );
      }
    }

    // Validate storage configuration if provided
    if (config.storage?.providers) {
      if (typeof config.storage.providers !== "object") {
        throw new InvalidConfigurationError(
          "storage.providers must be an object",
        );
      }

      // Validate that all providers have required methods
      for (const [name, provider] of Object.entries(config.storage.providers)) {
        if (!provider || typeof provider !== "object") {
          throw new InvalidConfigurationError(
            `Storage provider '${name}' must be a valid StorageProvider object`,
          );
        }
      }

      // Validate default provider if specified
      if (config.storage.defaultProvider) {
        if (!(config.storage.defaultProvider in config.storage.providers)) {
          throw new InvalidConfigurationError(
            `Default storage provider '${config.storage.defaultProvider}' not found in providers`,
          );
        }
      }
    }

    if (isWalletConfig(config)) {
      // Validate WalletConfig
      if (!config.walletClient) {
        throw new InvalidConfigurationError("walletClient is required");
      }

      // Validate that walletClient is actually a WalletClient
      if (
        typeof config.walletClient !== "object" ||
        !config.walletClient.signTypedData
      ) {
        throw new InvalidConfigurationError(
          "walletClient must be a valid viem WalletClient",
        );
      }

      // Validate that wallet client has a chain
      if (!config.walletClient.chain) {
        throw new InvalidConfigurationError(
          "walletClient must have a chain configured",
        );
      }

      // Validate that the chain is supported
      if (!isVanaChainId(config.walletClient.chain.id)) {
        throw new InvalidConfigurationError(
          `Unsupported chain ID: ${config.walletClient.chain.id}. Supported chains: 14800 (Moksha testnet), 1480 (Vana mainnet)`,
        );
      }
    } else if (isChainConfig(config)) {
      // Validate ChainConfig
      if (!isVanaChainId(config.chainId)) {
        throw new InvalidConfigurationError(
          `Unsupported chain ID: ${config.chainId}. Supported chains: 14800 (Moksha testnet), 1480 (Vana mainnet)`,
        );
      }

      // Validate rpcUrl if provided
      if (config.rpcUrl) {
        if (typeof config.rpcUrl !== "string") {
          throw new InvalidConfigurationError("rpcUrl must be a string");
        }

        if (config.rpcUrl.trim() === "") {
          throw new InvalidConfigurationError("rpcUrl cannot be empty");
        }

        // Basic URL validation for RPC URL
        try {
          new URL(config.rpcUrl);
        } catch {
          throw new InvalidConfigurationError("rpcUrl must be a valid URL");
        }
      }

      // Account is optional for ChainConfig, but if provided, validate it
      if (config.account) {
        if (typeof config.account !== "object" || !config.account.address) {
          throw new InvalidConfigurationError(
            "account must be a valid viem Account object",
          );
        }
      }
    } else {
      throw new InvalidConfigurationError(
        "Configuration must be either WalletConfig or ChainConfig",
      );
    }
  }

  /**
   * Gets the current chain ID from the wallet client.
   *
   * @returns The numeric chain ID of the connected network
   *
   * @example
   * ```typescript
   * const chainId = vana.chainId;
   * console.log(`Connected to chain: ${chainId}`); // e.g., "Connected to chain: 14800"
   * ```
   */
  get chainId(): number {
    return this.protocol.getChainId();
  }

  /**
   * Gets the current chain name from the wallet client.
   *
   * @returns The human-readable name of the connected network
   *
   * @example
   * ```typescript
   * const chainName = vana.chainName;
   * console.log(`Connected to: ${chainName}`); // e.g., "Connected to: Moksha Testnet"
   * ```
   */
  get chainName(): string {
    return this.protocol.getChainName();
  }

  /**
   * Retrieves the user's wallet address from the connected client.
   *
   * @returns A Promise that resolves to the user's Ethereum address
   *
   * @example
   * ```typescript
   * const address = await vana.getUserAddress();
   * console.log(`User address: ${address}`); // e.g., "User address: 0x742d35..."
   * ```
   */
  async getUserAddress() {
    const addresses = await this.permissions["getUserAddress"]();
    return addresses;
  }

  /**
   * Retrieves comprehensive runtime configuration information.
   *
   * @returns The current runtime configuration including chain, storage, and relayer settings
   *
   * @example
   * ```typescript
   * const config = vana.getConfig();
   * console.log(`Chain: ${config.chainName} (${config.chainId})`);
   * console.log(`Storage providers: ${config.storageProviders.join(", ")}`);
   * ```
   */
  getConfig(): RuntimeConfig {
    return {
      chainId: this.chainId as VanaChainId,
      chainName: this.chainName,
      relayerCallbacks: this.relayerCallbacks,
      storageProviders: this.storageManager?.getStorageProviders() || [],
      defaultStorageProvider: this.storageManager?.getDefaultStorageProvider(),
    };
  }

  /**
   * Sets the platform adapter for environment-specific operations.
   * This is useful for testing and advanced use cases where you need
   * to override the default platform detection.
   *
   * @param adapter - The platform adapter to use
   *
   * @example
   * ```typescript
   * // For testing with a mock adapter
   * const mockAdapter = new MockPlatformAdapter();
   * vana.setPlatformAdapter(mockAdapter);
   * 
   * // For advanced use cases with custom adapters
   * const customAdapter = new CustomPlatformAdapter();
   * vana.setPlatformAdapter(customAdapter);
   * ```
   */
  setPlatformAdapter(adapter: VanaPlatformAdapter): void {
    this.platform = adapter;
    
    // Note: Controllers will use the new platform adapter on their next operation
    // since they access this.platform from the shared context
  }

  /**
   * Gets the current platform adapter.
   * This is useful for advanced use cases where you need to access
   * the platform adapter directly.
   *
   * @returns The current platform adapter
   *
   * @example
   * ```typescript
   * const adapter = vana.getPlatformAdapter();
   * const encrypted = await adapter.encrypt(data, key);
   * ```
   */
  getPlatformAdapter(): VanaPlatformAdapter {
    return this.platform;
  }

  /**
   * Encrypts user data using the Vana protocol standard encryption.
   * This method automatically uses the correct platform adapter for the current environment.
   *
   * @param data The data to encrypt (string or Blob)
   * @param walletSignature The wallet signature to use as encryption key
   * @returns The encrypted data as Blob
   *
   * @example
   * ```typescript
   * const encryptionKey = await generateEncryptionKey(walletClient);
   * const encrypted = await vana.encryptUserData("sensitive data", encryptionKey);
   * ```
   */
  public async encryptUserData(data: string | Blob, walletSignature: string): Promise<Blob> {
    return encryptUserData(data, walletSignature, this.platform);
  }

  /**
   * Decrypts user data using the Vana protocol standard decryption.
   * This method automatically uses the correct platform adapter for the current environment.
   *
   * @param encryptedData The encrypted data (string or Blob)
   * @param walletSignature The wallet signature to use as decryption key
   * @returns The decrypted data as Blob
   *
   * @example
   * ```typescript
   * const encryptionKey = await generateEncryptionKey(walletClient);
   * const decrypted = await vana.decryptUserData(encryptedData, encryptionKey);
   * const text = await decrypted.text();
   * ```
   */
  public async decryptUserData(encryptedData: string | Blob, walletSignature: string): Promise<Blob> {
    return decryptUserData(encryptedData, walletSignature, this.platform);
  }
}
