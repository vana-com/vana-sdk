/**
 * Google Drive Storage Provider for Vana SDK
 *
 * Implements storage interface for Google Drive using OAuth2 authentication.
 * Based on patterns from dlp-ui-template with NextAuth integration.
 */

import {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
  StorageProviderConfig,
  StorageError,
} from "../index";

export interface GoogleDriveConfig {
  /** OAuth2 access token */
  accessToken: string;
  /** Optional refresh token for token renewal */
  refreshToken?: string;
  /** OAuth2 client ID */
  clientId?: string;
  /** OAuth2 client secret */
  clientSecret?: string;
  /** Parent folder ID to upload files to */
  folderId?: string;
}

interface GoogleDriveFile {
  id: string;
  name: string;
  webViewLink: string;
  size: string;
  mimeType: string;
  createdTime: string;
}

export class GoogleDriveStorage implements StorageProvider {
  private readonly baseUrl = "https://www.googleapis.com/drive/v3";
  private readonly uploadUrl = "https://www.googleapis.com/upload/drive/v3";

  constructor(private config: GoogleDriveConfig) {
    if (!config.accessToken) {
      throw new StorageError(
        "Google Drive access token is required",
        "MISSING_ACCESS_TOKEN",
        "google-drive",
      );
    }
  }

  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    try {
      const fileName = filename || `vana-file-${Date.now()}.dat`;

      // Create file metadata
      const metadata = {
        name: fileName,
        parents: this.config.folderId ? [this.config.folderId] : undefined,
      };

      // Create multipart upload request
      const delimiter = "-------314159265358979323846";
      const closeDelim = `\r\n--${delimiter}--`;

      const metadataBlob = new Blob([JSON.stringify(metadata)], {
        type: "application/json",
      });

      const multipartRequestBody = [
        `--${delimiter}`,
        "Content-Type: application/json",
        "",
        await metadataBlob.text(),
        `--${delimiter}`,
        `Content-Type: ${file.type || "application/octet-stream"}`,
        "",
        "",
      ].join("\r\n");

      const requestBody = new Blob([multipartRequestBody, file, closeDelim]);

      const response = await fetch(
        `${this.uploadUrl}/files?uploadType=multipart`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            "Content-Type": `multipart/related; boundary="${delimiter}"`,
          },
          body: requestBody,
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new StorageError(
          `Failed to upload to Google Drive: ${error}`,
          "UPLOAD_FAILED",
          "google-drive",
        );
      }

      const result = await response.json();

      // Make file publicly readable
      await this.makeFilePublic(result.id);

      return {
        url: `https://drive.google.com/file/d/${result.id}/view`,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        metadata: {
          id: result.id,
          name: result.name,
          driveUrl: `https://drive.google.com/file/d/${result.id}/view`,
          downloadUrl: `https://drive.google.com/uc?id=${result.id}&export=download`,
        },
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Google Drive upload error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UPLOAD_ERROR",
        "google-drive",
      );
    }
  }

  async download(url: string): Promise<Blob> {
    try {
      // Extract file ID from Google Drive URL
      const fileId = this.extractFileId(url);
      if (!fileId) {
        throw new StorageError(
          "Invalid Google Drive URL format",
          "INVALID_URL",
          "google-drive",
        );
      }

      const response = await fetch(
        `${this.baseUrl}/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new StorageError(
          `Failed to download from Google Drive: ${error}`,
          "DOWNLOAD_FAILED",
          "google-drive",
        );
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Google Drive download error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DOWNLOAD_ERROR",
        "google-drive",
      );
    }
  }

  async list(options?: StorageListOptions): Promise<StorageFile[]> {
    try {
      let query = "trashed = false";

      // Add parent folder filter if configured
      if (this.config.folderId) {
        query += ` and '${this.config.folderId}' in parents`;
      }

      // Add name pattern filter
      if (options?.namePattern) {
        query += ` and name contains '${options.namePattern}'`;
      }

      const params = new URLSearchParams({
        q: query,
        fields: "files(id,name,size,mimeType,createdTime,webViewLink)",
        pageSize: (options?.limit || 100).toString(),
      });

      if (options?.offset && typeof options.offset === "string") {
        params.set("pageToken", options.offset);
      }

      const response = await fetch(`${this.baseUrl}/files?${params}`, {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new StorageError(
          `Failed to list Google Drive files: ${error}`,
          "LIST_FAILED",
          "google-drive",
        );
      }

      const result = await response.json();

      return result.files.map((file: GoogleDriveFile) => ({
        id: file.id,
        name: file.name,
        url: file.webViewLink,
        size: parseInt(file.size) || 0,
        contentType: file.mimeType,
        createdAt: new Date(file.createdTime),
        metadata: {
          id: file.id,
          driveUrl: file.webViewLink,
          downloadUrl: `https://drive.google.com/uc?id=${file.id}&export=download`,
        },
      }));
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Google Drive list error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "LIST_ERROR",
        "google-drive",
      );
    }
  }

  async delete(url: string): Promise<boolean> {
    try {
      // Extract file ID from Google Drive URL
      const fileId = this.extractFileId(url);
      if (!fileId) {
        throw new StorageError(
          "Invalid Google Drive URL format",
          "INVALID_URL",
          "google-drive",
        );
      }

      const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new StorageError(
          `Failed to delete from Google Drive: ${error}`,
          "DELETE_FAILED",
          "google-drive",
        );
      }

      return true;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Google Drive delete error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DELETE_ERROR",
        "google-drive",
      );
    }
  }

  getConfig(): StorageProviderConfig {
    return {
      name: "Google Drive",
      type: "google-drive",
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
   * Make a Google Drive file publicly readable
   * @param fileId - Google Drive file ID
   */
  private async makeFilePublic(fileId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/files/${fileId}/permissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      });
    } catch (error) {
      // Non-critical error - file upload succeeded but sharing failed
      console.warn("Failed to make Google Drive file public:", error);
    }
  }

  /**
   * Extract file ID from various Google Drive URL formats
   * @param url - Google Drive URL
   * @returns File ID or null if not found
   */
  private extractFileId(url: string): string | null {
    // Handle various Google Drive URL formats
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/, // https://drive.google.com/file/d/FILE_ID/view
      /id=([a-zA-Z0-9-_]+)/, // https://drive.google.com/uc?id=FILE_ID
      /^([a-zA-Z0-9-_]+)$/, // Just the file ID
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
   * Refresh the access token using refresh token
   * @returns Promise with new access token
   */
  async refreshAccessToken(): Promise<string> {
    if (
      !this.config.refreshToken ||
      !this.config.clientId ||
      !this.config.clientSecret
    ) {
      throw new StorageError(
        "Refresh token, client ID, and client secret are required for token refresh",
        "MISSING_REFRESH_CONFIG",
        "google-drive",
      );
    }

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new StorageError(
          `Failed to refresh Google Drive token: ${error}`,
          "TOKEN_REFRESH_FAILED",
          "google-drive",
        );
      }

      const result = await response.json();
      this.config.accessToken = result.access_token;

      return result.access_token;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Google Drive token refresh error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "TOKEN_REFRESH_ERROR",
        "google-drive",
      );
    }
  }
}
