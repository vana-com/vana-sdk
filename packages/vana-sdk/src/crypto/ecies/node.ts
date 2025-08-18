/**
 * Node.js implementation of ECIES using native secp256k1 for performance
 *
 * @remarks
 * Uses native secp256k1 bindings for all elliptic curve operations.
 * Uses Node.js crypto module for hashing and AES operations.
 * Provides Uint8Array-only interface with no Buffer exposure.
 */

import {
  randomBytes,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from "crypto";
import { BaseECIESUint8 } from "./base";

// Type definition for secp256k1 module
interface Secp256k1Module {
  privateKeyVerify(privateKey: Buffer): boolean;
  publicKeyCreate(privateKey: Buffer, compressed: boolean): Buffer;
  publicKeyVerify(publicKey: Buffer): boolean;
  publicKeyConvert(publicKey: Buffer, compressed: boolean): Buffer;
  ecdh(
    publicKey: Buffer,
    privateKey: Buffer,
    options: {
      hashfn: (x: Uint8Array, y: Uint8Array, output?: Uint8Array) => Uint8Array;
    },
    output: Buffer,
  ): Buffer;
}

// Load native secp256k1 as optional dependency
/* global require */

let secp256k1: Secp256k1Module;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  secp256k1 = require("secp256k1");
} catch {
  throw new Error(
    "Native secp256k1 module not found. Please install with: npm install secp256k1\n" +
      "This is required for optimal performance in Node.js environments.",
  );
}

/**
 * Node.js-specific ECIES provider using native secp256k1
 *
 * @remarks
 * This implementation:
 * - Uses native secp256k1 for all EC operations (optimal performance)
 * - Uses Node.js crypto for SHA-512, HMAC, and AES operations
 * - Internally works with Uint8Array
 * - Only uses Buffer at crypto API boundaries
 */
export class NodeECIESUint8Provider extends BaseECIESUint8 {
  // Identity hash function for ECDH - returns raw X coordinate
  // CRITICAL: Must handle (x, y, output) signature correctly
  private readonly identityHashFn = (
    x: Uint8Array,
    y: Uint8Array,
    output?: Uint8Array,
  ): Uint8Array => {
    // Copy x into output buffer if provided (prevents allocations)
    if (output && output.length >= 32) {
      output.set(x);
      return output;
    }
    return x;
  };
  protected generateRandomBytes(length: number): Uint8Array {
    return new Uint8Array(randomBytes(length));
  }

  protected verifyPrivateKey(privateKey: Uint8Array): boolean {
    // Native secp256k1 returns true for valid, false for invalid
    return secp256k1.privateKeyVerify(Buffer.from(privateKey)) === true;
  }

  protected createPublicKey(
    privateKey: Uint8Array,
    compressed: boolean,
  ): Uint8Array | null {
    try {
      return new Uint8Array(
        secp256k1.publicKeyCreate(Buffer.from(privateKey), compressed),
      );
    } catch {
      return null;
    }
  }

  protected validatePublicKey(publicKey: Uint8Array): boolean {
    // Native secp256k1 returns true for valid, false for invalid
    return secp256k1.publicKeyVerify(Buffer.from(publicKey)) === true;
  }

  protected decompressPublicKey(publicKey: Uint8Array): Uint8Array | null {
    try {
      // Convert to uncompressed format (65 bytes)
      return new Uint8Array(
        secp256k1.publicKeyConvert(Buffer.from(publicKey), false),
      );
    } catch {
      return null;
    }
  }

  protected performECDH(
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array {
    try {
      // Use pre-allocated buffer for output (32 bytes)
      const output = Buffer.alloc(32);

      // CRITICAL: Use identity hash to get raw X coordinate
      // Default would apply SHA256 and break compatibility
      secp256k1.ecdh(
        Buffer.from(publicKey),
        Buffer.from(privateKey),
        { hashfn: this.identityHashFn },
        output,
      );

      return new Uint8Array(output);
    } catch (error) {
      throw new Error(
        `ECDH failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  protected sha512(data: Uint8Array): Uint8Array {
    // Use Node.js crypto for native performance
    return new Uint8Array(
      createHash("sha512").update(Buffer.from(data)).digest(),
    );
  }

  protected hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
    // Use Node.js crypto for native performance
    return new Uint8Array(
      createHmac("sha256", Buffer.from(key)).update(Buffer.from(data)).digest(),
    );
  }

  protected async aesEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
  ): Promise<Uint8Array> {
    const cipher = createCipheriv(
      "aes-256-cbc",
      Buffer.from(key),
      Buffer.from(iv),
    );
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(plaintext)),
      cipher.final(),
    ]);
    return new Uint8Array(encrypted);
  }

  protected async aesDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    const decipher = createDecipheriv(
      "aes-256-cbc",
      Buffer.from(key),
      Buffer.from(iv),
    );
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertext)),
      decipher.final(),
    ]);
    return new Uint8Array(decrypted);
  }

  // No Buffer compatibility methods - Uint8Array only public API

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

    // Compressed - decompress using secp256k1
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
