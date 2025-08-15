import type { Address } from "viem";
import type { BaseTransactionResult } from "../utils/transactionParsing";

/**
 * Transaction result types for all SDK operations.
 * These interfaces define the structure of data returned by enhanced
 * transaction methods that parse blockchain events automatically.
 */

// =============================================================================
// PERMISSION OPERATIONS
// =============================================================================

/**
 * Result of a successful permission grant operation.
 * Contains data from the PermissionAdded blockchain event.
 */
export interface PermissionGrantResult extends BaseTransactionResult {
  /** Unique permission ID for this grant */
  permissionId: bigint;
  /** Address of the user who granted the permission */
  user: Address;
  /** URL where the grant file is stored (IPFS/CDN) */
  grant: string;
  /** Array of file IDs covered by this permission */
  fileIds: readonly bigint[];
}

/**
 * Result of a successful permission revocation operation.
 * Contains data from the PermissionRevoked blockchain event.
 */
export interface PermissionRevokeResult extends BaseTransactionResult {
  /** ID of the permission that was revoked */
  permissionId: bigint;
}

/**
 * Result of a successful server trust operation.
 * Contains data from the ServerTrusted blockchain event.
 */
export interface ServerTrustResult extends BaseTransactionResult {
  /** Address of the user who trusted the server */
  user: Address;
  /** Address/ID of the trusted server */
  serverId: Address;
  /** URL of the trusted server */
  serverUrl: string;
}

/**
 * Result of a successful server untrust operation.
 * Contains data from the ServerUntrusted blockchain event.
 */
export interface ServerUntrustResult extends BaseTransactionResult {
  /** Address of the user who untrusted the server */
  user: Address;
  /** Address/ID of the untrusted server */
  serverId: Address;
}

/**
 * Result of a successful server registration operation.
 * Contains data from the ServerRegistered blockchain event.
 */
export interface ServerRegisterResult extends BaseTransactionResult {
  /** Unique server ID assigned by the registry */
  serverId: bigint;
  /** URL of the registered server */
  url: string;
  /** Owner address of the server */
  owner: Address;
}

/**
 * Result of a successful server update operation.
 * Contains data from the ServerUpdated blockchain event.
 */
export interface ServerUpdateResult extends BaseTransactionResult {
  /** ID of the server that was updated */
  serverId: bigint;
  /** New URL of the server */
  url: string;
}

/**
 * Result of a successful grantee registration operation.
 * Contains data from the GranteeRegistered blockchain event.
 */
export interface GranteeRegisterResult extends BaseTransactionResult {
  /** Unique grantee ID assigned by the registry */
  granteeId: bigint;
  /** Address of the registered grantee */
  granteeAddress: Address;
  /** Display name of the grantee */
  name: string;
}

// =============================================================================
// DATA REGISTRY OPERATIONS
// =============================================================================

/**
 * Result of a successful file addition operation.
 * Contains data from the FileAdded blockchain event.
 */
export interface FileAddedResult extends BaseTransactionResult {
  /** Unique file ID assigned by the registry */
  fileId: bigint;
  /** Address of the file owner */
  ownerAddress: Address;
  /** URL where the file is stored */
  url: string;
}

/**
 * Result of a successful schema addition operation.
 * Contains data from the SchemaAdded blockchain event.
 */
export interface SchemaAddedResult extends BaseTransactionResult {
  /** Unique schema ID assigned by the registry */
  schemaId: bigint;
  /** Human-readable name of the schema */
  name: string;
  /** Schema dialect (e.g., "jsonschema") */
  dialect: string;
  /** URL where the schema definition is stored */
  definitionUrl: string;
}

/**
 * Result of a successful refiner addition operation.
 * Contains data from the RefinerAdded blockchain event.
 */
export interface RefinerAddedResult extends BaseTransactionResult {
  /** Unique refiner ID assigned by the registry */
  refinerId: bigint;
  /** DLP ID this refiner belongs to */
  dlpId: bigint;
  /** Human-readable name of the refiner */
  name: string;
  /** Schema ID this refiner uses */
  schemaId: bigint;
  /** URL where the schema definition is stored */
  schemaDefinitionUrl: string;
  /** URL with refiner processing instructions */
  refinementInstructionUrl: string;
}

/**
 * Result of a successful schema ID update operation.
 * Contains data from the RefinerSchemaUpdated blockchain event.
 */
export interface SchemaUpdateResult extends BaseTransactionResult {
  /** ID of the refiner that was updated */
  refinerId: bigint;
  /** New schema ID */
  schemaId: bigint;
  /** URL of the new schema definition */
  schemaDefinitionUrl: string;
}

/**
 * Result of a successful file permission addition operation.
 * Contains data from the FilePermissionAdded blockchain event.
 */
export interface FilePermissionResult extends BaseTransactionResult {
  /** File ID the permission was added to */
  fileId: bigint;
  /** Account that was granted permission */
  account: Address;
  /** Encrypted key for file access */
  encryptedKey: string;
}

// =============================================================================
// UNION TYPES FOR GENERIC OPERATIONS
// =============================================================================

/**
 * Union type of all possible transaction result types.
 * Useful for generic functions that handle multiple operation types.
 */
export type AnyTransactionResult =
  | PermissionGrantResult
  | PermissionRevokeResult
  | ServerTrustResult
  | ServerUntrustResult
  | ServerRegisterResult
  | ServerUpdateResult
  | GranteeRegisterResult
  | FileAddedResult
  | SchemaAddedResult
  | RefinerAddedResult
  | SchemaUpdateResult
  | FilePermissionResult;

// =============================================================================
// TYPE UTILITIES
// =============================================================================

/**
 * Maps transaction operation names to their result types.
 * Used for type inference in generic transaction parsing functions.
 */
export interface TransactionResultMap {
  grant: PermissionGrantResult;
  revoke: PermissionRevokeResult;
  revokePermission: PermissionRevokeResult;
  addServerFilesAndPermissions: PermissionGrantResult;
  trustServer: ServerTrustResult;
  untrustServer: ServerUntrustResult;
  registerServer: ServerRegisterResult;
  updateServer: ServerUpdateResult;
  addAndTrustServer: ServerTrustResult;
  registerGrantee: GranteeRegisterResult;
  addFile: FileAddedResult;
  addFileWithPermissionsAndSchema: FileAddedResult;
  addFileWithSchema: FileAddedResult;
  addFileWithPermissions: FileAddedResult;
  addRefinement: RefinerAddedResult;
  addRefiner: RefinerAddedResult;
  updateSchemaId: SchemaUpdateResult;
  addSchema: SchemaAddedResult;
  updateRefinement: SchemaUpdateResult;
  addFilePermission: FilePermissionResult;
}
