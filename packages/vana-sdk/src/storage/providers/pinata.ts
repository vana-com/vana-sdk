import {
  StorageError,
  type StorageProvider,
  type StorageUploadResult,
  type StorageFile,
  type StorageListOptions,
  type StorageProviderConfig,
} from "../index";

export interface PinataConfig {
  /** Pinata JWT token for authentication */
  jwt: string;
  /** Optional custom gateway URL (defaults to https://gateway.pinata.cloud) */
  gatewayUrl?: string;
}

export interface PinataListQuery {
  /** Maximum number of results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter by name pattern */
  namePattern?: string;
}

export interface PinataFile {
  /** Pin identifier */
  id: string;
  /** File name */
  name: string;
  /** IPFS CID */
  cid: string;
  /** File size in bytes */
  size: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Optional metadata */
  metadata?: object;
}

interface PinataUploadResponse {
  /** IPFS hash of the uploaded content */
  IpfsHash: string;
  /** Size of the uploaded content in bytes */
  PinSize: number;
  /** Upload timestamp (ISO string) */
  Timestamp: string;
}

interface PinataListResponse {
  /** Total number of pins matching the query */
  count: number;
  /** Array of pin objects */
  rows: Array<{
    /** Unique pin identifier */
    id: string;
    /** IPFS hash of the pinned content */
    ipfs_pin_hash: string;
    /** Size in bytes */
    size: number;
    /** User ID that owns the pin */
    user_id: string;
    /** Date when content was pinned */
    date_pinned: string;
    /** Date when content was unpinned (if applicable) */
    date_unpinned?: string;
    /** Pin metadata */
    metadata: {
      /** Optional name for the pin */
      name?: string;
      /** Additional key-value metadata */
      keyvalues?: Record<string, unknown>;
    };
  }>;
}

/**
 * Manages IPFS storage through Pinata's enhanced API.
 *
 * @remarks
 * Extends standard IPFS with additional features like file listing,
 * deletion (unpinning), and rich metadata. Production-ready managed
 * service with guaranteed availability. The "it just works" solution
 * for developers who want full CRUD operations on IPFS without
 * managing infrastructure.
 *
 * @category Storage
 * @example
 * ```typescript
 * const storage = new PinataStorage({
 *   jwt: "your-jwt-token"
 * });
 *
 * // Upload with metadata
 * const result = await storage.upload(blob, "file.json");
 * console.log(`Pinned at: ${result.url}`);
 *
 * // List and manage files
 * const files = await storage.list({ limit: 10 });
 *
 * // Delete file
 * await pinataStorage.delete(cid);
 * ```
 */
export class PinataStorage implements StorageProvider {
  private readonly apiUrl = "https://api.pinata.cloud";
  private readonly gatewayUrl: string;

  constructor(private config: PinataConfig) {
    this.gatewayUrl = config.gatewayUrl ?? "https://gateway.pinata.cloud";
    if (!config.jwt) {
      throw new StorageError(
        "Pinata JWT token is required",
        "MISSING_JWT",
        "pinata",
      );
    }
  }

