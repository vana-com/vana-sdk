import {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
  StorageProviderConfig,
  StorageError,
} from "../index";

export interface ServerProxyConfig {
  /** Server endpoint for file uploads */
  uploadUrl: string;
  /** Server endpoint for file downloads */
  downloadUrl: string;
}

interface ServerProxyUploadResponse {
  success: boolean;
  identifier?: string;
  url?: string;
  error?: string;
}

/**
 * Delegates storage operations to your server endpoints
 *
 * @remarks
 * This provider is completely agnostic about the actual storage backend used by
 * your server. It simply proxies upload and download requests to your configured
 * endpoints, allowing you to implement any storage strategy (IPFS, S3, local filesystem, etc.)
 * on the server side while maintaining a consistent client interface.
 *
 * @category Storage
 *
 * @example
 * ```typescript
 * const serverStorage = new ServerProxyStorage({
 *   uploadUrl: "/api/files/upload",
 *   downloadUrl: "/api/files/download"
 * });
 *
 * // Upload file through your server
 * const identifier = await serverStorage.upload(fileBlob, { name: "document.pdf" });
 *
 * // Download file through your server
 * const file = await serverStorage.download(identifier);
 * ```
 */
export class ServerProxyStorage implements StorageProvider {
  constructor(private config: ServerProxyConfig) {
    if (!config.uploadUrl) {
      throw new StorageError(
        "Upload URL is required",
        "MISSING_UPLOAD_URL",
        "server-proxy",
      );
    }

    if (!config.downloadUrl) {
      throw new StorageError(
        "Download URL is required",
        "MISSING_DOWNLOAD_URL",
        "server-proxy",
      );
    }
  }

  /**
   * Uploads a file through your server endpoint
   *
   * @remarks
   * This method sends the file to your configured upload endpoint via FormData.
   * Your server is responsible for handling the actual storage implementation
   * and must return a JSON response with `success: true` and an `identifier` field.
   *
   * @param file - The file to upload
   * @param filename - Optional custom filename
   * @returns Promise that resolves to the server-provided identifier
   * @throws {StorageError} When the upload fails or server returns an error
   *
   * @example
   * ```typescript
   * const identifier = await serverStorage.upload(fileBlob, { name: "report.pdf" });
   * console.log("File uploaded with identifier:", identifier);
   * ```
   */
  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    try {
      const formData = new FormData();
      formData.append("file", file);

      if (filename) {
        formData.append("name", filename);
      }

      const response = await fetch(this.config.uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const _errorText = await response.text();
        throw new StorageError(
          `Server upload failed: ${response.status} ${response.statusText}`,
          "UPLOAD_FAILED",
          "server-proxy",
        );
      }

      const result = (await response.json()) as ServerProxyUploadResponse;

      if (!result.success) {
        throw new StorageError(
          `Upload failed: ${result.error || "Unknown server error"}`,
          "UPLOAD_FAILED",
          "server-proxy",
        );
      }

      if (!result.identifier) {
        throw new StorageError(
          "Server upload succeeded but no identifier returned",
          "NO_IDENTIFIER_RETURNED",
          "server-proxy",
        );
      }

      return {
        url: result.url || result.identifier,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Server proxy upload error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UPLOAD_ERROR",
        "server-proxy",
      );
    }
  }

  /**
   * Downloads a file through your server endpoint
   *
   * @remarks
   * This method sends the identifier to your configured download endpoint via POST request.
   * Your server is responsible for retrieving the file from your storage backend
   * and returning the file content as a blob response.
   *
   * @param url - The server-provided URL or identifier from upload
   * @returns Promise that resolves to the downloaded file content
   * @throws {StorageError} When the download fails or file is not found
   *
   * @example
   * ```typescript
   * const fileBlob = await serverStorage.download("file-123");
   * const url = URL.createObjectURL(fileBlob);
   * ```
   */
  async download(url: string): Promise<Blob> {
    try {
      // Extract identifier from URL if needed
      const identifier = this.extractIdentifierFromUrl(url);

      const response = await fetch(this.config.downloadUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier }),
      });

      if (!response.ok) {
        const _errorText = await response.text();
        throw new StorageError(
          `Server download failed: ${response.status} ${response.statusText}`,
          "DOWNLOAD_FAILED",
          "server-proxy",
        );
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Server proxy download error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DOWNLOAD_ERROR",
        "server-proxy",
      );
    }
  }

  async list(_options?: StorageListOptions): Promise<StorageFile[]> {
    throw new StorageError(
      "List operation is not supported by server proxy storage",
      "LIST_NOT_SUPPORTED",
      "server-proxy",
    );
  }

  async delete(_url: string): Promise<boolean> {
    throw new StorageError(
      "Delete operation is not supported by server proxy storage",
      "DELETE_NOT_SUPPORTED",
      "server-proxy",
    );
  }

  /**
   * Extract identifier from URL or return as-is
   *
   * @param url - URL or identifier string
   * @returns identifier string
   */
  private extractIdentifierFromUrl(url: string): string {
    // If it's a URL, we might need to extract the identifier
    // For now, assume server handles both URLs and identifiers
    return url;
  }

  getConfig(): StorageProviderConfig {
    return {
      name: "Server Proxy",
      type: "server-proxy",
      requiresAuth: false,
      features: {
        upload: true,
        download: true,
        list: false,
        delete: false,
      },
    };
  }
}
