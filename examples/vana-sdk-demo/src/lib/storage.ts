// Centralized storage configuration for the demo app
// This reduces duplication and provides consistent storage setup

import {
  StorageManager,
  PinataStorage,
  CallbackStorage,
  StorageCallbacks,
  GoogleDriveStorage,
} from "@opendatalabs/vana-sdk/browser";

/**
 * Get the Pinata gateway URL with fallback
 */
function getPinataGatewayUrl(): string {
  return process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud";
}

/**
 * Create a Pinata storage provider with the given JWT
 */
function createPinataStorageWithJWT(jwt: string): PinataStorage {
  return new PinataStorage({
    jwt,
    gatewayUrl: getPinataGatewayUrl(),
  });
}

/**
 * Create a Google Drive storage provider with the given configuration
 */
function createGoogleDriveStorageWithConfig(config: {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  folderId?: string;
}): GoogleDriveStorage {
  return new GoogleDriveStorage(config);
}

/**
 * Create a configured storage manager with available providers
 * This centralizes storage configuration across the demo app
 */
export function createStorageManager(): StorageManager {
  const storageManager = new StorageManager();

  // Always provide server-managed storage as fallback using callbacks
  const appIpfsCallbacks: StorageCallbacks = {
    async upload(blob: Blob, filename?: string) {
      const formData = new FormData();
      formData.append("file", blob, filename);
      const response = await fetch("/api/ipfs/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(
          `Upload failed: ${response.status} ${response.statusText}`,
        );
      }
      const data = await response.json();
      return {
        url: data.url || data.identifier,
        size: blob.size,
        contentType: blob.type || "application/octet-stream",
      };
    },
    async download(identifier: string) {
      const response = await fetch("/api/ipfs/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      if (!response.ok) {
        throw new Error(
          `Download failed: ${response.status} ${response.statusText}`,
        );
      }
      return response.blob();
    },
  };
  const serverProxy = new CallbackStorage(appIpfsCallbacks);
  storageManager.register("app-ipfs", serverProxy);

  // Add Pinata if configured
  if (process.env.PINATA_JWT) {
    const pinataProvider = createPinataStorageWithJWT(process.env.PINATA_JWT);
    storageManager.register("pinata", pinataProvider);
  }

  // Add Google Drive if configured
  if (process.env.GOOGLE_DRIVE_ACCESS_TOKEN) {
    const googleDriveProvider = createGoogleDriveStorageWithConfig({
      accessToken: process.env.GOOGLE_DRIVE_ACCESS_TOKEN,
      refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    });
    storageManager.register("google-drive", googleDriveProvider);
  }

  return storageManager;
}

/**
 * Create a Pinata storage provider for server-side usage
 * Throws if not configured
 */
export function createPinataProvider(): PinataStorage {
  if (!process.env.PINATA_JWT) {
    throw new Error("PINATA_JWT not configured");
  }

  return createPinataStorageWithJWT(process.env.PINATA_JWT);
}

/**
 * Create a Pinata storage provider for client-side usage
 * Returns null if not configured
 */
export function createClientPinataProvider(jwt: string): PinataStorage | null {
  if (!jwt) {
    return null;
  }

  return createPinataStorageWithJWT(jwt);
}

/**
 * Create a Google Drive storage provider with optional folder creation
 * This will create or find the specified folder name for organized storage
 */
export async function createGoogleDriveProviderWithFolder(
  config: {
    accessToken: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
  },
  folderName: string = "Vana Data",
): Promise<GoogleDriveStorage> {
  const googleDriveProvider = createGoogleDriveStorageWithConfig(config);

  // Find or create the folder
  const folderId = await googleDriveProvider.findOrCreateFolder(folderName);

  // Create a new provider with the folder ID
  return createGoogleDriveStorageWithConfig({
    ...config,
    folderId,
  });
}
