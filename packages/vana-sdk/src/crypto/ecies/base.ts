import type { ECIESProvider, ECIESEncrypted } from "./interface";
import { ECIESError, isECIESEncrypted } from "./interface";
import { CURVE, CIPHER, KDF, SECURITY } from "./constants";

/**
 * Provides shared ECIES encryption logic across platforms.
 *
 * @remarks
 * Platform implementations extend this class and provide crypto primitives.
 * The base class handles the ECIES protocol flow while maintaining
 * compatibility with the eccrypto data format.
 *
 * **Implementation details:**
 * - KDF: SHA-512(shared_secret) → encKey (32B) || macKey (32B)
 * - Cipher: AES-256-CBC with random 16-byte IV
 * - MAC: HMAC-SHA256(macKey, iv || ephemPublicKey || ciphertext)
 *
 * @category Cryptography
 */
export abstract class BaseECIES implements ECIESProvider {
  // Cache for validated public keys to avoid repeated validation
  private static readonly validatedKeys = new WeakMap<Buffer, boolean>();
  /**
   * Generates cryptographically secure random bytes.
   *
   * @param length - Number of random bytes to generate.
   * @returns Random bytes array.
   */
  protected abstract generateRandomBytes(length: number): Uint8Array;

  /**
   * Verifies a private key is valid for secp256k1.
   *
   * @param privateKey - Private key to verify (32 bytes).
   * @returns `true` if valid private key.
   */
  protected abstract verifyPrivateKey(privateKey: Uint8Array): boolean;

  /**
   * Creates a public key from a private key.
   *
   * @param privateKey - Source private key (32 bytes).
   * @param compressed - Generate compressed (33B) or uncompressed (65B) format.
   * @returns Public key or `null` if creation failed.
   */
  protected abstract createPublicKey(
    privateKey: Uint8Array,
    compressed: boolean,
  ): Uint8Array | null;

  /**
   * Validates a public key on the secp256k1 curve.
   *
   * @param publicKey - Public key to validate.
   * @returns `true` if valid public key.
   */
  protected abstract validatePublicKey(publicKey: Uint8Array): boolean;

  /**
   * Decompresses a compressed public key.
   *
   * @param publicKey - Compressed public key (33 bytes).
   * @returns Uncompressed public key (65 bytes) or `null` if decompression failed.
   */
  protected abstract decompressPublicKey(
    publicKey: Uint8Array,
  ): Uint8Array | null;

  /**
   * Performs ECDH key agreement.
   *
   * @param publicKey - Other party's public key.
   * @param privateKey - Your private key.
   * @returns Raw X coordinate of shared point (32 bytes).
   */
  protected abstract performECDH(
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array;

  /**
   * Computes SHA-512 hash.
   *
   * @param data - Data to hash.
   * @returns SHA-512 hash (64 bytes).
   */
  protected abstract sha512(data: Uint8Array): Uint8Array;

  /**
   * Computes HMAC-SHA256 authentication tag.
   *
   * @param key - HMAC key.
   * @param data - Data to authenticate.
   * @returns HMAC-SHA256 (32 bytes).
   */
  protected abstract hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array;

  /**
   * Encrypts data using AES-256-CBC.
   *
   * @param key - Encryption key (32 bytes).
   * @param iv - Initialization vector (16 bytes).
   * @param data - Data to encrypt.
   * @returns Encrypted data with PKCS7 padding.
   */
  protected abstract aesEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    data: Uint8Array,
  ): Promise<Uint8Array>;

