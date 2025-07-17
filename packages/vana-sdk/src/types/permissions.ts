import type { Address, Hash } from "viem";

/**
 * Represents a granted permission from the DataPermissions contract.
 *
 * This interface describes the structure of permissions that have been granted
 * on-chain, including all the metadata and parameters associated with the permission.
 * Used when querying user permissions or checking access rights.
 *
 * @category Permissions
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
 * Parameters for granting data access permission to an application.
 *
 * This interface defines the required and optional parameters when granting
 * an application permission to access specific files for a particular operation.
 * Used with `vana.permissions.grant()`.
 *
 * @category Permissions
 * @example
 * ```typescript
 * const params: GrantPermissionParams = {
 *   to: '0x1234...', // Application address
 *   operation: 'llm_inference',
 *   files: [1, 2, 3], // File IDs to grant access to
 *   parameters: {
 *     model: 'gpt-4',
 *     maxTokens: 1000,
 *     prompt: 'Analyze my data'
 *   }
 * };
 * ```
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
 * Parameters for revoking a previously granted data access permission.
 *
 * Used with `PermissionsController.revoke()` to remove an application's access
 * to user data. Once revoked, the application can no longer use the permission
 * to access the specified files.
 *
 * @category Permissions
 * @example
 * ```typescript
 * const revokeParams: RevokePermissionParams = {
 *   permissionId: 123n // Permission ID to revoke
 * };
 *
 * await vana.permissions.revoke(revokeParams);
 * ```
 */
export interface RevokePermissionParams {
  /** The permission ID to revoke */
  permissionId: bigint;
}

/**
 * Parameters for checking if a specific permission exists and is valid.
 *
 * Used to verify whether an application has active permission to access
 * specific user files for a particular operation before attempting to use the data.
 *
 * @category Permissions
 * @example
 * ```typescript
 * const checkParams: CheckPermissionParams = {
 *   application: '0x1234...', // App address
 *   operation: 'llm_inference',
 *   files: [1, 2, 3], // File IDs to check
 *   parameters: { model: 'gpt-4' }, // Operation parameters
 *   user: '0xabcd...' // Optional specific user
 * };
 *
 * const hasPermission = await vana.permissions.check(checkParams);
 * ```
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
  /** Application ID */
  applicationId: bigint;
  /** Grant URL */
  grant: string;
  /** File IDs */
  fileIds: bigint[];
}

/**
 * Contract PermissionInput structure
 */
export interface PermissionInput {
  /** Nonce */
  nonce: bigint;
  /** Application ID */
  applicationId: bigint;
  /** Grant URL */
  grant: string;
  /** File IDs to grant permission for */
  fileIds: bigint[];
}

/**
 * Contract RevokePermissionInput structure
 */
export interface RevokePermissionInput {
  /** Nonce */
  nonce: bigint;
  /** Permission ID to revoke */
  permissionId: bigint;
}

/**
 * Contract Permission Info structure returned from the contract
 */
