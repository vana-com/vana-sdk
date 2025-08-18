/**
 * Unified crypto utilities using Uint8Array
 *
 * @remarks
 * Platform-agnostic utility functions that work in both Node.js and browsers.
 * All functions use Uint8Array exclusively for consistency and simplicity.
 *
 * Design principle: Pure data transformations with no platform dependencies.
 * Encoding operations are delegated to the standalone encoding utils.
 */

import { toHex, fromHex } from "./encoding";

/**
 * Concatenates multiple Uint8Arrays into a single array
 *
 * @param arrays - Arrays to concatenate
 * @returns Combined array
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Converts hex string to Uint8Array
 * Delegates to encoding utils for consistency
 *
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Bytes array
 */
export function hexToBytes(hex: string): Uint8Array {
  return fromHex(hex);
}

/**
 * Converts Uint8Array to hex string
 * Delegates to encoding utils for consistency
 *
 * @param bytes - Bytes to convert
 * @returns Hex string (lowercase, no prefix)
 */
export function bytesToHex(bytes: Uint8Array): string {
  return toHex(bytes);
}

/**
 * Processes a wallet public key for use in crypto operations.
 * Handles both hex strings and raw bytes, normalizing to uncompressed format.
 *
 * @param publicKey - Public key as hex string or Uint8Array
 * @returns Normalized public key as Uint8Array
 */
export function processWalletPublicKey(
  publicKey: string | Uint8Array,
): Uint8Array {
  const publicKeyHex =
    typeof publicKey === "string"
      ? publicKey.startsWith("0x")
        ? publicKey.slice(2)
        : publicKey
      : bytesToHex(publicKey);

  const publicKeyBytes = hexToBytes(publicKeyHex);

  // If key is 64 bytes (raw coordinates), add uncompressed prefix
  return publicKeyBytes.length === 64
    ? concatBytes(new Uint8Array([4]), publicKeyBytes)
    : publicKeyBytes;
}

/**
 * Processes a wallet private key for use in crypto operations.
 *
 * @param privateKey - Private key as hex string or Uint8Array
 * @returns Private key as Uint8Array
 */
export function processWalletPrivateKey(
  privateKey: string | Uint8Array,
): Uint8Array {
  const privateKeyHex =
    typeof privateKey === "string"
      ? privateKey.startsWith("0x")
        ? privateKey.slice(2)
        : privateKey
      : bytesToHex(privateKey);

  return hexToBytes(privateKeyHex);
}

/**
 * Parses legacy eccrypto-format encrypted data buffer.
 * Format: [iv(16)][ephemPublicKey(65)][ciphertext(variable)][mac(32)]
 *
 * @param encryptedBuffer - Buffer containing encrypted data in eccrypto format
 * @returns Parsed encrypted data components
 */
export function parseEncryptedDataBuffer(encryptedBuffer: Uint8Array): {
  iv: Uint8Array;
  ephemPublicKey: Uint8Array;
  ciphertext: Uint8Array;
  mac: Uint8Array;
} {
  return {
    iv: encryptedBuffer.slice(0, 16),
    ephemPublicKey: encryptedBuffer.slice(16, 81), // 65 bytes for uncompressed public key
    ciphertext: encryptedBuffer.slice(81, -32),
    mac: encryptedBuffer.slice(-32),
  };
}

/**
 * Generates a deterministic seed from a message for key derivation
 *
 * @param message - Message to derive seed from
 * @returns Seed as Uint8Array
 */
export function generateSeed(message: string): Uint8Array {
  // Use encoding utils for consistent string-to-bytes conversion
  const encoder = new TextEncoder();
  return encoder.encode(message);
}

/**
 * Compares two Uint8Arrays for equality
 *
 * @param a - First array
 * @param b - Second array
 * @returns True if arrays are equal
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Creates a copy of a Uint8Array
 *
 * @param bytes - Array to copy
 * @returns New array with same contents
 */
export function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

/**
 * Validates a secp256k1 public key format
 *
 * @param publicKey - Public key to validate
 * @returns True if valid format (33, 65, or 64 bytes)
 */
export function isValidPublicKeyFormat(publicKey: Uint8Array): boolean {
  const len = publicKey.length;

  // Compressed (33 bytes)
  if (len === 33) {
    return publicKey[0] === 0x02 || publicKey[0] === 0x03;
  }

  // Uncompressed (65 bytes)
  if (len === 65) {
    return publicKey[0] === 0x04;
  }

  // Raw coordinates (64 bytes - no prefix)
  if (len === 64) {
    return true;
  }

  return false;
}

/**
 * Validates a secp256k1 private key format
 *
 * @param privateKey - Private key to validate
 * @returns True if valid format (32 bytes)
 */
export function isValidPrivateKeyFormat(privateKey: Uint8Array): boolean {
  return privateKey.length === 32;
}

/**
 * Normalizes a public key to uncompressed format (65 bytes with 0x04 prefix)
 * Note: This only checks format, not curve validity
 *
 * @param publicKey - Public key in any format
 * @returns Normalized key or null if invalid format
 */
export function normalizePublicKey(publicKey: Uint8Array): Uint8Array | null {
  if (!isValidPublicKeyFormat(publicKey)) {
    return null;
  }

  // Already uncompressed
  if (publicKey.length === 65 && publicKey[0] === 0x04) {
    return publicKey;
  }

  // Raw coordinates - add prefix
  if (publicKey.length === 64) {
    return concatBytes(new Uint8Array([0x04]), publicKey);
  }

  // Compressed - would need curve operations to decompress
  // This should be handled by platform-specific crypto
  if (publicKey.length === 33) {
    // Return as-is, let crypto layer handle decompression
    return publicKey;
  }

  return null;
}
