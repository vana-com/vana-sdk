/**
 * Platform detection and adapter utilities
 *
 * This module provides utilities for detecting the current runtime environment
 * and creating appropriate platform adapters automatically.
 */

import type { VanaPlatformAdapter, PlatformType } from "./interface";

/**
 * Detects the current runtime environment
 *
 * @returns The detected platform type
 */
export function detectPlatform(): PlatformType {
  // Check for Node.js environment
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    return "node";
  }

  // Check for browser environment
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    return "browser";
  }

  // Default to Node.js if we can't determine (e.g., SSR environments)
  return "node";
}

/**
 * Creates the appropriate platform adapter based on the current environment
 *
 * @returns A platform adapter instance for the current environment
 * @throws {Error} If platform adapters cannot be imported or created
 */
export async function createPlatformAdapter(): Promise<VanaPlatformAdapter> {
  const platform = detectPlatform();

  try {
    if (platform === "node") {
      // Use string concatenation to avoid static analysis
      const moduleName = "./node";
      const { NodePlatformAdapter } = await import(moduleName);
      return new NodePlatformAdapter();
    } else {
      const { BrowserPlatformAdapter } = await import("./browser");
      return new BrowserPlatformAdapter();
    }
  } catch (error) {
    throw new Error(
      `Failed to create platform adapter for ${platform}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Creates a platform adapter for a specific platform type
 *
 * @param platformType - The platform type to create an adapter for
 * @returns A platform adapter instance for the specified platform
 * @throws {Error} If platform adapters cannot be imported or created
 */
export async function createPlatformAdapterFor(
  platformType: PlatformType,
): Promise<VanaPlatformAdapter> {
  try {
    if (platformType === "node") {
      // Use string concatenation to avoid static analysis
      const moduleName = "./node";
      const { NodePlatformAdapter } = await import(moduleName);
      return new NodePlatformAdapter();
    } else {
      const { BrowserPlatformAdapter } = await import("./browser");
      return new BrowserPlatformAdapter();
    }
  } catch (error) {
    throw new Error(
      `Failed to create platform adapter for ${platformType}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Checks if the current environment supports the given platform adapter
 *
 * @param platformType - The platform type to check
 * @returns True if the platform is supported, false otherwise
 */
export function isPlatformSupported(platformType: PlatformType): boolean {
  const currentPlatform = detectPlatform();
  return currentPlatform === platformType;
}

/**
 * Gets platform-specific capabilities
 *
 * @returns Object describing available platform capabilities
 */
export function getPlatformCapabilities() {
  const platform = detectPlatform();

  return {
    platform,
    crypto: {
      webCrypto: typeof crypto !== "undefined" && crypto.subtle,
      nodeCrypto:
        typeof process !== "undefined" &&
        process.versions &&
        process.versions.node,
    },
    fetch:
      typeof fetch !== "undefined" || typeof globalThis.fetch !== "undefined",
    streams: typeof ReadableStream !== "undefined",
  };
}
