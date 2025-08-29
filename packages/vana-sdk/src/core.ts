import type {
  VanaConfig,
  VanaConfigWithStorage,
  RuntimeConfig,
  VanaChainId,
  StorageRequiredMarker,
} from "./types";
import {
  isWalletConfig,
  isChainConfig,
  isReadOnlyConfig,
  isAddressOnlyConfig,
  isVanaChainId,
  hasStorageConfig,
} from "./types";
import type { DownloadRelayerCallbacks } from "./types/config";
import type {
  RelayerConfig,
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
} from "./types/relayer";
import { InvalidConfigurationError } from "./errors";
import type { ControllerContext } from "./controllers/permissions";
import { PermissionsController } from "./controllers/permissions";
import { DataController } from "./controllers/data";
import { SchemaController } from "./controllers/schemas";
import { ServerController } from "./controllers/server";
import { ProtocolController } from "./controllers/protocol";
import { StorageManager } from "./storage";
import { createWalletClient, createPublicClient, http } from "viem";
import type {
  PublicClient,
  WalletClient,
  Address,
  Hash,
  TransactionReceipt,
  Chain,
} from "viem";
import { extractAddress } from "./utils/wallet";
import type {
  Operation,
  PollingOptions,
  TransactionResult,
  TransactionWaitOptions,
} from "./types/operations";
import type {
  Contract,
  Fn,
  TypedTransactionResult,
} from "./generated/event-types";
import { chains } from "./config/chains";
import { getChainConfig, vanaMainnet } from "./chains";
import type { VanaPlatformAdapter } from "./platform/interface";
import {
  encryptBlobWithSignedKey,
  decryptBlobWithSignedKey,
} from "./utils/encryption";

/**
 * Factory functions for creating VanaCore instances with proper type safety
 */
export class VanaCoreFactory {
  /**
   * Creates a VanaCore instance that enforces storage requirements at compile time.
   * Use this factory when you know you'll need storage-dependent operations.
   *
   * @param platform - The platform adapter for environment-specific operations
   * @param config - Configuration that includes required storage providers
   * @returns VanaCore instance with storage validation
   * @example
   * ```typescript
   * const vanaCore = VanaCoreFactory.createWithStorage(platformAdapter, {
   *   walletClient: myWalletClient,
   *   storage: {
   *     providers: { ipfs: new IPFSStorage() },
   *     defaultProvider: 'ipfs'
   *   }
   * });
   * ```
   */
  static createWithStorage(
    platform: VanaPlatformAdapter,
    config: VanaConfigWithStorage,
  ): VanaCore & StorageRequiredMarker {
    const core = new VanaCore(platform, config);
    return core as VanaCore & StorageRequiredMarker;
  }

  /**
   * Creates a VanaCore instance without storage requirements.
   * Storage-dependent operations will fail at runtime if not configured.
   *
   * @param platform - The platform adapter for environment-specific operations
   * @param config - Basic configuration without required storage
   * @returns VanaCore instance
   * @example
   * ```typescript
   * const vanaCore = VanaCoreFactory.create(platformAdapter, {
   *   walletClient: myWalletClient
   * });
   * ```
   */
  static create(platform: VanaPlatformAdapter, config: VanaConfig): VanaCore {
    return new VanaCore(platform, config);
  }
}

