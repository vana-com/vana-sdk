/**
 * Pinata IPFS Storage Provider for Vana SDK
 *
 * Direct browser integration with Pinata for IPFS storage.
 * This provider uploads files directly from the browser to Pinata's IPFS service.
 */

import {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
  StorageProviderConfig,
  StorageError,
} from "../index";

export interface PinataConfig {
  /** Pinata JWT token for authentication */
  jwt: string;
  /** Optional gateway URL for file access */
  gatewayUrl?: string;
  /** Optional API URL override */
  apiUrl?: string;
}

interface PinataPin {
  ipfs_pin_hash: string;
  size: string;
  date_pinned: string;
  metadata?: {
    name?: string;
    [key: string]: unknown;
  };
}

export class PinataStorage implements StorageProvider {
  private readonly apiUrl: string;
  private readonly gatewayUrl: string;

  constructor(private config: PinataConfig) {
    if (!config.jwt) {
      throw new StorageError(
        "Pinata JWT token is required",
        "MISSING_JWT",
        "pinata",
      );
    }

    this.apiUrl = config.apiUrl || "https://api.pinata.cloud";
    this.gatewayUrl = config.gatewayUrl || "https://gateway.pinata.cloud";
  }

  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    try {
      const fileName = filename || `vana-file-${Date.now()}.dat`;

      // Create form data for Pinata upload
      const formData = new FormData();
      formData.append("file", file, fileName);

      // Add metadata
      const metadata = {
        name: fileName,
        keyvalues: {
          uploadedBy: "vana-sdk",
          timestamp: new Date().toISOString(),
          source: "browser-upload",
        },
      };
      formData.append("pinataMetadata", JSON.stringify(metadata));

      // Upload to Pinata
      const response = await fetch(`${this.apiUrl}/pinning/pinFileToIPFS`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.jwt}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new StorageError(
          `Pinata upload failed: ${errorText}`,
          "UPLOAD_FAILED",
          "pinata",
        );
      }

      const result = await response.json();
      const ipfsHash = result.IpfsHash;

      if (!ipfsHash) {
        throw new StorageError(
          "Pinata upload succeeded but no IPFS hash returned",
          "NO_HASH_RETURNED",
          "pinata",
        );
      }

      const publicUrl = `${this.gatewayUrl}/ipfs/${ipfsHash}`;

      return {
        url: publicUrl,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        metadata: {
          ipfsHash,
          fileName,
          ipfsUrl: `ipfs://${ipfsHash}`,
          gatewayUrl: publicUrl,
          pinataResponse: result,
        },
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Pinata upload error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UPLOAD_ERROR",
        "pinata",
      );
    }
  }

  async download(url: string): Promise<Blob> {
    try {
      // Extract IPFS hash from URL
      const ipfsHash = this.extractIPFSHash(url);
      if (!ipfsHash) {
        throw new StorageError(
          "Invalid IPFS URL format",
          "INVALID_URL",
          "pinata",
        );
      }

      // Download from gateway
      const downloadUrl = `${this.gatewayUrl}/ipfs/${ipfsHash}`;
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new StorageError(
          `Failed to download from IPFS: ${response.statusText}`,
          "DOWNLOAD_FAILED",
          "pinata",
        );
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Pinata download error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DOWNLOAD_ERROR",
        "pinata",
      );
    }
  }

  async list(options?: StorageListOptions): Promise<StorageFile[]> {
    try {
      const params = new URLSearchParams({
        status: "pinned",
        pageLimit: (options?.limit || 10).toString(),
        metadata: JSON.stringify({
          keyvalues: {
            uploadedBy: "vana-sdk",
          },
        }),
      });

      if (options?.offset && typeof options.offset === "string") {
        params.set("pageOffset", options.offset);
      }

      const response = await fetch(`${this.apiUrl}/data/pinList?${params}`, {
        headers: {
          Authorization: `Bearer ${this.config.jwt}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new StorageError(
          `Failed to list Pinata files: ${errorText}`,
          "LIST_FAILED",
          "pinata",
        );
      }

      const result = await response.json();

      return result.rows.map((pin: PinataPin) => ({
        id: pin.ipfs_pin_hash,
        name: pin.metadata?.name || "Unnamed",
        url: `${this.gatewayUrl}/ipfs/${pin.ipfs_pin_hash}`,
        size: parseInt(pin.size) || 0,
        contentType: "application/octet-stream", // Pinata doesn't store content type
        createdAt: new Date(pin.date_pinned),
        metadata: {
          ipfsHash: pin.ipfs_pin_hash,
          ipfsUrl: `ipfs://${pin.ipfs_pin_hash}`,
          gatewayUrl: `${this.gatewayUrl}/ipfs/${pin.ipfs_pin_hash}`,
          pinataMetadata: pin.metadata,
        },
      }));
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Pinata list error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "LIST_ERROR",
        "pinata",
      );
    }
  }

  async delete(url: string): Promise<boolean> {
    try {
      // Extract IPFS hash from URL
      const ipfsHash = this.extractIPFSHash(url);
      if (!ipfsHash) {
        throw new StorageError(
          "Invalid IPFS URL format",
          "INVALID_URL",
          "pinata",
        );
      }

      const response = await fetch(`${this.apiUrl}/pinning/unpin/${ipfsHash}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.config.jwt}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new StorageError(
          `Failed to delete from Pinata: ${errorText}`,
          "DELETE_FAILED",
          "pinata",
        );
      }

      return true;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Pinata delete error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DELETE_ERROR",
        "pinata",
      );
    }
  }

  getConfig(): StorageProviderConfig {
    return {
      name: "Pinata IPFS",
      type: "pinata",
      requiresAuth: true,
      features: {
        upload: true,
        download: true,
        list: true,
        delete: true,
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

  /**
   * Test the Pinata connection
   * @returns Promise with authentication test result
   */
  async testConnection(): Promise<{
    success: boolean;
    error?: string;
    data?: unknown;
  }> {
    try {
      const response = await fetch(`${this.apiUrl}/data/testAuthentication`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.jwt}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Authentication failed: ${errorText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
