/**
 * Base ECIES Implementation
 *
 * Abstract base class containing shared ECIES logic.
 * Platform-specific implementations only need to provide crypto primitives.
 *
 * Follows eccrypto format for backward compatibility:
 * - KDF: SHA-512(shared_secret) → encKey (32B) || macKey (32B)
 * - Cipher: AES-256-CBC with random 16-byte IV
 * - MAC: HMAC-SHA256(macKey, iv || ephemPublicKey || ciphertext)
 * - Format: iv || ephemPublicKey || ciphertext || mac
 */

import type { ECIESProvider, ECIESEncrypted } from "./interface";
import { ECIESError, isECIESEncrypted } from "./interface";

/**
 * Abstract base class for ECIES implementations
 * Provides the complete ECIES algorithm with platform-specific crypto primitives
 */
export abstract class BaseECIES implements ECIESProvider {
  // Cache for validated public keys to avoid repeated validation
  private static readonly validatedKeys = new WeakMap<Buffer, boolean>();
  /**
   * Platform-specific random bytes generation
   *
   * @param length Number of random bytes to generate
   * @returns Random bytes
   */
  protected abstract generateRandomBytes(length: number): Uint8Array;

  /**
   * Platform-specific private key verification
   *
   * @param privateKey Private key to verify
   * @returns true if valid private key
   */
  protected abstract verifyPrivateKey(privateKey: Uint8Array): boolean;

  /**
   * Platform-specific public key creation from private key
   *
   * @param privateKey Private key
   * @param compressed Whether to create compressed (33B) or uncompressed (65B) public key
   * @returns Public key or null if creation failed
   */
  protected abstract createPublicKey(
    privateKey: Uint8Array,
    compressed: boolean,
  ): Uint8Array | null;

  /**
   * Platform-specific public key validation
   *
   * @param publicKey Public key to validate
   * @returns true if valid public key
   */
  protected abstract validatePublicKey(publicKey: Uint8Array): boolean;

  /**
   * Platform-specific public key decompression
   *
   * @param publicKey Compressed public key (33 bytes)
   * @returns Uncompressed public key (65 bytes) or null if decompression failed
   */
  protected abstract decompressPublicKey(
    publicKey: Uint8Array,
  ): Uint8Array | null;

  /**
   * Platform-specific ECDH computation
   *
   * @param publicKey Public key
   * @param privateKey Private key
   * @returns Raw X coordinate of ECDH result (32 bytes)
   */
  protected abstract performECDH(
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array;

  /**
   * Platform-specific SHA-512 hash
   *
   * @param data Data to hash
   * @returns SHA-512 hash (64 bytes)
   */
  protected abstract sha512(data: Uint8Array): Uint8Array;

  /**
   * Platform-specific HMAC-SHA256
   *
   * @param key HMAC key
   * @param data Data to authenticate
   * @returns HMAC-SHA256 (32 bytes)
   */
  protected abstract hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array;

  /**
   * Platform-specific AES-256-CBC encryption
   *
   * @param key Encryption key (32 bytes)
   * @param iv Initialization vector (16 bytes)
   * @param data Data to encrypt
   * @returns Encrypted data with PKCS7 padding
   */
  protected abstract aesEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    data: Uint8Array,
  ): Promise<Uint8Array>;