/**
 * Provides the core SDK functionality for interacting with the Vana network.
 *
 * @remarks
 * This environment-agnostic class contains all SDK logic and accepts a platform
 * adapter to handle environment-specific operations. It initializes all controllers
 * and manages shared context between them, providing a unified interface for
 * data management, permissions, smart contracts, and storage operations.
 *
 * The class uses TypeScript overloading to enforce storage requirements at compile time.
 * Methods that require storage will throw `InvalidConfigurationError` at runtime if
 * storage providers are not configured, implementing a fail-fast approach to prevent
 * errors during expensive operations.
 *
 * **Core Architecture:**
 * - **Controllers**: Specialized modules for different Vana features (data, permissions, etc.)
 * - **Platform Adapters**: Environment-specific implementations (browser vs Node.js)
 * - **Storage Managers**: Abstraction layer for multiple storage providers
 * - **Context Sharing**: Unified configuration and services across all controllers
 *
 * For public usage, use the platform-specific factory functions:
 * - Browser: `import { Vana } from '@opendatalabs/vana-sdk/browser'`
 * - Node.js: `import { Vana } from '@opendatalabs/vana-sdk/node'`
 *
 * @example
 * ```typescript
 * // Direct instantiation (advanced usage)
 * import { VanaCore, BrowserPlatformAdapter } from '@opendatalabs/vana-sdk/browser';
 *
 * const core = new VanaCore(new BrowserPlatformAdapter(), {
 *   walletClient: myWalletClient,
 *   storage: {
 *     providers: { ipfs: new IPFSStorage() },
 *     defaultProvider: 'ipfs'
 *   }
 * });
 *
 * // Access all controllers
 * const files = await core.data.getUserFiles();
 * const permissions = await core.permissions.grant({
 *   grantee: '0x742d35...',
 *   operation: 'read'
 * });
 * ```
 * @category Core SDK
 */
export class VanaCore {
  /** Manages gasless data access permissions and trusted server registry. */
  public readonly permissions: PermissionsController;

  /** Handles user data file operations. */
  public readonly data: DataController;

  /** Manages data schemas and refiners. */
  public readonly schemas: SchemaController;

  /** Provides personal server setup and trusted server interactions. */
  public readonly server: ServerController;

  /** Offers low-level access to Vana protocol smart contracts. */
  public readonly protocol: ProtocolController;

  /** Handles environment-specific operations like encryption and file systems. */
  protected platform: VanaPlatformAdapter;

  private readonly relayerConfig?: RelayerConfig;
  private readonly relayerCallback?: (
    request: UnifiedRelayerRequest,
  ) => Promise<UnifiedRelayerResponse>;
  private readonly downloadRelayer?: DownloadRelayerCallbacks;
  private readonly storageManager?: StorageManager;
  private readonly hasRequiredStorage: boolean;
  private readonly ipfsGateways?: string[];
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly _staticUserAddress?: Address; // For read-only mode

