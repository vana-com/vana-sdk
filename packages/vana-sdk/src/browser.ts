/**
 * Browser-specific entry point for the Vana SDK.
 *
 * @remarks
 * This module provides the browser implementation of the Vana SDK,
 * optimized for web applications and browser environments. It includes
 * platform-specific implementations using Web APIs for cryptography,
 * storage, and networking operations.
 *
 * Import this module when building web applications:
 * ```typescript
 * import { BrowserPlatformAdapter } from '@opendatalabs/vana-sdk/browser';
 * ```
 *
 * Features:
 * - Web Crypto API for encryption operations
 * - SessionStorage for caching
 * - Fetch API for HTTP requests
 * - Optimized bundle size for browser deployment
 *
 * @example
 * ```typescript
 * // In a React/Vue/Angular application
 * import { BrowserPlatformAdapter } from '@opendatalabs/vana-sdk/browser';
 * import { Vana } from '@opendatalabs/vana-sdk-experimental';
 *
 * const vana = new Vana({
 *   platform: new BrowserPlatformAdapter(),
 *   network: 'moksha'
 * });
 * ```
 *
 * @category Browser
 * @module browser
 */
export { BrowserPlatformAdapter } from "./platform/browser";
