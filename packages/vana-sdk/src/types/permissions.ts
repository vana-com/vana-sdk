import type { Address, Hash } from "viem";

/**
 * Represents a granted permission from the PermissionRegistry
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
  parameters?: Record<string, unknown>;
  /** Optional nonce used when granting the permission */
  nonce?: number;
  /** Optional block number when permission was granted */
  grantedAt?: number;
  /** Address that granted the permission */
  grantor: Address;
  /** Address that received the permission */
  grantee: Address;
  /** Whether the permission is still active */
  active: boolean;
  /** Expiration timestamp if applicable */
  expiresAt?: number;
}

/**
 * Parameters for granting a permission
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
  /** Optional nonce for the permission */
  nonce?: bigint;
  /** Optional expiration time for the permission */
  expiresAt?: number;
}

/**
 * Parameters for revoking a permission
 */
export interface RevokePermissionParams {
  /** The keccak256 hash of the original PermissionGrant struct to revoke */
  grantId: Hash;
}

/**
 * Parameters for checking if a permission exists
 */
export interface CheckPermissionParams {
  /** The application address */
  application: Address;
  /** The operation type */
  operation: string;
  /** The file IDs */
  files: number[];
  /** The grant parameters */
  parameters: Record<string, unknown>;
  /** The user address */
  user?: Address;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether the permission exists and is valid */
  exists: boolean;
  /** The permission details if it exists */
  permission?: GrantedPermission;
  /** Reason why permission is invalid (if applicable) */
  reason?: string;
}

/**
 * EIP-712 domain definition for PermissionGrant signatures
 */
export interface PermissionGrantDomain {
  /** Domain name */
  name: string;
  /** Domain version */
  version: string;
  /** Chain ID */
  chainId: number;
  /** Verifying contract address */
  verifyingContract: Address;
}

/**
 * EIP-712 Permission message structure (current contract format)
 */
export interface PermissionGrantMessage {
  /** Application address */
  application: Address;
  /** File IDs */
  files: number[];
  /** Operation type */
  operation: string;
  /** Grant URL */
  grant: string;
  /** Parameters as JSON string */
  parameters: string;
  /** Nonce */
  nonce: bigint;
}

/**
 * EIP-712 PermissionInput message structure (new simplified format)
 */
export interface PermissionInputMessage {
  /** Nonce */
  nonce: bigint;
  /** Grant URL */
  grant: string;
}

/**
 * EIP-712 Permission message structure (simplified future format)
 */
export interface SimplifiedPermissionMessage {
  /** Application address */
  application: Address;
  /** Grant URL */
  grant: string;
  /** Nonce */
  nonce: bigint;
}

/**
 * Grant file structure stored in IPFS
 */
export interface GrantFile {
  /** Operation type */
  operation: string;
  /** File IDs */
  files: number[];
  /** Parameters */
  parameters: Record<string, unknown>;
  /** Metadata */
  metadata: GrantFileMetadata;
}

/**
 * Grant file metadata
 */
export interface GrantFileMetadata {
  /** Timestamp when grant was created */
  timestamp: string;
  /** Grant file format version */
  version: string;
  /** User address who created the grant */
  userAddress: Address;
  /** Optional application metadata */
  application?: ApplicationMetadata;
}

/**
 * Application metadata
 */
export interface ApplicationMetadata {
  /** Application name */
  name: string;
  /** Application description */
  description?: string;
  /** Application website */
  website?: string;
  /** Application logo URL */
  logo?: string;
  /** Application version */
  version?: string;
}

/**
 * EIP-712 typed data structure for Permission
 */
export interface PermissionGrantTypedData {
  /** EIP-712 domain */
  domain: PermissionGrantDomain;
  /** EIP-712 types */
  types: {
    Permission: Array<{
      name: string;
      type: string;
    }>;
  };
  /** Primary type */
  primaryType: "Permission";
  /** Message to sign */
  message: PermissionInputMessage;
  /** Files to grant permission for (passed to relayer) */
  files?: number[];
}

/**
 * Generic EIP-712 typed data structure
 */