  /**
   * Initializes a new VanaCore client instance with the provided configuration.
   *
   * @remarks
   * The constructor validates the configuration, initializes storage providers if configured,
   * creates wallet and public clients, and sets up all SDK controllers with shared context.
   *
   * IMPORTANT: This constructor will validate storage requirements at runtime to fail fast.
   * Methods that require storage will throw runtime errors if storage is not configured.
   *
   * @param platform - The platform adapter for environment-specific operations
   * @param config - The configuration object specifying wallet or chain settings
   * @throws {InvalidConfigurationError} When the configuration is invalid or incomplete
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

    // Store relayer config and set up callback
    this.relayerConfig = config.relayer;
    if (config.relayer) {
      // Validate relayer type
      if (
        typeof config.relayer !== "string" &&
        typeof config.relayer !== "function"
      ) {
        throw new InvalidConfigurationError(
          "Relayer must be either a URL string or a callback function",
        );
      }

      if (typeof config.relayer === "string") {
        // Convenience: URL string - create HTTP transport
        const url = config.relayer;
        this.relayerCallback = async (request: UnifiedRelayerRequest) => {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });
          if (!response.ok) {
            throw new Error(`Relayer request failed: ${response.statusText}`);
          }
          return response.json();
        };
      } else {
        // Direct callback function
        this.relayerCallback = config.relayer;
      }
    }

    // Store download relayer if provided
    this.downloadRelayer = config.downloadRelayer;

    // Store IPFS gateways if provided
    this.ipfsGateways = config.ipfsGateways;

    // Check if storage is properly configured
    this.hasRequiredStorage = hasStorageConfig(config);

    // Initialize storage manager if storage providers are provided
    if (config.storage?.providers) {
      this.storageManager = new StorageManager();

      // Register all provided storage providers
      for (const [name, provider] of Object.entries(config.storage.providers)) {
        const isDefault = name === config.storage.defaultProvider;
        this.storageManager.register(name, provider, isDefault);
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

    // Initialize clients based on configuration type
    let walletClient: WalletClient | undefined;
    let publicClient: PublicClient;
    let staticUserAddress: Address | undefined; // Only for read-only mode
    let chainToUse: Chain;

    if (isWalletConfig(config)) {
      // Full mode with wallet client
      walletClient = config.walletClient;
      chainToUse = (walletClient.chain as Chain) ?? vanaMainnet;

      // In wallet mode, address is dynamic (not stored)
      staticUserAddress = undefined;

      // Use provided publicClient or create one
      if ("publicClient" in config && config.publicClient) {
        publicClient = config.publicClient;
      } else {
        publicClient = createPublicClient({
          chain: chainToUse,
          transport: http(),
        });
      }
    } else if (isReadOnlyConfig(config)) {
      // Read-only mode with public client and address
      walletClient = undefined;
      publicClient = config.publicClient;
      staticUserAddress = config.address;
      chainToUse = config.publicClient.chain ?? vanaMainnet;
    } else if (isAddressOnlyConfig(config)) {
      // Read-only mode with just address (create public client)
      walletClient = undefined;
      staticUserAddress = config.address;
      chainToUse = config.chain ?? vanaMainnet;

      publicClient = createPublicClient({
        chain: chainToUse,
        transport: http(),
      });
    } else if (isChainConfig(config)) {
      // Legacy chain configuration - create wallet client
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

      chainToUse = chain;
      walletClient = createWalletClient({
        chain,
        transport: http(config.rpcUrl ?? chain.rpcUrls.default.http[0]),
        account: config.account,
      });
      // In wallet mode, address is dynamic (not stored)
      staticUserAddress = undefined;
      publicClient = createPublicClient({
        chain,
        transport: http(),
      });
    } else {
      throw new InvalidConfigurationError(
        "Invalid configuration: must provide either walletClient, publicClient + address, or address alone",
      );
    }

    // Store the clients and static address for later use
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this._staticUserAddress = staticUserAddress;

    // Get default service URLs from chain config if not provided
    const chainConfig = getChainConfig(chainToUse.id);
    const subgraphUrl = config.subgraphUrl ?? chainConfig?.subgraphUrl;
    const personalServerUrl =
      config.defaultPersonalServerUrl ?? chainConfig?.personalServerUrl;

    // Create shared context for all controllers with dynamic userAddress getter
    const self = this; // Capture VanaCore instance for getter delegation
    const sharedContext: ControllerContext = {
      walletClient,
      publicClient,
      get userAddress() {
        // Delegate to VanaCore's getter for dynamic resolution
        return self.userAddress;
      },
      applicationClient: walletClient, // Using same wallet for now
      relayer: this.relayerCallback,
      downloadRelayer: this.downloadRelayer,
      storageManager: this.storageManager,
      subgraphUrl,
      platform: this.platform, // Pass the platform adapter to controllers
      validateStorageRequired: this.validateStorageRequired.bind(this),
      hasStorage: this.hasStorage.bind(this),
      ipfsGateways: this.ipfsGateways,
      defaultPersonalServerUrl: personalServerUrl,
      waitForTransactionEvents: this.waitForTransactionEvents.bind(this),
      waitForOperation: this.waitForOperation.bind(this),
    };

    // Initialize controllers
    this.permissions = new PermissionsController(sharedContext);
    this.data = new DataController(sharedContext);
    this.schemas = new SchemaController(sharedContext);
    this.server = new ServerController(sharedContext);
    this.protocol = new ProtocolController(sharedContext);
  }

  /**
   * Validates that storage is available for storage-dependent operations.
   * This method enforces the fail-fast principle by checking storage availability
   * at method call time rather than during expensive operations.
   *
   * @throws {InvalidConfigurationError} When storage is required but not configured
   * @example
   * ```typescript
   * // This will throw if storage is not configured
   * vana.validateStorageRequired();
   * await vana.data.uploadFile(file); // Safe to proceed
   * ```
   */
  public validateStorageRequired(): void {
    if (!this.hasRequiredStorage) {
      throw new InvalidConfigurationError(
        "Storage configuration is required for this operation. " +
          "Please configure storage providers in VanaConfig.storage, " +
          "provide a relayer configuration, " +
          "or pass pre-stored URLs to avoid this dependency. " +
          "\n\nFor better type safety, consider using VanaCoreFactory.createWithStorage() " +
          "with VanaConfigWithStorage to catch this error at compile time.",
      );
    }
  }

