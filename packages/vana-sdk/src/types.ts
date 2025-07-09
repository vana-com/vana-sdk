// Re-export all types from the new modular structure
export * from "./types/index";

// Also re-export legacy types for backward compatibility
// These were previously defined in this file and are now in the types module
import type { WalletClient, Address } from "viem";
import type { StorageProvider } from "./storage";

/**
 * @deprecated Use VanaConfig from "./types" instead
 * Configuration object for the main Vana class.
 */
export interface VanaConfigLegacy {
  /** The viem WalletClient instance used for signing transactions */
  walletClient: WalletClient;
  /** Optional URL for a Vana Relayer Service for gasless transactions */
  relayerUrl?: string;
  /** Optional storage providers configuration for file upload/download */
  storage?: {
    /** Map of provider name to storage provider instance */
    providers?: Record<string, StorageProvider>;
    /** Default provider name to use when none specified */
    defaultProvider?: string;
  };
}

/**
 * Represents a user's registered data file.
 */
export interface UserFile {
  /** Unique identifier for the file */
  id: number;
  /** URL where the file is stored */
  url: string;
  /** EVM address of the file owner */
  ownerAddress: Address;
  /** Block number when the file was added to the registry */
  addedAtBlock: bigint;
}

/**
 * Parameters for the `vana.permissions.grant` method.
 */
export interface GrantPermissionParams {
  /** The on-chain identity of the application */
  to: Address;
  /** The class of computation, e.g., "llm_inference" */
  operation: string;
  /** Array of file IDs to grant permission for */
  files: number[];
  /** The full, off-chain parameters (e.g., LLM prompt) */
  parameters: Record<string, unknown>;
  /** Optional pre-stored grant URL to avoid duplicate IPFS storage */
  grantUrl?: string;
}

/**
 * @deprecated Use VanaContractName from "./types" instead
 * A union type of all canonical Vana contract names.
 */
export type VanaContract =
  | "PermissionRegistry"
  | "DataRegistry"
  | "TeePool"
  | "ComputeEngine"
  | "TeePoolPhala"
  | "DataRefinerRegistry"
  | "QueryEngine"
  | "ComputeInstructionRegistry"
  | "TeePoolEphemeralStandard"
  | "TeePoolPersistentStandard"
  | "TeePoolPersistentGpu"
  | "TeePoolDedicatedStandard"
  | "TeePoolDedicatedGpu"
  | "VanaEpoch"
  | "DLPRegistry"
  | "DLPRegistryTreasury"
  | "DLPPerformance"
  | "DLPRewardDeployer"
  | "DLPRewardDeployerTreasury"
  | "DLPRewardSwap"
  | "SwapHelper"
  | "VanaPoolStaking"
  | "VanaPoolEntity"
  | "VanaPoolTreasury"
  | "DAT"
  | "DATFactory"
  | "DATPausable"
  | "DATVotes";
