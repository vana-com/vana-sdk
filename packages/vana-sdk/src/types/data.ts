import type { Address, Hash } from "viem";

/**
 * Represents a file registered on the Vana blockchain.
 *
 * @remarks
 * Contains complete metadata for files uploaded to storage and registered
 * on-chain. Each file has a unique ID, owner address, and storage URL.
 * Used throughout SDK for file operations and permission management.
 *
 * @category Data Management
 */
export interface UserFile {
  /** Unique identifier assigned by the Data Registry contract. */
  id: number;
  /** Storage URL where the encrypted file content is hosted. */
  url: string;
  /** Wallet address of the user who owns this file. */
  ownerAddress: Address;
  /** Block number when this file was registered on-chain. */
  addedAtBlock: bigint;
  /**
   * Schema identifier for data validation and structure definition.
   * Obtain schema IDs from `vana.schemas.list()` or when creating schemas via `vana.schemas.create()`.
   */
  schemaId?: number;
  /** Unix timestamp when the file was registered on-chain. */
  addedAtTimestamp?: bigint;
  /** Transaction hash of the on-chain file registration. */
  transactionHash?: Address;
  /** Additional file properties and custom application data. */
  metadata?: FileMetadata;
  /**
   * Array of DLP IDs that have submitted proofs for this file.
   * Each proof represents verification or processing by a Data Liquidity Pool.
   * Obtain DLP details via `vana.data.getDLP(dlpId)`.
   */
  dlpIds?: number[];
}

/**
 * Provides optional metadata for uploaded files and content description.
 *
 * @remarks
 * This interface contains descriptive information about uploaded files, including
 * file properties and custom application-specific data that can be used for
 * organization, validation, and display purposes.
 * @category Data Management
 */
export interface FileMetadata {
  /** Original filename as provided by the user or application. */
  name?: string;
  /** Total file size in bytes for storage tracking. */
  size?: number;
  /** MIME type identifier for content type recognition. */
  mimeType?: string;
  /** Hash value for file integrity verification. */
  checksum?: string;
  /** ISO 8601 timestamp when the file was uploaded. */
  uploadedAt?: string;
  /** Application-specific metadata for custom use cases. */
  custom?: Record<string, unknown>;
}

/**
 * High-level parameters for uploading user data with automatic encryption and blockchain registration.
 *
 * @remarks
 * This is the primary interface for uploading user data through the simplified `vana.data.upload()` method.
 * It handles the complete workflow including encryption, storage, and blockchain registration.
 *
 * When using permissions with encryption enabled (default), you must provide the public key
 * for each permission recipient.
 *
 * @example
 * ```typescript
 * // Basic file upload
 * const result = await vana.data.upload({
 *   content: "My personal data",
 *   filename: "diary.txt"
 * });
 *
 * // Upload with schema validation
 * const result = await vana.data.upload({
 *   content: { name: "John", age: 30 },
 *   filename: "profile.json",
 *   schemaId: 1
 * });
 *
 * // Upload with permissions for an app (encrypted - requires publicKey)
 * const result = await vana.data.upload({
 *   content: "Data for AI analysis",
 *   filename: "analysis.txt",
 *   permissions: [{
 *     grantee: "0x1234...",
 *     operation: "llm_inference",
 *     parameters: { model: "gpt-4" },
 *     publicKey: "0x04..." // Required when encrypt is true (default)
 *   }]
 * });
 *
 * // Upload without encryption (publicKey optional)
 * const result = await vana.data.upload({
 *   content: "Public data",
 *   filename: "public.txt",
 *   encrypt: false,
 *   permissions: [{
 *     grantee: "0x1234...",
 *     operation: "read",
 *     parameters: {}
 *   }]
 * });
 * ```
 * @category Data Management
 */
export interface UploadParams {
  /** Raw file data as string, Blob, or Buffer. */
  content: string | Blob | Buffer;
  /** Optional filename for the uploaded file. */
  filename?: string;
  /** Optional schema ID for data validation. */
  schemaId?: number;
  /** Optional file permissions to grant decryption access during upload. */
  permissions?: FilePermissionParams[];
  /** Whether to encrypt the data (defaults to true). */
  encrypt?: boolean;
  /** Optional storage provider name. */
  providerName?: string;
  /** Optional owner address (defaults to current wallet address). */
  owner?: Address;
}