  /**
   * Platform-specific AES-256-CBC decryption
   *
   * @param key Encryption key (32 bytes)
   * @param iv Initialization vector (16 bytes)
   * @param data Encrypted data with PKCS7 padding
   * @returns Decrypted data
   */
  protected abstract aesDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    data: Uint8Array,
  ): Promise<Uint8Array>;

  /**
   * Encrypts data using ECIES (Elliptic Curve Integrated Encryption Scheme)
   *
   * This method implements the ECIES encryption scheme using secp256k1 elliptic curve.
   * It maintains backward compatibility with the eccrypto library format.
   *
   * @param publicKey - Recipient's public key (33 bytes compressed or 65 bytes uncompressed)
   * @param message - Message to encrypt (any length)
   * @returns Promise resolving to encrypted data in eccrypto format
   *
   * @throws {ECIESError} With code 'INVALID_KEY' if public key is invalid
   * @throws {ECIESError} With code 'ENCRYPTION_FAILED' if encryption fails
   *
   * @example
   * ```typescript
   * const encrypted = await ecies.encrypt(publicKey, Buffer.from('Hello'));
   * // Returns: { iv, ephemPublicKey, ciphertext, mac }
   * ```
   */
  async encrypt(publicKey: Buffer, message: Buffer): Promise<ECIESEncrypted> {
    try {
      // Validate inputs
      if (!Buffer.isBuffer(publicKey)) {
        throw new ECIESError("Public key must be a Buffer", "INVALID_KEY");
      }
      if (!Buffer.isBuffer(message)) {
        throw new ECIESError("Message must be a Buffer", "ENCRYPTION_FAILED");
      }
      if (publicKey.length === 0) {
        throw new ECIESError("Public key cannot be empty", "INVALID_KEY");
      }

      // Normalize public key to uncompressed format
      const pubKey = this.normalizePublicKey(publicKey);

      // Generate ephemeral key pair
      let ephemeralPrivateKey: Uint8Array;
      do {
        ephemeralPrivateKey = this.generateRandomBytes(32);
      } while (!this.verifyPrivateKey(ephemeralPrivateKey));

      const ephemeralPublicKey = this.createPublicKey(
        ephemeralPrivateKey,
        false,
      );
      if (!ephemeralPublicKey) {
        throw new ECIESError(
          "Failed to generate ephemeral public key",
          "ENCRYPTION_FAILED",
        );
      }

      // Perform ECDH to get shared secret (raw X coordinate)
      const sharedSecret = this.performECDH(pubKey, ephemeralPrivateKey);

      // Derive keys using SHA-512 (eccrypto-compatible KDF)
      const kdf = this.sha512(sharedSecret);
      const encryptionKey = kdf.slice(0, 32);
      const macKey = kdf.slice(32, 64);

      // Generate random IV and encrypt
      const iv = this.generateRandomBytes(16);
      const ciphertext = await this.aesEncrypt(encryptionKey, iv, message);

      // Calculate MAC (Encrypt-then-MAC)
      const macData = this.concatBuffers(iv, ephemeralPublicKey, ciphertext);
      const mac = this.hmacSha256(macKey, macData);

      // Clear sensitive data
      this.clearBuffer(ephemeralPrivateKey);
      this.clearBuffer(sharedSecret);
      this.clearBuffer(kdf);

      return {
        iv: Buffer.from(iv),
        ephemPublicKey: Buffer.from(ephemeralPublicKey),
        ciphertext: Buffer.from(ciphertext),
        mac: Buffer.from(mac),
      };
    } catch (error) {
      if (error instanceof ECIESError) throw error;
      throw new ECIESError(
        `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "ENCRYPTION_FAILED",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Encrypts a UTF-8 string using ECIES
   *
   * Convenience method for encrypting string data.
   *
   * @param publicKey - Recipient's public key (33 bytes compressed or 65 bytes uncompressed)
   * @param message - String message to encrypt
   * @returns Promise resolving to encrypted data in eccrypto format
   *
   * @example
   * ```typescript
   * const encrypted = await ecies.encryptString(publicKey, 'Hello World');
   * ```
   */
  async encryptString(
    publicKey: Buffer,
    message: string,
  ): Promise<ECIESEncrypted> {
    return this.encrypt(publicKey, Buffer.from(message, "utf8"));
  }

  /**
   * Decrypts ECIES encrypted data
   *
   * This method decrypts data that was encrypted using the ECIES scheme.
   * It verifies the MAC before decryption to ensure data integrity.
   *
   * @param privateKey - Private key for decryption (must be exactly 32 bytes)
   * @param encrypted - Encrypted data structure in eccrypto format
   * @returns Promise resolving to the decrypted message
   *
   * @throws {ECIESError} With code 'INVALID_KEY' if private key is invalid or wrong length
   * @throws {ECIESError} With code 'DECRYPTION_FAILED' if encrypted data is malformed
   * @throws {ECIESError} With code 'MAC_MISMATCH' if MAC verification fails (data tampering)
   *
   * @example
   * ```typescript
   * const decrypted = await ecies.decrypt(privateKey, encrypted);
   * console.log(decrypted.toString()); // Original message
   * ```
   */
  async decrypt(
    privateKey: Buffer,
    encrypted: ECIESEncrypted,
  ): Promise<Buffer> {
    try {
      // Validate inputs
      if (!Buffer.isBuffer(privateKey)) {
        throw new ECIESError("Private key must be a Buffer", "INVALID_KEY");
      }
      if (privateKey.length !== 32) {
        throw new ECIESError(
          `Invalid private key length: expected 32 bytes, got ${privateKey.length}`,
          "INVALID_KEY",
        );
      }
      if (!encrypted || typeof encrypted !== "object") {
        throw new ECIESError(
          "Encrypted data must be an object",
          "DECRYPTION_FAILED",
        );
      }

      if (!isECIESEncrypted(encrypted)) {
        throw new ECIESError(
          "Invalid encrypted data structure",
          "DECRYPTION_FAILED",
        );
      }

      if (!this.verifyPrivateKey(privateKey)) {
        throw new ECIESError("Invalid private key", "INVALID_KEY");
      }

      // Perform ECDH to recover shared secret
      const sharedSecret = this.performECDH(
        encrypted.ephemPublicKey,
        privateKey,
      );

      // Derive keys (same as encryption)
      const kdf = this.sha512(sharedSecret);
      const encryptionKey = kdf.slice(0, 32);
      const macKey = kdf.slice(32, 64);

      // Verify MAC before decryption (Encrypt-then-MAC)
      const macData = this.concatBuffers(
        encrypted.iv,
        encrypted.ephemPublicKey,
        encrypted.ciphertext,
      );
      const expectedMac = this.hmacSha256(macKey, macData);

      if (!this.constantTimeEqual(encrypted.mac, Buffer.from(expectedMac))) {
        throw new ECIESError("MAC verification failed", "MAC_MISMATCH");
      }

      // Decrypt
      const decrypted = await this.aesDecrypt(
        encryptionKey,
        encrypted.iv,
        encrypted.ciphertext,
      );

      // Clear sensitive data
      this.clearBuffer(sharedSecret);
      this.clearBuffer(kdf);

      return Buffer.from(decrypted);
    } catch (error) {
      if (error instanceof ECIESError) throw error;
      throw new ECIESError(
        `Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "DECRYPTION_FAILED",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Decrypts ECIES encrypted data to a UTF-8 string
   *
   * Convenience method for decrypting string data.
   *
   * @param privateKey - Private key for decryption (must be exactly 32 bytes)
   * @param encrypted - Encrypted data structure in eccrypto format
   * @returns Promise resolving to the decrypted string
   *
   * @example
   * ```typescript
   * const message = await ecies.decryptString(privateKey, encrypted);
   * console.log(message); // 'Hello World'
   * ```
   */
  async decryptString(
    privateKey: Buffer,
    encrypted: ECIESEncrypted,
  ): Promise<string> {
    const buffer = await this.decrypt(privateKey, encrypted);
    return buffer.toString("utf8");
  }

  /**
   * Normalizes public key to uncompressed format (65 bytes)
   *
   * @param publicKey Public key (33 or 65 bytes)
   * @returns Uncompressed public key (65 bytes)
   */
  protected normalizePublicKey(publicKey: Buffer): Uint8Array {
    // Check validation cache first for performance
    const cached = BaseECIES.validatedKeys.get(publicKey);

    if (publicKey.length === 33) {
      // Compressed key - decompress it
      const isValid =
        cached !== undefined ? cached : this.validatePublicKey(publicKey);
      if (!isValid) {
        throw new ECIESError(
          `Invalid compressed public key: expected 33 bytes, got ${publicKey.length}`,
          "INVALID_KEY",
        );
      }
      // Cache successful validation
      if (cached === undefined) {
        BaseECIES.validatedKeys.set(publicKey, true);
      }
      const uncompressed = this.decompressPublicKey(publicKey);
      if (!uncompressed) {
        throw new ECIESError("Failed to decompress public key", "INVALID_KEY");
      }
      return uncompressed;
    } else if (publicKey.length === 65) {
      // Already uncompressed - validate it
      const isValid =
        cached !== undefined ? cached : this.validatePublicKey(publicKey);
      if (!isValid) {
        throw new ECIESError(
          `Invalid uncompressed public key: expected 65 bytes, got ${publicKey.length}`,
          "INVALID_KEY",
        );
      }
      // Cache successful validation
      if (cached === undefined) {
        BaseECIES.validatedKeys.set(publicKey, true);
      }
      return new Uint8Array(publicKey);
    } else {
      throw new ECIESError(
        `Invalid public key format: expected 33 (compressed) or 65 (uncompressed) bytes, got ${publicKey.length}`,
        "INVALID_KEY",
      );
    }
  }

  /**
   * Concatenates multiple buffers
   *
   * @param buffers Buffers to concatenate
   * @returns Concatenated buffer
   */
  protected concatBuffers(...buffers: ArrayBufferView[]): Uint8Array {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      result.set(
        new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
        offset,
      );
      offset += buf.byteLength;
    }
    return result;
  }

  /**
   * Constant-time buffer comparison to prevent timing attacks
   *
   * @param a First buffer
   * @param b Second buffer
   * @returns true if buffers are equal
   */
  protected constantTimeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean {
    if (a.byteLength !== b.byteLength) return false;

    const ua = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const ub = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);

    let result = 0;
    for (let i = 0; i < ua.length; i++) {
      result |= ua[i] ^ ub[i];
    }
    return result === 0;
  }

  /**
   * Clears sensitive data from buffer using multiple overwrite passes
   *
   * @param buffer Buffer to clear
   */
  protected clearBuffer(buffer: Uint8Array): void {
    // Multiple overwrite passes to prevent compiler optimization
    const len = buffer.length;
    // Pass 1: zeros
    buffer.fill(0);
    // Pass 2: ones
    buffer.fill(0xff);
    // Pass 3: pattern
    for (let i = 0; i < len; i++) {
      buffer[i] = (i * 7 + 13) & 0xff;
    }
    // Final pass: zeros
    buffer.fill(0);
  }
}
