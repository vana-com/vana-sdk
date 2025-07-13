/**
 * Shared PGP utilities for platform adapters
 *
 * IMPORTANT: This module contains NO IMPORTS to avoid affecting bundle loading.
 * All functions are pure utilities that can be safely shared across platforms.
 */

/**
 * Standard OpenPGP configuration for consistent behavior across platforms
 * Uses enum values instead of importing openpgp to avoid loading issues
 */
export const STANDARD_PGP_CONFIG = {
  preferredCompressionAlgorithm: 2, // zlib (openpgp.enums.compression.zlib)
  preferredSymmetricAlgorithm: 7, // aes256 (openpgp.enums.symmetric.aes256)
} as const;

/**
 * Process PGP key generation options with sensible defaults
 *
 * @param options Optional key generation parameters
 * @returns Processed options with defaults applied
 */
export function processPGPKeyOptions(options?: {
  name?: string;
  email?: string;
  passphrase?: string;
}) {
  return {
    name: options?.name || "Vana User",
    email: options?.email || "user@vana.org",
    passphrase: options?.passphrase,
  };
}

/**
 * Get standard PGP key generation parameters
 * Combines default values with standard configuration
 *
 * @param options Optional key generation parameters
 * @returns Complete key generation parameters object
 */
export function getPGPKeyGenParams(options?: {
  name?: string;
  email?: string;
  passphrase?: string;
}) {
  const { name, email, passphrase } = processPGPKeyOptions(options);

  return {
    type: "rsa" as const,
    rsaBits: 2048,
    userIDs: [{ name, email }],
    passphrase,
    config: STANDARD_PGP_CONFIG,
  };
}
