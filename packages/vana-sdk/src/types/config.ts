import type { WalletClient, Account, Chain } from "viem";
import type { VanaChainId, VanaChain } from "./chains";
import type { StorageProvider } from "../storage";

/**
 * Configuration for storage providers
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
 * Union type for all valid SDK configurations
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
