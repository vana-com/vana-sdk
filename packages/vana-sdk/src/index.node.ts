import { VanaCore } from "./core";
import { NodePlatformAdapter } from "./platform/node";
import type { VanaConfig } from "./types";

/**
 * The Vana SDK class pre-configured for Node.js environments.
 * Automatically uses the Node.js platform adapter.
 */
export class Vana extends VanaCore {
  constructor(config: VanaConfig) {
    // Automatically inject the Node.js platform adapter
    super(config, new NodePlatformAdapter());
  }

  /**
   * Creates a Vana SDK instance from a chain configuration.
   * @param config - Chain configuration object
   * @returns Vana SDK instance configured for Node.js
   */
  static override fromChain(config: VanaConfig) {
    return new Vana(config);
  }

  /**
   * Creates a Vana SDK instance from a wallet client configuration.
   * @param config - Wallet client configuration object
   * @returns Vana SDK instance configured for Node.js
   */
  static override fromWallet(config: VanaConfig) {
    return new Vana(config);
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

export { ApiClient } from "./core/apiClient";

export type {
  ApiClientConfig,
  HttpMethod,
  RequestOptions,
} from "./core/apiClient";

// Re-export the SDK as both named and default export
export default Vana;