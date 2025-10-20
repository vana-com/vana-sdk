/**
 * Main entry point for the Vana SDK.
 *
 * @remarks
 * This module prevents accidental imports from the root package path and
 * ensures developers explicitly choose the correct platform-specific build.
 * The SDK requires platform-specific implementations for cryptography,
 * storage, and networking operations.
 *
 * **DO NOT import from this module directly.**
 *
 * Instead, use one of the platform-specific entry points:
 * - `@opendatalabs/vana-sdk/browser` for web applications
 * - `@opendatalabs/vana-sdk/node` for Node.js applications
 *
 * @example
 * ```typescript
 * // ❌ WRONG - This will throw an error
 * import { something } from '@opendatalabs/vana-sdk';
 *
 * // ✅ CORRECT - For browser/web applications
 * import { BrowserPlatformAdapter } from '@opendatalabs/vana-sdk/browser';
 *
 * // ✅ CORRECT - For Node.js applications
 * import { NodePlatformAdapter } from '@opendatalabs/vana-sdk/node';
 * ```
 *
 * @throws {Error} Always throws an error directing to use platform-specific imports
 *
 * @category Core
 * @module index
 */
throw new Error(
  'Import from "@opendatalabs/vana-sdk/browser" or "@opendatalabs/vana-sdk/node" instead of the root entry point.',
);
