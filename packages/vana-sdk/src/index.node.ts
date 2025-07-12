/**
 * Node.js-specific entry point for Vana SDK
 *
 * This entry point ensures that the Node.js platform adapter is used
 * when the SDK is imported in Node.js environments.
 */

// Re-export all public APIs from the main index
export * from "./index";

// Override the platform adapter getter to use the Node.js adapter
import { nodePlatformAdapter } from "./platform/node";
import * as platformModule from "./platform";

// Monkey patch the getPlatformAdapter function to always return the Node.js adapter
(platformModule as Record<string, unknown>).getPlatformAdapter = () =>
  nodePlatformAdapter;
