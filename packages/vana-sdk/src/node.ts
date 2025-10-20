/**
 * Node.js-specific entry point for the Vana SDK.
 *
 * @remarks
 * This module provides the Node.js implementation of the Vana SDK,
 * optimized for server-side applications, CLI tools, and backend services.
 * It includes platform-specific implementations using Node.js built-in
 * modules and native libraries for optimal performance.
 *
 * Import this module when building Node.js applications:
 * ```typescript
 * import { NodePlatformAdapter } from '@opendatalabs/vana-sdk/node';
 * ```
 *
 * Features:
 * - Native crypto module for high-performance encryption
 * - File system-based caching for persistence
 * - HTTP/HTTPS modules for network operations
 * - OpenPGP support for advanced cryptography
 * - Full filesystem access for data operations
 *
 * @example
 * ```typescript
 * // In a Node.js backend or CLI application
 * import { NodePlatformAdapter } from '@opendatalabs/vana-sdk/node';
 * import { Vana } from '@opendatalabs/vana-sdk-experimental';
 *
 * const vana = new Vana({
 *   platform: new NodePlatformAdapter(),
 *   network: 'moksha',
 *   walletClient: await createWalletClient({
 *     account: privateKeyToAccount(process.env.PRIVATE_KEY),
 *     chain: moksha,
 *     transport: http()
 *   })
 * });
 * ```
 *
 * @category Node
 * @module node
 */
export { NodePlatformAdapter } from "./platform/node";
