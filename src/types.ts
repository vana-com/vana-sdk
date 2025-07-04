import type { WalletClient, Address, Hash, Abi } from 'viem';

/**
 * Configuration object for the main Vana class.
 */
export interface VanaConfig {
  /** The viem WalletClient instance used for signing transactions */
  walletClient: WalletClient;
  /** Optional URL for the Vana Relayer Service. Defaults to production URL if not provided */
  relayerUrl?: string;
  /** Optional application wallet for app-specific operations */
  applicationWallet: WalletClient;
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
  /** Address of the application that received the permission */
  application: Address;
  /** Array of file IDs included in the permission */
  files: number[];
  /** Type of operation permitted (e.g., "llm_inference") */
  operation: string;
  /** The prompt or parameters associated with the permission */
  prompt: string;
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
  parameters: Record<string, any>;
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
 * EIP-712 PermissionGrant message structure.
 */
export interface PermissionGrantMessage {
  from: Address;
  to: Address;
  operation: string;
  grantUrl: string;
  parametersHash: Hash;
  nonce: bigint;
}

/**
 * EIP-712 typed data structure for PermissionGrant.
 */
export interface PermissionGrantTypedData {
  domain: PermissionGrantDomain;
  types: {
    PermissionGrant: Array<{
      name: string;
      type: string;
    }>;
  };
  primaryType: 'PermissionGrant';
  message: PermissionGrantMessage;
  /** Files to grant permission for (passed to relayer) */
  files?: number[];
}

/**
 * Response from the relayer service for parameter storage.
 */
export interface RelayerStorageResponse {
  /** The content-addressable URL where parameters are stored */
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
 * Parameters for the `vana.personal.postRequest` method.
 */
export interface PostRequestParams {
  /** The owner's address */
  owner: Address;
  /** Array of file IDs to process */
  fileIds: number[];
  /** The operation to perform (e.g., "llm_inference") */
  operation: string;
  /** Parameters for the operation */
  parameters: Record<string, string>;
}

/**
 * Response from the personal server containing a link to get results or cancel computation.
 */
export interface ReplicatePredictionResponse {
  /** The prediction ID for tracking the computation */
  id: string;
  /** The status of the computation */
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  /** URL to check the status and get results */
  urls: {
    get: string;
    cancel: string;
  };
  /** The input parameters used for the computation */
  input: Record<string, any>;
  /** Optional output if computation is complete */
  output?: any;
  /** Optional error if computation failed */
  error?: string;
}