/**
 * Upload parameters with encryption enabled.
 *
 * @remarks
 * This interface ensures type safety when using encrypted uploads with permissions.
 * When encrypt is true, any permissions must include public keys for encryption.
 * @category Data Management
 */
export interface EncryptedUploadParams
  extends Omit<UploadParams, "permissions" | "encrypt"> {
  /** File permissions with required public keys for encrypted data sharing. */
  permissions?: FilePermissionParams[];
  /** Encryption is enabled. */
  encrypt: true;
}

/**
 * Upload parameters with encryption disabled.
 *
 * @remarks
 * This interface is used when uploading unencrypted data.
 * @category Data Management
 */
export interface UnencryptedUploadParams extends Omit<UploadParams, "encrypt"> {
  /** Encryption is disabled. */
  encrypt: false;
}

/**
 * Parameters for granting file decryption access during upload.
 *
 * @remarks
 * This interface is used to grant decryption access to specific accounts when uploading
 * encrypted files. It only handles encryption key sharing, not operation permissions.
 *
 * For granting operation permissions (like "llm_inference"), use the separate
 * `vana.permissions.grant()` method after uploading.
 *
 * @example
 * ```typescript
 * // Upload with decryption permission
 * const result = await vana.data.upload({
 *   content: "data",
 *   permissions: [{
 *     account: "0xServerAddress...",
 *     publicKey: "0x04..." // Server's public key
 *   }]
 * });
 * ```
 * @category Data Management
 */
export interface FilePermissionParams {
  /** The account address that will be able to decrypt this file. */
  account: Address;
  /** The public key to encrypt the file's encryption key with. */
  publicKey: string;
}

/**
 * Permission parameters for granting data access.
 *
 * @remarks
 * This interface defines parameters for granting permissions to access data.
 * It's used in the permissions system but kept here for compatibility.
 *
 * @category Data Management
 */
export interface PermissionParams {
  /** The address of the application to grant permission to. */
  grantee: Address;
  /** The operation type (e.g., "llm_inference", "data_analysis", "compute_task"). */
  operation: string;
  /** Additional parameters for the permission (operation-specific configuration). */
  parameters: Record<string, unknown>;
  /** Optional nonce for the permission (auto-generated if not provided). */
  nonce?: bigint;
  /** Optional expiration timestamp (Unix seconds, no expiration if not provided). */
  expiresAt?: number;
  /**
   * Public key of the recipient to encrypt the data key for (required for upload with permissions).
   * Obtain via `vana.server.getIdentity(recipientAddress).public_key` for personal servers.
   */
  publicKey?: string;
}

/**
 * Legacy permission parameters that conflated file encryption and data access grants.
 *
 * @remarks
 * This interface was removed because it conflated two different concepts:
 * 1. File encryption permissions (handled during upload)
 * 2. Data access grants (operation permissions)
 *
 * For file uploads, use FilePermissionParams instead.
 * For data access grants, use vana.permissions.grant() after uploading.
 *
 * @deprecated Removed in v2.0.0. Use FilePermissionParams for uploads.
 * @category Data Management
 */
export interface LegacyPermissionParams {
  grantee: Address;
  operation: string;
  parameters: Record<string, unknown>;
  nonce?: bigint;
  expiresAt?: number;
  publicKey?: string;
}

/**
 * Result of the high-level upload operation.
 *
 * @remarks
 * Returned by the `vana.data.upload()` method after successful upload and blockchain registration.
 * @category Data Management
 */
export interface UploadResult {
  /** The file ID assigned by the DataRegistry contract. */
  fileId: number;
  /** The storage URL where the file is hosted. */
  url: string;
  /** The transaction hash of the blockchain registration. */
  transactionHash: Hash;
  /** The actual file size in bytes. */
  size: number;
  /** Whether the data passed schema validation (if applicable). */
  isValid?: boolean;
  /** Validation errors if schema validation failed. */
  validationErrors?: string[];
  /** Permission IDs if permissions were granted during upload. */
  permissionIds?: bigint[];
}

