import type { WalletClient, Account, Hash, Address } from "viem";
import type { VanaChainId, VanaChain } from "./chains";
import type {
  StorageProvider,
  StorageUploadResult,
  StorageListOptions,
} from "./storage";
import type {
  PermissionGrantTypedData,
  TrustServerTypedData,
  UntrustServerTypedData,
  GenericTypedData,
  GrantFile,
} from "./permissions";

/**
 * Marker interface to indicate that a Vana instance has storage configured.
 * Used for compile-time type safety to ensure storage-dependent methods
 * are only called on properly configured instances.
 *
 * @category Configuration
 */
export interface StorageRequiredMarker {
  readonly __storageRequired: true;
}

/**
 * Configuration for storage providers used by the SDK.
 *
 * Allows you to configure multiple storage backends (IPFS, Pinata, Google Drive, etc.)
 * and specify which one to use by default for file operations.
 *
 * **Provider Selection:**
 * - IPFS: Decentralized, permanent storage ideal for production
 * - Pinata: Managed IPFS with guaranteed availability
 * - Google Drive: Centralized, suitable for development/testing
 * - Custom providers: Implement StorageProvider interface
 *
 * @category Configuration
 * @example
 * ```typescript
 * const storage: StorageConfig = {
 *   providers: {
 *     ipfs: new IPFSStorage({ gateway: 'https://gateway.pinata.cloud' }),
 *     pinata: new PinataStorage({ apiKey: 'your-key', secretKey: 'your-secret' })
 *   },
 *   defaultProvider: 'ipfs'
 * };
 * ```
 */
export interface StorageConfig {
  /**
   * Map of provider name to storage provider instance.
   *   Common provider names: "ipfs", "pinata", "googledrive", "s3".
   *   Custom names allowed for custom provider implementations.
   */
  providers: Record<string, StorageProvider>;
  /**
   * Default provider name to use when none specified.
   *   Must match a key in the providers map. Falls back to first provider if not specified.
   */
  defaultProvider?: string;
}

/**
 * Relayer callback functions for handling gasless transactions.
 *
 * Instead of hardcoding HTTP/REST API calls, users can provide custom callback
 * functions to handle transaction relay in any way they choose (HTTP, WebSocket,
 * direct blockchain submission, etc.).
 *
 * @category Configuration
 * @example
 * ```typescript
 * const relayerCallbacks: RelayerCallbacks = {
 *   async submitPermissionGrant(typedData, signature) {
 *     // Custom implementation - could be HTTP, WebSocket, etc.
 *     const response = await fetch('https://my-relayer.com/api/grant', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ typedData, signature })
 *     });
 *     const result = await response.json();
 *     return result.transactionHash;
 *   },
 *
 *   async submitFileAddition(url, userAddress) {
 *     // Custom relay implementation
 *     return await myCustomRelayer.addFile(url, userAddress);
 *   }
 * };
 * ```
 */
export interface RelayerCallbacks {
  /**
   * Submit a signed permission grant transaction for relay
   *
   * @param typedData - The EIP-712 typed data that was signed
   * @param signature - The user's signature
   * @returns Promise resolving to the transaction hash
   */
  submitPermissionGrant?: (
    typedData: PermissionGrantTypedData,
    signature: Hash,
  ) => Promise<Hash>;

  /**
   * Submit a signed permission revocation transaction for relay
   *
   * @param typedData - The EIP-712 typed data that was signed
   * @param signature - The user's signature
   * @returns Promise resolving to the transaction hash
   */
  submitPermissionRevoke?: (
    typedData: GenericTypedData,
    signature: Hash,
  ) => Promise<Hash>;

  /**
   * Submit a signed trust server transaction for relay
   *
   * @param typedData - The EIP-712 typed data that was signed
   * @param signature - The user's signature
   * @returns Promise resolving to the transaction hash
   */
  submitTrustServer?: (
    typedData: TrustServerTypedData,
    signature: Hash,
  ) => Promise<Hash>;

  /**
   * Submit a signed untrust server transaction for relay
   *
   * @param typedData - The EIP-712 typed data that was signed
   * @param signature - The user's signature
   * @returns Promise resolving to the transaction hash
   */
  submitUntrustServer?: (
    typedData: UntrustServerTypedData,
    signature: Hash,
  ) => Promise<Hash>;

  /**
   * Submit a file addition for relay
   *
   * @deprecated Since v2.0.0 - Use submitFileAdditionComplete() instead for full support.
   * Will be removed in v3.0.0.
   *
   * Migration guide:
   * ```typescript
   * // Old:
   * await submitFileAddition(url, userAddress);
   *
   * // New:
   * await submitFileAdditionComplete({
   *   url,
   *   userAddress,
   *   permissions: [] // Optional
   * });
   * ```
   * @param url - The file URL to register
   * @param userAddress - The user's address
   * @returns Promise resolving to object with fileId and transactionHash
   */
  submitFileAddition?: (
    url: string,
    userAddress: string,
  ) => Promise<{ fileId: number; transactionHash: Hash }>;

