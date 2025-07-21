import type { Address, Hash } from "viem";

/**
 * Represents a registered data file in the Vana network with complete blockchain metadata.
 *
 * @remarks
 * This interface describes files that have been uploaded to storage and registered
 * on the Vana blockchain, including their storage location, ownership, and blockchain
 * tracking information. Each file receives a unique ID and is linked to the owner's
 * address for permission management. Used throughout the SDK for file operations
 * and access control workflows.
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
  /** Schema identifier for data validation and structure definition. */
  schemaId?: number;
  /** Unix timestamp when the file was registered on-chain. */
  addedAtTimestamp?: bigint;
  /** Transaction hash of the on-chain file registration. */
  transactionHash?: Address;
  /** Additional file properties and custom application data. */
  metadata?: FileMetadata;
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
  /** Optional permissions to grant during upload. */
  permissions?: PermissionParams[];
  /** Whether to encrypt the data (defaults to true). */
  encrypt?: boolean;
  /** Optional storage provider name. */
  providerName?: string;
}

/**
 * Upload parameters with encryption enabled (requires EncryptedPermissionParams).
 *
 * @remarks
 * This interface ensures type safety when using encrypted uploads with permissions.
 * @category Data Management
 */
export interface EncryptedUploadParams
  extends Omit<UploadParams, "permissions" | "encrypt"> {
  /** Permissions with required public keys for encrypted data sharing. */
  permissions?: EncryptedPermissionParams[];
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
 * Permission parameters for granting access during file upload.
 *
 * @remarks
 * Used within UploadParams to grant permissions to applications during the upload process.
 * @category Data Management
 */
export interface PermissionParams {
  /** The address of the application to grant permission to. */
  grantee: Address;
  /** The operation type (e.g., "llm_inference"). */
  operation: string;
  /** Additional parameters for the permission. */
  parameters: Record<string, unknown>;
  /** Optional nonce for the permission. */
  nonce?: bigint;
  /** Optional expiration timestamp. */
  expiresAt?: number;
  /** Public key of the recipient to encrypt the data key for (required for upload with permissions). */
  publicKey?: string;
}

/**
 * Permission parameters with required public key for encrypted uploads.
 *
 * @remarks
 * This type extends PermissionParams and makes publicKey required, ensuring
 * compile-time safety when permissions are used with encryption.
 * @category Data Management
 */
export interface EncryptedPermissionParams extends PermissionParams {
  /** Public key of the recipient to encrypt the data key for. */
  publicKey: string;
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
  /** Storage provider name or uses configured default if unspecified. */
  storageProvider?: string;
  /** Enables automatic encryption before upload to storage. */
  encrypt?: boolean;
  /** Custom encryption key or generates one automatically if encryption enabled. */
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
 * Represents a data schema in the refiner registry.
 *
 * Schemas define the structure and validation rules for user data processed by refiners.
 * They ensure data quality and consistency across the Vana network by specifying how
 * raw user data should be formatted, validated, and processed.
 *
 * @category Data Management
 * @example
 * ```typescript
 * const socialMediaSchema: Schema = {
 *   id: 5,
 *   name: 'Social Media Profile',
 *   type: 'JSON',
 *   url: 'ipfs://QmSchema...', // Schema definition file
 *   description: 'Schema for validating social media profile data'
 * };
 * ```
 */
export interface Schema {
  /** Schema ID */
  id: number;
  /** Schema name */
  name: string;
  /** Schema type */
  type: string;
  /** URL containing the schema definition */
  definitionUrl: string;
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
  /** Schema type */
  type: string;
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
 * Query mode for trusted server retrieval
 *
 * @category Data Management
 */
export type TrustedServerQueryMode = "subgraph" | "rpc" | "auto";

/**
 * Trusted server data structure (unified format for both subgraph and RPC modes)
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
 * Parameters for getUserTrustedServers with dual-mode support
 *
 * @category Data Management
 */
export interface GetUserTrustedServersParams {
  /** User address to query */
  user: Address;
  /** Query mode: 'subgraph' (fast, requires subgraph), 'rpc' (direct contract), or 'auto' (tries subgraph first) */
  mode?: TrustedServerQueryMode;
  /** Subgraph URL (required for subgraph mode) */
  subgraphUrl?: string;
  /** Pagination limit (applies to RPC mode) */
  limit?: number;
  /** Pagination offset (applies to RPC mode) */
  offset?: number;
}

/**
 * Result of getUserTrustedServers query
 *
 * @category Data Management
 */
export interface GetUserTrustedServersResult {
  /** Array of trusted servers */
  servers: TrustedServer[];
  /** Query mode that was actually used */
  usedMode: TrustedServerQueryMode;
  /** Total count (only available in RPC mode) */
  total?: number;
  /** Whether there are more servers (pagination info for RPC mode) */
  hasMore?: boolean;
  /** Any warnings or fallback information */
  warnings?: string[];
}
