/**
 * ECIES Module Entry Point
 *
 * Exports interface and utilities for ECIES encryption/decryption
 * Platform-specific implementations are imported separately
 */

export type { ECIESProvider, ECIESEncrypted, ECIESOptions } from "./interface";

export {
  ECIESError,
  isECIESEncrypted,
  serializeECIES,
  deserializeECIES,
} from "./interface";
