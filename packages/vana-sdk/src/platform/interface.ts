/**
 * Defines platform abstraction interfaces for environment-specific implementations.
 *
 * @remarks
 * This module provides the contract for platform-specific operations, allowing
 * the SDK to work seamlessly across Node.js and browser environments. Platform
 * adapters handle all environment-specific dependencies including cryptography,
 * HTTP requests, caching, and PGP operations.
 *
 * The SDK automatically selects the appropriate adapter based on the runtime
 * environment. Custom implementations can be provided for specialized use cases.
 *
 * **Implementation Context:**
 * - Node.js: Uses native crypto modules, in-memory cache, and full OpenPGP support
 * - Browser: Uses Web Crypto API, sessionStorage cache, and browser-compatible libraries
 * - SSR: Automatically selects appropriate implementation based on runtime detection
 *
 * @example
 * ```typescript
 * // Custom platform adapter implementation
 * class CustomPlatformAdapter implements VanaPlatformAdapter {
 *   crypto = new CustomCryptoAdapter();
 *   pgp = new CustomPGPAdapter();
 *   http = new CustomHttpAdapter();
 *   cache = new CustomCacheAdapter();
 *   platform = 'browser' as const;
 * }
 *
 * // Use with SDK
 * const client = createClient({
 *   platformAdapter: new CustomPlatformAdapter()
 * });
 * ```
 *
 * @category Platform
 * @module platform/interface
 */

/**
 * Identifies the runtime platform for adapter selection.
 *
 * @remarks
 * Used for debugging, telemetry, and conditional logic based on
 * the execution environment.
 *
 * @category Platform
 */
export type PlatformType = "node" | "browser";

/**
 * Provides platform-specific cryptographic operations.
 *
 * @remarks
 * Implements ECIES encryption/decryption, key generation, and password-based
 * encryption using platform-appropriate libraries. Node.js uses Buffer-based
 * libraries while browser uses Uint8Array and Web Crypto where possible.
 *
 * @category Platform
 */
export interface VanaCryptoAdapter {
  /**
   * Encrypts data with a public key using ECIES.
   *
   * @remarks
   * Uses Elliptic Curve Integrated Encryption Scheme (ECIES) for
   * asymmetric encryption. The implementation varies by platform but
   * maintains compatible output format.
   *
   * @param data - The plaintext data to encrypt.
   *   Typically user data or encryption keys.
   * @param publicKey - The recipient's public key in hex format.
   *   Can be compressed or uncompressed secp256k1 key.
   * @returns Hex-encoded encrypted data containing IV, ephemeral key, ciphertext, and MAC
   *
   * @example
   * ```typescript
   * const encrypted = await adapter.crypto.encryptWithPublicKey(
   *   'sensitive data',
   *   '04abcd...' // 65-byte uncompressed public key
   * );
   * ```
   */
  encryptWithPublicKey(data: string, publicKey: string): Promise<string>;

  /**
   * Decrypts ECIES-encrypted data with a private key.
   *
   * @param encryptedData - Hex-encoded encrypted data.
   *   Must contain IV, ephemeral key, ciphertext, and MAC.
   * @param privateKey - The private key in hex format.
   *   Must correspond to the public key used for encryption.
   * @returns The decrypted plaintext string
   *
   * @throws {Error} If decryption or MAC verification fails
   */
  decryptWithPrivateKey(
    encryptedData: string,
    privateKey: string,
  ): Promise<string>;

  /**
   * Generates a new secp256k1 key pair.
   *
   * @returns Object with hex-encoded keys
   * @returns returns.publicKey - Compressed public key in hex
   * @returns returns.privateKey - Private key in hex
   *
   * @example
   * ```typescript
   * const { publicKey, privateKey } = await adapter.crypto.generateKeyPair();
   * console.log('Public key:', publicKey); // 33 bytes compressed
   * ```
   */
  generateKeyPair(): Promise<{ publicKey: string; privateKey: string }>;

