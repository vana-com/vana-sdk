/**
 * ECIES Constants and Format Specification
 *
 * These constants define the eccrypto-compatible ECIES format used throughout the SDK.
 * Maintaining these exact values ensures backward compatibility with data encrypted
 * using the original eccrypto library.
 */

/**
 * Elliptic curve parameters
 */
export const CURVE = {
  /** The elliptic curve used (secp256k1 - same as Bitcoin/Ethereum) */
  name: "secp256k1",
  /** Private key length in bytes */
  PRIVATE_KEY_LENGTH: 32,
  /** Compressed public key length in bytes (0x02 or 0x03 prefix + 32 bytes) */
  COMPRESSED_PUBLIC_KEY_LENGTH: 33,
  /** Uncompressed public key length in bytes (0x04 prefix + 64 bytes) */
  UNCOMPRESSED_PUBLIC_KEY_LENGTH: 65,
  /** ECDH shared secret X coordinate length */
  SHARED_SECRET_LENGTH: 32,
  /** Public key prefixes */
  PREFIX: {
    /** Uncompressed public key prefix */
    UNCOMPRESSED: 0x04,
    /** Compressed public key prefix for even Y */
    COMPRESSED_EVEN: 0x02,
    /** Compressed public key prefix for odd Y */
    COMPRESSED_ODD: 0x03,
  },
  /** X coordinate starts at byte 1 (after prefix) */
  X_COORDINATE_OFFSET: 1,
  /** X coordinate ends at byte 33 (1 + 32) */
  X_COORDINATE_END: 33,
} as const;

/**
 * Symmetric encryption parameters (AES-256-CBC)
 */
export const CIPHER = {
  /** Cipher algorithm - must match eccrypto */
  algorithm: "aes-256-cbc",
  /** AES key length in bytes */
  KEY_LENGTH: 32,
  /** Initialization vector length in bytes */
  IV_LENGTH: 16,
  /** Block size for AES */
  BLOCK_SIZE: 16,
} as const;

/**
 * Key derivation function parameters
 */
export const KDF = {
  /** Hash algorithm for key derivation - must match eccrypto */
  algorithm: "sha512",
  /** Output length of SHA-512 in bytes */
  OUTPUT_LENGTH: 64,
  /** Encryption key slice (first 32 bytes of KDF output) */
  ENCRYPTION_KEY_OFFSET: 0,
  ENCRYPTION_KEY_LENGTH: 32,
  /** MAC key slice (last 32 bytes of KDF output) */
  MAC_KEY_OFFSET: 32,
  MAC_KEY_LENGTH: 32,
} as const;

/**
 * Message authentication code parameters
 */
export const MAC = {
  /** MAC algorithm - must match eccrypto */
  algorithm: "sha256",
  /** HMAC-SHA256 output length in bytes */
  LENGTH: 32,
} as const;

/**
 * ECIES encrypted data format offsets and lengths
 * Format: [iv(16)][ephemPublicKey(65)][ciphertext(variable)][mac(32)]
 */
export const FORMAT = {
  /** Offsets for each component in serialized format */
  IV_OFFSET: 0,
  IV_LENGTH: CIPHER.IV_LENGTH,

  /** Ephemeral public key (always uncompressed in eccrypto format) */
  EPHEMERAL_KEY_OFFSET: CIPHER.IV_LENGTH,
  EPHEMERAL_KEY_LENGTH: CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH,

  /** Ciphertext starts after IV and ephemeral key */
  CIPHERTEXT_OFFSET: CIPHER.IV_LENGTH + CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH,

  /** MAC is always the last 32 bytes */
  MAC_LENGTH: MAC.LENGTH,

  /** Minimum size of encrypted data (IV + ephemKey + MAC, no ciphertext) */
  MIN_ENCRYPTED_LENGTH:
    CIPHER.IV_LENGTH + CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH + MAC.LENGTH,

  /**
   * Helper to calculate total length of encrypted data
   *
   * @param ciphertextLength - Length of the ciphertext portion
   * @returns Total length including all components
   */
  getTotalLength: (ciphertextLength: number) =>
    CIPHER.IV_LENGTH +
    CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH +
    ciphertextLength +
    MAC.LENGTH,
} as const;

/**
 * Security constants for data clearing
 */
export const SECURITY = {
  /** Overwrite patterns for secure data clearing */
  CLEAR_PATTERNS: {
    ZEROS: 0x00,
    ONES: 0xff,
    /** Pattern multiplier for third pass */
    PATTERN_MULTIPLIER: 7,
    /** Pattern offset for third pass */
    PATTERN_OFFSET: 13,
  },
} as const;