  /**
   * Submit a file addition with permissions for relay
   *
   * @deprecated Since v2.0.0 - Use submitFileAdditionComplete() instead for full support.
   * Will be removed in v3.0.0.
   *
   * Migration guide:
   * ```typescript
   * // Old:
   * await submitFileAdditionWithPermissions(url, userAddress, permissions);
   *
   * // New:
   * await submitFileAdditionComplete({
   *   url,
   *   userAddress,
   *   permissions
   * });
   * ```
   * @param url - The file URL to register
   * @param userAddress - The user's address
   * @param permissions - Array of encrypted permissions
   * @returns Promise resolving to object with fileId and transactionHash
   */
  submitFileAdditionWithPermissions?: (
    url: string,
    userAddress: string,
    permissions: Array<{ account: string; key: string }>,
  ) => Promise<{ fileId: number; transactionHash: Hash }>;

  /**
   * Submit a comprehensive file addition with optional schema and permissions for relay
   *
   * This is the preferred callback that supports all file addition scenarios.
   * It can handle files with schemas, permissions, or both.
   *
   * @param params - Complete parameters for file addition
   * @param params.url - The file URL to register
   * @param params.userAddress - The user's address (defaults to connected wallet if not specified)
   * @param params.permissions - Array of encrypted permissions (empty array if none)
   * @param params.schemaId - Schema ID for validation (0 if none)
   * @param params.ownerAddress - Optional owner address (defaults to userAddress if not specified)
   * @returns Promise resolving to object with fileId and transactionHash
   */
  submitFileAdditionComplete?: (params: {
    url: string;
    userAddress: Address;
    permissions: Array<{ account: Address; key: string }>;
    schemaId: number;
    ownerAddress?: Address;
  }) => Promise<{ fileId: number; transactionHash: Hash }>;

  /**
   * Store a grant file for relay (e.g., upload to IPFS)
   *
   * @param grantData - The grant file data
   * @returns Promise resolving to the storage URL
   */
  storeGrantFile?: (grantData: GrantFile) => Promise<string>;
}

/**
 * Storage callback functions for flexible storage operations.
 *
 * Instead of hardcoding storage behavior (HTTP endpoints, etc.), users can provide
 * custom callback functions to handle storage operations in any way they choose.
 * This pattern matches the relayer callbacks approach, providing maximum flexibility.
 *
 * @category Configuration
 * @example
 * ```typescript
 * const storageCallbacks: StorageCallbacks = {
 *   async upload(blob, filename, metadata) {
 *     // Custom implementation - could be HTTP, S3, local filesystem, etc.
 *     const formData = new FormData();
 *     formData.append('file', blob, filename);
 *     const response = await fetch('/api/storage/upload', {
 *       method: 'POST',
 *       body: formData
 *     });
 *     const data = await response.json();
 *     return {
 *       url: data.url,
 *       size: blob.size,
 *       contentType: blob.type,
 *       metadata: data.metadata
 *     };
 *   },
 *
 *   async download(identifier) {
 *     const response = await fetch(`/api/storage/download/${identifier}`);
 *     return response.blob();
 *   }
 * };
 * ```
 */
export interface StorageCallbacks {
  /**
   * Upload a blob to storage
   *
   * @param blob - The data to upload
   * @param filename - Optional filename hint
   * @param metadata - Optional metadata for the upload
   * @returns Upload result with identifier and metadata
   */
  upload: (
    blob: Blob,
    filename?: string,
    metadata?: Record<string, unknown>,
  ) => Promise<StorageUploadResult>;

  /**
   * Download data from storage
   *
   * @param identifier - The storage identifier (could be URL, hash, path, or any unique ID)
   * @param options - Optional download options
   * @returns The downloaded data as a Blob
   */
  download: (
    identifier: string,
    options?: StorageDownloadOptions,
  ) => Promise<Blob>;

  /**
   * List stored items (optional)
   *
   * @param prefix - Optional prefix to filter results
   * @param options - Optional listing options
   * @returns Array of storage items with metadata
   */
  list?: (
    prefix?: string,
    options?: StorageListOptions,
  ) => Promise<StorageListResult>;

  /**
   * Delete a stored item (optional)
   *
   * @param identifier - The storage identifier to delete
   * @returns Promise that resolves to true if deletion succeeded
   */
  delete?: (identifier: string) => Promise<boolean>;

  /**
   * Extract identifier from a URL or return as-is (optional)
   * Used for backward compatibility with URL-based systems
   *
   * @param url - The URL to extract from
   * @returns The extracted identifier
   */
  extractIdentifier?: (url: string) => string;
}

