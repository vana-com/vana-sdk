/**
 * Browser-specific crypto utilities using Uint8Array
 *
 * Platform-specific utility functions for browser environments
 * without any Buffer or Node.js dependencies.
 */

import { hexToBytes, bytesToHex, concatBytes } from "../../crypto/ecies/utils";

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
 * Browser-specific base64 encoding
 *
 * @param data - Uint8Array to encode
 * @returns Base64 encoded string
 */
export function toBase64(data: Uint8Array): string {
  const binary = Array.from(data)
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return btoa(binary);
}

/**
 * Browser-specific base64 decoding
 *
 * @param str - Base64 string to decode
 * @returns Decoded Uint8Array
 */
export function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a deterministic seed from a message for key derivation
 *
 * @param message - Message to derive seed from
 * @returns Seed as Uint8Array
 */
export function generateSeed(message: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(message);
}
