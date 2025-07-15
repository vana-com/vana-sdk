import { VanaCore } from "./core";
import { BrowserPlatformAdapter } from "./platform/browser";
import type { VanaConfig } from "./types";

/**
 * The Vana SDK class pre-configured for browser environments.
 * Automatically uses the browser platform adapter.
 *
 * Use the static `create()` method to initialize:
 * ```typescript
 * const vana = await Vana.create({ walletClient });
 * ```
 */
export class Vana extends VanaCore {
  private constructor(config: VanaConfig, _allowConstruction = false) {
    if (!_allowConstruction) {
      throw new Error(
        "Cannot instantiate Vana directly. Use Vana.create() instead.",
      );
    }
    // Automatically inject the browser platform adapter
    super(config, new BrowserPlatformAdapter());
  }

  /**
   * Creates a Vana SDK instance configured for browser environments.
   * @param config - SDK configuration object (wallet client or chain config)
   * @returns Promise resolving to Vana SDK instance
   *
   * @example
   * ```typescript
   * // With wallet client
   * const vana = await Vana.create({ walletClient });
   *
   * // With chain configuration
   * const vana = await Vana.create({ chainId: 14800, account });
   * ```
   */
  static async create(config: VanaConfig): Promise<Vana> {
    return new Vana(config, true);
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