/**
 * Options for storage download operations
 *
 * @category Configuration
 */
export interface StorageDownloadOptions {
  /** Optional HTTP headers */
  headers?: Record<string, string>;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Optional byte range for partial downloads */
  range?: { start?: number; end?: number };
}

/**
 * Result from storage list operations
 *
 * @category Configuration
 */
export interface StorageListResult {
  /** Array of storage items */
  items: Array<{
    /** Item identifier */
    identifier: string;
    /** Item size in bytes */
    size?: number;
    /** Last modified timestamp */
    lastModified?: Date;
    /** Item metadata */
    metadata?: Record<string, unknown>;
  }>;
  /** Continuation token for pagination */
  continuationToken?: string;
  /** Whether more results are available */
  hasMore?: boolean;
}

/**
 * Base configuration interface without storage requirements
 *
 * @category Configuration
 */
export interface BaseConfig {
  /**
   * Optional relayer callback functions for handling gasless transactions.
   * Provides flexible relay mechanism - can use HTTP, WebSocket, or any custom implementation.
   */
  relayerCallbacks?: RelayerCallbacks;

  /**
   * Optional storage providers configuration for file upload/download.
   *   Required for: upload(), grant() without pre-stored URLs, schema operations.
   *   See StorageConfig for provider selection guidance.
   */
  storage?: StorageConfig;
  /**
   * Optional subgraph URL for querying user files and permissions.
   * If not provided, defaults to the built-in subgraph URL for the current chain.
   * Can be overridden per method call if needed.
   * Obtain chain-specific URLs from Vana documentation or deployment info.
   */
  subgraphUrl?: string;
  /**
   * Optional default IPFS gateways to use for fetching files.
   * These gateways will be used by default in fetchFromIPFS unless overridden per-call.
   * If not provided, the SDK will use public gateways.
   * Order matters: first successful gateway is used.
   *
   * @example ['https://gateway.pinata.cloud', 'https://ipfs.io']
   */
  ipfsGateways?: string[];
}

/**
 * Base configuration interface that requires storage for storage-dependent operations
 *
 * @category Configuration
 */
export interface BaseConfigWithStorage {
  /**
   * Optional relayer callback functions for handling gasless transactions.
   * Provides flexible relay mechanism - can use HTTP, WebSocket, or any custom implementation.
   */
  relayerCallbacks?: RelayerCallbacks;

  /** Required storage providers configuration for file upload/download */
  storage: StorageConfig;
  /**
   * Optional subgraph URL for querying user files and permissions.
   * If not provided, defaults to the built-in subgraph URL for the current chain.
   * Can be overridden per method call if needed.
   */
  subgraphUrl?: string;
  /**
   * Optional default IPFS gateways to use for fetching files.
   * These gateways will be used by default in fetchFromIPFS unless overridden per-call.
   * If not provided, the SDK will use public gateways.
   *
   * @example ['https://gateway.pinata.cloud', 'https://ipfs.io']
   */
  ipfsGateways?: string[];
}

/**
 * Configuration with wallet client
 *
 * @category Configuration
 */
export interface WalletConfig extends BaseConfig {
  /** The viem WalletClient instance used for signing transactions */
  walletClient: WalletClient & {
    chain: VanaChain;
  };
}

/**
 * Configuration with wallet client that requires storage
 *
 * @category Configuration
 */
export interface WalletConfigWithStorage extends BaseConfigWithStorage {
  /** The viem WalletClient instance used for signing transactions */
  walletClient: WalletClient & {
    chain: VanaChain;
  };
}

/**
 * Configuration with chain and account details
 *
 * @category Configuration
 */
export interface ChainConfig extends BaseConfig {
  /**
   * The chain ID for Vana network.
   *   Supported: 14800 (Vana Mainnet), 14801 (Moksha Testnet), 31337 (Local Development).
   *   Use chain constants from '@vana/sdk' for type safety.
   */
  chainId: VanaChainId;
  /**
   * RPC URL for the chain (optional, will use default for the chain if not provided).
   *   Default URLs: mainnet (https://rpc.vana.org), testnet (https://rpc.moksha.vana.org).
   *   Override for custom nodes or local development.
   */
  rpcUrl?: string;
  /**
   * Optional account for signing transactions.
   *   Can be: privateKeyToAccount(), mnemonicToAccount(), or custom Account implementation.
   *   Required for write operations; read-only operations work without account.
   */
  account?: Account;
}

/**
 * Configuration with chain and account details that requires storage
 *
 * @category Configuration
 */
export interface ChainConfigWithStorage extends BaseConfigWithStorage {
  /** The chain ID for Vana network */
  chainId: VanaChainId;
  /** RPC URL for the chain (optional, will use default for the chain if not provided) */
  rpcUrl?: string;
  /** Optional account for signing transactions */
  account?: Account;
}

