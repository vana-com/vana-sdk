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
 * Provides the main SDK interface with automatic platform detection and isomorphic support.
 *
 * @remarks
 * This class uses dynamic imports to ensure platform-specific code is only loaded in the
 * correct environment, preventing SSR issues where browser-only APIs would be bundled
 * in server environments. The constructor is private to enforce async initialization.
 *
 * @example
 * ```typescript
 * // Initialize with wallet configuration
 * const vana = await Vana.create({
 *   network: "moksha",
 *   wallet: {
 *     privateKey: "0x...",
 *   },
 * });
 *
 * // Initialize with chain configuration
 * const vana = await Vana.create({
 *   network: "mainnet",
 *   chain: {
 *     providerUrl: "https://rpc.vana.org",
 *   },
 * });
 * ```
 *
 * @category Core SDK
 */
export class Vana extends VanaCore {
  /**
   * Enforces async initialization pattern.
   *
   * @remarks
   * Use `Vana.create()` instead of direct instantiation to ensure proper platform detection.
   */
  private constructor(config: VanaConfig, platform: VanaPlatformAdapter) {
    super(config, platform);
  }

  /**
   * Creates a new Vana instance with automatic platform detection.
   *
   * @remarks
   * This method detects the runtime environment (Node.js or browser) and loads the
   * appropriate platform adapter using dynamic imports for optimal bundle size.
   *
   * @param config - The configuration object specifying network and authentication settings
   * @returns A Promise that resolves to a fully initialized Vana instance
   * @throws {Error} When platform detection fails or configuration is invalid
   *
   * @example
   * ```typescript
   * const vana = await Vana.create({
   *   network: "moksha",
   *   wallet: {
   *     privateKey: process.env.VANA_PRIVATE_KEY,
   *   },
   * });
   *
   * console.log(`Connected to ${vana.network}`);
   * ```
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

/**
 * Pre-configured chain definitions for all supported Vana networks.
 *
 * @example
 * ```typescript
 * import { vanaMainnet, moksha } from 'vana-sdk';
 *
 * // Use in wallet client configuration
 * const client = createWalletClient({
 *   chain: vanaMainnet,
 *   transport: http()
 * });
 * ```
 */
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
