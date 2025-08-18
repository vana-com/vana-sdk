import type { ECIESProvider, ECIESEncrypted } from "./interface";
import { ECIESError, isECIESEncrypted } from "./interface";
import { CURVE, CIPHER, KDF } from "./constants";
import { concatBytes, constantTimeEqual } from "./utils";

/**
 * Provides shared ECIES encryption logic across platforms using Uint8Array.
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
export abstract class BaseECIESUint8 implements ECIESProvider {
  // Cache for validated public keys to avoid repeated validation
  private static readonly validatedKeys = new WeakMap<Uint8Array, boolean>();

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
   * @param plaintext - Data to encrypt.
   * @returns Ciphertext with PKCS#7 padding.
   */
  protected abstract aesEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
  ): Promise<Uint8Array>;

  /**
   * Decrypts data using AES-256-CBC.
   *
   * @param key - Decryption key (32 bytes).
   * @param iv - Initialization vector (16 bytes).
   * @param ciphertext - Data to decrypt.
   * @returns Plaintext with padding removed.
   */
  protected abstract aesDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array>;

  /**
   * Normalizes a public key to uncompressed format.
   *
   * @param publicKey - Public key in any format.
   * @returns Uncompressed public key (65 bytes).
   * @throws {ECIESError} If key format is invalid.
   */
  protected normalizePublicKey(publicKey: Uint8Array): Uint8Array {
    // Check cache first
    if (BaseECIESUint8.validatedKeys.has(publicKey)) {
      return publicKey;
    }

    if (publicKey.length === CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH) {
      if (publicKey[0] !== CURVE.PREFIX.UNCOMPRESSED) {
        throw new ECIESError(
          "Invalid uncompressed public key prefix",
          "INVALID_KEY",
        );
      }
      // Validate and cache
      if (!this.validatePublicKey(publicKey)) {
        throw new ECIESError("Invalid public key", "INVALID_KEY");
      }
      BaseECIESUint8.validatedKeys.set(publicKey, true);
      return publicKey;
    }

    if (publicKey.length === CURVE.COMPRESSED_PUBLIC_KEY_LENGTH) {
      const decompressed = this.decompressPublicKey(publicKey);
      if (!decompressed) {
        throw new ECIESError("Failed to decompress public key", "INVALID_KEY");
      }
      // Cache the decompressed key
      BaseECIESUint8.validatedKeys.set(decompressed, true);
      return decompressed;
    }

    throw new ECIESError(
      `Invalid public key length: ${publicKey.length}`,
      "INVALID_KEY",
    );
  }

  /**
   * Encrypts data using ECIES.
   *
   * @param publicKey - The recipient's public key (compressed or uncompressed)
   * @param message - The data to encrypt
   * @returns Promise resolving to encrypted data structure
   */
  async encrypt(
    publicKey: Uint8Array,
    message: Uint8Array,
  ): Promise<ECIESEncrypted> {
    try {
      // Validate inputs
      if (!(publicKey instanceof Uint8Array)) {
        throw new ECIESError("Public key must be a Uint8Array", "INVALID_KEY");
      }
      if (!(message instanceof Uint8Array)) {
        throw new ECIESError(
          "Message must be a Uint8Array",
          "ENCRYPTION_FAILED",
        );
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
      const macData = concatBytes(iv, ephemeralPublicKey, ciphertext);
      const mac = this.hmacSha256(macKey, macData);

      // Clear sensitive data
      this.clearBuffer(ephemeralPrivateKey);
      this.clearBuffer(sharedSecret);
      this.clearBuffer(kdf);

      return {
        iv,
        ephemPublicKey: ephemeralPublicKey,
        ciphertext,
        mac,
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
   * Decrypts ECIES encrypted data.
   *
   * @param privateKey - The recipient's private key (32 bytes)
   * @param encrypted - The encrypted data structure from encrypt()
   * @returns Promise resolving to the original plaintext
   */
  async decrypt(
    privateKey: Uint8Array,
    encrypted: ECIESEncrypted,
  ): Promise<Uint8Array> {
    try {
      // Validate inputs
      if (!(privateKey instanceof Uint8Array)) {
        throw new ECIESError("Private key must be a Uint8Array", "INVALID_KEY");
      }
      if (!isECIESEncrypted(encrypted)) {
        throw new ECIESError(
          "Invalid encrypted data structure",
          "DECRYPTION_FAILED",
        );
      }
      if (privateKey.length !== CURVE.PRIVATE_KEY_LENGTH) {
        throw new ECIESError(
          `Invalid private key length: ${privateKey.length}`,
          "INVALID_KEY",
        );
      }
      if (!this.verifyPrivateKey(privateKey)) {
        throw new ECIESError("Invalid private key", "INVALID_KEY");
      }

      // Normalize ephemeral public key to uncompressed format
      const ephemeralPublicKey = this.normalizePublicKey(
        encrypted.ephemPublicKey,
      );

      // Perform ECDH to recover shared secret
      const sharedSecret = this.performECDH(ephemeralPublicKey, privateKey);

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

      // Verify MAC before decryption (Encrypt-then-MAC)
      const macData = concatBytes(
        encrypted.iv,
        encrypted.ephemPublicKey,
        encrypted.ciphertext,
      );
      const expectedMac = this.hmacSha256(macKey, macData);

      if (!constantTimeEqual(encrypted.mac, expectedMac)) {
        throw new ECIESError("MAC verification failed", "MAC_MISMATCH");
      }

      // Decrypt the ciphertext
      const decrypted = await this.aesDecrypt(
        encryptionKey,
        encrypted.iv,
        encrypted.ciphertext,
      );

      // Clear sensitive data
      this.clearBuffer(sharedSecret);
      this.clearBuffer(kdf);

      return decrypted;
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
   * Clears sensitive data from memory using multi-pass overwrite.
   *
   * @remarks
   * Uses multiple passes with different patterns to make it harder
   * for JIT compilers to optimize away the operation. While not
   * guaranteed in JavaScript, this is a best-effort approach to
   * clear sensitive data from memory.
   *
   * @param buffer - The buffer to clear
   */
  protected clearBuffer(buffer: Uint8Array): void {
    if (buffer && buffer.length > 0) {
      // Multi-pass overwrite to resist compiler optimization
      buffer.fill(0x00); // Fill with zeros
      buffer.fill(0xff); // Fill with ones
      buffer.fill(0xaa); // Fill with alternating pattern
      buffer.fill(0x00); // Final zero fill

      // Additional pattern write to further discourage optimization
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = (i & 0xff) ^ 0x5a; // XOR with pattern
      }
      buffer.fill(0x00); // Final clear
    }
  }
}