/**
 * Defines parameters for uploading files to storage providers with encryption options.
 *
 * @remarks
 * Used with DataController upload methods and storage operations. Supports multiple
 * content formats, optional encryption, and custom storage provider selection with
 * comprehensive metadata tracking.
 * @deprecated Use UploadParams with vana.data.upload() instead for the high-level API
 * @example
 * ```typescript
 * const uploadParams: UploadFileParams = {
 *   content: new TextEncoder().encode(JSON.stringify(userData)),
 *   metadata: {
 *     name: "personal-profile.json",
 *     mimeType: "application/json",
 *     size: 2048,
 *   },
 *   storageProvider: "ipfs",
 *   encrypt: true,
 * };
 *
 * const result = await vana.data.uploadFile(uploadParams);
 * ```
 * @category Data Management
 */
export interface UploadFileParams {
  /** Raw file data in bytes, buffer, or string format. */
  content: Uint8Array | Buffer | string;
  /** Descriptive metadata for file organization and tracking. */
  metadata?: FileMetadata;
  /** Storage provider name ("ipfs" or custom provider, uses configured default if unspecified). */
  storageProvider?: string;
  /** Enables automatic encryption before upload to storage (defaults to false). */
  encrypt?: boolean;
  /** Custom encryption key (auto-generated if encryption enabled and not provided). */
  encryptionKey?: string;
}

/**
 * Contains the result of a successful file upload operation.
 *
 * @remarks
 * This interface provides the essential information returned after uploading
 * a file to a storage provider, including access URL, size verification,
 * and encryption details when applicable.
 * @category Data Management
 */
export interface UploadFileResult {
  /** Public URL where the uploaded file can be accessed. */
  url: string;
  /** Actual file size in bytes after upload processing. */
  size: number;
  /** Hash value for verifying file integrity after upload. */
  checksum?: string;
  /** Encryption metadata when file was encrypted before storage. */
  encryption?: EncryptionInfo;
}

/**
 * Result of uploading an encrypted file to storage and blockchain
 *
 * @category Data Management
 */
export interface UploadEncryptedFileResult extends UploadFileResult {
  /** The new file ID assigned by the DataRegistry */
  fileId: number;
  /** Transaction hash of the file registration */
  transactionHash?: Hash;
}

/**
 * Encryption information for a file
 *
 * @category Data Management
 */
export interface EncryptionInfo {
  /** Encryption algorithm used */
  algorithm: string;
  /** Key derivation function */
  kdf?: string;
  /** Initialization vector */
  iv?: string;
  /** Salt used for key derivation */
  salt?: string;
  /** Key identifier */
  keyId?: string;
}

/**
 * Parameters for getting user files
 *
 * @category Data Management
 */
