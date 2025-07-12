import type {
  VanaConfig,
  WalletConfig,
  ChainConfig,
  RuntimeConfig,
  VanaChainId,
} from "./types";
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

/**
 * The core Vana SDK client class that is environment-agnostic.
 * 
 * This class contains all the SDK logic and accepts a platform adapter
 * via its constructor to handle environment-specific operations.
 * 
 * @category Core SDK
 */
export class VanaCore {
  /** Controller for managing data access permissions */
  public readonly permissions: PermissionsController;

  /** Controller for managing user data assets */
  public readonly data: DataController;

  /** Controller for managing server interactions including personal servers and trusted server registry */
  public readonly server: ServerController;

  /** Controller providing low-level access to protocol contracts */
  public readonly protocol: ProtocolController;

  /** Platform adapter for environment-specific operations */
  protected readonly platform: VanaPlatformAdapter;

  private readonly relayerCallbacks?: RelayerCallbacks;
  private readonly storageManager?: StorageManager;

  /**
   * Creates a VanaCore instance from a chain configuration.
   * This is a convenience factory method for users who want to provide
   * chain details directly rather than a pre-configured wallet client.
   *
   * @param config - Chain configuration object
   * @param platform - Platform adapter for environment-specific operations
   * @returns VanaCore instance
   */
  static fromChain(config: ChainConfig, platform: VanaPlatformAdapter): VanaCore {
    return new VanaCore(config, platform);
  }

  /**
   * Creates a VanaCore instance from a wallet client configuration.
   * This is the recommended approach when you already have a configured wallet client.
   *
   * @param config - Wallet client configuration object
   * @param platform - Platform adapter for environment-specific operations
   * @returns VanaCore instance
   */
  static fromWallet(config: WalletConfig, platform: VanaPlatformAdapter): VanaCore {
    return new VanaCore(config, platform);
  }

  /**
   * Creates a new VanaCore client instance.
   *
   * @param config - Configuration object (WalletConfig or ChainConfig)
   * @param platform - Platform adapter for environment-specific operations
   * @throws InvalidConfigurationError if the configuration is invalid
   */
  constructor(config: VanaConfig, platform: VanaPlatformAdapter) {
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
   * Validates the configuration object.
   *
   * @param config - The configuration to validate
   * @throws InvalidConfigurationError if the configuration is invalid
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
   * @returns The chain ID
   */
  get chainId(): number {
    return this.protocol.getChainId();
  }

  /**
   * Gets the current chain name from the wallet client.
   *
   * @returns The chain name
   */
  get chainName(): string {
    return this.protocol.getChainName();
  }

  /**
   * Gets the user's address from the wallet client.
   *
   * @returns Promise resolving to the user's address
   */
  async getUserAddress() {
    const addresses = await this.permissions["getUserAddress"]();
    return addresses;
  }

  /**
   * Gets information about the current configuration.
   *
   * @returns Runtime configuration information
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
}