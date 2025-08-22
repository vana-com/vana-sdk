/**
 * Provides platform-agnostic cryptographic utility functions.
 *
 * @remarks
 * This module contains utility functions for cryptographic operations that work
 * consistently across Node.js and browser environments. All functions use `Uint8Array`
 * exclusively for binary data to ensure cross-platform compatibility.
 *
 * @category Cryptography
 */

import { fromHex } from "viem";

/**
 * Concatenates multiple Uint8Arrays into a single array.
 *
 * @param arrays - The byte arrays to concatenate in order.
 * @returns A new Uint8Array containing all input arrays concatenated.
 *
 * @example
 * ```typescript
 * const combined = concatBytes(
 *   new Uint8Array([1, 2]),
 *   new Uint8Array([3, 4])
 * );
 * console.log(combined); // Uint8Array([1, 2, 3, 4])
 * ```
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
 * Processes a wallet public key for cryptographic operations.
 *
 * @remarks
 * Converts hex string public keys to Uint8Array format.
 * For normalization to uncompressed format, use the crypto provider's
 * normalizeToUncompressed method.
 *
 * @param publicKey - The wallet public key as hex string or byte array.
 * @returns The public key as a Uint8Array.
 *
 * @example
 * ```typescript
 * const keyBytes = processWalletPublicKey("0x04...");
 * const normalized = provider.normalizeToUncompressed(keyBytes);
 * ```
 */
export function processWalletPublicKey(
  publicKey: string | Uint8Array,
): Uint8Array {
  // Convert to bytes if hex string
  return typeof publicKey === "string"
    ? fromHex(
        (publicKey.startsWith("0x")
          ? publicKey
          : `0x${publicKey}`) as `0x${string}`,
        "bytes",
      )
    : publicKey;
}

/**
 * Processes a wallet private key for cryptographic operations.
 *
 * @param privateKey - The wallet private key as hex string or byte array.
 * @returns The private key as a Uint8Array.
 *
 * @example
 * ```typescript
 * const key = processWalletPrivateKey("0x...");
 * console.log(key.length); // 32 (secp256k1 private key)
 * ```
 */
export function processWalletPrivateKey(
  privateKey: string | Uint8Array,
): Uint8Array {
  // Convert to bytes
  return typeof privateKey === "string"
    ? fromHex(
        (privateKey.startsWith("0x")
          ? privateKey
          : `0x${privateKey}`) as `0x${string}`,
        "bytes",
      )
    : privateKey;
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
 * Asserts that a public key is in uncompressed format (65 bytes with 0x04 prefix).
 * This validation function only checks format, it does not transform keys.
 * For key normalization (including decompression), use the crypto provider's
 * normalizeToUncompressed method.
 *
 * @param publicKey - Public key to validate
 * @throws {Error} When public key is not in uncompressed format
 */
export function assertUncompressedPublicKey(publicKey: Uint8Array): void {
  if (publicKey.length !== 65) {
    throw new Error(
      `Public key must be uncompressed (65 bytes), got ${publicKey.length} bytes. ` +
        `Use provider.normalizeToUncompressed() to convert compressed keys.`,
    );
  }

  if (publicKey[0] !== 0x04) {
    throw new Error(
      `Uncompressed public key must start with 0x04 prefix, got 0x${publicKey[0].toString(16).padStart(2, "0")}`,
    );
  }
}
