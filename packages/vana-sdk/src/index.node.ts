import { NodePlatformAdapter } from "./platform/node";
import { VanaCore } from "./core";
import type {
  VanaConfig,
  VanaConfigWithStorage,
  StorageRequiredMarker,
} from "./types";

/**
 * Internal implementation class for Node.js environments.
 * This class is not exported directly - use the Vana factory function instead.
 */
class VanaNodeImpl extends VanaCore {
  constructor(config: VanaConfig) {
    super(new NodePlatformAdapter(), config);
  }
}

/**
 * Creates a new Vana SDK instance configured for Node.js environments.
 *
 * This function automatically provides the correct TypeScript types based on your configuration:
 * - With storage config: All methods including storage-dependent ones are available
 * - Without storage: Storage-dependent methods are not available at compile time
 *
 * @param config - The configuration object containing wallet client and optional storage settings
 * @returns A Vana SDK instance configured for Node.js use
 * @example
 * ```typescript
 * // With storage - all methods available
 * const vana = Vana({
 *   walletClient,
 *   storage: { providers: { ipfs: new IPFSStorage() }, defaultProvider: 'ipfs' }
 * });
 * await vana.data.uploadFile(file); // ✅ Works - TypeScript knows storage is available
 *
 * // Without storage - storage methods unavailable at compile time
 * const vanaNoStorage = Vana({ walletClient });
 * // await vanaNoStorage.data.uploadFile(file); // ❌ TypeScript error
 *
 * // Runtime check still available
 * if (vanaNoStorage.isStorageEnabled()) {
 *   // TypeScript now knows storage methods are safe to use
 *   await vanaNoStorage.data.uploadFile(file); // ✅ Works
 * }
 * ```
 */
export function Vana(
  config: VanaConfigWithStorage,
): VanaNodeImpl & StorageRequiredMarker;
export function Vana(config: VanaConfig): VanaNodeImpl;
export function Vana(config: VanaConfig) {
  return new VanaNodeImpl(config);
}

/**
 * The type of a Vana SDK instance in Node.js environments.
 *
 * @see {@link Vana}
 */
export type VanaInstance = VanaNodeImpl;

// Export as default export
export default Vana;

// Re-export everything that was in index.ts (avoiding circular dependency)
// Core class and factory
export { VanaCore, VanaCoreFactory } from "./core";

// Types - modular exports
export type * from "./types";

// Type guards and utilities
export {
  isReplicateAPIResponse,
  isAPIResponse,
  safeParseJSON,
  parseReplicateOutput,
} from "./types/external-apis";

// VanaContract is exported from abi to avoid circular dependencies
export type { VanaContract } from "./abi";

// Error classes
export * from "./errors";

// Controllers
export { PermissionsController } from "./controllers/permissions";
export { DataController } from "./controllers/data";
export { ServerController } from "./controllers/server";
export { ProtocolController } from "./controllers/protocol";
export { SchemaController } from "./controllers/schemas";

// Contract controller
export * from "./contracts/contractController";

// Utilities
export * from "./utils/encryption";
export * from "./utils/formatters";
export * from "./utils/grantFiles";
export * from "./utils/grantValidation";
export * from "./utils/grants";
export * from "./utils/ipfs";
export * from "./utils/schemaValidation";
export * from "./utils/signatureCache";

// Storage API
export * from "./storage";

// Configuration
export { getContractAddress } from "./config/addresses";
export { chains } from "./config/chains";

// Chain configurations with subgraph URLs - explicit exports for better DX
export {
  vanaMainnet,
  mokshaTestnet,
  moksha,
  type VanaChainConfig,
  getChainConfig,
  getAllChains,
} from "./chains";
export * from "./chains";

// ABIs
export { getAbi } from "./abi";
export type { VanaContract as VanaContractAbi } from "./abi";

// Generic utilities for extensibility
export {
  BaseController,
  RetryUtility,
  RateLimiter,
  MemoryCache,
  EventEmitter,
  MiddlewarePipeline,
  AsyncQueue,
  CircuitBreaker,
} from "./core/generics";

// Server-side utilities
export { handleRelayerRequest } from "./server/handler";
export type { RelayerRequestPayload } from "./server/handler";

// Platform adapters
export { NodePlatformAdapter } from "./platform/node";
export { BrowserPlatformAdapter } from "./platform/browser";
export type { VanaPlatformAdapter } from "./platform/interface";

// Platform utilities
export {
  detectPlatform,
  createPlatformAdapter,
  createPlatformAdapterFor,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";

// Browser-safe platform utilities
export {
  createNodePlatformAdapter,
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./platform/browser-safe";

export { ApiClient } from "./core/apiClient";

export type {
  ApiClientConfig,
  HttpMethod,
  RequestOptions,
} from "./core/apiClient";

// Note: Default export is already handled above with the Vana factory function
// For testing purposes, we also export the implementation class
export { VanaNodeImpl };