  /**
   * Checks whether storage is configured without throwing an error.
   *
   * @returns True if storage is properly configured
   * @example
   * ```typescript
   * if (vana.hasStorage()) {
   *   await vana.data.uploadFile(file);
   * } else {
   *   console.warn('Storage not configured - using pre-stored URLs only');
   * }
   * ```
   */
  public hasStorage(): boolean {
    return this.hasRequiredStorage;
  }

  /**
   * Type guard to check if this instance has storage enabled at compile time.
   * Use this when you need TypeScript to understand that storage is available.
   *
   * @returns True if storage is configured, with type narrowing
   * @example
   * ```typescript
   * if (vana.isStorageEnabled()) {
   *   // TypeScript knows storage is available here
   *   await vana.data.uploadFile(file);
   * }
   * ```
   */
  public isStorageEnabled(): this is VanaCore & StorageRequiredMarker {
    return this.hasRequiredStorage;
  }

  /**
   * Validates the provided configuration object against all requirements.
   *
   * @remarks
   * This method performs comprehensive validation of wallet client configuration,
   * chain configuration, storage providers, and relayer callbacks.
   * @param config - The configuration object to validate
   * @throws {InvalidConfigurationError} When any configuration parameter is invalid
   */
  private validateConfig(config: VanaConfig): void {
    if (!config) {
      throw new InvalidConfigurationError("Configuration object is required");
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
          `Unsupported chain ID: ${String(config.walletClient.chain.id)}. Supported chains: 14800 (Moksha testnet), 1480 (Vana mainnet)`,
        );
      }
    } else if (isChainConfig(config)) {
      // Validate ChainConfig
      if (!isVanaChainId(config.chainId)) {
        throw new InvalidConfigurationError(
          `Unsupported chain ID: ${String(config.chainId)}. Supported chains: 14800 (Moksha testnet), 1480 (Vana mainnet)`,
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
    } else if (isReadOnlyConfig(config)) {
      // Validate read-only config with publicClient and address
      if (!config.publicClient) {
        throw new InvalidConfigurationError(
          "publicClient is required for read-only configuration",
        );
      }
      if (!config.address) {
        throw new InvalidConfigurationError(
          "address is required for read-only configuration",
        );
      }
    } else if (isAddressOnlyConfig(config)) {
      // Validate address-only config
      if (!config.address) {
        throw new InvalidConfigurationError(
          "address is required for address-only configuration",
        );
      }
      // chain is optional, will use default
    } else {
      throw new InvalidConfigurationError(
        "Invalid configuration: must provide either walletClient, publicClient + address, or address alone",
      );
    }
  }

  /**
   * Gets the current chain ID from the wallet client.
   *
   * @returns The numeric chain ID of the connected network
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
   * The user's wallet address.
   * In wallet mode, this always returns the current wallet account address.
   * In read-only mode, this returns the static address provided during initialization.
   *
   * @example
   * ```typescript
   * const address = vana.userAddress;
   * console.log(`User address: ${address}`); // e.g., "User address: 0x742d35..."
   * ```
   */
  get userAddress(): Address {
    // In wallet mode: dynamically read from wallet
    if (this.walletClient?.account) {
      return extractAddress(this.walletClient.account);
    }

    // In read-only mode: use static address
    if (this._staticUserAddress) {
      return this._staticUserAddress;
    }

    throw new Error("No user address available");
  }

  /**
   * Retrieves comprehensive runtime configuration information.
   *
   * @returns The current runtime configuration including chain, storage, and relayer settings
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
      relayerConfig: this.relayerConfig,
      storageProviders: this.storageManager?.getStorageProviders() ?? [],
      defaultStorageProvider: this.storageManager?.getDefaultStorageProvider(),
    };
  }

  /**
   * Sets the platform adapter for environment-specific operations.
   * This is useful for testing and advanced use cases where you need
   * to override the default platform detection.
   *
   * @param adapter - The platform adapter to use
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
   * Encrypts data using the Vana protocol standard encryption.
   *
   * @remarks
   * This method implements the Vana network's standard encryption protocol using
   * platform-appropriate cryptographic libraries. It automatically handles different
   * input types (string or Blob) and produces encrypted output suitable for secure
   * storage or transmission. The encryption is compatible with the network's
   * decryption protocols and can be decrypted by authorized parties.
   *
   * @param data - The data to encrypt (string or Blob)
   * @param key - The encryption key (typically generated via `generateEncryptionKey`)
   * @returns The encrypted data as a Blob
   * @throws {Error} When encryption fails due to invalid key or data format
   * @example
   * ```typescript
   * import { generateEncryptionKey } from '@opendatalabs/vana-sdk/node';
   *
   * // Generate encryption key from wallet signature
   * const encryptionKey = await generateEncryptionKey(vana.walletClient);
   *
   * // Encrypt string data
   * const sensitiveData = "User's private information";
   * const encrypted = await vana.encryptBlob(sensitiveData, encryptionKey);
   *
   * // Encrypt file data
   * const fileBlob = new Blob([fileContent], { type: 'application/json' });
   * const encryptedFile = await vana.encryptBlob(fileBlob, encryptionKey);
   *
   * // Store encrypted data safely
   * await storageProvider.upload(encrypted, 'encrypted-data.bin');
   * ```
   */
  public async encryptBlob(data: string | Blob, key: string): Promise<Blob> {
    return encryptBlobWithSignedKey(data, key, this.platform);
  }

  /**
   * Decrypts data that was encrypted using the Vana protocol.
   *
   * @remarks
   * This method decrypts data that was previously encrypted using the Vana network's
   * standard encryption protocol. It requires the same wallet signature that was used
   * for encryption and automatically uses the appropriate platform adapter for
   * cryptographic operations. The decrypted output maintains the original data format.
   *
   * @param encryptedData - The encrypted data (string or Blob)
   * @param walletSignature - The wallet signature used as decryption key
   * @returns The decrypted data as a Blob
   * @throws {Error} When decryption fails due to invalid signature or corrupted data
   * @example
   * ```typescript
   * import { generateEncryptionKey } from '@opendatalabs/vana-sdk/node';
   *
   * // Retrieve encrypted data from storage
   * const encryptedBlob = await storageProvider.download('encrypted-data.bin');
   *
   * // Generate the same key used for encryption
   * const decryptionKey = await generateEncryptionKey(vana.walletClient);
   *
   * // Decrypt the data
   * const decrypted = await vana.decryptBlob(encryptedBlob, decryptionKey);
   *
   * // Convert back to original format
   * const originalText = await decrypted.text();
   * const originalJson = JSON.parse(originalText);
   *
   * console.log('Decrypted data:', originalJson);
   * ```
   *
   * @example
   * ```typescript
   * // Decrypt file downloaded from Vana network
   * const userFiles = await vana.data.getUserFiles();
   * const file = userFiles[0];
   *
   * // Download encrypted content
   * const encrypted = await fetch(file.url).then(r => r.blob());
   *
   * // Decrypt with user's key
   * const decryptionKey = await generateEncryptionKey(vana.walletClient);
   * const decrypted = await vana.decryptBlob(encrypted, decryptionKey);
   *
   * // Process original data
   * const fileContent = await decrypted.arrayBuffer();
   * ```
   */
  public async decryptBlob(
    encryptedData: string | Blob,
    walletSignature: string,
  ): Promise<Blob> {
    return decryptBlobWithSignedKey(
      encryptedData,
      walletSignature,
      this.platform,
    );
  }

  /**
   * Waits for an operation to complete and returns the final result.
   *
   * @remarks
   * This method polls the operation status at regular intervals until it
   * reaches a terminal state (succeeded, failed, or canceled). Supports
   * ergonomic overloads to accept either an Operation object or just the ID.
   *
   * @param opOrId - Either an Operation object or operation ID string
   * @param options - Optional polling configuration
   * @returns The completed operation with result or error
   * @throws {PersonalServerError} When the operation fails or times out
   * @example
   * ```typescript
   * // Using operation object
   * const operation = await vana.server.createOperation({ permissionId: 123 });
   * const completed = await vana.waitForOperation(operation);
   *
   * // Using just the ID
   * const completed = await vana.waitForOperation("op_abc123");
   *
   * // With custom timeout
   * const completed = await vana.waitForOperation(operation, {
   *   timeout: 60000,
   *   pollingInterval: 1000
   * });
   * ```
   */
  public async waitForOperation<T = unknown>(
    opOrId: Operation<T> | string,
    options?: PollingOptions,
  ): Promise<Operation<T>> {
    return this.server.waitForOperation(opOrId, options);
  }

  /**
   * Waits for a transaction to be confirmed and returns the receipt.
   *
   * @remarks
   * This method polls for transaction confirmation on the blockchain.
   * Supports ergonomic overloads to accept either a transaction result
   * object or just the hash string.
   *
   * @param hashOrObj - Either a TransactionResult object or hash string
   * @param options - Optional wait configuration
   * @returns The transaction receipt with logs and status
   * @example
   * ```typescript
   * // Using transaction result object
   * const tx = await vana.permissions.grant(params);
   * const receipt = await vana.waitForTransactionReceipt(tx);
   *
   * // Using just the hash
   * const receipt = await vana.waitForTransactionReceipt("0x123...");
   *
   * // With custom confirmations
   * const receipt = await vana.waitForTransactionReceipt(tx, {
   *   confirmations: 3,
   *   timeout: 60000
   * });
   * ```
   */
  public async waitForTransactionReceipt(
    hashOrObj: TransactionResult | { hash: Hash } | Hash,
    options?: TransactionWaitOptions,
  ): Promise<TransactionReceipt> {
    const hash = typeof hashOrObj === "string" ? hashOrObj : hashOrObj.hash;

    return this.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: options?.confirmations,
      pollingInterval: options?.pollingInterval,
      timeout: options?.timeout,
    });
  }

  /**
   * Waits for transaction confirmation and extracts blockchain event data.
   *
   * @remarks
   * This method leverages the context-carrying POJO architecture. When passed a
   * `TransactionResult` with an `operation` field, it automatically parses the
   * correct events from the transaction logs. For legacy compatibility, it accepts
   * raw hashes but will not parse events without operation context.
   *
   * @param transaction - Transaction result with operation context
   * @param options - Optional confirmation and timeout settings
   * @returns Parsed event data specific to the transaction's operation type
   * @throws {NetworkError} When transaction confirmation times out
   * @throws {BlockchainError} When expected events are not found in the transaction
   *
   * @example
   * ```typescript
   * // Recommended: Pass the transaction result for automatic event parsing
   * const tx = await vana.permissions.submitAddServerFilesAndPermissions(params);
   * const events = await vana.waitForTransactionEvents<{ permissionId: bigint }>(tx);
   * console.log(`Permission ID: ${events.permissionId}`);
   *
   * // Legacy: Raw hash without event parsing (returns receipt)
   * const receipt = await vana.waitForTransactionEvents("0x123...");
   * ```
   *
   * @see For understanding transaction flows, visit https://docs.vana.org/docs/transactions
   */
  public async waitForTransactionEvents<C extends Contract, F extends Fn<C>>(
    transaction: TransactionResult<C, F>,
    options?: TransactionWaitOptions,
  ): Promise<TypedTransactionResult<C, F>> {
    // Import the POJO-based parser
    const { parseTransaction } = await import("./utils/parseTransactionPojo");

    // Wait for the transaction to be mined
    const receipt = await this.waitForTransactionReceipt(
      transaction.hash,
      options,
    );

    // Parse events using our heuristic-free POJO system
    const result = parseTransaction(transaction, receipt);

    // Return the strongly-typed result
    // TypeScript knows exactly what events are possible!
    return result;
  }
}
