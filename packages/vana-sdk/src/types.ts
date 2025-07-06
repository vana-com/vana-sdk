import type { WalletClient, Address, Hash, Abi } from "viem";
import type { StorageProvider } from "./storage";

/**
 * Configuration object for the main Vana class.
 */
export interface VanaConfig {
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
  id: number;
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
  /** The keccak256 hash of the original PermissionGrant struct to revoke */
  grantId: Hash;
}

/**
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

/**
 * EIP-712 domain definition for PermissionGrant signatures.
 */
export interface PermissionGrantDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

/**
 * EIP-712 Permission message structure (current contract format).
 */
export interface PermissionGrantMessage {
  application: Address;
  files: number[];
  operation: string;
  grant: string;
  parameters: string;
  nonce: bigint;
}

/**
 * EIP-712 PermissionInput message structure (new simplified format).
 */
export interface PermissionInputMessage {
  nonce: bigint;
  grant: string;
}

/**
 * EIP-712 Permission message structure (simplified future format).
 */
export interface SimplifiedPermissionMessage {
  application: Address;
  grant: string;
  nonce: bigint;
}

/**
 * Grant file structure stored in IPFS.
 */
export interface GrantFile {
  operation: string;
  files: number[];
  parameters: Record<string, unknown>;
  metadata: {
    timestamp: string;
    version: string;
    userAddress: Address;
  };
}

/**
 * EIP-712 typed data structure for Permission.
 */
export interface PermissionGrantTypedData {
  domain: PermissionGrantDomain;
  types: {
    Permission: Array<{
      name: string;
      type: string;
    }>;
  };
  primaryType: "Permission";
  message: PermissionInputMessage;
  /** Files to grant permission for (passed to relayer) */
  files?: number[];
}

/**
 * Generic EIP-712 typed data structure.
 */
export interface GenericTypedData {
  domain: PermissionGrantDomain;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * Response from the relayer service for grant file storage.
 */
export interface RelayerStorageResponse {
  /** The IPFS URL where the grant file is stored */
  grantUrl: string;
  /** Success status */
  success: boolean;
  /** Optional error message */
  error?: string;
}

/**
 * Response from the relayer service for transaction submission.
 */
export interface RelayerTransactionResponse {
  /** The transaction hash of the submitted transaction */
  transactionHash: Hash;
  /** Success status */
  success: boolean;
  /** Optional error message */
  error?: string;
}

/**
 * Contract information returned by the protocol controller.
 */
export interface ContractInfo {
  /** The contract's deployed address */
  address: Address;
  /** The contract's ABI */
  abi: Abi;
}

/**
 * Result of uploading an encrypted file to storage and blockchain.
 */
export interface UploadEncryptedFileResult {
  /** The new file ID assigned by the DataRegistry */
  fileId: number;
  /** The storage URL where the encrypted file is stored */
  url: string;
  /** Size of the encrypted file in bytes */
  size: number;
  /** Transaction hash of the file registration */
  transactionHash?: Hash;
}
