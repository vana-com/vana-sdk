/**
 * Node.js-specific platform adapters entry point
 *
 * This module provides full platform utilities including Node.js support.
 */

// Export both platform adapters
export { BrowserPlatformAdapter } from "./platform/browser";
export { NodePlatformAdapter } from "./platform/node";

// Export platform interface
export type { VanaPlatformAdapter } from "./platform/interface";

// Export all platform utilities
export {
  detectPlatform,
  createPlatformAdapter,
  createPlatformAdapterFor,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";

// Export browser-safe utilities with Node.js support
export {
  createNodePlatformAdapter,
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./platform/browser-safe";
