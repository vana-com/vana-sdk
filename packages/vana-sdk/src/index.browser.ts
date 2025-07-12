/**
 * Browser-specific entry point for Vana SDK
 *
 * This entry point ensures that the browser platform adapter is used
 * when the SDK is imported in browser environments.
 */

// Re-export all public APIs from the main index
export * from "./index";

// Override the platform adapter getter to use the browser adapter
import { browserPlatformAdapter } from "./platform/browser";
import * as platformModule from "./platform";

// Monkey patch the getPlatformAdapter function to always return the browser adapter
(platformModule as Record<string, unknown>).getPlatformAdapter = () =>
  browserPlatformAdapter;
