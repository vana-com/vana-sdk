/**
 * Internal platform adapter factory
 * 
 * This module provides a single function to get the appropriate platform adapter
 * based on the runtime environment. This should not be exported from the public API.
 */

import { isBrowser } from "../utils/runtime";
import { BrowserPlatformAdapter } from "./browser";
import { NodePlatformAdapter } from "./node";
import type { VanaPlatformAdapter } from "./interface";

/**
 * Gets the appropriate platform adapter for the current runtime environment
 * @returns BrowserPlatformAdapter in browser, NodePlatformAdapter in Node.js
 */
export function getPlatformAdapter(): VanaPlatformAdapter {
  return isBrowser() ? new BrowserPlatformAdapter() : new NodePlatformAdapter();
}