export interface GenericTypedData {
  /** EIP-712 domain */
  domain: PermissionGrantDomain;
  /** EIP-712 types */
  types: Record<string, Array<{ name: string; type: string }>>;
  /** Primary type */
  primaryType: string;
  /** Message to sign */
  message: Record<string, unknown>;
}

/**
 * Permission operation types
 */
export type PermissionOperation =
  | "llm_inference"
  | "data_analysis"
  | "model_training"
  | "data_sharing"
  | "compute_task"
  | string;

/**
 * Permission status
 */
export type PermissionStatus = "active" | "revoked" | "expired" | "pending";

/**
 * Parameters for querying permissions
 */
export interface QueryPermissionsParams {
  /** Filter by grantor address */
  grantor?: Address;
  /** Filter by grantee address */
  grantee?: Address;
  /** Filter by operation type */
  operation?: PermissionOperation;
  /** Filter by file IDs */
  files?: number[];
  /** Filter by status */
  status?: PermissionStatus;
  /** Starting block number */
  fromBlock?: bigint;
  /** Ending block number */
  toBlock?: bigint;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Permission query result
 */
export interface PermissionQueryResult {
  /** Array of permissions matching the query */
  permissions: GrantedPermission[];
  /** Total number of permissions (for pagination) */
  total: number;
  /** Whether there are more results available */
  hasMore: boolean;
}

/**
 * Permission analytics data
 */
export interface PermissionAnalytics {
  /** Total number of permissions granted */
  totalPermissions: number;
  /** Number of active permissions */
  activePermissions: number;
  /** Number of revoked permissions */
  revokedPermissions: number;
  /** Number of expired permissions */
  expiredPermissions: number;
  /** Most common operation types */
  topOperations: Array<{
    operation: PermissionOperation;
    count: number;
  }>;
  /** Most active applications */
  topApplications: Array<{
    application: Address;
    count: number;
  }>;
}

/**
 * Server information
 */
export interface Server {
  /** Server URL */
  url: string;
}

/**
 * Parameters for adding a server
 */
export interface AddServerParams {
  /** Server URL */
  url: string;
}

/**
 * Parameters for trusting a server
 */
export interface TrustServerParams {
  /** Server ID (address) */
  serverId: Address;
  /** Server URL */
  serverUrl: string;
}

/**
 * Parameters for untrusting a server
 */
export interface UntrustServerParams {
  /** Server ID (address) */
  serverId: Address;
}

/**
 * Input for trusting a server with signature (gasless)
 */
export interface TrustServerInput {
  /** User nonce */
  nonce: bigint;
  /** Server ID (address) */
  serverId: Address;
  /** Server URL */
  serverUrl: string;
}

/**
 * Input for untrusting a server with signature (gasless)
 */
export interface UntrustServerInput {
  /** User nonce */
  nonce: bigint;
  /** Server ID (address) */
  serverId: Address;
}

/**
 * EIP-712 typed data for TrustServer
 */
export interface TrustServerTypedData {
  /** EIP-712 domain */
  domain: PermissionGrantDomain;
  /** EIP-712 types */
  types: {
    TrustServer: Array<{
      name: string;
      type: string;
    }>;
  };
  /** Primary type */
  primaryType: "TrustServer";
  /** Message to sign */
  message: TrustServerInput;
}

/**
 * EIP-712 typed data for UntrustServer
 */
export interface UntrustServerTypedData {
  /** EIP-712 domain */
  domain: PermissionGrantDomain;
  /** EIP-712 types */
  types: {
    UntrustServer: Array<{
      name: string;
      type: string;
    }>;
  };
  /** Primary type */
  primaryType: "UntrustServer";
  /** Message to sign */
  message: UntrustServerInput;
}

/**
 * Permission event data
 */
export interface PermissionEvent {
  /** Event type */
  type: "granted" | "revoked" | "expired";
  /** Permission details */
  permission: GrantedPermission;
  /** Block number where event occurred */
  blockNumber: bigint;
  /** Transaction hash */
  transactionHash: Hash;
  /** Event timestamp */
  timestamp: number;
}
