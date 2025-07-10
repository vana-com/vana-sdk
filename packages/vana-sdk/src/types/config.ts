import type { WalletClient, Account } from "viem";
import type { VanaChainId, VanaChain } from "./chains";
import type { StorageProvider } from "./storage";

/**
 * Configuration for storage providers used by the SDK.
 *
 * Allows you to configure multiple storage backends (IPFS, Pinata, Google Drive, etc.)
 * and specify which one to use by default for file operations.
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
  /** Map of provider name to storage provider instance */
  providers: Record<string, StorageProvider>;
  /** Default provider name to use when none specified */
  defaultProvider?: string;
}

/**
 * Base configuration interface
 */
export interface BaseConfig {
  /** Optional URL for a Vana Relayer Service for gasless transactions */
  relayerUrl?: string;
  /** Optional storage providers configuration for file upload/download */
  storage?: StorageConfig;
  /**
   * Optional subgraph URL for querying user files and permissions.
   * If not provided, defaults to the built-in subgraph URL for the current chain.
   * Can be overridden per method call if needed.
   */
  subgraphUrl?: string;
}

/**
 * Configuration with wallet client
 */
export interface WalletConfig extends BaseConfig {
  /** The viem WalletClient instance used for signing transactions */
  walletClient: WalletClient & {
    chain: VanaChain;
  };
}

/**
 * Configuration with chain and account details
 */
export interface ChainConfig extends BaseConfig {
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
 *   relayerUrl: 'https://relayer.vana.org'
 * };
 *
 * // Using ChainConfig with chain ID and account
 * const config: VanaConfig = {
 *   chainId: 14800,
 *   account: privateKeyToAccount('0x...'),
 *   relayerUrl: 'https://relayer.vana.org'
 * };
 * ```
 */
export type VanaConfig = WalletConfig | ChainConfig;

/**
 * Runtime configuration information
 */
export interface RuntimeConfig {
  /** Current chain ID */
  chainId: VanaChainId;
  /** Current chain name */
  chainName: string;
  /** Relayer URL if configured */
  relayerUrl?: string;
  /** Available storage providers */
  storageProviders: string[];
  /** Default storage provider */
  defaultStorageProvider?: string;
}

/**
 * Type guard to check if config is WalletConfig
 */
export function isWalletConfig(config: VanaConfig): config is WalletConfig {
  return "walletClient" in config;
}

/**
 * Type guard to check if config is ChainConfig
 */
export function isChainConfig(config: VanaConfig): config is ChainConfig {
  return "chainId" in config && !("walletClient" in config);
}

/**
 * Configuration validation options
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
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}
