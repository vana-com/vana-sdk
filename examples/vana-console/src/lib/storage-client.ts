/**
 * Client-side storage configuration
 * Used by React components running in the browser
 *
 * Design principle: Support both patterns
 * 1. User-provided credentials (for testing/development)
 * 2. Server proxy (for production/users without credentials)
 *
 * This allows developers to test with their own storage while
 * also providing a secure default for production usage.
 */

import {
  StorageManager,
  CallbackStorage,
  PinataStorage,
  GoogleDriveStorage,
  DropboxStorage,
  type StorageCallbacks,
  type StorageProvider,
} from "@opendatalabs/vana-sdk/browser";

/**
 * Storage configuration options
 */
export interface StorageConfig {
  /** User's own Pinata JWT for direct access */
  pinataJwt?: string;
  /** Custom Pinata gateway URL */
  pinataGateway?: string;
  /** Google Drive access token */
  googleDriveAccessToken?: string;
  /** Google Drive refresh token */
  googleDriveRefreshToken?: string;
  /** Dropbox access token */
  dropboxAccessToken?: string;
  /** Dropbox refresh token */
  dropboxRefreshToken?: string;
  /** Default provider to use */
  defaultProvider?: string;
}

/**
 * Create server proxy callbacks that route through API
 */
function createServerProxyCallbacks(): StorageCallbacks {
  return {
    async upload(blob: Blob, filename?: string) {
      const formData = new FormData();
      formData.append("file", blob, filename);

      const response = await fetch("/api/ipfs/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed: ${error}`);
      }

      const data = await response.json();
      return {
        url: data.url ?? data.identifier,
        size: blob.size,
        contentType: blob.type ?? "application/octet-stream",
      };
    },

    async download(identifier: string) {
      const response = await fetch("/api/ipfs/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Download failed: ${error}`);
      }

      return response.blob();
    },
  };
}

/**
 * Create a storage manager for client-side usage
 * Supports both user-provided credentials and server proxy
 */
export function createClientStorageManager(
  config: StorageConfig = {},
): StorageManager {
  const storageManager = new StorageManager();
  const providers: Record<string, StorageProvider> = {};

  // Always provide server proxy as a fallback option
  providers["server-ipfs"] = new CallbackStorage(createServerProxyCallbacks());

  // Add user-provided Pinata if configured
  if (config.pinataJwt) {
    providers["user-ipfs"] = new PinataStorage({
      jwt: config.pinataJwt,
      gatewayUrl: config.pinataGateway ?? "https://gateway.pinata.cloud",
    });
  }

  // Add user-provided Google Drive if configured
  if (config.googleDriveAccessToken) {
    providers["google-drive"] = new GoogleDriveStorage({
      accessToken: config.googleDriveAccessToken,
      refreshToken: config.googleDriveRefreshToken,
    });
  }

  // Add user-provided Dropbox if configured
  if (config.dropboxAccessToken) {
    providers["dropbox"] = new DropboxStorage({
      accessToken: config.dropboxAccessToken,
      refreshToken: config.dropboxRefreshToken,
    });
  }

  // Register all providers
  Object.entries(providers).forEach(([name, provider]) => {
    const isDefault = name === (config.defaultProvider ?? "server-ipfs");
    storageManager.register(name, provider, isDefault);
  });

  return storageManager;
}

/**
 * Create a standalone Pinata provider for direct client usage
 * Used when users want to test with their own credentials
 */
export function createClientPinataProvider(jwt: string): PinataStorage {
  return new PinataStorage({
    jwt,
    gatewayUrl: "https://gateway.pinata.cloud",
  });
}

/**
 * Create a standalone Google Drive provider for direct client usage
 */
export function createClientGoogleDriveProvider(config: {
  accessToken: string;
  refreshToken?: string;
}): GoogleDriveStorage {
  return new GoogleDriveStorage(config);
}