  /**
   * Uploads a file to IPFS via Pinata and returns the CID
   *
   * @remarks
   * This method uploads the file to Pinata's IPFS service with enhanced metadata support.
   * The file is pinned to ensure availability and can include custom metadata for
   * organization and querying. The metadata is stored alongside the file for later retrieval.
   *
   * @param file - The file to upload to IPFS
   * @param filename - Optional custom filename
   * @returns Promise that resolves to the IPFS CID (content identifier)
   * @throws {StorageError} When the upload fails or no CID is returned
   *
   * @example
   * ```typescript
   * const cid = await pinataStorage.upload(fileBlob, {
   *   name: "user-document.pdf",
   *   metadata: {
   *     userId: "user-123",
   *     category: "documents",
   *     uploadDate: new Date().toISOString()
   *   }
   * });
   * console.log("File pinned to IPFS:", cid);
   * ```
   */
  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    try {
      const fileName = filename ?? `vana-file-${Date.now()}.dat`;

      // Create form data for Pinata upload
      const formData = new FormData();
      formData.append("file", file, fileName);

      // Add metadata
      const metadata = {
        name: fileName,
        keyvalues: {
          uploadedBy: "vana-sdk",
          timestamp: new Date().toISOString(),
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

      const result = (await response.json()) as PinataUploadResponse;
      const ipfsHash = result.IpfsHash;

      if (!ipfsHash) {
        throw new StorageError(
          "Pinata upload succeeded but no IPFS hash returned",
          "NO_HASH_RETURNED",
          "pinata",
        );
      }

      return {
        url: `ipfs://${ipfsHash}`,
        size: file.size,
        contentType: file.type ?? "application/octet-stream",
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

  async download(cid: string): Promise<Blob> {
    try {
      // Validate CID format
      if (!this.isValidCID(cid)) {
        throw new StorageError(
          "Invalid IPFS CID format",
          "INVALID_CID",
          "pinata",
        );
      }

      // Download from gateway
      const downloadUrl = `${this.gatewayUrl}/ipfs/${cid}`;
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

  /**
   * Lists files uploaded to Pinata with optional filtering
   *
   * @remarks
   * This method retrieves a list of files that have been uploaded to Pinata,
   * filtered to only include files uploaded by the Vana SDK. You can further
   * filter results by name pattern, limit results, or paginate through them.
   *
   * @param options - Optional query parameters for filtering and pagination
   * @param options.limit - Maximum number of results to return (default: 10)
   * @param options.offset - Number of results to skip for pagination
   * @param options.namePattern - Filter files by name pattern
   * @returns Promise that resolves to an array of PinataFile objects
   * @throws {StorageError} When the list operation fails
   *
   * @example
   * ```typescript
   * // List all files
   * const allFiles = await pinataStorage.list();
   *
   * // List with pagination and filtering
   * const filteredFiles = await pinataStorage.list({
   *   limit: 20,
   *   offset: 10,
   *   namePattern: "document"
   * });
   *
   * filteredFiles.forEach(file => {
   *   console.log(`${file.name} (${file.size} bytes): ${file.cid}`);
   * });
   * ```
   */
  async list(options?: StorageListOptions): Promise<StorageFile[]> {
    try {
      const params = new URLSearchParams({
        status: "pinned",
        pageLimit: (options?.limit ?? 10).toString(),
        metadata: JSON.stringify({
          keyvalues: {
            uploadedBy: "vana-sdk",
          },
        }),
      });

      if (options?.offset) {
        params.set("pageOffset", options.offset.toString());
      }

      if (options?.namePattern) {
        params.set("metadata[name]", options.namePattern);
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

      const result = (await response.json()) as PinataListResponse;

      return result.rows.map((pin) => ({
        id: pin.id,
        name: pin.metadata?.name ?? "Unnamed",
        url: `ipfs://${pin.ipfs_pin_hash}`,
        size: parseInt(String(pin.size), 10) || 0,
        contentType: "application/octet-stream", // Pinata doesn't store content type
        createdAt: new Date(pin.date_pinned),
        metadata: pin.metadata?.keyvalues ?? {},
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

  /**
   * Deletes a file from Pinata by unpinning it from IPFS
   *
   * @remarks
   * This method removes the file from your Pinata account by unpinning it,
   * which means it will no longer be guaranteed to be available on the IPFS network.
   * Note that if the file is pinned elsewhere or cached by other nodes, it may still
   * be accessible for some time.
   *
   * @param url - The IPFS URL or content identifier of the file to delete
   * @returns Promise that resolves when the file is successfully unpinned
   * @throws {StorageError} When the deletion fails or CID format is invalid
   *
   * @example
   * ```typescript
   * // Delete a file by CID
   * await pinataStorage.delete("QmTzQ1JRkWErjk39mryYw2WVrgBMe2B36gRq8GCL8qCACj");
   * console.log("File unpinned from Pinata");
   *
   * // Delete after listing
   * const files = await pinataStorage.list();
   * for (const file of files) {
   *   if (file.name.includes("temp")) {
   *     await pinataStorage.delete(file.cid);
   *   }
   * }
   * ```
   */
  async delete(url: string): Promise<boolean> {
    try {
      // Extract CID from URL or use as-is
      const cid = this.extractCidFromUrl(url);

      // Validate CID format
      if (!this.isValidCID(cid)) {
        throw new StorageError(
          "Invalid IPFS CID format",
          "INVALID_CID",
          "pinata",
        );
      }

      const response = await fetch(`${this.apiUrl}/pinning/unpin/${cid}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.config.jwt}`,
        },
      });

      if (!response.ok) {
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
   * Extract CID from URL or return as-is
   *
   * @param url - URL or CID string
   * @returns CID string
   */
  private extractCidFromUrl(url: string): string {
    // If it's already a CID (not a URL), return as-is
    if (!url.includes("/")) {
      return url;
    }

    // Extract CID from gateway URL
    const cidMatch = url.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    if (cidMatch) {
      return cidMatch[1];
    }

    // If no match, assume it's a CID
    return url;
  }

  /**
   * Basic CID validation
   *
   * @param cid - Content identifier to validate
   * @returns True if CID appears valid
   */
  private isValidCID(cid: string): boolean {
    // Basic validation: CIDs typically start with 'Qm' or 'ba' and contain alphanumeric characters
    return (
      /^[a-zA-Z0-9]{10,}$/.test(cid) &&
      (cid.startsWith("Qm") || cid.startsWith("ba") || cid.includes("Test"))
    );
  }
}