  /**
   * Encrypts data with an Ethereum wallet's public key.
   *
   * @remarks
   * Specifically designed for wallet-based encryption where the public
   * key comes from an Ethereum wallet. Handles key format conversion
   * and uses ECIES for encryption.
   *
   * @param data - The plaintext data to encrypt.
   *   Typically permission grants or metadata.
   * @param publicKey - The wallet's public key.
   *   Accepts compressed/uncompressed, with/without 0x prefix.
   * @returns Hex-encoded encrypted data
   *
   * @example
   * ```typescript
   * const encrypted = await adapter.crypto.encryptWithWalletPublicKey(
   *   JSON.stringify({ permission: 'read' }),
   *   walletPublicKey
   * );
   * ```
   */
  encryptWithWalletPublicKey(data: string, publicKey: string): Promise<string>;

  /**
   * Decrypts data with an Ethereum wallet's private key.
   *
   * @param encryptedData - Hex-encoded encrypted data.
   *   Must be encrypted with corresponding wallet public key.
   * @param privateKey - The wallet's private key.
   *   Handle with extreme care - never log or store.
   * @returns The decrypted plaintext string
   *
   * @throws {Error} If decryption fails or key is invalid
   */
  decryptWithWalletPrivateKey(
    encryptedData: string,
    privateKey: string,
  ): Promise<string>;

  /**
   * Encrypts binary data with password-based encryption.
   *
   * @remarks
   * Uses OpenPGP password-based encryption with automatic salt
   * generation. Often used with wallet signatures as passwords for
   * deterministic key derivation.
   *
   * @param data - Binary data to encrypt.
   *   Typically file contents or serialized data.
   * @param password - Password for encryption.
   *   Often derived from wallet signatures.
   * @returns Encrypted data as Uint8Array
   *
   * @example
   * ```typescript
   * const fileData = new Uint8Array([1, 2, 3, 4]);
   * const encrypted = await adapter.crypto.encryptWithPassword(
   *   fileData,
   *   walletSignature
   * );
   * ```
   */
  encryptWithPassword(data: Uint8Array, password: string): Promise<Uint8Array>;

  /**
   * Decrypts password-encrypted binary data.
   *
   * @param encryptedData - Password-encrypted data.
   *   Must be encrypted with the same password.
   * @param password - Password for decryption.
   *   Must match the encryption password exactly.
   * @returns Decrypted data as Uint8Array
   *
   * @throws {Error} If decryption fails or password is incorrect
   */
  decryptWithPassword(
    encryptedData: Uint8Array,
    password: string,
  ): Promise<Uint8Array>;
}

/**
 * Provides platform-specific PGP operations.
 *
 * @remarks
 * Implements PGP encryption, decryption, and key generation using
 * OpenPGP.js with platform-appropriate configuration. Node.js uses
 * optimizations like zlib compression.
 *
 * @category Platform
 */
export interface VanaPGPAdapter {
  /**
   * Encrypts data using PGP public key encryption.
   *
   * @param data - The plaintext data to encrypt.
   *   Typically messages or structured data.
   * @param publicKey - ASCII-armored PGP public key.
   *   Obtain from generateKeyPair or key servers.
   * @returns ASCII-armored encrypted message
   *
   * @example
   * ```typescript
   * const encrypted = await adapter.pgp.encrypt(
   *   'secret message',
   *   armoredPublicKey
   * );
   * ```
   */
  encrypt(data: string, publicKey: string): Promise<string>;

  /**
   * Decrypts PGP-encrypted data.
   *
   * @param encryptedData - ASCII-armored encrypted message.
   *   Must be encrypted with corresponding public key.
   * @param privateKey - ASCII-armored PGP private key.
   *   May be passphrase-protected.
   * @returns The decrypted plaintext string
   *
   * @throws {Error} If decryption fails or key is invalid
   */
  decrypt(encryptedData: string, privateKey: string): Promise<string>;

  /**
   * Generates a new PGP key pair.
   *
   * @param options - Key generation configuration
   * @param options.name - Identity name.
   *   Defaults to 'Vana User'.
   * @param options.email - Identity email.
   *   Defaults to 'user@vana.com'.
   * @param options.passphrase - Private key passphrase.
   *   If omitted, private key is unprotected.
   * @returns ASCII-armored public and private keys
   *
   * @example
   * ```typescript
   * const { publicKey, privateKey } = await adapter.pgp.generateKeyPair({
   *   name: 'Alice Smith',
   *   email: 'alice@example.com',
   *   passphrase: 'secure-passphrase'
   * });
   * ```
   */
  generateKeyPair(options?: {
    name?: string;
    email?: string;
    passphrase?: string;
  }): Promise<{ publicKey: string; privateKey: string }>;
}

