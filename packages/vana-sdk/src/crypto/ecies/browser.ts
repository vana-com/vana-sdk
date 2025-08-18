/**
 * Browser implementation of ECIES using @noble/secp256k1 with Uint8Array
 *
 * @remarks
 * Uses native browser crypto APIs and @noble/secp256k1 for elliptic curve operations.
 * This implementation is polyfill-free and works in all modern browsers.
 */

import * as secp256k1 from "@noble/secp256k1";
import { BaseECIESUint8 } from "./base";
import { hmac } from "@noble/hashes/hmac";
import { sha256, sha512 as nobleSha512 } from "@noble/hashes/sha2";

/**
 * Browser-specific ECIES provider using @noble/secp256k1
 *
 * @remarks
 * This implementation uses:
 * - Web Crypto API for AES operations
 * - @noble/secp256k1 for elliptic curve operations
 * - @noble/hashes for SHA and HMAC operations
 * - No Buffer or Node.js dependencies
 */
export class BrowserECIESUint8Provider extends BaseECIESUint8 {
  protected generateRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  protected verifyPrivateKey(privateKey: Uint8Array): boolean {
    try {
      return secp256k1.utils.isValidPrivateKey(privateKey);
    } catch {
      return false;
    }
  }

  protected createPublicKey(
    privateKey: Uint8Array,
    compressed: boolean,
  ): Uint8Array | null {
    try {
      return secp256k1.getPublicKey(privateKey, compressed);
    } catch {
      return null;
    }
  }

  protected validatePublicKey(publicKey: Uint8Array): boolean {
    try {
      // @noble/secp256k1 will throw if the point is not on the curve
      secp256k1.Point.fromHex(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  protected decompressPublicKey(publicKey: Uint8Array): Uint8Array | null {
    try {
      // @noble/secp256k1 handles both compressed and uncompressed
      const point = secp256k1.Point.fromHex(publicKey);
      return point.toRawBytes(false); // false = uncompressed
    } catch {
      return null;
    }
  }

  protected performECDH(
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array {
    try {
      // Use @noble/secp256k1's getSharedSecret which is optimized and secure
      // The 'true' parameter returns the raw x-coordinate (32 bytes)
      // This matches eccrypto's behavior
      const sharedPoint = secp256k1.getSharedSecret(
        privateKey,
        publicKey,
        true,
      );

      // getSharedSecret returns compressed point (33 bytes) when true
      // We need just the x-coordinate (32 bytes) for eccrypto compatibility
      // Remove the prefix byte
      return sharedPoint.slice(1);
    } catch (error) {
      throw new Error(
        `ECDH failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  protected sha512(data: Uint8Array): Uint8Array {
    return nobleSha512(data);
  }

  protected hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
    return hmac(sha256, key, data);
  }

  protected async aesEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
  ): Promise<Uint8Array> {
    // Import the key for AES-CBC
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key as BufferSource,
      { name: "AES-CBC" },
      false,
      ["encrypt"],
    );

    // Encrypt with Web Crypto API
    // Note: Web Crypto API automatically handles PKCS#7 padding for AES-CBC
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: iv as BufferSource },
      cryptoKey,
      plaintext as BufferSource,
    );

    return new Uint8Array(encrypted);
  }

  protected async aesDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    // Import the key for AES-CBC
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key as BufferSource,
      { name: "AES-CBC" },
      false,
      ["decrypt"],
    );

    // Decrypt with Web Crypto API
    // Note: Web Crypto API automatically handles PKCS#7 padding removal
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: iv as BufferSource },
      cryptoKey,
      ciphertext as BufferSource,
    );

    return new Uint8Array(decrypted);
  }

  /**
   * Normalizes a public key to uncompressed format (65 bytes with 0x04 prefix).
   * Handles compressed (33 bytes) and uncompressed (65 bytes) formats only.
   *
   * @remarks
   * Strict policy: Does not accept 64-byte raw coordinates to avoid masking
   * malformed data. Callers must provide properly formatted keys.
   *
   * @param publicKey - The public key to normalize (33 or 65 bytes)
   * @returns The normalized uncompressed public key (65 bytes)
   * @throws {Error} When public key format is invalid or decompression fails
   */
  normalizeToUncompressed(publicKey: Uint8Array): Uint8Array {
    const len = publicKey.length;

    // Already uncompressed
    if (len === 65 && publicKey[0] === 0x04) {
      return publicKey;
    }

    // Compressed - decompress using @noble/secp256k1
    if (len === 33 && (publicKey[0] === 0x02 || publicKey[0] === 0x03)) {
      const decompressed = this.decompressPublicKey(publicKey);
      if (!decompressed) {
        throw new Error(
          `Failed to decompress public key with prefix 0x${publicKey[0].toString(16).padStart(2, "0")}`,
        );
      }
      return decompressed;
    }

    // Reject raw coordinates (64 bytes) - require proper formatting
    if (len === 64) {
      throw new Error(
        "Raw public key coordinates (64 bytes) are not accepted. " +
          "Please provide a properly formatted compressed (33 bytes) or uncompressed (65 bytes) public key.",
      );
    }

    throw new Error(
      `Invalid public key format: expected compressed (33 bytes) or uncompressed (65 bytes), got ${len} bytes`,
    );
  }
}