  /**
   * Decrypts AES-256-CBC encrypted data.
   *
   * @param key - Encryption key (32 bytes).
   * @param iv - Initialization vector (16 bytes).
   * @param data - Encrypted data with PKCS7 padding.
   * @returns Decrypted data.
   */
  protected abstract aesDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    data: Uint8Array,
  ): Promise<Uint8Array>;

  /**
   * Encrypts data using ECIES with secp256k1.
   *
   * @remarks
   * Generates an ephemeral key pair, performs ECDH key agreement,
   * and encrypts data using AES-256-CBC with HMAC-SHA256 authentication.
   *
   * @param publicKey - Recipient's public key (33 bytes compressed or 65 bytes uncompressed).
   *   Obtain via `vana.server.getIdentity(userAddress).public_key`.
   * @param message - Data to encrypt.
   * @returns Encrypted data structure compatible with eccrypto format.
   * @throws {ECIESError} When public key is invalid.
   *   Verify key format matches secp256k1 requirements.
   *
   * @example
   * ```typescript
   * const encrypted = await provider.encrypt(
   *   Buffer.from(publicKey, 'hex'),
   *   Buffer.from('sensitive data')
   * );
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
        ephemeralPrivateKey = this.generateRandomBytes(
          CURVE.PRIVATE_KEY_LENGTH,
        );
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
      const encryptionKey = kdf.slice(
        KDF.ENCRYPTION_KEY_OFFSET,
        KDF.ENCRYPTION_KEY_OFFSET + KDF.ENCRYPTION_KEY_LENGTH,
      );
      const macKey = kdf.slice(
        KDF.MAC_KEY_OFFSET,
        KDF.MAC_KEY_OFFSET + KDF.MAC_KEY_LENGTH,
      );

      // Generate random IV and encrypt
      const iv = this.generateRandomBytes(CIPHER.IV_LENGTH);
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
   * Encrypts a UTF-8 string using ECIES.
   *
   * @param publicKey - Recipient's public key.
   * @param message - String to encrypt.
   * @returns Encrypted data structure.
   *
   * @example
   * ```typescript
   * const encrypted = await provider.encryptString(
   *   publicKey,
   *   'Hello World'
   * );
   * ```
   */
  async encryptString(
    publicKey: Buffer,
    message: string,
  ): Promise<ECIESEncrypted> {
    return this.encrypt(publicKey, Buffer.from(message, "utf8"));
  }

  /**
   * Decrypts ECIES encrypted data.
   *
   * @remarks
   * Verifies MAC before decryption to ensure data integrity.
   * Compatible with data encrypted by eccrypto or this SDK.
   *
   * @param privateKey - Recipient's private key (32 bytes).
   * @param encrypted - Encrypted data structure from `encrypt()` or legacy eccrypto.
   * @returns Decrypted message as Buffer.
   * @throws {ECIESError} When MAC verification fails.
   *   Ensure the private key matches the public key used for encryption.
   *
   * @example
   * ```typescript
   * const decrypted = await provider.decrypt(
   *   Buffer.from(privateKey, 'hex'),
   *   encrypted
   * );
   * const message = decrypted.toString('utf8');
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
      if (privateKey.length !== CURVE.PRIVATE_KEY_LENGTH) {
        throw new ECIESError(
          `Invalid private key length: expected ${CURVE.PRIVATE_KEY_LENGTH} bytes, got ${privateKey.length}`,
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
      const encryptionKey = kdf.slice(
        KDF.ENCRYPTION_KEY_OFFSET,
        KDF.ENCRYPTION_KEY_OFFSET + KDF.ENCRYPTION_KEY_LENGTH,
      );
      const macKey = kdf.slice(
        KDF.MAC_KEY_OFFSET,
        KDF.MAC_KEY_OFFSET + KDF.MAC_KEY_LENGTH,
      );

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
   * Decrypts ECIES encrypted data to a UTF-8 string.
   *
   * @param privateKey - Recipient's private key (32 bytes).
   * @param encrypted - Encrypted data structure.
   * @returns Decrypted string.
   *
   * @example
   * ```typescript
   * const message = await provider.decryptString(
   *   privateKey,
   *   encrypted
   * );
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
   * Normalizes public key to uncompressed format.
   *
   * @param publicKey - Public key (33 or 65 bytes).
   * @returns Uncompressed public key (65 bytes).
   */
  protected normalizePublicKey(publicKey: Buffer): Uint8Array {
    // Check validation cache first for performance
    const cached = BaseECIES.validatedKeys.get(publicKey);

    if (publicKey.length === CURVE.COMPRESSED_PUBLIC_KEY_LENGTH) {
      // Compressed key - decompress it
      const isValid =
        cached !== undefined ? cached : this.validatePublicKey(publicKey);
      if (!isValid) {
        throw new ECIESError(
          `Invalid compressed public key: expected ${CURVE.COMPRESSED_PUBLIC_KEY_LENGTH} bytes, got ${publicKey.length}`,
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
    } else if (publicKey.length === CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH) {
      // Already uncompressed - validate it
      const isValid =
        cached !== undefined ? cached : this.validatePublicKey(publicKey);
      if (!isValid) {
        throw new ECIESError(
          `Invalid uncompressed public key: expected ${CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH} bytes, got ${publicKey.length}`,
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
        `Invalid public key format: expected ${CURVE.COMPRESSED_PUBLIC_KEY_LENGTH} (compressed) or ${CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH} (uncompressed) bytes, got ${publicKey.length}`,
        "INVALID_KEY",
      );
    }
  }

  /**
   * Concatenates multiple buffers efficiently.
   *
   * @param buffers - Buffers to concatenate.
   * @returns Single concatenated buffer.
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
   * Performs constant-time buffer comparison.
   *
   * @remarks
   * Prevents timing attacks by ensuring comparison time
   * doesn't depend on buffer contents.
   *
   * @param a - First buffer.
   * @param b - Second buffer.
   * @returns `true` if buffers are equal.
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
   * Securely clears sensitive data from memory.
   *
   * @remarks
   * Uses multiple overwrite passes to prevent data recovery.
   *
   * @param buffer - Buffer containing sensitive data.
   */
  protected clearBuffer(buffer: Uint8Array): void {
    // Multiple overwrite passes to prevent compiler optimization
    const len = buffer.length;
    const { ZEROS, ONES, PATTERN_MULTIPLIER, PATTERN_OFFSET } =
      SECURITY.CLEAR_PATTERNS;

    // Pass 1: zeros
    buffer.fill(ZEROS);
    // Pass 2: ones
    buffer.fill(ONES);
    // Pass 3: pattern
    for (let i = 0; i < len; i++) {
      buffer[i] = (i * PATTERN_MULTIPLIER + PATTERN_OFFSET) & 0xff;
    }
    // Final pass: zeros
    buffer.fill(ZEROS);
  }
}