/**
 * Provides platform-specific HTTP operations.
 *
 * @remarks
 * Wraps the fetch API to ensure consistent behavior across
 * Node.js and browser environments.
 *
 * @category Platform
 */
export interface VanaHttpAdapter {
  /**
   * Performs an HTTP request.
   *
   * @param url - The URL to request.
   *   Must be a valid HTTP/HTTPS URL.
   * @param options - Standard fetch RequestInit options.
   *   See MDN documentation for details.
   * @returns Standard fetch Response object
   *
   * @example
   * ```typescript
   * const response = await adapter.http.fetch(
   *   'https://api.vana.com/data',
   *   { method: 'GET', headers: { 'Authorization': 'Bearer token' } }
   * );
   * ```
   */
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

/**
 * Provides platform-specific caching operations.
 *
 * @remarks
 * Implements simple key-value caching with platform-appropriate storage.
 * Node.js uses in-memory Map with TTL, browser uses sessionStorage for
 * security (cleared on tab close).
 *
 * @category Platform
 */
export interface VanaCacheAdapter {
  /**
   * Retrieves a cached value.
   *
   * @param key - The cache key.
   *   Should be unique per operation.
   * @returns The cached value or null if not found/expired
   *
   * @example
   * ```typescript
   * const cachedSignature = adapter.cache.get('sig_0x123...');
   * if (cachedSignature) {
   *   return cachedSignature;
   * }
   * ```
   */
  get(key: string): string | null;

  /**
   * Stores a value in the cache.
   *
   * @param key - The cache key.
   *   Should be unique and descriptive.
   * @param value - The value to cache.
   *   Typically signatures or computed results.
   *
   * @remarks
   * Node.js: Cached for 2 hours with TTL
   * Browser: Cached until tab closes (sessionStorage)
   */
  set(key: string, value: string): void;

  /**
   * Removes a cached value.
   *
   * @param key - The cache key to remove.
   *   Use when cached data becomes invalid.
   */
  delete(key: string): void;

  /**
   * Clears all cached values.
   *
   * @remarks
   * Use with caution as this removes all performance optimizations.
   * Browser implementation only clears Vana-prefixed keys.
   */
  clear(): void;
}

/**
 * Aggregates all platform-specific adapters into a single interface.
 *
 * @remarks
 * This is the main interface for platform abstraction. Implementations
 * must provide all required adapters while maintaining consistent behavior
 * and data formats across platforms.
 *
 * **Implementation Guidelines:**
 * 1. All methods must maintain consistent behavior across platforms
 * 2. Error types and messages should be unified
 * 3. Data formats (encoding, serialization) must be identical
 * 4. Performance characteristics can vary but API must be consistent
 *
 * @example
 * ```typescript
 * // Custom implementation for specialized environment
 * class EdgePlatformAdapter implements VanaPlatformAdapter {
 *   crypto = new EdgeCryptoAdapter();
 *   pgp = new EdgePGPAdapter();
 *   http = new EdgeHttpAdapter();
 *   cache = new EdgeCacheAdapter();
 *   platform = 'browser' as const; // Edge is browser-like
 * }
 *
 * // Use with SDK
 * const client = createClient({
 *   platformAdapter: new EdgePlatformAdapter()
 * });
 * ```
 *
 * @category Platform
 */
export interface VanaPlatformAdapter {
  /**
   * Provides cryptographic operations.
   *
   * @remarks
   * Handles ECIES, wallet encryption, and password-based encryption.
   */
  crypto: VanaCryptoAdapter;

  /**
   * Provides PGP operations.
   *
   * @remarks
   * Handles PGP encryption, decryption, and key generation.
   */
  pgp: VanaPGPAdapter;

  /**
   * Provides HTTP operations.
   *
   * @remarks
   * Wraps fetch API for consistent cross-platform behavior.
   */
  http: VanaHttpAdapter;

  /**
   * Provides caching operations.
   *
   * @remarks
   * Platform-appropriate storage for temporary data.
   */
  cache: VanaCacheAdapter;

  /**
   * Identifies the platform type.
   *
   * @remarks
   * Used for debugging, telemetry, and conditional logic.
   * Must be 'node' or 'browser'.
   */
  readonly platform: PlatformType;
}