export interface GetUserFilesParams {
  /** Owner address to filter by */
  owner?: Address;
  /** Starting block number for filtering */
  fromBlock?: bigint;
  /** Ending block number for filtering */
  toBlock?: bigint;
  /** Maximum number of files to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Parameters for getting a specific file
 *
 * @category Data Management
 */
export interface GetFileParams {
  /** File ID to retrieve */
  fileId: number;
  /** Whether to include metadata */
  includeMetadata?: boolean;
}

/**
 * Parameters for downloading a file
 *
 * @category Data Management
 */
export interface DownloadFileParams {
  /** File URL or ID to download */
  file: string | number;
  /** Storage provider to use */
  storageProvider?: string;
  /** Decryption key if file is encrypted */
  decryptionKey?: string;
}

/**
 * Result of downloading a file
 *
 * @category Data Management
 */
export interface DownloadFileResult {
  /** File content */
  content: Uint8Array;
  /** File metadata */
  metadata?: FileMetadata;
  /** Whether the file was encrypted */
  wasEncrypted?: boolean;
}

/**
 * Parameters for deleting a file
 *
 * @category Data Management
 */
export interface DeleteFileParams {
  /** File ID to delete */
  fileId: number;
  /** Whether to also delete from storage */
  deleteFromStorage?: boolean;
  /** Storage provider to delete from */
  storageProvider?: string;
}

/**
 * Result of deleting a file
 *
 * @category Data Management
 */
export interface DeleteFileResult {
  /** Whether the file was successfully deleted from the registry */
  registryDeleted: boolean;
  /** Whether the file was successfully deleted from storage */
  storageDeleted?: boolean;
  /** Transaction hash of the deletion */
  transactionHash?: Hash;
}

/**
 * Options for encrypting a file
 *
 * @category Data Management
 */
export interface EncryptFileOptions {
  /** Encryption seed for key derivation. Defaults to DEFAULT_ENCRYPTION_SEED */
  seed?: string;
  /** MIME type for the encrypted blob if input is not already a Blob */
  mimeType?: string;
}

/**
 * Result of encrypting a file
 *
 * @category Data Management
 */
export interface EncryptFileResult {
  /** The encrypted data as a Blob */
  encryptedData: Blob;
  /** The encryption key used (derived from wallet) */
  encryptionKey: string;
}

/**
 * Options for decrypting a file
 *
 * @category Data Management
 */
export interface DecryptFileOptions {
  /** Encryption seed for key derivation. Defaults to DEFAULT_ENCRYPTION_SEED */
  seed?: string;
}

/**
 * Parameters for uploading a file with permissions
 *
 * @category Data Management
 */
export interface UploadFileWithPermissionsParams {
  /** The file data to encrypt and upload */
  data: Blob;
  /** Array of permissions to grant, each with account address and public key */
  permissions: Array<{ account: Address; publicKey: string }>;
  /** Optional filename for the upload */
  filename?: string;
  /** Optional storage provider to use */
  providerName?: string;
}

/**
 * Parameters for adding permission to a file
 *
 * @category Data Management
 */
export interface AddFilePermissionParams {
  /** The file ID to grant permission for */
  fileId: number;
  /** The account to grant permission to */
  account: Address;
  /** The public key of the account for encryption */
  publicKey: string;
}

/**
 * Options for decrypting a file with permission
 *
 * @category Data Management
 */
export interface DecryptFileWithPermissionOptions {
  /** Optional account address to verify permission against */
  account?: Address;
}

/**
 * File access permissions
 *
 * @category Data Management
 */
export interface FileAccessPermissions {
  /** Whether the file can be read */
  read: boolean;
  /** Whether the file can be written */
  write: boolean;
  /** Whether the file can be deleted */
  delete: boolean;
  /** Whether the file can be shared */
  share: boolean;
}

/**
 * File sharing configuration
 *
 * @category Data Management
 */
export interface FileSharingConfig {
  /** Addresses that can access the file */
  allowedAddresses?: Address[];
  /** Expiration time for shared access */
  expiresAt?: Date;
  /** Required permissions for shared access */
  permissions: FileAccessPermissions;
}

/**
 * Batch upload parameters
 *
 * @category Data Management
 */
export interface BatchUploadParams {
  /** Array of files to upload */
  files: UploadFileParams[];
  /** Storage provider to use for all files */
  storageProvider?: string;
  /** Whether to encrypt all files */
  encrypt?: boolean;
  /** Encryption key for all files */
  encryptionKey?: string;
}

/**
 * Batch upload result
 *
 * @category Data Management
 */
export interface BatchUploadResult {
  /** Results for each uploaded file */
  results: UploadEncryptedFileResult[];
  /** Overall success status */
  success: boolean;
  /** Any errors that occurred */
  errors?: string[];
}

/**
 * Schema metadata from the blockchain (without fetched definition).
 *
 * This represents the on-chain schema registration data before the
 * definition has been fetched from the storage URL.
 *
 * @category Data Management
 */
export interface SchemaMetadata {
  /** Schema ID */
  id: number;
  /** Schema name */
  name: string;
  /** Schema dialect ('json' or 'sqlite') */
  dialect: "json" | "sqlite";
  /** URL containing the schema definition */
  definitionUrl: string;
}

/**
 * Complete schema with all definition fields populated.
 * This is what schemas.get() returns - a schema with the definition fetched.
 */
export interface CompleteSchema extends SchemaMetadata {
  /** Version of the schema */
  version: string;
  /** Optional description of the schema */
  description?: string;
  /** Optional version of the dialect */
  dialectVersion?: string;
  /** The actual schema - JSON Schema object for 'json' dialect, DDL string for 'sqlite' */
  schema: object | string;
}

/**
 * Schema with optional definition fields.
 *
 * Schemas define the structure and validation rules for user data processed by refiners.
 * They ensure data quality and consistency across the Vana network by specifying how
 * raw user data should be formatted, validated, and processed.
 *
 * When the definition has been fetched (via schemas.get() or schemas.list() with includeDefinitions),
 * the version and schema fields will be populated. Otherwise, only the metadata fields are present.
 *
 * @category Data Management
 * @example
 * ```typescript
 * // Complete schema from schemas.get()
 * const completeSchema: Schema = {
 *   id: 5,
 *   name: 'Social Media Profile',
 *   dialect: 'json',
 *   definitionUrl: 'ipfs://QmSchema...',
 *   version: '1.0.0',
 *   description: 'Schema for validating social media profile data',
 *   schema: { // JSON Schema object
 *     type: 'object',
 *     properties: {
 *       username: { type: 'string' }
 *     }
 *   }
 * };
 *
 * // Metadata-only schema from schemas.list() without includeDefinitions
 * const metadataSchema: Schema = {
 *   id: 5,
 *   name: 'Social Media Profile',
 *   dialect: 'json',
 *   definitionUrl: 'ipfs://QmSchema...'
 * };
 * ```
 */
export interface Schema extends SchemaMetadata {
  /** Version of the schema (present when definition is fetched) */
  version?: string;
  /** Optional description of the schema */
  description?: string;
  /** Optional version of the dialect */
  dialectVersion?: string;
  /** The actual schema - JSON Schema object for 'json' dialect, DDL string for 'sqlite' (present when definition is fetched) */
  schema?: object | string;
}

/**
 * Represents a refiner with schema information
 *
 * @category Data Management
 */
export interface Refiner {
  /** Refiner ID */
  id: number;
  /** DLP ID this refiner belongs to */
  dlpId: number;
  /** Owner address */
  owner: Address;
  /** Refiner name */
  name: string;
  /** Schema ID associated with this refiner */
  schemaId: number;
  /** URL containing refinement instructions */
  refinementInstructionUrl: string;
}

/**
 * Parameters for adding a new schema
 *
 * @category Data Management
 */
export interface AddSchemaParams {
  /** Schema name */
  name: string;
  /** Schema dialect */
  dialect: string;
  /** URL containing the schema definition */
  definitionUrl: string;
}

/**
 * Result of adding a schema
 *
 * @category Data Management
 */
export interface AddSchemaResult {
  /** The new schema ID assigned by the contract */
  schemaId: number;
  /** Transaction hash of the schema registration */
  transactionHash: Hash;
}

/**
 * Parameters for registering a new data refiner in the Vana network.
 *
 * Refiners are processors that transform and validate user data according to specific
 * schemas and instructions. They enable applications to work with structured, verified
 * user data while maintaining privacy and user control.
 *
 * @category Data Management
 * @example
 * ```typescript
 * const refinerParams: AddRefinerParams = {
 *   dlpId: 1, // Data Liquidity Pool ID
 *   name: 'Social Media Refiner',
 *   schemaId: 5, // Pre-defined schema for social media data
 *   refinementInstructionUrl: 'ipfs://Qm...' // Instructions for data processing
 * };
 * ```
 */
export interface AddRefinerParams {
  /** DLP ID this refiner belongs to */
  dlpId: number;
  /** Refiner name */
  name: string;
  /** Schema ID to associate with this refiner */
  schemaId: number;
  /** URL containing refinement instructions */
  refinementInstructionUrl: string;
}

/**
 * Result of adding a refiner
 *
 * @category Data Management
 */
export interface AddRefinerResult {
  /** The new refiner ID assigned by the contract */
  refinerId: number;
  /** Transaction hash of the refiner registration */
  transactionHash: Hash;
}

/**
 * Parameters for updating a refiner's schema ID
 *
 * @category Data Management
 */
export interface UpdateSchemaIdParams {
  /** Refiner ID to update */
  refinerId: number;
  /** New schema ID to associate with the refiner */
  newSchemaId: number;
}

/**
 * Result of updating a refiner's schema ID
 *
 * @category Data Management
 */
export interface UpdateSchemaIdResult {
  /** Transaction hash of the update */
  transactionHash: Hash;
}

/**
 * Trusted server data structure
 *
 * @category Data Management
 */
export interface TrustedServer {
  /** Unique identifier for the trusted server relationship */
  id: string;
  /** Server address (EVM address) */
  serverAddress: Address;
  /** Server URL */
  serverUrl: string;
  /** Timestamp when server was trusted */
  trustedAt: bigint;
  /** User who trusted the server */
  user: Address;
  /** Index in user's trusted server list (only available in RPC mode) */
  trustIndex?: number;
}

/**
 * Parameters for getUserTrustedServers method
 *
 * @category Data Management
 */
export interface GetUserTrustedServersParams {
  /** User address to query trusted servers for */
  user: Address;
  /** Optional subgraph URL to override default */
  subgraphUrl?: string;
}
