/**
 * Browser ECIES Implementation (Zero Config)
 *
 * Pure JavaScript implementation using @noble/secp256k1 and Web Crypto API.
 * No WebAssembly configuration required - works out of the box.
 *
 * Performance: Good performance with zero configuration requirements
 */

import * as secp from "@noble/secp256k1";
import { sha256, sha512 } from "@noble/hashes/sha2";
import { hmac } from "@noble/hashes/hmac";
import { BaseECIES } from "./base";
import { ECIESError } from "./interface";
import { warnOnce } from "../../diagnostics";
import { CURVE, CIPHER } from "./constants";

/**
 * Browser ECIES provider using @noble/secp256k1 (pure JS) and Web Crypto API
 */
export class BrowserECIESProvider extends BaseECIES {
  constructor() {
    super();

    // Check secure context (non-HTTPS can disable WebCrypto or weaken RNG)
    if (
      typeof window !== "undefined" &&
      "isSecureContext" in window &&
      window.isSecureContext === false
    ) {
      warnOnce(
        "Browser running in a non-secure context.",
        "WebCrypto may be unavailable or degraded. Use HTTPS for reliable crypto.",
      );
    }

    // Check WebCrypto API availability
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      warnOnce(
        "WebCrypto API not detected.",
        "Falling back is not supported. Ensure a modern browser or polyfill environment.",
      );
    } else {
      // Lazy probe AES-CBC support (best-effort, non-throwing)
      (async () => {
        try {
          const keyRaw = new Uint8Array(CIPHER.KEY_LENGTH);
          const iv = new Uint8Array(CIPHER.IV_LENGTH);
          const k = await subtle.importKey(
            "raw",
            keyRaw,
            { name: "AES-CBC" },
            false,
            ["encrypt"],
          );
          await subtle.encrypt(
            { name: "AES-CBC", iv },
            k,
            new Uint8Array(CIPHER.BLOCK_SIZE),
          );
        } catch {
          warnOnce(
            "WebCrypto AES-CBC not available.",
            `ECIES requires ${CIPHER.algorithm.toUpperCase()}; ensure browser supports it.`,
          );
        }
      })();
    }
  }
  /**
   * Helper to convert Uint8Array to ArrayBuffer
   *
   * @param uint8Array Input array
   * @returns ArrayBuffer
   */
  private toArrayBuffer(uint8Array: Uint8Array): ArrayBuffer {
    // Create new ArrayBuffer and copy data
    const buffer = new ArrayBuffer(uint8Array.length);
    new Uint8Array(buffer).set(uint8Array);
    return buffer;
  }

  /**
   * Generates cryptographically secure random bytes using Web Crypto API
   *
   * @param length Number of bytes to generate
   * @returns Random bytes
   */
  protected generateRandomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Verifies if a buffer is a valid secp256k1 private key
   *
   * @param privateKey Private key to verify
   * @returns true if valid
   */
  protected verifyPrivateKey(privateKey: Uint8Array): boolean {
    try {
      return secp.utils.isValidPrivateKey(privateKey);
    } catch {
      return false;
    }
  }

  /**
   * Creates a public key from a private key
   *
   * @param privateKey Private key
   * @param compressed Whether to create compressed or uncompressed public key
   * @returns Public key or null if creation failed
   */
  protected createPublicKey(
    privateKey: Uint8Array,
    compressed: boolean,
  ): Uint8Array | null {
    try {
      const pubKey = secp.getPublicKey(privateKey, compressed);
      return new Uint8Array(pubKey);
    } catch {
      return null;
    }
  }

  /**
   * Validates a public key
   *
   * @param publicKey Public key to validate
   * @returns true if valid
   */
  protected validatePublicKey(publicKey: Uint8Array): boolean {
    try {
      secp.Point.fromHex(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Decompresses a compressed public key
   *
   * @param publicKey Compressed public key (33 bytes)
   * @returns Uncompressed public key (65 bytes) or null
   */
  protected decompressPublicKey(publicKey: Uint8Array): Uint8Array | null {
    try {
      const point = secp.Point.fromHex(publicKey);
      return point.toRawBytes(false); // false = uncompressed
    } catch {
      return null;
    }
  }

  /**
   * Performs ECDH and returns raw X coordinate (eccrypto-compatible)
   *
   * @param publicKey Public key
   * @param privateKey Private key
   * @returns Raw X coordinate (32 bytes)
   */
  protected performECDH(
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array {
    try {
      // Get shared point by multiplying public key with private key
      const pubPoint = secp.Point.fromHex(publicKey);
      const sharedPoint = pubPoint.multiply(
        BigInt("0x" + Buffer.from(privateKey).toString("hex")),
      );

      // Get raw X coordinate (eccrypto-compatible)
      const rawBytes = sharedPoint.toRawBytes(false); // uncompressed format
      // Extract X coordinate (skip prefix byte, take 32-byte X coordinate)
      return new Uint8Array(
        rawBytes.slice(CURVE.X_COORDINATE_OFFSET, CURVE.X_COORDINATE_END),
      );
    } catch (error) {
      throw new ECIESError(
        `ECDH computation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "ECDH_FAILED",
      );
    }
  }

  /**
   * Computes SHA-512 hash
   *
   * @param data Data to hash
   * @returns SHA-512 hash (64 bytes)
   */
  protected sha512(data: Uint8Array): Uint8Array {
    return sha512(data);
  }

  /**
   * Computes HMAC-SHA256
   *
   * @param key HMAC key
   * @param data Data to authenticate
   * @returns HMAC-SHA256 (32 bytes)
   */
  protected hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
    return hmac(sha256, key, data);
  }

  /**
   * Encrypts data using AES-256-CBC with Web Crypto API
   *
   * @param key Encryption key (32 bytes)
   * @param iv Initialization vector (16 bytes)
   * @param data Data to encrypt
   * @returns Encrypted data with PKCS7 padding
   */
  protected async aesEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    data: Uint8Array,
  ): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      this.toArrayBuffer(key),
      { name: "AES-CBC" },
      false,
      ["encrypt"],
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: this.toArrayBuffer(iv) },
      cryptoKey,
      this.toArrayBuffer(data),
    );

    return new Uint8Array(encrypted);
  }

  /**
   * Decrypts data using AES-256-CBC with Web Crypto API
   *
   * @param key Encryption key (32 bytes)
   * @param iv Initialization vector (16 bytes)
   * @param data Encrypted data with PKCS7 padding
   * @returns Decrypted data
   */
  protected async aesDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    data: Uint8Array,
  ): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      this.toArrayBuffer(key),
      { name: "AES-CBC" },
      false,
      ["decrypt"],
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: this.toArrayBuffer(iv) },
      cryptoKey,
      this.toArrayBuffer(data),
    );

    return new Uint8Array(decrypted);
  }
}

/**
 * Factory function for creating browser ECIES provider
 *
 * @returns Browser ECIES provider instance
 */
export function createBrowserECIESProvider(): BrowserECIESProvider {
  return new BrowserECIESProvider();
}
