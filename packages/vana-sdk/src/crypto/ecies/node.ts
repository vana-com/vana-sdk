/**
 * Node.js ECIES Implementation
 *
 * High-performance implementation using native secp256k1 bindings.
 * Extends BaseECIES and provides only platform-specific crypto primitives.
 *
 * Performance: 3-10x faster than pure JavaScript implementations
 */

import * as secp256k1 from "secp256k1";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "crypto";
import { BaseECIES } from "./base";

/**
 * Node.js ECIES provider using native secp256k1 bindings
 */
export class NodeECIESProvider extends BaseECIES {
  /**
   * Generates cryptographically secure random bytes
   *
   * @param length Number of bytes to generate
   * @returns Random bytes
   */
  protected generateRandomBytes(length: number): Uint8Array {
    return randomBytes(length);
  }

  /**
   * Verifies if a buffer is a valid secp256k1 private key
   *
   * @param privateKey Private key to verify
   * @returns true if valid
   */
  protected verifyPrivateKey(privateKey: Uint8Array): boolean {
    return secp256k1.privateKeyVerify(Buffer.from(privateKey));
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
      return secp256k1.publicKeyCreate(Buffer.from(privateKey), compressed);
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
    return secp256k1.publicKeyVerify(Buffer.from(publicKey));
  }

  /**
   * Decompresses a compressed public key
   *
   * @param publicKey Compressed public key (33 bytes)
   * @returns Uncompressed public key (65 bytes) or null
   */
  protected decompressPublicKey(publicKey: Uint8Array): Uint8Array | null {
    try {
      return secp256k1.publicKeyConvert(Buffer.from(publicKey), false);
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
    const sharedSecret = Buffer.alloc(32);
    const outputBuffer = new Uint8Array(32);

    // Use identity hash function to get raw X coordinate
    secp256k1.ecdh(
      Buffer.from(publicKey),
      Buffer.from(privateKey),
      {
        hashfn: (x: Uint8Array) => {
          // Copy raw X coordinate to our buffer
          Buffer.from(x).copy(sharedSecret);
          return x;
        },
      },
      outputBuffer,
    );

    return sharedSecret;
  }

  /**
   * Computes SHA-512 hash
   *
   * @param data Data to hash
   * @returns SHA-512 hash (64 bytes)
   */
  protected sha512(data: Uint8Array): Uint8Array {
    return createHash("sha512").update(data).digest();
  }

  /**
   * Computes HMAC-SHA256
   *
   * @param key HMAC key
   * @param data Data to authenticate
   * @returns HMAC-SHA256 (32 bytes)
   */
  protected hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
    return createHmac("sha256", key).update(data).digest();
  }

  /**
   * Encrypts data using AES-256-CBC
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
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  /**
   * Decrypts data using AES-256-CBC
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
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  /**
   * Constant-time buffer comparison using Node.js native implementation
   *
   * @param a First buffer
   * @param b Second buffer
   * @returns true if buffers are equal
   */
  protected override constantTimeEqual(
    a: ArrayBufferView,
    b: ArrayBufferView,
  ): boolean {
    // Pad to same length to avoid timing leak on length check
    const maxLen = Math.max(a.byteLength, b.byteLength);
    const bufA = Buffer.alloc(maxLen);
    const bufB = Buffer.alloc(maxLen);

    Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(bufA);
    Buffer.from(b.buffer, b.byteOffset, b.byteLength).copy(bufB);

    // Use Node's timing-safe comparison
    return a.byteLength === b.byteLength && timingSafeEqual(bufA, bufB);
  }
}

/**
 * Factory function for creating Node.js ECIES provider
 *
 * @returns Node.js ECIES provider instance
 */
export function createNodeECIESProvider(): NodeECIESProvider {
  return new NodeECIESProvider();
}
