/**
 * Utility functions for ECIES operations
 *
 * Provides conversion utilities between different data formats
 * to bridge platform-specific implementations.
 */

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