export interface PermissionInfo {
  /** Permission ID */
  id: bigint;
  /** Address that granted the permission */
  grantor: Address;
  /** Nonce used when creating */
  nonce: bigint;
  /** Application ID */
  applicationId: bigint;
  /** Grant URL */
  grant: string;
  /** Signature bytes */
  signature: `0x${string}`;
  /** Whether the permission is active */
  isActive: boolean;
  /** File IDs associated with this permission */
  fileIds: bigint[];
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
 * Grant file structure containing permission details.
 *
 * Grant files contain the complete specification of what an application is permitted
 * to do with user data, including operation parameters and file access rights.
 *
 * @category Permissions
 * @example
 * ```typescript
 * const grantFile: GrantFile = {
 *   grantee: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
 *   operation: 'llm_inference',
 *   parameters: {
 *     prompt: 'Analyze this data: {{data}}',
 *     model: 'gpt-4',
 *     maxTokens: 2000,
 *     temperature: 0.7
 *   },
 *   expires: 1736467579
 * };
 * ```
 */
export interface GrantFile {
  /** EVM address of the application authorized to use this grant */
  grantee: Address;
  /** Operation the grantee is authorized to perform */
  operation: string;
  /** Operation-specific parameters */
  parameters: Record<string, unknown>;
  /** Optional Unix timestamp when grant expires (seconds since epoch per POSIX.1-2008) */
  expires?: number;
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
  /** Server owner address */
  owner: Address;
  /** Server address */
  serverAddress: Address;
  /** Server public key */
  publicKey: string;
  /** Server URL */
  url: string;
}

/**
 * Application information
 */
export interface Application {
  /** Application owner address */
  owner: Address;
  /** Application address */
  applicationAddress: Address;
  /** Application public key */
  publicKey: string;
  /** Permission IDs associated with this application */
  permissionIds: bigint[];
}

/**
 * Parameters for trusting a server
 */
export interface TrustServerParams {
  /** Server owner address */
  owner: Address;
  /** Server address */
  serverAddress: Address;
  /** Server public key */
  publicKey: string;
  /** Server URL */
  serverUrl: string;
}

/**
 * Parameters for untrusting a server
 */
export interface UntrustServerParams {
  /** Server ID (uint256) */
  serverId: bigint;
}

/**
 * Input for trusting a server with signature (gasless)
 */
export interface TrustServerInput {
  /** User nonce */
  nonce: bigint;
  /** Server owner address */
  owner: Address;
  /** Server address */
  serverAddress: Address;
  /** Server public key */
  publicKey: `0x${string}`;
  /** Server URL */
  serverUrl: string;
}

/**
 * Input for untrusting a server with signature (gasless)
 */
export interface UntrustServerInput {
  /** User nonce */
  nonce: bigint;
  /** Server ID (uint256) */
  serverId: bigint;
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

/**
 * Enhanced trusted server information with trust status
 */
export interface TrustedServerInfo {
  /** Server ID (uint256) */
  serverId: bigint;
  /** Server URL */
  url: string;
  /** Whether this server is trusted by the user */
  isTrusted: boolean;
  /** Index in user's trusted server list (if trusted) */
  trustIndex?: number;
}

/**
 * Paginated result for trusted server queries
 */
export interface PaginatedTrustedServers {
  /** Array of server IDs */
  servers: bigint[];
  /** Total number of trusted servers */
  total: number;
  /** Offset used for this query */
  offset: number;
  /** Limit used for this query */
  limit: number;
  /** Whether there are more servers beyond this page */
  hasMore: boolean;
}

/**
 * Options for querying trusted servers
 */
export interface TrustedServerQueryOptions {
  /** User address to query (defaults to current user) */
  userAddress?: Address;
  /** Maximum number of servers to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Whether to include full server info or just IDs */
  includeServerInfo?: boolean;
}

/**
 * Result of batch server info requests
 */
export interface BatchServerInfoResult {
  /** Successfully retrieved server info */
  servers: Map<bigint, Server>;
  /** Server IDs that failed to retrieve */
  failed: bigint[];
}

/**
 * Server trust status information
 */
export interface ServerTrustStatus {
  /** Server ID being checked */
  serverId: bigint;
  /** Whether the server is trusted by the user */
  isTrusted: boolean;
  /** Index in user's trusted server list (if trusted) */
  trustIndex?: number;
}

/**
 * Parameters for registering an application
 */
export interface RegisterApplicationParams {
  /** Application owner address */
  owner: Address;
  /** Application address */
  applicationAddress: Address;
  /** Application public key */
  publicKey: string;
}

/**
 * Parameters for registering a server
 */
export interface RegisterServerParams {
  /** Server owner address */
  owner: Address;
  /** Server address */
  serverAddress: Address;
  /** Server public key */
  publicKey: string;
  /** Server URL */
  url: string;
}

/**
 * Parameters for updating a server
 */
export interface UpdateServerParams {
  /** Server ID */
  serverId: bigint;
  /** New server URL */
  url: string;
}
