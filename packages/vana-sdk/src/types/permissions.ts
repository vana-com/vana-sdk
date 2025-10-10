import type { Address, Hash } from "viem";

/**
 * Base interface for types that need to be compatible with Record<string, unknown>
 *
 * @category Permissions
 */
export interface RecordCompatible {
  [key: string]: unknown;
}

/**
 * Contains on-chain permission data for efficient retrieval.
 *
 * @remarks
 * Provides fast access to permission metadata from subgraph without
 * IPFS calls. For detailed parameters, resolve `grantUrl` separately.
 *
 * @category Permissions
 * @example
 * ```typescript
 * const grants = await vana.permissions.getUserPermissionGrantsOnChain();
 *
 * // Resolve details when needed
 * const details = await retrieveGrantFile(grants[0].grantUrl);
 * console.log(`Operation: ${details.operation}`);
 * ```
 */
export interface OnChainPermissionGrant {
  /** Unique identifier for the permission */
  id: bigint;
  /** The grant URL containing detailed permission parameters (IPFS link) */
  grantUrl: string;
  /** Cryptographic signature that authorized this permission */
  grantSignature: string;
  /** Nonce used when granting the permission */
  nonce: bigint;
  /** Block number when permission started */
  startBlock: bigint;
  /** Block number when permission was granted */
  addedAtBlock: bigint;
  /** Timestamp when permission was added */
  addedAtTimestamp: bigint;
  /** Transaction hash of the grant transaction */
  transactionHash: string;
  /** Address that granted the permission */
  grantor: Address;
  /** Grantee information */
  grantee: {
    /** Grantee ID */
    id: string;
    /** Grantee address */
    address: string;
  };
  /** Whether the permission is still active (not revoked) */
  active: boolean;
}

/**
 * Options for retrieving user permissions
 *
 * @category Permissions
 */
export interface GetUserPermissionsOptions {
  /** Maximum number of permissions to retrieve */
  limit?: number;
  /** Whether to fetch all permissions (ignores limit) */
  fetchAll?: boolean;
  /** Custom subgraph URL to use for querying */
  subgraphUrl?: string;
}

/**
 * Defines parameters for granting file access permissions.
 *
 * @remarks
 * Specifies application, operation, files, and parameters for
 * permission grants via `vana.permissions.grant()`.
 *
 * @category Permissions
 * @example
 * ```typescript
 * const params: GrantPermissionParams = {
 *   grantee: '0x1234...',
 *   operation: 'llm_inference',
 *   files: [1, 2, 3],
 *   parameters: { model: 'gpt-4', maxTokens: 1000 }
 * };
 * const result = await vana.permissions.grant(params);
 * ```
 */
