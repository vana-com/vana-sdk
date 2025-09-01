/**
 * Defines interface for storage provider implementations.
 *
 * @remarks
 * Abstracts storage backends (IPFS, Google Drive, Pinata) behind
 * common interface for encrypted file operations.
 *
 * @category Storage
 * @example
 * ```typescript
 * class MyStorage implements StorageProvider {
 *   async upload(file: Blob): Promise<StorageUploadResult> {
 *     const url = await uploadToService(file);
 *     return { url, size: file.size, contentType: file.type };
 *   }
 *
 *   async download(url: string): Promise<Blob> {
 *     return fetch(url).then(r => r.blob());
 *   }
 * }
 * ```
 */
export interface StorageProvider {
  /**
   * Upload a file to the storage provider
   *
   * @param file - The file to upload
   * @param filename - Optional custom filename
   * @returns Promise with storage URL and metadata
   */
  upload(file: Blob, filename?: string): Promise<StorageUploadResult>;

  /**
   * Download a file from the storage provider
   *
   * @param url - The storage URL
   * @returns Promise with file blob
   */
  download(url: string): Promise<Blob>;

  /**
   * List files from the storage provider
   *
   * @param options - Optional filtering and pagination
   * @returns Promise with file list
   */
  list(options?: StorageListOptions): Promise<StorageFile[]>;

  /**
   * Delete a file from the storage provider
   *
   * @param url - The storage URL
   * @returns Promise with success status
   */
  delete(url: string): Promise<boolean>;

  /**
   * Get provider-specific configuration
   *
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
  public readonly code: string;
  public readonly provider: string;
  // The 'cause' property is now inherited from the base Error class

  constructor(
    message: string,
    code: string,
    provider: string,
    options?: { cause?: Error },
  ) {
    // Pass the options object with 'cause' to the super constructor
    super(message, options);
    this.name = "StorageError";
    this.code = code;
    this.provider = provider;
  }
}
