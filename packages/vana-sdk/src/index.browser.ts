import { BrowserPlatformAdapter } from "./platform/browser";
import { VanaCore } from "./core";
import type { VanaConfig } from "./types";

/**
 * The Vana SDK class pre-configured for browser environments.
 * Automatically uses the browser platform adapter for crypto operations and file systems.
 *
 * @example
 * ```typescript
 * const vana = new Vana({ walletClient });
 *
 * // Upload and encrypt user data
 * const file = await vana.data.uploadAndStoreFile(dataBlob, schema);
 *
 * // Grant permissions to DLPs
 * await vana.permissions.grantPermission({
 *   account: dlpAddress,
 *   fileId: file.id,
 *   permissions: ['read']
 * });
 * ```
 */
export class VanaBrowser extends VanaCore {
  /**
   * Creates a Vana SDK instance configured for browser environments.
   *
   * @param config - SDK configuration object (wallet client or chain config)
   * @example
   * ```typescript
   * // With wallet client
   * const vana = new Vana({ walletClient });
   *
   * // With chain configuration
   * const vana = new Vana({ chainId: 14800, account });
   * ```
   */
  constructor(config: VanaConfig) {
    super(new BrowserPlatformAdapter(), config);
  }
}

// Re-export everything that was in index.ts (avoiding circular dependency)
// Types - modular exports
export type * from "./types";

// Type guards and utilities
export {
  isReplicateAPIResponse,
  isIdentityServerOutput,
  isPersonalServerOutput,
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

// Storage API
export * from "./storage";

// Configuration
export { getContractAddress } from "./config/addresses";
export { chains, mokshaTestnet, vanaMainnet } from "./config/chains";

// Chain configurations with subgraph URLs
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

// Platform adapters
export { BrowserPlatformAdapter } from "./platform/browser";
export type { NodePlatformAdapter } from "./platform/node";

export { ApiClient } from "./core/apiClient";

export type {
  ApiClientConfig,
  HttpMethod,
  RequestOptions,
} from "./core/apiClient";

// Re-export the SDK as both named and default export
export default VanaBrowser;
