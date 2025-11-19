/**
 * ECIES Module Entry Point
 *
 * Exports interface and utilities for ECIES encryption/decryption.
 * Platform-specific implementations (BrowserECIESProvider, NodeECIESProvider)
 * are exported from the platform entry points.
 *
 * @remarks
 * Import from platform-specific entry points:
 * - Browser: `import { BrowserECIESProvider, serializeECIES } from '@opendatalabs/vana-sdk/browser'`
 * - Node: `import { NodeECIESProvider, serializeECIES } from '@opendatalabs/vana-sdk/node'`
 *
 * @category Cryptography
 */

export type { ECIESProvider, ECIESEncrypted, ECIESOptions } from "./interface";

export {
  ECIESError,
  isECIESEncrypted,
  serializeECIES,
  deserializeECIES,
} from "./interface";
