/**
 * Platform adapters entry point
 *
 * This module provides platform-specific utilities for different environments.
 * Use this when you need platform detection or adapter creation.
 */

// Export platform adapters - these will be environment-specific
export { BrowserPlatformAdapter } from "./platform/browser";
export { NodePlatformAdapter } from "./platform/node";

// Export platform interface
export type { VanaPlatformAdapter } from "./platform/interface";

// Export platform utilities
export {
  detectPlatform,
  createPlatformAdapter,
  createPlatformAdapterFor,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";

// Export browser-safe utilities
export {
  createNodePlatformAdapter,
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./platform/browser-safe";
