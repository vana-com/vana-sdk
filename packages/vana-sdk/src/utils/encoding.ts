/**
 * Platform-aware encoding utilities
 *
 * @remarks
 * Provides consistent encoding/decoding operations across Node.js and browser
 * environments. Automatically selects the most efficient implementation based
 * on the runtime environment.
 *
 * Design principle: Single source of truth for all encoding operations.
 * Platform detection happens here, not scattered throughout the codebase.
 */

/**
 * Converts a Uint8Array to a base64 string
 *
 * @param data - The bytes to encode
 * @returns Base64 encoded string
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
 * Converts a base64 string to a Uint8Array
 *
 * @param str - The base64 string to decode
 * @returns Decoded bytes
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
 * Converts a Uint8Array to a hex string
 *
 * @param data - The bytes to encode
 * @returns Hex encoded string (lowercase, no '0x' prefix)
 */
export function toHex(data: Uint8Array): string {
  // Node.js path - most efficient
  if (typeof Buffer !== "undefined" && Buffer.from) {
    return Buffer.from(data).toString("hex");
  }

  // Browser path - manual conversion
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Converts a hex string to a Uint8Array
 *
 * @param hex - The hex string to decode (with or without '0x' prefix)
 * @returns Decoded bytes
 */
export function fromHex(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;

  // Validate hex string
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string: odd length");
  }

  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error("Invalid hex string: contains non-hex characters");
  }

  // Node.js path - most efficient
  if (typeof Buffer !== "undefined" && Buffer.from) {
    return new Uint8Array(Buffer.from(cleanHex, "hex"));
  }

  // Browser path - manual conversion
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Converts a string to a Uint8Array using UTF-8 encoding
 *
 * @param str - The string to encode
 * @returns UTF-8 encoded bytes
 */
export function stringToBytes(str: string): Uint8Array {
  // Node.js path - most efficient
  if (typeof Buffer !== "undefined" && Buffer.from) {
    return new Uint8Array(Buffer.from(str, "utf8"));
  }

  // Browser path - using TextEncoder
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str);
  }

  // Fallback for very old browsers
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    if (char < 0x80) {
      bytes.push(char);
    } else if (char < 0x800) {
      bytes.push(0xc0 | (char >> 6), 0x80 | (char & 0x3f));
    } else if (char < 0xd800 || char >= 0xe000) {
      bytes.push(
        0xe0 | (char >> 12),
        0x80 | ((char >> 6) & 0x3f),
        0x80 | (char & 0x3f),
      );
    } else {
      // Surrogate pair
      i++;
      const char2 = str.charCodeAt(i);
      const codePoint = 0x10000 + (((char & 0x3ff) << 10) | (char2 & 0x3ff));
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Converts a Uint8Array to a string using UTF-8 decoding
 *
 * @param bytes - The bytes to decode
 * @returns UTF-8 decoded string
 */
export function bytesToString(bytes: Uint8Array): string {
  // Node.js path - most efficient
  if (typeof Buffer !== "undefined" && Buffer.from) {
    return Buffer.from(bytes).toString("utf8");
  }

  // Browser path - using TextDecoder
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes);
  }

  // Fallback for very old browsers
  let str = "";
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];
    if (byte < 0x80) {
      str += String.fromCharCode(byte);
      i++;
    } else if ((byte & 0xe0) === 0xc0) {
      str += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if ((byte & 0xf0) === 0xe0) {
      str += String.fromCharCode(
        ((byte & 0x0f) << 12) |
          ((bytes[i + 1] & 0x3f) << 6) |
          (bytes[i + 2] & 0x3f),
      );
      i += 3;
    } else {
      // 4-byte UTF-8
      const codePoint =
        (((byte & 0x07) << 18) |
          ((bytes[i + 1] & 0x3f) << 12) |
          ((bytes[i + 2] & 0x3f) << 6) |
          (bytes[i + 3] & 0x3f)) -
        0x10000;
      str += String.fromCharCode(
        0xd800 + (codePoint >> 10),
        0xdc00 + (codePoint & 0x3ff),
      );
      i += 4;
    }
  }
  return str;
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
