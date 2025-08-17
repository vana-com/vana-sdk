/**
 * Browser ECIES Implementation
 *
 * High-performance implementation using tiny-secp256k1 (WASM) and Web Crypto API.
 * Extends BaseECIES and provides only platform-specific crypto primitives.
 *
 * Performance: 1.5-3x faster than pure JavaScript implementations
 */

import * as secp256k1 from "tiny-secp256k1";
import { sha256, sha512 } from "@noble/hashes/sha2";
import { hmac } from "@noble/hashes/hmac";
import { BaseECIES } from "./base";
import { ECIESError } from "./interface";

/**
 * Browser ECIES provider using tiny-secp256k1 (WASM) and Web Crypto API
 */
export class BrowserECIESProvider extends BaseECIES {
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
    return secp256k1.isPrivate(Buffer.from(privateKey));
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
    const pubKey = secp256k1.pointFromScalar(
      Buffer.from(privateKey),
      compressed,
    );
    return pubKey ? new Uint8Array(pubKey) : null;
  }

  /**
   * Validates a public key
   *
   * @param publicKey Public key to validate
   * @returns true if valid
   */
  protected validatePublicKey(publicKey: Uint8Array): boolean {
    return secp256k1.isPoint(Buffer.from(publicKey));
  }

  /**
   * Decompresses a compressed public key
   *
   * @param publicKey Compressed public key (33 bytes)
   * @returns Uncompressed public key (65 bytes) or null
   */
  protected decompressPublicKey(publicKey: Uint8Array): Uint8Array | null {
    // pointCompress with false decompresses the key
    const uncompressed = secp256k1.pointCompress(Buffer.from(publicKey), false);
    return uncompressed ? new Uint8Array(uncompressed) : null;
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
    // pointMultiply returns full point (65 bytes starting with 0x04)
    const sharedPoint = secp256k1.pointMultiply(
      Buffer.from(publicKey),
      Buffer.from(privateKey),
    );

    if (!sharedPoint) {
      throw new ECIESError("ECDH computation failed", "ECDH_FAILED");
    }

    // Extract X coordinate (skip 0x04 prefix, take first 32 bytes)
    return new Uint8Array(sharedPoint.slice(1, 33));
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
