/**
 * Browser-only exports for platform adapters
 *
 * This file provides browser-only exports that completely avoid Node.js imports
 * when bundling for browser environments. This is used by the browser entry point.
 */

import type { VanaPlatformAdapter } from "./interface";
import { BrowserPlatformAdapter } from "./browser";

/**
 * Creates a BrowserPlatformAdapter instance
 *
 * @returns A BrowserPlatformAdapter instance
 */
export function createBrowserPlatformAdapter(): VanaPlatformAdapter {
  return new BrowserPlatformAdapter();
}

/**
 * Browser-only platform adapter factory
 * This version does not include Node.js imports at all
 *
 * @returns A BrowserPlatformAdapter instance
 */
export function createPlatformAdapterSafe(): VanaPlatformAdapter {
  // Always return browser adapter in browser environments
  return createBrowserPlatformAdapter();
}

// Export types
export type { VanaPlatformAdapter } from "./interface";
export type { BrowserPlatformAdapter } from "./browser";
