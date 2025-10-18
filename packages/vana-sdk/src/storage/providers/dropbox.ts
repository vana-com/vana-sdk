/**
 * Dropbox Storage Provider for Vana SDK
 *
 * Implements the storage interface for Dropbox using its API.
 */

import {
  StorageError,
  type StorageProvider,
  type StorageUploadResult,
  type StorageFile,
  type StorageListOptions,
  type StorageProviderConfig,
} from "../index";

export interface DropboxConfig {
  /** OAuth2 access token */
  accessToken: string;
  /** Optional refresh token for token renewal */
  refreshToken?: string;
  /** OAuth2 client ID */
  clientId?: string;
  /** OAuth2 client secret */
  clientSecret?: string;
  /** Root path for uploads (defaults to '/Vana Data') */
  rootPath?: string;
}

interface DropboxUploadResponse {
  name: string;
  path_lower: string;
  path_display: string;
  id: string;
  size: number;
}

interface DropboxSharedLinkResponse {
  url: string;
}

interface DropboxListResponse {
  entries: Array<{
    ".tag": "file" | "folder";
    name: string;
    path_lower: string;
    id: string;
    server_modified: string;
    size: number;
  }>;
  has_more: boolean;
  cursor: string;
}

/**
 * Dropbox Storage Provider
 *
 * @remarks
 * Implements the storage interface for Dropbox. Requires OAuth2 authentication.
 *
 * @category Storage
 */
export class DropboxStorage implements StorageProvider {
  private readonly apiUrl = "https://api.dropboxapi.com/2";
  private readonly contentUrl = "https://content.dropboxapi.com/2";
  private readonly rootPath: string;

  constructor(private config: DropboxConfig) {
    if (!config.accessToken) {
      throw new StorageError(
        "Dropbox access token is required",
        "MISSING_ACCESS_TOKEN",
        "dropbox",
      );
    }
    this.rootPath = config.rootPath ?? "/Vana Data";
  }

  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    try {
      const fileName = filename ?? `vana-file-${Date.now()}.dat`;
      const path = `${this.rootPath}/${fileName}`;

      const response = await fetch(`${this.contentUrl}/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path,
            mode: "add",
            autorename: true,
            mute: false,
          }),
        },
        body: file,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new StorageError(
          `Failed to upload to Dropbox: ${error}`,
          "UPLOAD_FAILED",
          "dropbox",
        );
      }

      const result = (await response.json()) as DropboxUploadResponse;
      const sharedLinkUrl = await this.createSharedLink(result.path_lower);

      // Convert the shareable URL to a direct download URL before returning.
      // This ensures the correct, raw-content URL is stored on-chain.
      const directDownloadUrl = sharedLinkUrl
        .replace("www.dropbox.com", "dl.dropboxusercontent.com")
        .replace("?dl=1", "");

      return {
        url: directDownloadUrl,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        metadata: {
          id: result.id,
          path: result.path_display,
        },
      };
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        `Dropbox upload error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UPLOAD_ERROR",
        "dropbox",
      );
    }
  }

  async download(url: string): Promise<Blob> {
    // URL to force a direct download instead of showing the preview page.
    // This is done by changing the hostname from 'www.dropbox.com' to 'dl.dropboxusercontent.com'.
    const downloadUrl = url.replace(
      "www.dropbox.com",
      "dl.dropboxusercontent.com",
    );
    try {
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new StorageError(
          `Failed to download from Dropbox: ${response.statusText}`,
          "DOWNLOAD_FAILED",
          "dropbox",
        );
      }
      return response.blob();
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        `Dropbox download error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DOWNLOAD_ERROR",
        "dropbox",
      );
    }
  }

  async list(options?: StorageListOptions): Promise<StorageFile[]> {
    if (!this.config.accessToken) {
      throw new StorageError(
        "Access token not provided",
        "AUTH_ERROR",
        "dropbox",
      );
    }

    try {
      const response = await fetch(`${this.apiUrl}/files/list_folder`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: this.rootPath,
          limit: options?.limit ?? 100,
          include_deleted: false,
        }),
      });

      if (!response.ok) {
        throw new StorageError(
          `Failed to list Dropbox files: ${await response.text()}`,
          "LIST_FAILED",
          "dropbox",
        );
      }

      const result = (await response.json()) as DropboxListResponse;

      return result.entries
        .filter((entry) => entry[".tag"] === "file")
        .map((file) => ({
          id: file.id,
          name: file.name,
          url: `dropbox://${file.path_lower}`, // Placeholder URL
          size: file.size,
          contentType: "application/octet-stream", // Dropbox API doesn't provide this in list
          createdAt: new Date(file.server_modified),
        }));
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        `Dropbox list error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "LIST_ERROR",
        "dropbox",
      );
    }
  }

  async delete(url: string): Promise<boolean> {
    try {
      const path = new URL(url).pathname; // Assuming a direct URL format that includes the path
      const response = await fetch(`${this.apiUrl}/files/delete_v2`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path }),
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new StorageError(
          `Failed to delete from Dropbox: ${error}`,
          "DELETE_FAILED",
          "dropbox",
        );
      }

      return true;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        `Dropbox delete error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DELETE_ERROR",
        "dropbox",
      );
    }
  }

  getConfig(): StorageProviderConfig {
    return {
      name: "Dropbox",
      type: "dropbox",
      requiresAuth: true,
      features: {
        upload: true,
        download: true,
        list: true,
        delete: true,
      },
    };
  }

  private async createSharedLink(path: string): Promise<string> {
    const response = await fetch(
      `${this.apiUrl}/sharing/create_shared_link_with_settings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path,
          settings: {
            requested_visibility: "public",
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      // If link already exists, Dropbox returns a 409 with the existing link
      if (
        response.status === 409 &&
        errorData.error?.shared_link_already_exists
      ) {
        return errorData.error.shared_link_already_exists.metadata.url;
      }
      throw new StorageError(
        `Failed to create shared link: ${JSON.stringify(errorData)}`,
        "LINK_CREATION_FAILED",
        "dropbox",
      );
    }

    const result = (await response.json()) as DropboxSharedLinkResponse;
    // Modify URL for direct download
    return result.url.replace("?dl=0", "?dl=1");
  }
}
