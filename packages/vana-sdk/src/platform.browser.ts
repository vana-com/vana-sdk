/**
 * Browser-specific platform adapters entry point
 *
 * This module provides browser-safe platform utilities without Node.js dependencies.
 */

// Export browser platform adapter
export { BrowserPlatformAdapter } from "./platform/browser";

// Export platform interface
export type { VanaPlatformAdapter } from "./platform/interface";

// Export browser-safe utilities only
export {
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./platform/browser-only";

// Export safe platform utilities (no Node.js imports)
export {
  detectPlatform,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";
