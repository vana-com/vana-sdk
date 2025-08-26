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
  isVanaChainId,
  hasStorageConfig,
} from "./types";
import type {
  RelayerCallbacks,
  DownloadRelayerCallbacks,
} from "./types/config";
import { InvalidConfigurationError } from "./errors";
import type { ControllerContext } from "./controllers/permissions";
import { PermissionsController } from "./controllers/permissions";
import { DataController } from "./controllers/data";
import { SchemaController } from "./controllers/schemas";
import { ServerController } from "./controllers/server";
import { ProtocolController } from "./controllers/protocol";
import type { StorageProvider } from "./storage";
import { StorageManager } from "./storage";
import { createWalletClient, createPublicClient, http } from "viem";
import { chains } from "./config/chains";
import { getChainConfig } from "./chains";
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

  private readonly relayerCallbacks?: RelayerCallbacks;
  private readonly downloadRelayer?: DownloadRelayerCallbacks;
  private readonly storageManager?: StorageManager;
  private readonly hasRequiredStorage: boolean;
  private readonly ipfsGateways?: string[];
  private readonly defaultPersonalServerUrl?: string;
  private readonly publicClient: import("viem").PublicClient;
  private readonly walletClient: import("viem").WalletClient;

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

    // Store relayer callbacks if provided
    this.relayerCallbacks = config.relayerCallbacks;

    // Store download relayer if provided
    this.downloadRelayer = config.downloadRelayer;

    // Store IPFS gateways if provided
    this.ipfsGateways = config.ipfsGateways;

    // Store default personal server URL if provided
    this.defaultPersonalServerUrl = config.defaultPersonalServerUrl;

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

    // Store the clients for later use
    this.publicClient = publicClient;
    this.walletClient = walletClient;

    // Get default subgraph URL if not provided in config
    const chainConfig = getChainConfig(walletClient.chain.id);
    const subgraphUrl = config.subgraphUrl || chainConfig?.subgraphUrl;

    // Create shared context for all controllers, now including the platform adapter
    const sharedContext: ControllerContext = {
      walletClient,
      publicClient,
      applicationClient: walletClient, // Using same wallet for now
      relayerCallbacks: this.relayerCallbacks,
      downloadRelayer: this.downloadRelayer,
      storageManager: this.storageManager,
      subgraphUrl,
      platform: this.platform, // Pass the platform adapter to controllers
      validateStorageRequired: this.validateStorageRequired.bind(this),
      hasStorage: this.hasStorage.bind(this),
      ipfsGateways: this.ipfsGateways,
      defaultPersonalServerUrl: this.defaultPersonalServerUrl,
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
          "provide a relayerCallbacks.storeGrantFile implementation, " +
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
   * Retrieves the user's wallet address from the connected client.
   *
   * @returns A Promise that resolves to the user's Ethereum address
   * @example
   * ```typescript
   * const address = await vana.getUserAddress();
   * console.log(`User address: ${address}`); // e.g., "User address: 0x742d35..."
   * ```
   */
  async getUserAddress(): Promise<import("viem").Address> {
    if (!this.walletClient.account) {
      throw new Error("No wallet account connected");
    }

    const { account } = this.walletClient;

    // Return the account address directly if available
    if (typeof account === "string") {
      return account as import("viem").Address;
    }

    // If account is an object, get the address property
    if (typeof account === "object" && account.address) {
      return account.address;
    }

    throw new Error("Unable to determine wallet address");
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
    opOrId: import("./types/operations").Operation<T> | string,
    options?: import("./types/operations").PollingOptions,
  ): Promise<import("./types/operations").Operation<T>> {
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
    hashOrObj:
      | import("./types/operations").TransactionResult
      | { hash: import("viem").Hash }
      | import("viem").Hash,
    options?: import("./types/operations").TransactionWaitOptions,
  ): Promise<import("viem").TransactionReceipt> {
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
  public async waitForTransactionEvents<
    C extends import("./generated/event-types").Contract,
    F extends import("./generated/event-types").Fn<C>,
  >(
    transaction: import("./types/operations").TransactionResult<C, F>,
    options?: import("./types/operations").TransactionWaitOptions,
  ): Promise<import("./generated/event-types").TypedTransactionResult<C, F>> {
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
