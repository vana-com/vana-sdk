import type { Address, Hash } from "viem";

/**
 * Represents a user's registered data file
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
  /** Optional file metadata */
  metadata?: FileMetadata;
}

/**
 * File metadata structure
 */
export interface FileMetadata {
  /** Original filename */
  name?: string;
  /** File size in bytes */
  size?: number;
  /** MIME type */
  mimeType?: string;
  /** File checksum */
  checksum?: string;
  /** Upload timestamp */
  uploadedAt?: string;
  /** Additional custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Parameters for uploading a file
 */
export interface UploadFileParams {
  /** File content or buffer */
  content: Uint8Array | Buffer | string;
  /** Optional file metadata */
  metadata?: FileMetadata;
  /** Storage provider to use (defaults to configured default) */
  storageProvider?: string;
  /** Whether to encrypt the file */
  encrypt?: boolean;
  /** Optional encryption key */
  encryptionKey?: string;
}

/**
 * Result of uploading a file
 */
export interface UploadFileResult {
  /** The storage URL where the file is stored */
  url: string;
  /** Size of the file in bytes */
  size: number;
  /** File checksum */
  checksum?: string;
  /** Optional encryption information */
  encryption?: EncryptionInfo;
}

/**
 * Result of uploading an encrypted file to storage and blockchain
 */
export interface UploadEncryptedFileResult extends UploadFileResult {
  /** The new file ID assigned by the DataRegistry */
  fileId: number;
  /** Transaction hash of the file registration */
  transactionHash?: Hash;
}

/**
 * Encryption information for a file
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
 */
export interface GetFileParams {
  /** File ID to retrieve */
  fileId: number;
  /** Whether to include metadata */
  includeMetadata?: boolean;
}

/**
 * Parameters for downloading a file
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
 * Represents a data schema in the refiner registry
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
 */
export interface AddSchemaResult {
  /** The new schema ID assigned by the contract */
  schemaId: number;
  /** Transaction hash of the schema registration */
  transactionHash: Hash;
}

/**
 * Parameters for adding a refiner
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
 */
export interface AddRefinerResult {
  /** The new refiner ID assigned by the contract */
  refinerId: number;
  /** Transaction hash of the refiner registration */
  transactionHash: Hash;
}

/**
 * Parameters for updating a refiner's schema ID
 */
export interface UpdateSchemaIdParams {
  /** Refiner ID to update */
  refinerId: number;
  /** New schema ID to associate with the refiner */
  newSchemaId: number;
}

/**
 * Result of updating a refiner's schema ID
 */
export interface UpdateSchemaIdResult {
  /** Transaction hash of the update */
  transactionHash: Hash;
}
