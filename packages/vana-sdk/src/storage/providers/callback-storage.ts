import type { StorageProvider } from "../../types/storage";
import type { StorageCallbacks } from "../../types/config";
import {
  StorageError,
  type StorageUploadResult,
  type StorageFile,
  type StorageListOptions,
  type StorageProviderConfig,
} from "../../types/storage";

/**
 * Storage provider that delegates all operations to user-provided callbacks.
 *
 * This provider follows the same flexible pattern as relayer callbacks,
 * allowing users to implement storage operations in any way they choose
 * (HTTP, WebSocket, direct cloud APIs, local filesystem, etc.).
 *
 * @category Storage
 * @example
 * ```typescript
 * // HTTP-based implementation
 * const httpCallbacks: StorageCallbacks = {
 *   async upload(blob, filename) {
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
 *       contentType: blob.type
 *     };
 *   },
 *   async download(identifier) {
 *     const response = await fetch(`/api/storage/download/${identifier}`);
 *     return response.blob();
 *   }
 * };
 *
 * const storage = new CallbackStorage(httpCallbacks);
 *
 * // Direct S3 implementation
 * const s3Callbacks: StorageCallbacks = {
 *   async upload(blob, filename) {
 *     const url = await getPresignedUploadUrl(filename);
 *     await fetch(url, { method: 'PUT', body: blob });
 *     return {
 *       url: `s3://my-bucket/${filename}`,
 *       size: blob.size,
 *       contentType: blob.type
 *     };
 *   },
 *   async download(identifier) {
 *     const url = await getPresignedDownloadUrl(identifier);
 *     const response = await fetch(url);
 *     return response.blob();
 *   }
 * };
 * ```
 */
export class CallbackStorage implements StorageProvider {
  constructor(private readonly callbacks: StorageCallbacks) {
    if (!callbacks.upload || !callbacks.download) {
      throw new Error(
        "CallbackStorage requires both upload and download callbacks",
      );
    }
  }

  /**
   * Upload a file using the provided callback
   *
   * @param file - The blob to upload
   * @param filename - Optional filename for the upload
   * @returns The upload result with URL and metadata
   */
  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    try {
      const result = await this.callbacks.upload(file, filename);

      // Validate the result has required fields
      if (!result.url || result.url.trim() === "") {
        throw new StorageError(
          "Upload callback returned invalid result: missing or empty url",
          "INVALID_UPLOAD_RESULT",
          "callback-storage",
        );
      }

      return result;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
        "UPLOAD_ERROR",
        "callback-storage",
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  /**
   * Download a file using the provided callback
   *
   * @param url - The URL or identifier to download
   * @returns The downloaded blob
   */
  async download(url: string): Promise<Blob> {
    try {
      // Extract identifier if callback is provided, otherwise use URL as-is
      const identifier = this.callbacks.extractIdentifier
        ? this.callbacks.extractIdentifier(url)
        : url;

      const blob = await this.callbacks.download(identifier);

      if (!(blob instanceof Blob)) {
        throw new StorageError(
          "Download callback returned invalid result: expected Blob",
          "INVALID_DOWNLOAD_RESULT",
          "callback-storage",
        );
      }

      return blob;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Download failed: ${error instanceof Error ? error.message : String(error)}`,
        "DOWNLOAD_ERROR",
        "callback-storage",
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  /**
   * List files using the provided callback (if available)
   *
   * @param options - Optional list options including filters and pagination
   * @returns Array of storage files
   */
  async list(options?: StorageListOptions): Promise<StorageFile[]> {
    if (!this.callbacks.list) {
      throw new StorageError(
        "List operation not supported - no list callback provided",
        "NOT_SUPPORTED",
        "callback-storage",
      );
    }

    try {
      const result = await this.callbacks.list(options?.namePattern, options);

      // Convert list result to StorageFile format
      return result.items.map((item, index) => ({
        id: item.identifier,
        name: item.identifier.split("/").pop() || `file-${index}`,
        url: item.identifier,
        size: item.size || 0,
        contentType: "application/octet-stream",
        createdAt: item.lastModified || new Date(),
        metadata: item.metadata,
      }));
    } catch (error) {
      throw new StorageError(
        `List failed: ${error instanceof Error ? error.message : String(error)}`,
        "LIST_ERROR",
        "callback-storage",
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  /**
   * Delete a file using the provided callback (if available)
   *
   * @param url - The URL or identifier to delete
   * @returns True if deletion succeeded
   */
  async delete(url: string): Promise<boolean> {
    if (!this.callbacks.delete) {
      throw new StorageError(
        "Delete operation not supported - no delete callback provided",
        "NOT_SUPPORTED",
        "callback-storage",
      );
    }

    try {
      // Extract identifier if callback is provided, otherwise use URL as-is
      const identifier = this.callbacks.extractIdentifier
        ? this.callbacks.extractIdentifier(url)
        : url;

      return await this.callbacks.delete(identifier);
    } catch (error) {
      throw new StorageError(
        `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
        "DELETE_ERROR",
        "callback-storage",
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  /**
   * Get provider configuration
   *
   * @returns Provider configuration metadata
   */
  getConfig(): StorageProviderConfig {
    return {
      name: "callback-storage",
      type: "callback",
      requiresAuth: false,
      features: {
        upload: true,
        download: true,
        list: !!this.callbacks.list,
        delete: !!this.callbacks.delete,
      },
    };
  }
}
