/**
 * ECIES (Elliptic Curve Integrated Encryption Scheme) Interface
 *
 * This interface defines the contract for platform-specific ECIES implementations.
 * All implementations MUST maintain compatibility with the eccrypto format to ensure
 * backward compatibility with existing encrypted data.
 *
 * Format specification:
 * [iv (16 bytes)][ephemPublicKey (65 bytes)][ciphertext (variable)][mac (32 bytes)]
 */

/**
 * Encrypted data structure matching eccrypto format
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
 * ECIES encryption/decryption provider interface
 */
export interface ECIESProvider {
  /**
   * Encrypts data using ECIES with secp256k1
   *
   * @param publicKey - Recipient's public key (65 bytes uncompressed or 33 bytes compressed)
   * @param message - Data to encrypt
   * @returns Encrypted data structure
   * @throws {Error} If encryption fails
   */
  encrypt(publicKey: Buffer, message: Buffer): Promise<ECIESEncrypted>;

  /**
   * Decrypts ECIES encrypted data
   *
   * @param privateKey - Recipient's private key (32 bytes)
   * @param encrypted - Encrypted data structure
   * @returns Decrypted message
   * @throws {Error} If decryption fails or MAC verification fails
   */
  decrypt(privateKey: Buffer, encrypted: ECIESEncrypted): Promise<Buffer>;
}

/**
 * Options for ECIES operations
 */
export interface ECIESOptions {
  /** Use compressed public keys (33 bytes) instead of uncompressed (65 bytes) */
  useCompressed?: boolean;
}

/**
 * Error thrown when ECIES operations fail
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
 * Type guard to check if an object is a valid ECIESEncrypted structure
 *
 * @param obj - Object to check
 * @returns true if object is a valid ECIESEncrypted structure
 */
export function isECIESEncrypted(obj: unknown): obj is ECIESEncrypted {
  if (!obj || typeof obj !== "object") return false;
  const enc = obj as Record<string, unknown>;

  return (
    Buffer.isBuffer(enc.iv) &&
    enc.iv.length === 16 &&
    Buffer.isBuffer(enc.ephemPublicKey) &&
    (enc.ephemPublicKey.length === 65 || enc.ephemPublicKey.length === 33) &&
    Buffer.isBuffer(enc.ciphertext) &&
    enc.ciphertext.length > 0 &&
    Buffer.isBuffer(enc.mac) &&
    enc.mac.length === 32
  );
}

/**
 * Utility to serialize ECIESEncrypted to hex string for transmission
 *
 * @param encrypted - Encrypted data structure to serialize
 * @returns Hex string representation of encrypted data
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
 * Utility to deserialize hex string to ECIESEncrypted structure
 *
 * @param hex - Hex string to deserialize
 * @returns ECIESEncrypted structure
 */
export function deserializeECIES(hex: string): ECIESEncrypted {
  const buffer = Buffer.from(hex, "hex");

  // Determine ephemPublicKey size (33 for compressed, 65 for uncompressed)
  const ephemKeySize = buffer[16] === 0x04 ? 65 : 33;

  if (buffer.length < 16 + ephemKeySize + 32 + 1) {
    throw new ECIESError("Invalid ECIES data: too short", "DECRYPTION_FAILED");
  }

  return {
    iv: buffer.subarray(0, 16),
    ephemPublicKey: buffer.subarray(16, 16 + ephemKeySize),
    ciphertext: buffer.subarray(16 + ephemKeySize, buffer.length - 32),
    mac: buffer.subarray(buffer.length - 32),
  };
}
