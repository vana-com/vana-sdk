// Re-export all types from the new modular structure
export * from "./types/index";

// Also re-export legacy types for backward compatibility
// These were previously defined in this file and are now in the types module
import type { WalletClient, Address, Hash, Abi } from "viem";
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
