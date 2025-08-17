/**
 * ECIES (Elliptic Curve Integrated Encryption Scheme) Interface
 *
 * @remarks
 * Defines the contract for platform-specific ECIES implementations.
 * All implementations maintain compatibility with the eccrypto format to ensure
 * backward compatibility with existing encrypted data.
 *
 * **Format specification:**
 * `[iv (16 bytes)][ephemPublicKey (65 bytes)][ciphertext (variable)][mac (32 bytes)]`
 *
 * @category Cryptography
 */

import { CIPHER, CURVE, MAC, FORMAT } from "./constants";

/**
 * Represents ECIES encrypted data in eccrypto-compatible format.
 *
 * @remarks
 * This structure maintains backward compatibility with data encrypted using
 * the legacy eccrypto library.
 */
export interface ECIESEncrypted {
  /** Initialization vector (16 bytes) */
  iv: Buffer;
  /** Ephemeral public key (65 bytes uncompressed) */
  ephemPublicKey: Buffer;
  /** Encrypted data */
  ciphertext: Buffer;
  /** Message authentication code (32 bytes) */
  mac: Buffer;
}

/**
 * Provides ECIES encryption and decryption operations.
 *
 * @remarks
 * Platform-specific implementations handle the underlying cryptographic primitives
 * while maintaining consistent data format across environments.
 *
 * @category Cryptography
 */
export interface ECIESProvider {
  /**
   * Encrypts data using ECIES with secp256k1.
   *
   * @param publicKey - Recipient's public key (65 bytes uncompressed or 33 bytes compressed).
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
  encrypt(publicKey: Buffer, message: Buffer): Promise<ECIESEncrypted>;

  /**
   * Decrypts ECIES encrypted data.
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
  decrypt(privateKey: Buffer, encrypted: ECIESEncrypted): Promise<Buffer>;
}

/**
 * Configures ECIES operation behavior.
 */
export interface ECIESOptions {
  /** Use compressed public keys (33 bytes) instead of uncompressed (65 bytes) */
  useCompressed?: boolean;
}

/**
 * Represents failures in ECIES cryptographic operations.
 *
 * @remarks
 * Provides specific error codes to help identify and recover from
 * different failure scenarios.
 *
 * @category Errors
 */
export class ECIESError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_KEY"
      | "ENCRYPTION_FAILED"
      | "DECRYPTION_FAILED"
      | "MAC_MISMATCH"
      | "ECDH_FAILED",
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = "ECIESError";
  }
}

/**
 * Validates if an object conforms to the ECIESEncrypted structure.
 *
 * @param obj - Object to validate.
 * @returns `true` if object is a valid ECIESEncrypted structure.
 *
 * @example
 * ```typescript
 * if (isECIESEncrypted(data)) {
 *   const decrypted = await provider.decrypt(privateKey, data);
 * }
 * ```
 */
export function isECIESEncrypted(obj: unknown): obj is ECIESEncrypted {
  if (!obj || typeof obj !== "object") return false;
  const enc = obj as Record<string, unknown>;

  return (
    Buffer.isBuffer(enc.iv) &&
    enc.iv.length === CIPHER.IV_LENGTH &&
    Buffer.isBuffer(enc.ephemPublicKey) &&
    (enc.ephemPublicKey.length === CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH ||
      enc.ephemPublicKey.length === CURVE.COMPRESSED_PUBLIC_KEY_LENGTH) &&
    Buffer.isBuffer(enc.ciphertext) &&
    enc.ciphertext.length > 0 &&
    Buffer.isBuffer(enc.mac) &&
    enc.mac.length === MAC.LENGTH
  );
}

/**
 * Serializes ECIESEncrypted to hex string for storage or transmission.
 *
 * @param encrypted - Encrypted data structure from `encrypt()`.
 * @returns Hex string representation.
 *
 * @example
 * ```typescript
 * const hexString = serializeECIES(encrypted);
 * // Store hexString in database or send over network
 * ```
 */
export function serializeECIES(encrypted: ECIESEncrypted): string {
  return Buffer.concat([
    encrypted.iv,
    encrypted.ephemPublicKey,
    encrypted.ciphertext,
    encrypted.mac,
  ]).toString("hex");
}

/**
 * Deserializes hex string to ECIESEncrypted structure.
 *
 * @param hex - Hex string from `serializeECIES()` or storage.
 * @returns ECIESEncrypted structure ready for decryption.
 * @throws {ECIESError} When hex string format is invalid.
 *   Verify the hex string is complete and uncorrupted.
 *
 * @example
 * ```typescript
 * const encrypted = deserializeECIES(hexString);
 * const decrypted = await provider.decrypt(privateKey, encrypted);
 * ```
 */
export function deserializeECIES(hex: string): ECIESEncrypted {
  const buffer = Buffer.from(hex, "hex");

  // Determine ephemPublicKey size based on prefix
  const ephemKeySize =
    buffer[FORMAT.EPHEMERAL_KEY_OFFSET] === CURVE.PREFIX.UNCOMPRESSED
      ? CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH
      : CURVE.COMPRESSED_PUBLIC_KEY_LENGTH;

  const minLength = FORMAT.IV_LENGTH + ephemKeySize + MAC.LENGTH + 1; // +1 for at least 1 byte of ciphertext
  if (buffer.length < minLength) {
    throw new ECIESError("Invalid ECIES data: too short", "DECRYPTION_FAILED");
  }

  return {
    iv: buffer.subarray(FORMAT.IV_OFFSET, FORMAT.IV_OFFSET + FORMAT.IV_LENGTH),
    ephemPublicKey: buffer.subarray(
      FORMAT.EPHEMERAL_KEY_OFFSET,
      FORMAT.EPHEMERAL_KEY_OFFSET + ephemKeySize,
    ),
    ciphertext: buffer.subarray(
      FORMAT.EPHEMERAL_KEY_OFFSET + ephemKeySize,
      buffer.length - MAC.LENGTH,
    ),
    mac: buffer.subarray(buffer.length - MAC.LENGTH),
  };
}
