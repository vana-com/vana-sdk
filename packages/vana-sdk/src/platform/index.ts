/**
 * Platform adapter types and implementations
 *
 * This module exports the platform-specific adapters and interfaces
 * along with utilities for platform detection and adapter creation.
 */

// Export types
export type {
  VanaCryptoAdapter,
  VanaPGPAdapter,
  VanaHttpAdapter,
  VanaPlatformAdapter,
  PlatformType,
} from "./interface";

// Export implementations
export { NodePlatformAdapter } from "./node";
export { BrowserPlatformAdapter } from "./browser";

// Export utilities
export {
  detectPlatform,
  createPlatformAdapter,
  createPlatformAdapterFor,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./utils";
