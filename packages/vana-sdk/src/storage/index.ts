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
 * **Want server-managed storage?**
 * - ✅ Use `ServerProxyStorage` - Delegate to your server endpoints (any backend)
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
 * // Server-managed storage
 * const server = new ServerProxyStorage({ uploadUrl: "/upload", downloadUrl: "/download" });
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
export { ServerProxyStorage } from "./providers/server-proxy";

// Export storage manager
export { StorageManager } from "./manager";
