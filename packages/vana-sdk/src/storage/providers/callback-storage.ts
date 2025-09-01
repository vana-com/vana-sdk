/**
 * Provides user-defined storage operations through callback functions.
 *
 * @remarks
 * This module implements a flexible storage provider that delegates all
 * operations to user-provided callbacks. It enables custom storage
 * integrations without modifying the SDK, supporting any backend including
 * HTTP APIs, WebSocket servers, cloud storage services, or local filesystems.
 *
 * @category Storage
 * @module storage/providers/callback-storage
 */

import type { StorageCallbacks } from "../../types/config";
import {
  StorageError,
  type StorageProvider,
  type StorageUploadResult,
  type StorageFile,
  type StorageListOptions,
  type StorageProviderConfig,
} from "../../types/storage";

/**
 * Delegates storage operations to user-provided callback functions.
 *
 * @remarks
 * This provider enables custom storage integrations by delegating all
 * operations to user-defined callbacks. It follows the same flexible
 * pattern as relayer callbacks, allowing implementations via HTTP,
 * WebSocket, direct cloud APIs, local filesystem, or any other backend.
 *
 * The provider validates callback results and wraps errors in consistent
 * `StorageError` types for uniform error handling across the SDK.
 *
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
 *
 * @category Storage
 */
export class CallbackStorage implements StorageProvider {
  /**
   * Creates a new callback-based storage provider.
   *
   * @param callbacks - User-provided storage operation callbacks.
   *   Must include at minimum `upload` and `download` functions.
   * @throws {Error} If required callbacks are missing
   */
  constructor(private readonly callbacks: StorageCallbacks) {
    if (!callbacks.upload || !callbacks.download) {
      throw new Error(
        "CallbackStorage requires both upload and download callbacks",
      );
    }
  }

  /**
   * Uploads a file using the user-provided callback.
   *
   * @param file - The blob to upload.
   *   Can be any Blob-compatible object including File.
   * @param filename - Optional filename for the upload.
   *   If not provided, callback may generate a name.
   * @returns Upload result containing URL and metadata
   *
   * @throws {StorageError} With code 'INVALID_UPLOAD_RESULT' if callback returns invalid data
   * @throws {StorageError} With code 'UPLOAD_ERROR' if upload fails
   *
   * @example
   * ```typescript
   * const file = new File(['content'], 'data.json');
   * const result = await storage.upload(file);
   * console.log('Uploaded to:', result.url);
   * ```
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
   * Downloads a file using the user-provided callback.
   *
   * @param url - The URL or identifier to download.
   *   If `extractIdentifier` callback is provided, it will be used to extract the identifier.
   * @returns The downloaded file as a Blob
   *
   * @throws {StorageError} With code 'INVALID_DOWNLOAD_RESULT' if callback returns non-Blob
   * @throws {StorageError} With code 'DOWNLOAD_ERROR' if download fails
   *
   * @example
   * ```typescript
   * const blob = await storage.download('https://storage.example.com/file123');
   * const text = await blob.text();
   * ```
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
   * Lists files using the user-provided callback.
   *
   * @param options - Optional list options.
   * @param options.namePattern - Pattern to filter files by name.
   *   Implementation depends on callback.
   * @param options.limit - Maximum number of files to return.
   *   Implementation depends on callback.
   * @returns Array of storage file metadata
   *
   * @throws {StorageError} With code 'NOT_SUPPORTED' if list callback not provided
   * @throws {StorageError} With code 'LIST_ERROR' if listing fails
   *
   * @remarks
   * This operation is optional and only available if a `list` callback
   * is provided during construction.
   *
   * @example
   * ```typescript
   * const files = await storage.list({ namePattern: '*.json' });
   * files.forEach(file => console.log(file.name, file.size));
   * ```
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
        name: item.identifier.split("/").pop() ?? `file-${index}`,
        url: item.identifier,
        size: item.size ?? 0,
        contentType: "application/octet-stream",
        createdAt: item.lastModified ?? new Date(),
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
   * Deletes a file using the user-provided callback.
   *
   * @param url - The URL or identifier to delete.
   *   If `extractIdentifier` callback is provided, it will be used to extract the identifier.
   * @returns True if deletion succeeded, false otherwise
   *
   * @throws {StorageError} With code 'NOT_SUPPORTED' if delete callback not provided
   * @throws {StorageError} With code 'DELETE_ERROR' if deletion fails
   *
   * @remarks
   * This operation is optional and only available if a `delete` callback
   * is provided during construction.
   *
   * @example
   * ```typescript
   * const deleted = await storage.delete('https://storage.example.com/file123');
   * if (deleted) {
   *   console.log('File deleted successfully');
   * }
   * ```
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
   * Returns the provider's configuration and capabilities.
   *
   * @returns Configuration object indicating supported features
   *
   * @example
   * ```typescript
   * const config = storage.getConfig();
   * if (config.features.list) {
   *   // List operation is supported
   *   const files = await storage.list();
   * }
   * ```
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
