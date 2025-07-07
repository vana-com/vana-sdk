// Re-export all types from the new modular structure
export * from "./types/index";

// Also re-export legacy types for backward compatibility
// These were previously defined in this file and are now in the types module
import type { WalletClient, Address, Hash } from "viem";
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
  /** Ethereum address of the file owner */
  ownerAddress: Address;
  /** Block number when the file was added to the registry */
  addedAtBlock: bigint;
}

/**
 * Represents a granted permission from the PermissionRegistry.
 */
export interface GrantedPermission {
  /** Unique identifier for the permission */
  id: bigint;
  /** Array of file IDs included in the permission */
  files: number[];
  /** Type of operation permitted (e.g., "llm_inference") */
  operation?: string;
  /** The grant URL containing all permission details */
  grant: string;
  /** The parameters associated with the permission */
  parameters?: unknown;
  /** Optional nonce used when granting the permission */
  nonce?: number;
  /** Optional block number when permission was granted */
  grantedAt?: number;
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
 * Parameters for the `vana.permissions.revoke` method.
 */
export interface RevokePermissionParams {
  /** The permission ID (from GrantedPermission.id) OR the keccak256 hash of the original PermissionGrant struct to revoke */
  grantId: Hash | bigint | number | string;
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
