/**
 * Provides platform-aware base64 encoding utilities.
 *
 * @remarks
 * This module provides base64 encoding/decoding operations across Node.js and browser
 * environments. For hex and string conversions, use viem's utilities instead:
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

// Import viem utilities for wrapping
import {
  toHex as viemToHex,
  fromHex as viemFromHex,
  stringToBytes as viemStringToBytes,
  bytesToString as viemBytesToString,
} from "viem";

/**
 * Converts bytes to hex string (without 0x prefix)
 *
 * @param bytes - The bytes to convert
 * @returns Hex string without 0x prefix
 */
export function toHex(bytes: Uint8Array): string {
  // Return without 0x prefix for backward compatibility
  return viemToHex(bytes).slice(2);
}

/**
 * Converts hex string to bytes
 *
 * @param hex - The hex string (with or without 0x prefix)
 * @returns The decoded bytes
 */
export function fromHex(hex: string): Uint8Array {
  // Add 0x prefix if missing for viem
  const prefixedHex = hex.startsWith("0x") ? hex : `0x${hex}`;

  // Validate hex string
  const cleanHex = prefixedHex.slice(2);
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string: odd length");
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error("Invalid hex string: contains non-hex characters");
  }

  return viemFromHex(prefixedHex as `0x${string}`, "bytes");
}

export const stringToBytes = viemStringToBytes;
export const bytesToString = viemBytesToString;

/**
 * @deprecated Use `toHex` from 'viem' directly instead
 */
export const toHexDeprecated = "(Deprecated: Use toHex from 'viem')";

/**
 * @deprecated Use `fromHex` from 'viem' directly instead
 */
export const fromHexDeprecated = "(Deprecated: Use fromHex from 'viem')";

/**
 * @deprecated Use `stringToBytes` from 'viem' directly instead
 */
export const stringToBytesDeprecated =
  "(Deprecated: Use stringToBytes from 'viem')";

/**
 * @deprecated Use `bytesToString` from 'viem' directly instead
 */
export const bytesToStringDeprecated =
  "(Deprecated: Use bytesToString from 'viem')";
