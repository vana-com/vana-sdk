/**
 * Platform adapter types and implementations
 * 
 * This module exports the platform-specific adapters and interfaces
 * without the getPlatformAdapter function, which has been removed
 * in favor of explicit adapter injection.
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