/**
 * Platform adapter selection and exports
 *
 * This module provides the appropriate platform adapter based on the current environment.
 * The actual adapter used will be determined by the conditional exports in package.json.
 */

export type {
  VanaPlatformAdapter,
  VanaCryptoAdapter,
  VanaPGPAdapter,
  VanaHttpAdapter,
} from "./interface";

// Import the adapters for local use
import { nodePlatformAdapter } from "./node";
import { browserPlatformAdapter } from "./browser";

// These will be conditionally exported based on the environment
export { nodePlatformAdapter } from "./node";
export { browserPlatformAdapter } from "./browser";

/**
 * Get the platform adapter for the current environment
 * This function will be overridden by conditional exports to return the appropriate adapter
 */
export function getPlatformAdapter(): import("./interface").VanaPlatformAdapter {
  // This is a fallback that should never be reached in production
  // due to conditional exports, but provides a safety net

  // Check if we're in a browser environment
  const hasWindow =
    typeof globalThis !== "undefined" &&
    "window" in globalThis &&
    typeof (globalThis as Record<string, unknown>).window !== "undefined";

  if (hasWindow) {
    // Browser environment
    return browserPlatformAdapter;
  } else {
    // Node.js environment
    return nodePlatformAdapter;
  }
}
