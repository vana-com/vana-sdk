/**
 * Storage API for Vana SDK
 *
 * Provides unified interface for different storage providers
 * to upload, download, and manage user data files.
 *
 * ## Storage Provider Decision Tree
 *
 * Choose your storage provider based on your needs:
 *
 * **Need full CRUD operations and metadata?**
 * - ✅ Use `PinataStorage` - Managed IPFS with listing, deletion, and rich metadata
 *
 * **Want to use your own IPFS infrastructure?**
 * - ✅ Use `IpfsStorage.forInfura()` - Connect to Infura IPFS service
 * - ✅ Use `IpfsStorage.forLocalNode()` - Connect to local IPFS node
 * - ✅ Use `new IpfsStorage()` - Connect to any IPFS-compatible service
 *
 * **Want flexible callback-based storage?**
 * - ✅ Use `CallbackStorage` - Implement storage via custom callbacks (HTTP, WebSocket, etc.)
 *
 * **Need Google Drive integration?**
 * - ✅ Use `GoogleDriveStorage` - Direct Google Drive API with folder management
 *
 * @example
 * ```typescript
 * // Managed IPFS with full features
 * const pinata = new PinataStorage({ jwt: "your-jwt" });
 *
 * // Standard IPFS with Infura
 * const ipfs = IpfsStorage.forInfura({ projectId: "...", projectSecret: "..." });
 *
 * // Callback-based storage (flexible)
 * const storage = new CallbackStorage({
 *   async upload(blob, filename) {
 *     // Your custom upload logic
 *     const response = await fetch('/api/upload', { method: 'POST', body: blob });
 *     const data = await response.json();
 *     return { url: data.url, size: blob.size, contentType: blob.type };
 *   },
 *   async download(identifier) {
 *     // Your custom download logic
 *     const response = await fetch(`/api/download/${identifier}`);
 *     return response.blob();
 *   }
 * });
 * ```
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
export { IpfsStorage } from "./providers/ipfs";
export { PinataStorage } from "./providers/pinata";
export { CallbackStorage } from "./providers/callback-storage";

// Export storage manager
export { StorageManager } from "./manager";

// Export storage callback types
export type {
  StorageCallbacks,
  StorageDownloadOptions,
  StorageListResult,
} from "../types/config";
