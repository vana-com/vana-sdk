/**
 * Platform Adapter interface for environment-specific implementations
 *
 * This interface abstracts all environment-specific dependencies to ensure
 * the SDK works seamlessly across Node.js and browser/SSR environments.
 *
 * **Implementation Context:**
 * - Node.js: Uses native crypto modules and full OpenPGP support
 * - Browser: Uses Web Crypto API and browser-compatible libraries
 * - SSR: Automatically selects appropriate implementation based on runtime
 *
 * **Usage Notes:**
 * Platform adapters are automatically selected by the SDK. Direct usage is only
 * needed for custom implementations or testing.
 */

/**
 * Platform type identifier
 */
export type PlatformType = "node" | "browser";

/**
 * Encryption operations that require different implementations per platform
 */
export interface VanaCryptoAdapter {
  /**
   * Encrypt data with a public key using asymmetric cryptography
   *
   * **Usage Context:**
   * - Used internally for file encryption before storage
   * - Public key format: Armored PGP public key string
   * - Returns base64-encoded encrypted data
   *
   * @param data The data to encrypt
   * @param publicKey The public key for encryption
   * @returns Promise resolving to encrypted data
   */
  encryptWithPublicKey(data: string, publicKey: string): Promise<string>;

  /**
   * Decrypt data with a private key using asymmetric cryptography
   *
   * @param encryptedData The encrypted data
   * @param privateKey The private key for decryption
   * @returns Promise resolving to decrypted data
   */
  decryptWithPrivateKey(
    encryptedData: string,
    privateKey: string,
  ): Promise<string>;

  /**
   * Generate a new key pair for asymmetric cryptography
   *
   * @returns Promise resolving to public and private key pair
   */
  generateKeyPair(): Promise<{ publicKey: string; privateKey: string }>;

  /**
   * Encrypt data with a wallet's public key using ECDH cryptography
   * Uses platform-appropriate ECDH implementation (eccrypto vs eccrypto-js)
   *
   * **Usage Context:**
   * - Used for sharing encryption keys with permission recipients
   * - Public key format: Compressed or uncompressed secp256k1 hex string
   * - Compatible with Ethereum wallet public keys
   *
   * @param data The data to encrypt (string)
   * @param publicKey The wallet's public key (secp256k1)
   * @returns Promise resolving to encrypted data as hex string
   */
  encryptWithWalletPublicKey(data: string, publicKey: string): Promise<string>;

  /**
   * Decrypt data with a wallet's private key using ECDH cryptography
   * Uses platform-appropriate ECDH implementation (eccrypto vs eccrypto-js)
   *
   * @param encryptedData The encrypted data as hex string
   * @param privateKey The wallet's private key (secp256k1)
   * @returns Promise resolving to decrypted data as string
   */
  decryptWithWalletPrivateKey(
    encryptedData: string,
    privateKey: string,
  ): Promise<string>;

  /**
   * Encrypt data with a password using PGP password-based encryption
   * Uses platform-appropriate OpenPGP implementation with consistent format
   *
   * @param data The data to encrypt as Uint8Array
   * @param password The password for encryption (typically wallet signature)
   * @returns Promise resolving to encrypted data as Uint8Array
   */
  encryptWithPassword(data: Uint8Array, password: string): Promise<Uint8Array>;

  /**
   * Decrypt data with a password using PGP password-based decryption
   * Uses platform-appropriate OpenPGP implementation with consistent format
   *
   * @param encryptedData The encrypted data as Uint8Array
   * @param password The password for decryption (typically wallet signature)
   * @returns Promise resolving to decrypted data as Uint8Array
   */
  decryptWithPassword(
    encryptedData: Uint8Array,
    password: string,
  ): Promise<Uint8Array>;
}

/**
 * PGP operations that require different configurations per platform
 */
export interface VanaPGPAdapter {
  /**
   * Encrypt data using PGP with proper platform configuration
   *
   * @param data The data to encrypt
   * @param publicKey The PGP public key
   * @returns Promise resolving to encrypted data
   */
  encrypt(data: string, publicKey: string): Promise<string>;

  /**
   * Decrypt data using PGP with proper platform configuration
   *
   * @param encryptedData The encrypted data
   * @param privateKey The PGP private key
   * @returns Promise resolving to decrypted data
   */
  decrypt(encryptedData: string, privateKey: string): Promise<string>;

  /**
   * Generate a new PGP key pair with platform-appropriate configuration
   *
   * @param options - Key generation options
   * @param options.name - The name for the PGP key
   * @param options.email - The email for the PGP key
   * @param options.passphrase - Optional passphrase to protect the private key
   * @returns Promise resolving to public and private key pair
   */
  generateKeyPair(options?: {
    name?: string;
    email?: string;
    passphrase?: string;
  }): Promise<{ publicKey: string; privateKey: string }>;
}

/**
 * HTTP operations that need consistent API across platforms
 */
export interface VanaHttpAdapter {
  /**
   * Perform HTTP request with platform-appropriate fetch implementation
   *
   * @param url The URL to request
   * @param options Request options
   * @returns Promise resolving to response
   */
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

/**
 * Main platform adapter interface that combines all platform-specific functionality
 *
 * **Implementation Guidelines:**
 * 1. All methods must maintain consistent behavior across platforms
 * 2. Error types and messages should be unified
 * 3. Data formats (encoding, serialization) must be identical
 * 4. Performance characteristics can vary but API must be consistent
 *
 * **Custom Implementation Example:**
 * ```typescript
 * class CustomPlatformAdapter implements VanaPlatformAdapter {
 *   crypto = new CustomCryptoAdapter();
 *   pgp = new CustomPGPAdapter();
 *   http = new CustomHttpAdapter();
 *   platform = 'browser' as const;
 * }
 * ```
 */
export interface VanaPlatformAdapter {
  /**
   * Crypto operations adapter
   */
  crypto: VanaCryptoAdapter;

  /**
   * PGP operations adapter
   */
  pgp: VanaPGPAdapter;

  /**
   * HTTP operations adapter
   */
  http: VanaHttpAdapter;

  /**
   * Platform identifier for debugging/telemetry
   */
  readonly platform: PlatformType;
}
