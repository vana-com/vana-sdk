/**
 * Shared crypto utilities for platform adapters
 *
 * IMPORTANT: This module contains NO IMPORTS to avoid affecting bundle loading.
 * All functions are pure utilities that can be safely shared across platforms.
 */

/**
 * Process wallet public key for encryption operations
 * Removes 0x prefix and ensures uncompressed format (65 bytes with 0x04 prefix)
 *
 * @param publicKey The public key (with or without 0x prefix)
 * @returns Buffer containing uncompressed public key
 */
export function processWalletPublicKey(publicKey: string): Buffer {
  const publicKeyHex = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;
  const publicKeyBytes = Buffer.from(publicKeyHex, "hex");

  // Ensure public key is in uncompressed format (65 bytes with 0x04 prefix)
  // If it's 64 bytes, add the 0x04 prefix; if already 65 bytes, use as-is
  return publicKeyBytes.length === 64
    ? Buffer.concat([Buffer.from([4]), publicKeyBytes])
    : publicKeyBytes;
}

/**
 * Process wallet private key for decryption operations
 * Removes 0x prefix and converts to Buffer
 *
 * @param privateKey The private key (with or without 0x prefix)
 * @returns Buffer containing private key
 */
export function processWalletPrivateKey(privateKey: string): Buffer {
  const privateKeyHex = privateKey.startsWith("0x")
    ? privateKey.slice(2)
    : privateKey;
  return Buffer.from(privateKeyHex, "hex");
}

/**
 * Parse encrypted data buffer into components
 * Extracts IV, ephemeral public key, ciphertext, and MAC from a concatenated buffer
 *
 * @param encryptedBuffer The buffer containing encrypted data
 * @returns Object with parsed components
 */
export function parseEncryptedDataBuffer(encryptedBuffer: Buffer) {
  return {
    iv: encryptedBuffer.slice(0, 16),
    ephemPublicKey: encryptedBuffer.slice(16, 81), // 65 bytes for uncompressed public key
    ciphertext: encryptedBuffer.slice(81, -32),
    mac: encryptedBuffer.slice(-32),
  };
}

/**
 * Convert hex string to Uint8Array
 *
 * @param hex The hex string to convert
 * @returns Uint8Array representation
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return result;
}

/**
 * Convert Uint8Array to hex string
 *
 * @param array The Uint8Array to convert
 * @returns Hex string representation
 */
export function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