/**
 * Main configuration interface for initializing the Vana SDK.
 *
 * You can configure the SDK using either a pre-configured wallet client
 * (WalletConfig) or by providing chain and account details (ChainConfig).
 * Both approaches support optional storage providers and relayer configuration.
 *
 * @category Configuration
 * @example
 * ```typescript
 * // Using WalletConfig with pre-configured client
 * const config: VanaConfig = {
 *   walletClient: createWalletClient({
 *     account: privateKeyToAccount('0x...'),
 *     chain: moksha,
 *     transport: http()
 *   }),
 *   relayerCallbacks: {
 *     submitPermissionGrant: async (typedData, signature) => {
 *       // Custom relay implementation
 *       return await myRelayer.submit(typedData, signature);
 *     }
 *   }
 * };
 *
 * // Using ChainConfig with chain ID and account
 * const config: VanaConfig = {
 *   chainId: 14800,
 *   account: privateKeyToAccount('0x...'),
 *   relayerCallbacks: {
 *     submitPermissionGrant: async (typedData, signature) => {
 *       // Custom relay implementation
 *       return await myRelayer.submit(typedData, signature);
 *     }
 *   }
 * };
 * ```
 */
export type VanaConfig = WalletConfig | ChainConfig;

/**
 * Configuration interface for Vana SDK that requires storage providers.
 *
 * Use this type when you need to ensure storage is configured for operations
 * like file uploads, permission grants without pre-stored URLs, or schema creation.
 *
 * @category Configuration
 * @example
 * ```typescript
 * // Configuration that guarantees storage availability
 * const config: VanaConfigWithStorage = {
 *   walletClient: createWalletClient({
 *     account: privateKeyToAccount('0x...'),
 *     chain: moksha,
 *     transport: http()
 *   }),
 *   storage: {
 *     providers: {
 *       ipfs: new IPFSStorage({ gateway: 'https://gateway.pinata.cloud' })
 *     },
 *     defaultProvider: 'ipfs'
 *   }
 * };
 * ```
 */
export type VanaConfigWithStorage =
  | WalletConfigWithStorage
  | ChainConfigWithStorage;

/**
 * Runtime configuration information
 *
 * @category Configuration
 */
export interface RuntimeConfig {
  /** Current chain ID */
  chainId: VanaChainId;
  /** Current chain name */
  chainName: string;
  /** Available storage providers */
  storageProviders: string[];
  /** Default storage provider */
  defaultStorageProvider?: string;
  /** Current relayer callbacks configuration */
  relayerCallbacks?: RelayerCallbacks;
}

/**
 * Validates whether a configuration object is a WalletConfig.
 *
 * @param config - The configuration object to check
 * @returns True if the config is a WalletConfig (contains walletClient)
 * @example
 * ```typescript
 * if (isWalletConfig(config)) {
 *   console.log('Using wallet client:', config.walletClient.account?.address);
 * } else {
 *   console.log('Using chain config with chain ID:', config.chainId);
 * }
 * ```
 */
export function isWalletConfig(config: VanaConfig): config is WalletConfig {
  return "walletClient" in config;
}

/**
 * Validates whether a configuration object is a ChainConfig.
 *
 * @param config - The configuration object to check
 * @returns True if the config is a ChainConfig (contains chainId but not walletClient)
 * @example
 * ```typescript
 * if (isChainConfig(config)) {
 *   console.log('Chain ID:', config.chainId);
 *   console.log('RPC URL:', config.rpcUrl);
 * } else {
 *   console.log('Using pre-configured wallet client');
 * }
 * ```
 */
export function isChainConfig(config: VanaConfig): config is ChainConfig {
  return "chainId" in config && !("walletClient" in config);
}

/**
 * Validates whether a configuration has required storage providers.
 *
 * @param config - The configuration object to check
 * @returns True if the config has storage providers configured
 * @example
 * ```typescript
 * if (hasStorageConfig(config)) {
 *   // Safe to use storage-dependent operations
 *   await vana.data.uploadFile(file);
 * } else {
 *   console.log('Storage not configured - some operations may fail');
 * }
 * ```
 */
export function hasStorageConfig(
  config: VanaConfig,
): config is VanaConfigWithStorage {
  return (
    config.storage?.providers !== undefined &&
    Object.keys(config.storage.providers).length > 0
  );
}

/**
 * Configuration validation options
 *
 * @category Configuration
 */
export interface ConfigValidationOptions {
  /** Whether to validate storage providers */
  validateStorage?: boolean;
  /** Whether to validate relayer URL */
  validateRelayer?: boolean;
  /** Whether to validate chain configuration */
  validateChain?: boolean;
}

/**
 * Configuration validation result
 *
 * @category Configuration
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}
