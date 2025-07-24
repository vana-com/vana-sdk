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

/**
 * Cross-platform base64 encoding
 * Works in both Node.js and browser environments
 *
 * @param str The string to encode
 * @returns Base64 encoded string
 */
export function toBase64(str: string): string {
  if (typeof Buffer !== "undefined") {
    // Node.js environment
    return Buffer.from(str, "utf8").toString("base64");
  } else if (typeof btoa !== "undefined") {
    // Browser environment
    return btoa(str);
  } else {
    // Fallback manual implementation
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    let i = 0;
    while (i < str.length) {
      const a = str.charCodeAt(i++);
      const b = i < str.length ? str.charCodeAt(i++) : 0;
      const c = i < str.length ? str.charCodeAt(i++) : 0;

      const bitmap = (a << 16) | (b << 8) | c;

      result += chars.charAt((bitmap >> 18) & 63);
      result += chars.charAt((bitmap >> 12) & 63);
      result += i - 2 < str.length ? chars.charAt((bitmap >> 6) & 63) : "=";
      result += i - 1 < str.length ? chars.charAt(bitmap & 63) : "=";
    }
    return result;
  }
}

/**
 * Cross-platform base64 decoding
 * Works in both Node.js and browser environments
 *
 * @param str The base64 string to decode
 * @returns Decoded string
 */
export function fromBase64(str: string): string {
  if (typeof Buffer !== "undefined") {
    // Node.js environment
    return Buffer.from(str, "base64").toString("utf8");
  } else if (typeof atob !== "undefined") {
    // Browser environment
    return atob(str);
  } else {
    // Fallback manual implementation
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    let i = 0;

    // Remove any characters not in the base64 character set
    str = str.replace(/[^A-Za-z0-9+/]/g, "");

    while (i < str.length) {
      const encoded1 = chars.indexOf(str.charAt(i++));
      const encoded2 = chars.indexOf(str.charAt(i++));
      const encoded3 = chars.indexOf(str.charAt(i++));
      const encoded4 = chars.indexOf(str.charAt(i++));

      const bitmap =
        (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;

      result += String.fromCharCode((bitmap >> 16) & 255);
      if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
      if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255);
    }
    return result;
  }
}
