/**
 * Node.js implementation of ECIES using native crypto with Uint8Array core
 *
 * @remarks
 * Uses Node.js crypto module for all operations.
 * Converts Buffer to/from Uint8Array at the boundaries only.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "crypto";
import * as secp256k1 from "secp256k1";
import * as nobleSecp256k1 from "@noble/secp256k1";
import { BaseECIESUint8 } from "./base";
import type { ECIESEncrypted } from "./interface";

/**
 * Node.js-specific ECIES provider using native crypto
 *
 * @remarks
 * This implementation:
 * - Uses Node.js crypto module for performance
 * - Internally works with Uint8Array
 * - Only uses Buffer at the Node.js crypto API boundaries
 */
export class NodeECIESUint8Provider extends BaseECIESUint8 {
  protected generateRandomBytes(length: number): Uint8Array {
    return new Uint8Array(randomBytes(length));
  }

  protected verifyPrivateKey(privateKey: Uint8Array): boolean {
    return secp256k1.privateKeyVerify(privateKey);
  }

  protected createPublicKey(
    privateKey: Uint8Array,
    compressed: boolean,
  ): Uint8Array | null {
    try {
      return secp256k1.publicKeyCreate(privateKey, compressed);
    } catch {
      return null;
    }
  }

  protected validatePublicKey(publicKey: Uint8Array): boolean {
    return secp256k1.publicKeyVerify(publicKey);
  }

  protected decompressPublicKey(publicKey: Uint8Array): Uint8Array | null {
    try {
      return secp256k1.publicKeyConvert(publicKey, false);
    } catch {
      return null;
    }
  }

  protected performECDH(
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array {
    try {
      // Use @noble/secp256k1 for ECDH to ensure eccrypto compatibility
      // The 'true' parameter returns compressed point (33 bytes)
      // We need just the x-coordinate (32 bytes) so we slice off the prefix
      const sharedPoint = nobleSecp256k1.getSharedSecret(
        privateKey,
        publicKey,
        true,
      );
      return sharedPoint.slice(1); // Remove prefix byte to get x-coordinate
    } catch (error) {
      throw new Error(
        `ECDH failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  protected sha512(data: Uint8Array): Uint8Array {
    return new Uint8Array(
      createHash("sha512").update(Buffer.from(data)).digest(),
    );
  }

  protected hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
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

  /**
   * Provides Buffer-compatible encrypt method for backward compatibility
   *
   * @param publicKey - The recipient's public key as Buffer
   * @param message - The data to encrypt as Buffer
   * @returns Promise resolving to encrypted data structure with Buffer fields
   */
  async encryptWithBuffer(
    publicKey: Buffer,
    message: Buffer,
  ): Promise<ECIESEncrypted> {
    const result = await this.encrypt(
      new Uint8Array(publicKey),
      new Uint8Array(message),
    );

    // Convert Uint8Arrays back to Buffers for Node.js consumers that expect Buffer
    return {
      iv: Buffer.from(result.iv),
      ephemPublicKey: Buffer.from(result.ephemPublicKey),
      ciphertext: Buffer.from(result.ciphertext),
      mac: Buffer.from(result.mac),
    };
  }

  /**
   * Provides Buffer-compatible decrypt method for backward compatibility
   *
   * @param privateKey - The recipient's private key as Buffer
   * @param encrypted - The encrypted data structure from encrypt()
   * @returns Promise resolving to the original plaintext as Buffer
   */
  async decryptWithBuffer(
    privateKey: Buffer,
    encrypted: ECIESEncrypted,
  ): Promise<Buffer> {
    // Convert any Buffers in the encrypted object to Uint8Array
    const normalizedEncrypted: ECIESEncrypted = {
      iv: new Uint8Array(encrypted.iv),
      ephemPublicKey: new Uint8Array(encrypted.ephemPublicKey),
      ciphertext: new Uint8Array(encrypted.ciphertext),
      mac: new Uint8Array(encrypted.mac),
    };

    const result = await this.decrypt(
      new Uint8Array(privateKey),
      normalizedEncrypted,
    );

    return Buffer.from(result);
  }
}
