/**
 * Browser-safe exports for platform adapters
 *
 * This file provides browser-safe exports that avoid importing Node.js dependencies
 * when bundling for browser environments.
 */

import type { VanaPlatformAdapter } from "./interface";
import { BrowserPlatformAdapter } from "./browser";

/**
 * Dynamically imports the NodePlatformAdapter only when needed
 * This prevents Node.js modules from being bundled in browser builds
 */
export async function createNodePlatformAdapter(): Promise<VanaPlatformAdapter> {
  // Use string concatenation to avoid static analysis during bundling
  const moduleName = "./node";
  const { NodePlatformAdapter } = await import(moduleName);
  return new NodePlatformAdapter();
}

/**
 * Creates a BrowserPlatformAdapter instance
 */
export function createBrowserPlatformAdapter(): VanaPlatformAdapter {
  return new BrowserPlatformAdapter();
}

/**
 * Browser-safe platform adapter factory
 */
export async function createPlatformAdapterSafe(): Promise<VanaPlatformAdapter> {
  // Check for Node.js environment
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    return await createNodePlatformAdapter();
  }

  // Default to browser
  return createBrowserPlatformAdapter();
}

// Export types
export type { VanaPlatformAdapter } from "./interface";
export type { BrowserPlatformAdapter } from "./browser";
// NodePlatformAdapter type is available through dynamic import to avoid bundling Node.js dependencies
