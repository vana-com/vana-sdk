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
  /** Grantee ID from the DataPortabilityGrantees contract */
  granteeId?: bigint;
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
 *
 * @category Permissions
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
 *
 * @category Permissions
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
 *
 * @category Permissions
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
 *
 * @category Permissions
 */
export interface PermissionInputMessage {
  /** Nonce */
  nonce: bigint;
  /** Grantee ID from the DataPortabilityGrantees contract */
  granteeId: bigint;
  /** Grant URL */
  grant: string;
  /** File IDs */
  fileIds: bigint[];
}

/**
 * Contract PermissionInput structure
 *
 * @category Permissions
 */
export interface PermissionInput {
  /** Nonce */
  nonce: bigint;
  /** Grantee ID from the DataPortabilityGrantees contract */
  granteeId: bigint;
  /** Grant URL */
  grant: string;
  /** File IDs to grant permission for */
  fileIds: bigint[];
}

/**
 * Contract RevokePermissionInput structure
 *
 * @category Permissions
 */
export interface RevokePermissionInput {
  /** Nonce */
  nonce: bigint;
  /** Permission ID to revoke */
  permissionId: bigint;
}

/**
 * Contract Permission Info structure returned from the new DataPortabilityPermissions contract
 *
 * @category Permissions
 */
export interface PermissionInfo {
  /** Permission ID */
  id: bigint;
  /** Address that granted the permission */
  grantor: Address;
  /** Nonce used when creating */
  nonce: bigint;
  /** Grantee ID from the DataPortabilityGrantees contract */
  granteeId: bigint;
  /** Grant URL */
  grant: string;
  /** Signature bytes */
  signature: `0x${string}`;
  /** Start block when permission becomes active */
  startBlock: bigint;
  /** End block when permission expires */
  endBlock: bigint;
  /** File IDs associated with this permission */
  fileIds: bigint[];
}

/**
 * EIP-712 Permission message structure (simplified future format)
 *
 * @category Permissions
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
 *
 * @category Permissions
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
 *
 * @category Permissions
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
 *
 * @category Permissions
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
 *
 * @category Permissions
 */
export type PermissionStatus = "active" | "revoked" | "expired" | "pending";

/**
 * Parameters for querying permissions
 *
 * @category Permissions
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
 *
 * @category Permissions
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
 *
 * @category Permissions
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
 *
 * @category Permissions
 */
export interface Server {
  /** Server URL */
  url: string;
}

/**
 * Parameters for trusting an existing server
 *
 * @category Permissions
 */
export interface TrustServerParams {
  /** Server ID (address) */
  serverId: Address;
}

/**
 * Parameters for untrusting a server
 *
 * @category Permissions
 */
export interface UntrustServerParams {
  /** Server ID (address) */
  serverId: Address;
}

/**
 * Parameters for adding and trusting a new server
 *
 * @category Permissions
 */
export interface AddAndTrustServerParams {
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
 * Input for adding and trusting a server with signature (gasless)
 *
 * @category Permissions
 */
export interface AddAndTrustServerInput {
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
 * Input for trusting a server with signature (gasless)
 *
 * @category Permissions
 */
export interface TrustServerInput {
  /** User nonce */
  nonce: bigint;
  /** Server ID */
  serverId: bigint;
}

/**
 * Input for untrusting a server with signature (gasless)
 *
 * @category Permissions
 */
export interface UntrustServerInput {
  /** User nonce */
  nonce: bigint;
  /** Server ID */
  serverId: bigint;
}

/**
 * EIP-712 typed data for TrustServer
 *
 * @category Permissions
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
 * EIP-712 typed data for AddAndTrustServer
 *
 * @category Permissions
 */
export interface AddAndTrustServerTypedData {
  /** EIP-712 domain */
  domain: PermissionGrantDomain;
  /** EIP-712 types */
  types: {
    AddAndTrustServer: Array<{
      name: string;
      type: string;
    }>;
  };
  /** Primary type */
  primaryType: "AddAndTrustServer";
  /** Message to sign */
  message: AddAndTrustServerInput;
}

/**
 * EIP-712 typed data for UntrustServer
 *
 * @category Permissions
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
 *
 * @category Permissions
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
 *
 * @category Permissions
 */
export interface TrustedServerInfo {
  /** Server ID (address) */
  serverId: Address;
  /** Server URL */
  url: string;
  /** Whether this server is trusted by the user */
  isTrusted: boolean;
  /** Index in user's trusted server list (if trusted) */
  trustIndex?: number;
}

/**
 * Paginated result for trusted server queries
 *
 * @category Permissions
 */
export interface PaginatedTrustedServers {
  /** Array of server addresses */
  servers: Address[];
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
 *
 * @category Permissions
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
 *
 * @category Permissions
 */
export interface BatchServerInfoResult {
  /** Successfully retrieved server info */
  servers: Map<Address, { url: string }>;
  /** Server IDs that failed to retrieve */
  failed: Address[];
}

/**
 * Server trust status information
 *
 * @category Permissions
 */
export interface ServerTrustStatus {
  /** Server ID being checked */
  serverId: Address;
  /** Whether the server is trusted by the user */
  isTrusted: boolean;
  /** Index in user's trusted server list (if trusted) */
  trustIndex?: number;
}
