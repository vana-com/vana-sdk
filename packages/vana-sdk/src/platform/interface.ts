/**
 * Platform Adapter interface for environment-specific implementations
 *
 * This interface abstracts all environment-specific dependencies to ensure
 * the SDK works seamlessly across Node.js and browser/SSR environments.
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
   * @param data The data to encrypt
   * @param publicKey The public key for encryption
   * @returns Promise resolving to encrypted data
   */
  encryptWithPublicKey(data: string, publicKey: string): Promise<string>;

  /**
   * Decrypt data with a private key using asymmetric cryptography
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
   * @returns Promise resolving to public and private key pair
   */
  generateKeyPair(): Promise<{ publicKey: string; privateKey: string }>;
}

/**
 * PGP operations that require different configurations per platform
 */
export interface VanaPGPAdapter {
  /**
   * Encrypt data using PGP with proper platform configuration
   * @param data The data to encrypt
   * @param publicKey The PGP public key
   * @returns Promise resolving to encrypted data
   */
  encrypt(data: string, publicKey: string): Promise<string>;

  /**
   * Decrypt data using PGP with proper platform configuration
   * @param encryptedData The encrypted data
   * @param privateKey The PGP private key
   * @returns Promise resolving to decrypted data
   */
  decrypt(encryptedData: string, privateKey: string): Promise<string>;

  /**
   * Generate a new PGP key pair with platform-appropriate configuration
   * @param options Key generation options
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
   * @param url The URL to request
   * @param options Request options
   * @returns Promise resolving to response
   */
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

/**
 * Main platform adapter interface that combines all platform-specific functionality
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
