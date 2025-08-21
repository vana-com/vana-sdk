/**
 * Provides platform-aware base64 encoding utilities.
 *
 * @remarks
 * This module provides base64 encoding/decoding operations across Node.js and browser
 * environments. For hex and string conversions, use viem's utilities directly:
 * - `toHex` / `fromHex` from 'viem'
 * - `stringToBytes` / `bytesToString` from 'viem'
 *
 * @category Utilities
 */

/**
 * Converts a Uint8Array to a base64 string.
 *
 * @param data - The byte array to encode into base64 format.
 * @returns The base64-encoded string representation.
 * @throws {Error} When no base64 encoding method is available in the environment.
 *
 * @example
 * ```typescript
 * const bytes = new Uint8Array([72, 101, 108, 108, 111]);
 * const encoded = toBase64(bytes);
 * console.log(encoded); // "SGVsbG8="
 * ```
 */
export function toBase64(data: Uint8Array): string {
  // Node.js path - most efficient
  if (typeof Buffer !== "undefined" && Buffer.from) {
    return Buffer.from(data).toString("base64");
  }

  // Browser path - using native btoa
  if (typeof btoa !== "undefined") {
    const binary = Array.from(data, (byte) => String.fromCharCode(byte)).join(
      "",
    );
    return btoa(binary);
  }

  throw new Error("No base64 encoding method available in this environment");
}

/**
 * Converts a base64 string to a Uint8Array.
 *
 * @param str - The base64-encoded string to decode.
 * @returns The decoded byte array.
 * @throws {Error} When no base64 decoding method is available in the environment.
 *
 * @example
 * ```typescript
 * const decoded = fromBase64("SGVsbG8=");
 * console.log(new TextDecoder().decode(decoded)); // "Hello"
 * ```
 */
export function fromBase64(str: string): Uint8Array {
  // Node.js path - most efficient
  if (typeof Buffer !== "undefined" && Buffer.from) {
    return new Uint8Array(Buffer.from(str, "base64"));
  }

  // Browser path - using native atob
  if (typeof atob !== "undefined") {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  throw new Error("No base64 decoding method available in this environment");
}

/**
 * Type guard to check if running in Node.js environment
 *
 * @returns True if running in Node.js
 */
export function isNodeEnvironment(): boolean {
  return (
    typeof Buffer !== "undefined" &&
    typeof Buffer.from === "function" &&
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node !== undefined
  );
}

/**
 * Type guard to check if running in browser environment
 *
 * @returns True if running in browser
 */
export function isBrowserEnvironment(): boolean {
  return (
    typeof window !== "undefined" && typeof window.document !== "undefined"
  );
}
