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
import { fromHex, toHex } from "viem";

/**
 * Represents ECIES encrypted data in eccrypto-compatible format.
 *
 * @remarks
 * This structure maintains backward compatibility with data encrypted using
 * the legacy eccrypto library.
 */
export interface ECIESEncrypted {
  /** Initialization vector (16 bytes) */
  iv: Uint8Array;
  /** Ephemeral public key (65 bytes uncompressed) */
  ephemPublicKey: Uint8Array;
  /** Encrypted data */
  ciphertext: Uint8Array;
  /** Message authentication code (32 bytes) */
  mac: Uint8Array;
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
   *   fromHex(publicKey, 'bytes'),
   *   new TextEncoder().encode('sensitive data')
   * );
   * ```
   */
  encrypt(publicKey: Uint8Array, message: Uint8Array): Promise<ECIESEncrypted>;

  /**
   * Decrypts ECIES encrypted data.
   *
   * @param privateKey - Recipient's private key (32 bytes).
   * @param encrypted - Encrypted data structure from `encrypt()` or legacy eccrypto.
   * @returns Decrypted message as Uint8Array.
   * @throws {ECIESError} When MAC verification fails.
   *   Ensure the private key matches the public key used for encryption.
   *
   * @example
   * ```typescript
   * const decrypted = await provider.decrypt(
   *   fromHex(privateKey, 'bytes'),
   *   encrypted
   * );
   * const message = new TextDecoder().decode(decrypted);
   * ```
   */
  decrypt(
    privateKey: Uint8Array,
    encrypted: ECIESEncrypted,
  ): Promise<Uint8Array>;

  /**
   * Normalizes a public key to uncompressed format (65 bytes with 0x04 prefix).
   *
   * @remarks
   * Strict policy: Only accepts properly formatted compressed (33 bytes) or
   * uncompressed (65 bytes) public keys. Does not accept 64-byte raw coordinates
   * to ensure data integrity and prevent masking of malformed inputs.
   *
   * @param publicKey - Public key in compressed or uncompressed format
   * @returns Normalized uncompressed public key (65 bytes with 0x04 prefix)
   * @throws {Error} When public key format is invalid, including raw coordinates (64 bytes)
   * @throws {Error} When decompression of compressed key fails
   *
   * @example
   * ```typescript
   * // Compressed key (33 bytes)
   * const compressed = new Uint8Array(33);
   * compressed[0] = 0x02;
   * const uncompressed = provider.normalizeToUncompressed(compressed);
   * console.log(uncompressed.length); // 65
   * console.log(uncompressed[0]); // 0x04
   *
   * // Already uncompressed (65 bytes)
   * const already = provider.normalizeToUncompressed(uncompressedKey);
   * console.log(already === uncompressedKey); // true (returns same reference)
   *
   * // Raw coordinates rejected (64 bytes)
   * const raw = new Uint8Array(64);
   * provider.normalizeToUncompressed(raw); // Throws error
   * ```
   */
  normalizeToUncompressed(publicKey: Uint8Array): Uint8Array;
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

  const isUint8Array = (value: unknown): value is Uint8Array => {
    return (
      value instanceof Uint8Array ||
      (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
    );
  };

  return (
    isUint8Array(enc.iv) &&
    enc.iv.length === CIPHER.IV_LENGTH &&
    isUint8Array(enc.ephemPublicKey) &&
    (enc.ephemPublicKey.length === CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH ||
      enc.ephemPublicKey.length === CURVE.COMPRESSED_PUBLIC_KEY_LENGTH) &&
    isUint8Array(enc.ciphertext) &&
    enc.ciphertext.length > 0 &&
    isUint8Array(enc.mac) &&
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
  const combined = new Uint8Array(
    encrypted.iv.length +
      encrypted.ephemPublicKey.length +
      encrypted.ciphertext.length +
      encrypted.mac.length,
  );

  let offset = 0;
  combined.set(encrypted.iv, offset);
  offset += encrypted.iv.length;
  combined.set(encrypted.ephemPublicKey, offset);
  offset += encrypted.ephemPublicKey.length;
  combined.set(encrypted.ciphertext, offset);
  offset += encrypted.ciphertext.length;
  combined.set(encrypted.mac, offset);

  return toHex(combined).slice(2);
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
  const hexWithPrefix = hex.startsWith("0x") ? hex : `0x${hex}`;
  const bytes = fromHex(hexWithPrefix as `0x${string}`, "bytes");

  // Check minimum length before accessing prefix byte
  // Need at least: IV (16 bytes) + 1 byte for prefix check + MAC (32 bytes) + 1 byte ciphertext
  const absoluteMinLength = FORMAT.IV_LENGTH + 1 + MAC.LENGTH + 1;
  if (bytes.length < absoluteMinLength) {
    throw new ECIESError(
      `Invalid ECIES data: too short (${bytes.length} bytes, minimum ${absoluteMinLength} bytes required)`,
      "DECRYPTION_FAILED",
    );
  }

  // Determine ephemPublicKey size based on prefix
  const prefix = bytes[FORMAT.EPHEMERAL_KEY_OFFSET];
  let ephemKeySize: number;

  if (prefix === CURVE.PREFIX.UNCOMPRESSED) {
    ephemKeySize = CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH;
  } else if (
    prefix === CURVE.PREFIX.COMPRESSED_EVEN ||
    prefix === CURVE.PREFIX.COMPRESSED_ODD
  ) {
    ephemKeySize = CURVE.COMPRESSED_PUBLIC_KEY_LENGTH;
  } else {
    throw new ECIESError(
      `Invalid ephemeral public key prefix: 0x${prefix.toString(16).padStart(2, "0")}`,
      "DECRYPTION_FAILED",
    );
  }

  const minLength = FORMAT.IV_LENGTH + ephemKeySize + MAC.LENGTH + 1; // +1 for at least 1 byte of ciphertext
  if (bytes.length < minLength) {
    throw new ECIESError(
      `Invalid ECIES data: too short (${bytes.length} bytes, minimum ${minLength} bytes required)`,
      "DECRYPTION_FAILED",
    );
  }

  return {
    iv: bytes.subarray(FORMAT.IV_OFFSET, FORMAT.IV_OFFSET + FORMAT.IV_LENGTH),
    ephemPublicKey: bytes.subarray(
      FORMAT.EPHEMERAL_KEY_OFFSET,
      FORMAT.EPHEMERAL_KEY_OFFSET + ephemKeySize,
    ),
    ciphertext: bytes.subarray(
      FORMAT.EPHEMERAL_KEY_OFFSET + ephemKeySize,
      bytes.length - MAC.LENGTH,
    ),
    mac: bytes.subarray(bytes.length - MAC.LENGTH),
  };
}
