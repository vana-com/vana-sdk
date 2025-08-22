/**
 * Utility functions for ECIES operations
 *
 * Provides conversion utilities between different data formats
 * to bridge platform-specific implementations.
 */

/**
 * Converts a hex string to Uint8Array
 *
 * @param hex - Hex string to convert
 * @returns Uint8Array representation of the hex string
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string
 *
 * @param bytes - Bytes to convert to hex
 * @returns Hex string representation
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Converts a string to Uint8Array using UTF-8 encoding
 *
 * @param str - String to convert
 * @returns UTF-8 encoded bytes
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts Uint8Array to string using UTF-8 decoding
 *
 * @param bytes - Bytes to decode
 * @returns Decoded UTF-8 string
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Concatenates multiple Uint8Arrays into one
 *
 * @param arrays - Arrays to concatenate
 * @returns Concatenated Uint8Array
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
 * Checks if two Uint8Arrays are equal in constant time
 *
 * @param a - First array to compare
 * @param b - Second array to compare
 * @returns `true` if arrays are equal
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Converts Buffer to Uint8Array (for Node.js compatibility layer)
 * In browser, this is a no-op if already Uint8Array
 *
 * @param buffer - Buffer or Uint8Array to convert
 * @returns Uint8Array representation
 */
export function bufferToBytes(buffer: Buffer | Uint8Array): Uint8Array {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }
  // Node.js Buffer is a subclass of Uint8Array
  return new Uint8Array(buffer);
}

/**
 * Converts Uint8Array to Buffer (for Node.js compatibility layer)
 * Only available in Node.js environment
 *
 * @param bytes - Uint8Array to convert to Buffer
 * @returns Buffer representation
 */
export function bytesToBuffer(bytes: Uint8Array): Buffer {
  if (typeof Buffer === "undefined") {
    throw new Error("Buffer is not available in browser environment");
  }
  return Buffer.from(bytes);
}