export interface GrantPermissionParams {
  /** The on-chain identity of the application */
  grantee: Address;
  /** The class of computation, e.g., "llm_inference" */
  operation: string;
  /**
   * Array of file IDs to grant permission for.
   * Obtain file IDs from `vana.data.getUserFiles()` or from upload results via `vana.data.upload().fileId`.
   */
  files: number[];
  /** The full, off-chain parameters (e.g., LLM prompt) */
  parameters: Record<string, unknown>;
  /** Optional JSONPath filters to apply to files, keyed by file ID */
  filters?: Record<string, string>;
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
export interface PermissionInputMessage extends RecordCompatible {
  /** Nonce */
  nonce: bigint;
  /** Grantee ID */
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
  /** Grantee ID */
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
export interface RevokePermissionInput extends RecordCompatible {
  /** Nonce */
  nonce: bigint;
  /** Permission ID to revoke */
  permissionId: bigint;
}

/**
 * Contract Permission Info structure returned from the contract
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
  /** Grantee ID */
  granteeId: bigint;
  /** Grant URL */
  grant: string;
  /** Signature bytes (removed in newer contract versions) */
  signature?: `0x${string}`;
  /** Start block */
  startBlock: bigint;
  /** End block */
  endBlock: bigint;
  /** File IDs associated with this permission */
  fileIds: readonly bigint[];
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
export interface PermissionGrantTypedData extends GenericTypedData {
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
export interface GenericTypedData extends RecordCompatible {
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
 * Represents EIP-712 typed data for permission revocation.
 *
 * @remarks
 * Used when revoking previously granted permissions through gasless transactions.
 * The message contains a nonce and the permission ID to revoke.
 *
 * @category Permissions
 */
export interface RevokePermissionTypedData extends GenericTypedData {
  /** EIP-712 type definitions for the RevokePermission structure */
  types: {
    RevokePermission: Array<{
      name: string;
      type: string;
    }>;
  };
  /** The primary type identifier for revocation operations */
  primaryType: "RevokePermission";
  /** The structured message containing revocation parameters */
  message: RevokePermissionInput;
}

/**
 * Defines all valid primary types for EIP-712 typed data in the Vana SDK.
 *
 * @remarks
 * These literal types ensure compile-time safety when handling typed data operations.
 * Each corresponds to a specific blockchain operation type.
 *
 * @category Permissions
 */
export type TypedDataPrimaryType =
  | "Permission"
  | "RevokePermission"
  | "TrustServer"
  | "UntrustServer"
  | "AddServer"
  | "RegisterGrantee"
  | "ServerFilesAndPermission";

/**
 * Represents the union of all specific typed data interfaces.
 *
 * @remarks
 * Enables type-safe handling of any typed data structure in the SDK.
 * Used internally by relayer handlers and signature verification.
 *
 * @category Permissions
 */
export type SpecificTypedData =
  | PermissionGrantTypedData
  | RevokePermissionTypedData
  | TrustServerTypedData
  | UntrustServerTypedData
  | AddAndTrustServerTypedData
  | RegisterGranteeTypedData
  | ServerFilesAndPermissionTypedData;

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
 * Granted permission details
 *
 * @category Permissions
 */
export interface GrantedPermission {
  /** Unique identifier for the permission */
  id: bigint;
  /** Array of file IDs that the permission applies to */
  files: number[];
  /** The type of operation being granted permission for */
  operation: string;
  /** Grant file reference (IPFS hash or URL) */
  grant: string;
  /** Address of the application granted permission */
  grantee: Address;
  /** Address of the user who granted permission */
  grantor: Address;
  /** Custom parameters for the operation */
  parameters: Record<string, unknown>;
  /** Whether the permission is still active */
  active: boolean;
  /** Data status for the permission */
  dataStatus?: string;
  /** Nonce used for the permission */
  nonce?: number;
  /** Timestamp when permission was granted */
  grantedAt?: number;
  /** Optional expiration timestamp */
  expiresAt?: number;
  /** Transaction hash of the grant transaction */
  transactionHash?: string;
  /** Block number when permission was granted */
  blockNumber?: bigint;
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
  /** Server ID (numeric) */
  id: number;
  /** Server owner address */
  owner: Address;
  /** Server URL */
  url: string;
  /** Server address */
  serverAddress: Address;
  /** Server public key */
  publicKey: string;
}

/**
 * Contract ServerInfo structure returned from the contract
 *
 * @category Permissions
 */
export interface ServerInfo {
  /** Server ID */
  id: bigint;
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
 * Parameters for adding and trusting a server
 *
 * @category Permissions
 */
export interface AddAndTrustServerParams {
  /** Server address */
  serverAddress: Address;
  /** Server URL */
  serverUrl: string;
  /** Server public key */
  publicKey: string;
}

/**
 * Parameters for trusting a server (legacy)
 *
 * @category Permissions
 * @deprecated Use AddAndTrustServerParams instead
 */
export interface TrustServerParams {
  /** Server ID (numeric) */
  serverId: number;
}

/**
 * Parameters for untrusting a server
 *
 * @category Permissions
 */
export interface UntrustServerParams {
  /** Server ID (numeric) */
  serverId: number;
}

/**
 * Input for adding and trusting a server with signature (gasless)
 *
 * @category Permissions
 */
export interface AddAndTrustServerInput extends RecordCompatible {
  /** User nonce */
  nonce: bigint;
  /** Server address */
  serverAddress: Address;
  /** Server URL */
  serverUrl: string;
  /** Server public key */
  publicKey: string;
}

/**
 * Input for trusting a server with signature (gasless)
 *
 * @category Permissions
 * @deprecated Use AddAndTrustServerInput instead
 */
export interface TrustServerInput extends RecordCompatible {
  /** User nonce */
  nonce: bigint;
  /** Server ID (numeric) */
  serverId: number;
}

/**
 * Input for untrusting a server with signature (gasless)
 *
 * @category Permissions
 */
export interface UntrustServerInput extends RecordCompatible {
  /** User nonce */
  nonce: bigint;
  /** Server ID (numeric) */
  serverId: number;
}

/**
 * EIP-712 typed data for AddAndTrustServer
 *
 * @category Permissions
 */
export interface AddAndTrustServerTypedData extends GenericTypedData {
  /** EIP-712 types */
  types: {
    AddServer: Array<{
      name: string;
      type: string;
    }>;
  };
  /** Primary type */
  primaryType: "AddServer";
  /** Message to sign */
  message: AddAndTrustServerInput;
}

/**
 * EIP-712 typed data for TrustServer
 *
 * @category Permissions
 * @deprecated Use AddAndTrustServerTypedData instead
 */
export interface TrustServerTypedData extends GenericTypedData {
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
 *
 * @category Permissions
 */
export interface UntrustServerTypedData extends GenericTypedData {
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
  /** Server ID */
  id: bigint;
  /** Server owner address */
  owner: Address;
  /** Server address */
  serverAddress: Address;
  /** Server public key */
  publicKey: string;
  /** Server URL */
  url: string;
  /** Start block when trust relationship began */
  startBlock: bigint;
  /** End block when trust relationship ended (0 if still active) */
  endBlock: bigint;
}

/**
 * Paginated result for trusted server queries
 *
 * @category Permissions
 */
export interface PaginatedTrustedServers {
  /** Array of server IDs (numeric) */
  servers: number[];
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
  servers: Map<number, Server>;
  /** Server IDs that failed to retrieve */
  failed: number[];
}

/**
 * Server trust status information
 *
 * @category Permissions
 */
export interface ServerTrustStatus {
  /** Server ID being checked (numeric) */
  serverId: number;
  /** Whether the server is trusted by the user */
  isTrusted: boolean;
  /** Index in user's trusted server list (if trusted) */
  trustIndex?: number;
}

/**
 * Grantee information
 *
 * @category Permissions
 */
export interface Grantee {
  /** Grantee ID (numeric) */
  id: number;
  /** Grantee owner address */
  owner: Address;
  /** Grantee address */
  address: Address;
  /** Grantee public key */
  publicKey: string;
  /** Permission IDs associated with this grantee */
  permissionIds: number[];
}

/**
 * Contract GranteeInfo structure returned from the contract
 *
 * @category Permissions
 */
export interface GranteeInfo {
  /** Grantee owner address */
  owner: Address;
  /** Grantee address */
  granteeAddress: Address;
  /** Grantee public key */
  publicKey: string;
  /** Permission IDs associated with this grantee */
  permissionIds: readonly bigint[];
}

/**
 * Parameters for registering a grantee
 *
 * @category Permissions
 */
export interface RegisterGranteeParams {
  /** Grantee owner address */
  owner: Address;
  /** Grantee address */
  granteeAddress: Address;
  /** Grantee public key */
  publicKey: string;
}

/**
 * Input for registering a grantee with signature (gasless)
 *
 * @category Permissions
 */
export interface RegisterGranteeInput extends RecordCompatible {
  /** User nonce */
  nonce: bigint;
  /** Grantee owner address */
  owner: Address;
  /** Grantee address */
  granteeAddress: Address;
  /** Grantee public key */
  publicKey: string;
}

/**
 * EIP-712 typed data for RegisterGrantee
 *
 * @category Permissions
 */
export interface RegisterGranteeTypedData extends GenericTypedData {
  /** EIP-712 types */
  types: {
    RegisterGrantee: Array<{
      name: string;
      type: string;
    }>;
  };
  /** Primary type */
  primaryType: "RegisterGrantee";
  /** Message to sign */
  message: RegisterGranteeInput;
}

/**
 * Options for querying grantees
 *
 * @category Permissions
 */
export interface GranteeQueryOptions {
  /** Maximum number of grantees to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Whether to include permission info or just basic info */
  includePermissions?: boolean;
}

/**
 * Paginated result for grantee queries
 *
 * @category Permissions
 */
export interface PaginatedGrantees {
  /** Array of grantees */
  grantees: Grantee[];
  /** Total number of grantees */
  total: number;
  /** Offset used for this query */
  offset: number;
  /** Limit used for this query */
  limit: number;
  /** Whether there are more grantees beyond this page */
  hasMore: boolean;
}

/**
 * Contract Permission structure as used in ServerFilesAndPermissionInput
 *
 * @category Permissions
 */
export interface Permission {
  /** Account address for the permission */
  account: Address;
  /** Permission key */
  key: string;
}

/**
 * Contract ServerFilesAndPermissionInput structure
 *
 * @category Permissions
 */
export interface ServerFilesAndPermissionInput {
  /** User nonce */
  nonce: bigint;
  /** Grantee ID */
  granteeId: bigint;
  /** Grant URL */
  grant: string;
  /** File URLs */
  fileUrls: string[];
  /** Server address */
  serverAddress: Address;
  /** Server URL */
  serverUrl: string;
  /** Server public key */
  serverPublicKey: string;
  /** File permissions array - permissions for each file */
  filePermissions: Permission[][];
}

/**
 * Parameters for server files and permissions operations
 *
 * @category Permissions
 */
export interface ServerFilesAndPermissionParams {
  /** Grantee ID */
  granteeId: bigint;
  /** Grant URL or grant data */
  grant: string;
  /** File URLs */
  fileUrls: string[];
  /** Schema IDs for each file - use 0 for files without schema validation */
  schemaIds: number[];
  /** Server address */
  serverAddress: Address;
  /** Server URL */
  serverUrl: string;
  /** Server public key */
  serverPublicKey: string;
  /** File permissions array - permissions for each file */
  filePermissions: Permission[][];
}

/**
 * EIP-712 typed data for server files and permissions messages
 *
 * @category Permissions
 */
export interface ServerFilesAndPermissionTypedData extends GenericTypedData {
  /** Message data structure */
  message: {
    /** User nonce */
    nonce: bigint;
    /** Grantee ID */
    granteeId: bigint;
    /** Grant URL */
    grant: string;
    /** File URLs */
    fileUrls: string[];
    /** Schema IDs for each file - use 0 for files without schema validation */
    schemaIds: bigint[];
    /** Server address */
    serverAddress: Address;
    /** Server URL */
    serverUrl: string;
    /** Server public key */
    serverPublicKey: string;
    /** File permissions array - permissions for each file */
    filePermissions: Permission[][];
  };
}
