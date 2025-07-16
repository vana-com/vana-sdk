/**
 * Server-managed IPFS Storage Provider for Vana SDK
 *
 * This provider uploads files to IPFS through the app's server,
 * using the app's Pinata account. This is the "Option A" pattern
 * where the app manages storage for users.
 */

import {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
  StorageProviderConfig,
  StorageError,
} from "../index";

interface ServerIPFSResponse {
  success: boolean;
  error?: string;
  url?: string;
  size?: number;
  ipfsHash?: string;
}

export interface ServerIPFSConfig {
  /** API endpoint for server-side IPFS uploads */
  uploadEndpoint: string;
  /** Optional base URL if different from current origin */
  baseUrl?: string;
}

/**
 * Server-Managed IPFS Storage Provider
 *
 * Uses a server-side IPFS handler instead of direct IPFS node access.
 * Provides simplified IPFS operations through API endpoints.
 *
 * @category Storage
 */
export class ServerIPFSStorage implements StorageProvider {
  private readonly uploadUrl: string;

  constructor(private config: ServerIPFSConfig) {
    if (!config.uploadEndpoint) {
      throw new StorageError(
        "Upload endpoint is required for server-managed IPFS",
        "MISSING_ENDPOINT",
        "server-ipfs",
      );
    }

    this.uploadUrl = config.baseUrl
      ? `${config.baseUrl}${config.uploadEndpoint}`
      : config.uploadEndpoint;
  }

  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    try {
      const fileName = filename || `vana-file-${Date.now()}.dat`;

      // Create form data for server upload
      const formData = new FormData();
      formData.append("file", file, fileName);

      const response = await fetch(this.uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new StorageError(
          `Server upload failed: ${response.status} ${response.statusText} - ${errorText}`,
          "UPLOAD_FAILED",
          "server-ipfs",
        );
      }

      const responseData: unknown = await response.json();
      const result = responseData as ServerIPFSResponse;

      if (!result.success) {
        throw new StorageError(
          `Server upload failed: ${result.error}`,
          "UPLOAD_FAILED",
          "server-ipfs",
        );
      }

      return {
        url: result.url || "",
        size: result.size || file.size,
        contentType: file.type || "application/octet-stream",
        metadata: {
          ipfsHash: result.ipfsHash,
          fileName,
          storage: "app-managed-ipfs",
          serverResponse: result,
        },
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to upload to server: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UPLOAD_ERROR",
        "server-ipfs",
      );
    }
  }

  async download(url: string): Promise<Blob> {
    try {
      // For IPFS URLs, we can download directly from gateway
      let downloadUrl = url;

      // Convert ipfs:// URLs to gateway URLs
      if (url.startsWith("ipfs://")) {
        const hash = url.replace("ipfs://", "");
        downloadUrl = `https://gateway.pinata.cloud/ipfs/${hash}`;
      }

      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new StorageError(
          `Failed to download file: ${response.status} ${response.statusText}`,
          "DOWNLOAD_FAILED",
          "server-ipfs",
        );
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to download from server: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DOWNLOAD_ERROR",
        "server-ipfs",
      );
    }
  }

  async list(_options?: StorageListOptions): Promise<StorageFile[]> {
    // Server-managed IPFS typically doesn't expose a list API to clients
    // This would require implementing a server endpoint that tracks uploads
    // Return empty array for now as tests expect
    return [];
  }

  async delete(_url: string): Promise<boolean> {
    // Server-managed IPFS typically doesn't expose delete to clients
    // IPFS files are immutable anyway - you can only unpin them
    // Return false for now as tests expect
    return false;
  }

  getConfig(): StorageProviderConfig {
    return {
      name: "Server-managed IPFS",
      type: "server-ipfs",
      requiresAuth: false, // No user auth needed - app handles it
      features: {
        upload: true,
        download: true,
        list: false,
        delete: false,
      },
    };
  }
}
