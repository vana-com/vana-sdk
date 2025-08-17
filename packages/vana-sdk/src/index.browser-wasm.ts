/**
 * Vana SDK Browser Build with WebAssembly
 *
 * This entry point uses WebAssembly for improved performance.
 *
 * ⚠️ REQUIRES BUNDLER CONFIGURATION:
 *
 * Next.js (next.config.js):
 * ```js
 * module.exports = {
 *   webpack: (config) => {
 *     config.experiments = {
 *       ...config.experiments,
 *       asyncWebAssembly: true,
 *     };
 *     config.module.rules.push({
 *       test: /\.wasm$/,
 *       type: "webassembly/async",
 *     });
 *     return config;
 *   }
 * }
 * ```
 *
 * Webpack 5:
 * ```js
 * module.exports = {
 *   experiments: {
 *     asyncWebAssembly: true,
 *   },
 *   module: {
 *     rules: [
 *       {
 *         test: /\.wasm$/,
 *         type: "webassembly/async",
 *       }
 *     ]
 *   }
 * }
 * ```
 */

import { BrowserWASMPlatformAdapter } from "./platform/browser-wasm";
import { VanaCore } from "./core";
import type {
  VanaConfig,
  VanaConfigWithStorage,
  StorageRequiredMarker,
} from "./types";

/**
 * Internal implementation class for browser environments with WASM.
 * This class is not exported directly - use the Vana factory function instead.
 */
class VanaBrowserWASMImpl extends VanaCore {
  constructor(config: VanaConfig) {
    super(new BrowserWASMPlatformAdapter(), config);
  }
}

/**
 * Creates a new Vana SDK instance configured for browser environments with WebAssembly.
 * This variant provides better performance but requires WebAssembly configuration in your bundler.
 *
 * @param config - Configuration object containing wallet, storage, and relayer settings
 * @returns A fully configured Vana SDK instance for browser use with WASM optimization
 * @throws {InvalidConfigurationError} When configuration parameters are invalid or missing
 */
export function Vana(
  config: VanaConfigWithStorage,
): VanaBrowserWASMImpl & StorageRequiredMarker;
export function Vana(config: VanaConfig): VanaBrowserWASMImpl;
/**
 * Creates a Vana SDK instance optimized for browser WASM environments.
 *
 * @param config - Configuration object containing wallet, storage, and relayer settings
 * @returns A fully configured Vana SDK instance for browser use with WASM optimization
 */
export function Vana(config: VanaConfig) {
  return new VanaBrowserWASMImpl(config);
}

/**
 * The type of a Vana SDK instance in browser WASM environments.
 */
export type VanaInstance = VanaBrowserWASMImpl;

// Export as default export
export default Vana;

// Re-export everything from the browser build (avoiding circular dependency)
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
export type { VanaContract } from "./generated/abi";

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
export * from "./utils/signatureCache";
export { TransactionHandle } from "./utils/transactionHandle";

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
export { getAbi } from "./generated/abi";
export type { VanaContract as VanaContractAbi } from "./generated/abi";

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

// Platform adapters - WASM-optimized exports
export { BrowserWASMPlatformAdapter } from "./platform/browser-wasm";
export { browserWASMPlatformAdapter as platformAdapter } from "./platform/browser-wasm";
export type { VanaPlatformAdapter } from "./platform/interface";

// WASM ECIES provider
export { createBrowserWASMECIESProvider as createECIESProvider } from "./crypto/ecies/browser-wasm";

// Platform utilities - browser-safe only
export {
  detectPlatform,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";

export { ApiClient } from "./core/apiClient";

export type {
  ApiClientConfig,
  HttpMethod,
  RequestOptions,
} from "./core/apiClient";

// For testing purposes, we also export the implementation class
export { VanaBrowserWASMImpl };
