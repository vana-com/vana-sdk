/**
 * IPFS Storage Provider for Vana SDK
 *
 * Simple IPFS storage implementation using Pinata or other IPFS services.
 * This is a fallback option when cloud storage providers are not available.
 */

import {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
  StorageProviderConfig,
  StorageError,
} from "../index";

export interface IPFSConfig {
  /** API endpoint for IPFS operations */
  apiEndpoint: string;
  /** Optional API key for authenticated services */
  apiKey?: string;
  /** Optional JWT token for Pinata */
  jwt?: string;
  /** Optional gateway URL for file access */
  gatewayUrl?: string;
}

interface IPFSUploadResponse {
  IpfsHash?: string;
  Hash?: string;
  hash?: string;
}

/**
 * IPFS Storage Provider
 *
 * Direct connection to IPFS nodes for decentralized storage.
 * Supports both public and private IPFS endpoints.
 *
 * @throws {StorageError} When IPFS API endpoint is missing from configuration
 *
 * @example
 * ```typescript
 * const ipfsStorage = new IPFSStorage({
 *   apiEndpoint: 'https://ipfs.infura.io:5001/api/v0',
 *   gatewayUrl: 'https://ipfs.infura.io/ipfs'
 * });
 *
 * const file = new Blob(['Hello IPFS'], { type: 'text/plain' });
 * const result = await ipfsStorage.upload(file, 'hello.txt');
 * console.log('File uploaded to:', result.url);
 * ```
 *
 * @category Storage
 */
export class IPFSStorage implements StorageProvider {
  constructor(private config: IPFSConfig) {
    if (!config.apiEndpoint) {
      throw new StorageError(
        "IPFS API endpoint is required",
        "MISSING_API_ENDPOINT",
        "ipfs",
      );
    }
  }

  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    try {
      const fileName = filename || `vana-file-${Date.now()}.dat`;

      // Create form data for IPFS upload
      const formData = new FormData();
      formData.append("file", file, fileName);

      // Add metadata if available
      if (this.config.jwt) {
        formData.append(
          "pinataMetadata",
          JSON.stringify({
            name: fileName,
            keyvalues: {
              uploadedBy: "vana-sdk",
              timestamp: new Date().toISOString(),
            },
          }),
        );
      }

      const headers: Record<string, string> = {};

      // Add authentication headers
      if (this.config.jwt) {
        headers["Authorization"] = `Bearer ${this.config.jwt}`;
      } else if (this.config.apiKey) {
        headers["X-API-Key"] = this.config.apiKey;
      }

      const response = await fetch(this.config.apiEndpoint, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new StorageError(
          `Failed to upload to IPFS: ${error}`,
          "UPLOAD_FAILED",
          "ipfs",
        );
      }

      const result = (await response.json()) as IPFSUploadResponse;

      // Handle different IPFS service response formats
      const hash = result.IpfsHash || result.Hash || result.hash;
      if (!hash) {
        throw new StorageError(
          "IPFS upload succeeded but no hash returned",
          "NO_HASH_RETURNED",
          "ipfs",
        );
      }

      const gatewayUrl =
        this.config.gatewayUrl || "https://gateway.pinata.cloud/ipfs";
      const publicUrl = `${gatewayUrl}/${hash}`;

      return {
        url: publicUrl,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        metadata: {
          hash,
          fileName,
          ipfsUrl: `ipfs://${hash}`,
          gatewayUrl: publicUrl,
        },
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `IPFS upload error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UPLOAD_ERROR",
        "ipfs",
      );
    }
  }

  async download(url: string): Promise<Blob> {
    try {
      // Extract IPFS hash from URL
      const hash = this.extractIPFSHash(url);
      if (!hash) {
        throw new StorageError(
          "Invalid IPFS URL format",
          "INVALID_URL",
          "ipfs",
        );
      }

      // Use gateway URL for download
      const gatewayUrl =
        this.config.gatewayUrl || "https://gateway.pinata.cloud/ipfs";
      const downloadUrl = `${gatewayUrl}/${hash}`;

      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new StorageError(
          `Failed to download from IPFS: ${response.statusText}`,
          "DOWNLOAD_FAILED",
          "ipfs",
        );
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `IPFS download error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DOWNLOAD_ERROR",
        "ipfs",
      );
    }
  }

  async list(_options?: StorageListOptions): Promise<StorageFile[]> {
    // IPFS doesn't have a native "list" operation for user files
    // This would require maintaining an index or using a service like Pinata's API
    throw new StorageError(
      "IPFS storage does not support file listing. Use a service-specific adapter like Pinata.",
      "LIST_NOT_SUPPORTED",
      "ipfs",
    );
  }

  async delete(_url: string): Promise<boolean> {
    // IPFS is immutable - files cannot be deleted, only unpinned from services
    throw new StorageError(
      "IPFS storage does not support file deletion. Files are immutable once uploaded.",
      "DELETE_NOT_SUPPORTED",
      "ipfs",
    );
  }

  getConfig(): StorageProviderConfig {
    return {
      name: "IPFS",
      type: "ipfs",
      requiresAuth: !!this.config.apiKey || !!this.config.jwt,
      features: {
        upload: true,
        download: true,
        list: false,
        delete: false,
      },
    };
  }

  /**
   * Extract IPFS hash from various URL formats
   * @param url - IPFS URL
   * @returns IPFS hash or null if not found
   */
  private extractIPFSHash(url: string): string | null {
    // Handle various IPFS URL formats
    const patterns = [
      /ipfs\/([a-zA-Z0-9]+)/, // https://gateway.pinata.cloud/ipfs/HASH
      /^ipfs:\/\/([a-zA-Z0-9]+)$/, // ipfs://HASH
      /^([a-zA-Z0-9]{46,})$/, // Just the hash (46+ chars for IPFS hashes)
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}
