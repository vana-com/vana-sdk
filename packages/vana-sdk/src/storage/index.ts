/**
 * Storage API for Vana SDK
 *
 * Provides unified interface for different storage providers
 * to upload, download, and manage user data files.
 */

// Re-export storage types from types module to avoid circular dependencies
export type {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
  StorageProviderConfig,
} from "../types/storage";

export { StorageError } from "../types/storage";

// Export storage providers
export { GoogleDriveStorage } from "./providers/google-drive";
export { IPFSStorage } from "./providers/ipfs";
export { PinataStorage } from "./providers/pinata";
export { ServerIPFSStorage } from "./providers/server-ipfs";

// Export storage manager
export { StorageManager } from "./manager";
