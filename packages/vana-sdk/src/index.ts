// Core modules - environment-specific Vana classes are exported from index.node.ts and index.browser.ts
export { VanaCore } from "./core";

// Universal Vana class with runtime platform detection
// This provides a fallback for environments where conditional exports don't work properly
import { VanaCore } from "./core";
import { NodePlatformAdapter } from "./platform/node";
import { BrowserPlatformAdapter } from "./platform/browser";
import type { VanaConfig } from "./types";
import type { VanaPlatformAdapter } from "./platform/interface";

/**
 * NOTE on Platform Adapter Imports:
 * Both NodePlatformAdapter and BrowserPlatformAdapter are statically imported here
 * to create a universal Vana class that works in any environment via runtime
 * detection. While this may seem to bundle unnecessary code, it acts as a
 * robust fallback for environments (like some Next.js configurations) that
 * do not properly handle the 'exports' field in package.json for conditional
 * exports. Modern bundlers with effective tree-shaking should eliminate the
 * unused adapter from the final bundle.
 */

/**
 * Universal Vana SDK class with automatic platform detection.
 * Detects the runtime environment and uses the appropriate platform adapter.
 *
 * For better performance and explicit control, prefer importing from:
 * - Node.js: Use the environment-specific entry points via conditional exports
 * - Browser: Use the environment-specific entry points via conditional exports
 */
export class Vana extends VanaCore {
  constructor(config: VanaConfig) {
    // Runtime platform detection and adapter selection
    const platformAdapter = Vana.createPlatformAdapter();
    super(config, platformAdapter);
  }

  private static createPlatformAdapter(): VanaPlatformAdapter {
    // Runtime environment detection
    const isNode =
      typeof window === "undefined" &&
      typeof global !== "undefined" &&
      typeof process !== "undefined";

    if (isNode) {
      return new NodePlatformAdapter();
    } else {
      return new BrowserPlatformAdapter();
    }
  }

  static override fromChain(config: VanaConfig) {
    return new Vana(config);
  }

  static override fromWallet(config: VanaConfig) {
    return new Vana(config);
  }
}

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

// Legacy exports for backward compatibility
// VanaContract is already exported from "./types" above
