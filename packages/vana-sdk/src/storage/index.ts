/**
 * Storage API for Vana SDK
 *
 * Provides unified interface for different storage providers
 * to upload, download, and manage user data files.
 */

export interface StorageProvider {
  /**
   * Upload a file to the storage provider
   * @param file - The file to upload
   * @param filename - Optional custom filename
   * @returns Promise with storage URL and metadata
   */
  upload(file: Blob, filename?: string): Promise<StorageUploadResult>;

  /**
   * Download a file from the storage provider
   * @param url - The storage URL
   * @returns Promise with file blob
   */
  download(url: string): Promise<Blob>;

  /**
   * List files from the storage provider
   * @param options - Optional filtering and pagination
   * @returns Promise with file list
   */
  list(options?: StorageListOptions): Promise<StorageFile[]>;

  /**
   * Delete a file from the storage provider
   * @param url - The storage URL
   * @returns Promise with success status
   */
  delete(url: string): Promise<boolean>;

  /**
   * Get provider-specific configuration
   * @returns Provider configuration object
   */
  getConfig(): StorageProviderConfig;
}

export interface StorageUploadResult {
  /** Public URL to access the file */
  url: string;
  /** File size in bytes */
  size: number;
  /** Content type/MIME type */
  contentType: string;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface StorageFile {
  /** File identifier */
  id: string;
  /** File name */
  name: string;
  /** Public URL to access the file */
  url: string;
  /** File size in bytes */
  size: number;
  /** Content type/MIME type */
  contentType: string;
  /** Upload timestamp */
  createdAt: Date;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface StorageListOptions {
  /** Maximum number of files to return */
  limit?: number;
  /** Pagination cursor/offset */
  offset?: string | number;
  /** Filter by file name pattern */
  namePattern?: string;
  /** Filter by content type */
  contentType?: string;
}

export interface StorageProviderConfig {
  /** Provider name */
  name: string;
  /** Provider type */
  type: string;
  /** Whether authentication is required */
  requiresAuth: boolean;
  /** Supported features */
  features: {
    upload: boolean;
    download: boolean;
    list: boolean;
    delete: boolean;
  };
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

// Export storage providers
export { GoogleDriveStorage } from "./providers/google-drive";
export { IPFSStorage } from "./providers/ipfs";
export { PinataStorage } from "./providers/pinata";
export { ServerIPFSStorage } from "./providers/server-ipfs";

// Export storage manager
export { StorageManager } from "./manager";
