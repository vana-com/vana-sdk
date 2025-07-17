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
 *
 * @returns Promise resolving to a NodePlatformAdapter instance
 * @throws {Error} If running in a browser environment
 */
export async function createNodePlatformAdapter(): Promise<VanaPlatformAdapter> {
  // Check if we're in a browser environment
  if (typeof window !== "undefined") {
    throw new Error(
      "NodePlatformAdapter is not available in browser environments. Use BrowserPlatformAdapter instead.",
    );
  }

  // Use string concatenation to avoid static analysis during bundling
  const moduleName = "./node";
  const { NodePlatformAdapter } = await import(moduleName);
  return new NodePlatformAdapter();
}

/**
 * Creates a BrowserPlatformAdapter instance
 *
 * @returns A BrowserPlatformAdapter instance
 */
export function createBrowserPlatformAdapter(): VanaPlatformAdapter {
  return new BrowserPlatformAdapter();
}

/**
 * Browser-safe platform adapter factory
 *
 * @returns Promise resolving to the appropriate platform adapter
 */
export async function createPlatformAdapterSafe(): Promise<VanaPlatformAdapter> {
  // Check if we're in a browser environment
  if (typeof window !== "undefined") {
    return createBrowserPlatformAdapter();
  }

  // Check for Node.js environment
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    // Only attempt Node.js import if we're not in a browser environment
    if (typeof window === "undefined") {
      return await createNodePlatformAdapter();
    }
  }

  // Default to browser if we can't determine
  return createBrowserPlatformAdapter();
}

// Export types
export type { VanaPlatformAdapter } from "./interface";
export type { BrowserPlatformAdapter } from "./browser";
// NodePlatformAdapter type is available through dynamic import to avoid bundling Node.js dependencies
