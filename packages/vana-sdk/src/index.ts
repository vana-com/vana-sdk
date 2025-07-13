// Core modules - environment-specific Vana classes are exported from index.node.ts and index.browser.ts
export { VanaCore } from "./core";

// Universal Vana class with runtime platform detection using dynamic imports
// This provides robust isomorphic support without bundling browser code in server environments
import { VanaCore } from "./core";
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
 * Uses dynamic imports to ensure platform-specific code is only loaded in the correct environment.
 * This prevents SSR issues where browser-only APIs are bundled in server environments.
 *
 * BREAKING CHANGE: The constructor is now private. Use the async static create() method instead.
 */
export class Vana extends VanaCore {
  /**
   * Private constructor to enforce async initialization.
   * Use Vana.create() instead of new Vana().
   */
  private constructor(config: VanaConfig, platform: VanaPlatformAdapter) {
    super(config, platform);
  }

  /**
   * Creates a new Vana instance with automatic platform detection.
   * This is the new official way to initialize the SDK.
   *
   * @param config - Configuration object (WalletConfig or ChainConfig)
   * @returns Promise resolving to a Vana instance
   */
  public static async create(config: VanaConfig): Promise<Vana> {
    const platformAdapter = await Vana.createPlatformAdapter();
    return new Vana(config, platformAdapter);
  }

  private static async createPlatformAdapter(): Promise<VanaPlatformAdapter> {
    // Runtime environment detection
    const isNode =
      typeof window === "undefined" &&
      typeof global !== "undefined" &&
      typeof process !== "undefined";

    if (isNode) {
      // Dynamic import for Node.js environment
      const { NodePlatformAdapter } = await import("./platform/node");
      return new NodePlatformAdapter();
    } else {
      // Dynamic import for browser environment
      const { BrowserPlatformAdapter } = await import("./platform/browser");
      return new BrowserPlatformAdapter();
    }
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
