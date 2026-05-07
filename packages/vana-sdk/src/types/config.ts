import type { StorageUploadResult, StorageListOptions } from "./storage";

/**
 * Storage callback functions for flexible storage operations.
 *
 * Instead of hardcoding storage behavior (HTTP endpoints, etc.), users can provide
 * custom callback functions to handle storage operations in any way they choose.
 *
 * @category Configuration
 * @example
 * ```typescript
 * const storageCallbacks: StorageCallbacks = {
 *   async upload(blob, filename, metadata) {
 *     const formData = new FormData();
 *     formData.append('file', blob, filename);
 *     const response = await fetch('/api/storage/upload', {
 *       method: 'POST',
 *       body: formData
 *     });
 *     const data = await response.json();
 *     return {
 *       url: data.url,
 *       size: blob.size,
 *       contentType: blob.type,
 *       metadata: data.metadata
 *     };
 *   },
 *
 *   async download(identifier) {
 *     const response = await fetch(`/api/storage/download/${identifier}`);
 *     return response.blob();
 *   }
 * };
 * ```
 */
export interface StorageCallbacks {
  /**
   * Upload a blob to storage
   *
   * @param blob - The data to upload
   * @param filename - Optional filename hint
   * @param metadata - Optional metadata for the upload
   * @returns Upload result with identifier and metadata
   */
  upload: (
    blob: Blob,
    filename?: string,
    metadata?: Record<string, unknown>,
  ) => Promise<StorageUploadResult>;

  /**
   * Download data from storage
   *
   * @param identifier - The storage identifier (could be URL, hash, path, or any unique ID)
   * @param options - Optional download options
   * @returns The downloaded data as a Blob
   */
  download: (
    identifier: string,
    options?: StorageDownloadOptions,
  ) => Promise<Blob>;

  /**
   * List stored items (optional)
   *
   * @param prefix - Optional prefix to filter results
   * @param options - Optional listing options
   * @returns Array of storage items with metadata
   */
  list?: (
    prefix?: string,
    options?: StorageListOptions,
  ) => Promise<StorageListResult>;

  /**
   * Delete a stored item (optional)
   *
   * @param identifier - The storage identifier to delete
   * @returns Promise that resolves to true if deletion succeeded
   */
  delete?: (identifier: string) => Promise<boolean>;

  /**
   * Extract identifier from a URL or return as-is (optional)
   * Used for backward compatibility with URL-based systems
   *
   * @param url - The URL to extract from
   * @returns The extracted identifier
   */
  extractIdentifier?: (url: string) => string;
}

/**
 * Options for storage download operations
 *
 * @category Configuration
 */
export interface StorageDownloadOptions {
  /** Optional HTTP headers */
  headers?: Record<string, string>;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Optional byte range for partial downloads */
  range?: { start?: number; end?: number };
}

/**
 * Result from storage list operations
 *
 * @category Configuration
 */
export interface StorageListResult {
  /** Array of storage items */
  items: Array<{
    /** Item identifier */
    identifier: string;
    /** Item size in bytes */
    size?: number;
    /** Last modified timestamp */
    lastModified?: Date;
    /** Item metadata */
    metadata?: Record<string, unknown>;
  }>;
  /** Continuation token for pagination */
  continuationToken?: string;
  /** Whether more results are available */
  hasMore?: boolean;
}
