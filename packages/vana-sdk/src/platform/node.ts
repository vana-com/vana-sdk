/**
 * Provides Node.js-specific implementations of platform abstraction interfaces.
 *
 * @remarks
 * This module implements all platform-specific operations for Node.js environments,
 * including cryptography, PGP operations, HTTP requests, and caching. It dynamically
 * imports dependencies to avoid Turbopack TDZ issues and uses a custom ECIES
 * implementation with native secp256k1 for optimal performance.
 *
 * WARNING: Dependencies that access globals during init MUST be dynamically imported
 * to support Turbopack. See: https://github.com/vercel/next.js/issues/82632
 *
 * @example
 * ```typescript
 * // Use the Node.js platform adapter
 * import { nodePlatformAdapter} from '@vana-sdk/platform/node';
 *
 * // Encrypt data with public key
 * const encrypted = await nodePlatformAdapter.crypto.encryptWithPublicKey(
 *   'sensitive data',
 *   '0x04...' // Public key hex
 * );
 *
 * // Generate PGP key pair
 * const { publicKey, privateKey } = await nodePlatformAdapter.pgp.generateKeyPair({
 *   name: 'Data Owner',
 *   email: 'owner@example.com'
 * });
 * ```
 *
 * @category Platform
 * @module platform/node
 */

import type {
  VanaPlatformAdapter,
  VanaCryptoAdapter,
  VanaPGPAdapter,
  VanaHttpAdapter,
  VanaCacheAdapter,
} from "./interface";
import { getPGPKeyGenParams } from "./shared/pgp-utils";
import { wrapCryptoError } from "./shared/error-utils";
import { streamToUint8Array } from "./shared/stream-utils";
import { lazyImport } from "../utils/lazy-import";
import { WalletKeyEncryptionService } from "../crypto/services/WalletKeyEncryptionService";
import {
  processWalletPrivateKey,
  parseEncryptedDataBuffer,
  processWalletPublicKey,
} from "../utils/crypto-utils";

// Lazy-loaded dependencies to avoid Turbopack TDZ issues
const getOpenPGP = lazyImport(() => import("openpgp"));

// Import ECIES implementation
import { NodeECIESUint8Provider } from "../crypto/ecies/node";
import { ECIESError } from "../crypto/ecies/interface";
import type { ECIESEncrypted } from "../crypto/ecies";
import { randomBytes } from "crypto";
import secp256k1Import from "secp256k1";

// Type definition for secp256k1 module
interface Secp256k1Module {
  privateKeyVerify(privateKey: Buffer): boolean;
  publicKeyCreate(privateKey: Buffer, compressed: boolean): Buffer;
  publicKeyVerify(publicKey: Buffer): boolean;
  publicKeyConvert(publicKey: Buffer, compressed: boolean): Buffer;
  ecdh(
    publicKey: Buffer,
    privateKey: Buffer,
    options: {
      hashfn: (x: Uint8Array, y: Uint8Array, output?: Uint8Array) => Uint8Array;
    },
    output: Buffer,
  ): Buffer;
}

/**
 * Implements cryptographic operations for Node.js environments.
 *
 * @remarks
 * Provides ECIES encryption/decryption, key generation, and password-based
 * encryption using a custom ECIES implementation with native secp256k1.
 *
 * @internal
 */
class NodeCryptoAdapter implements VanaCryptoAdapter {
  private eciesProvider = new NodeECIESUint8Provider();
  private walletService = new WalletKeyEncryptionService({
    eciesProvider: this.eciesProvider,
  });

  /**
   * Encrypts data using ECIES with a public key.
   *
   * @param data - The plaintext string to encrypt.
   *   Typically user data or sensitive information.
   * @param publicKeyHex - The recipient's public key in hex format.
   *   Obtain from key generation or user profile.
   * @returns Encrypted data as a hex string containing IV, ephemeral key, ciphertext, and MAC
   *
   * @throws {Error} If encryption fails or public key is invalid
   */
  async encryptWithPublicKey(
    data: string,
    publicKeyHex: string,
  ): Promise<string> {
    try {
      // Process public key to handle 0x prefix and convert to Buffer
      const publicKeyBytes = processWalletPublicKey(publicKeyHex);
      const publicKey = Buffer.from(publicKeyBytes);
      const message = Buffer.from(data, "utf8");

      const encrypted = await this.eciesProvider.encrypt(publicKey, message);

      // Concatenate all components and return as hex string for API consistency
      const result = Buffer.concat([
        encrypted.iv,
        encrypted.ephemPublicKey,
        encrypted.ciphertext,
        encrypted.mac,
      ]);

      return result.toString("hex");
    } catch (error) {
      if (error instanceof ECIESError) {
        throw error;
      }
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Decrypts ECIES-encrypted data using a private key.
   *
   * @param encryptedData - Hex string containing encrypted data.
   *   Must include IV, ephemeral public key, ciphertext, and MAC.
   * @param privateKeyHex - The private key in hex format.
   *   Must correspond to the public key used for encryption.
   * @returns The decrypted plaintext string
   *
   * @throws {Error} If decryption fails or MAC verification fails
   * @throws {ECIESError} If using custom ECIES and specific error occurs
   */
  async decryptWithPrivateKey(
    encryptedData: string,
    privateKeyHex: string,
  ): Promise<string> {
    try {
      const privateKeyBuffer = processWalletPrivateKey(privateKeyHex);
      // Handle 0x prefix in encrypted data (e.g., from viem's toHex)
      const encryptedHex = encryptedData.startsWith("0x")
        ? encryptedData.slice(2)
        : encryptedData;
      const encryptedBuffer = Buffer.from(encryptedHex, "hex");
      const { iv, ephemPublicKey, ciphertext, mac } =
        parseEncryptedDataBuffer(encryptedBuffer);

      // Reconstruct the encrypted data structure
      const encryptedObj: ECIESEncrypted = {
        iv,
        ephemPublicKey,
        ciphertext,
        mac,
      };

      const decrypted = await this.eciesProvider.decrypt(
        privateKeyBuffer,
        encryptedObj,
      );
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      if (error instanceof ECIESError) {
        throw error;
      }
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generates a new secp256k1 key pair for ECIES operations.
   *
   * @returns Object containing hex-encoded public and private keys
   * @returns returns.publicKey - Compressed public key in hex format
   * @returns returns.privateKey - Private key in hex format
   *
   * @throws {Error} If key generation fails
   */
  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    try {
      const secp256k1 = secp256k1Import as unknown as Secp256k1Module;

      // Generate private key
      let privateKey: Buffer;
      do {
        privateKey = randomBytes(32);
      } while (!secp256k1.privateKeyVerify(privateKey));

      // Get compressed public key
      const publicKey = Buffer.from(
        secp256k1.publicKeyCreate(privateKey, true),
      );

      return {
        privateKey: privateKey.toString("hex"),
        publicKey: publicKey.toString("hex"),
      };
    } catch (error) {
      throw wrapCryptoError("key generation", error);
    }
  }

  /**
   * Encrypts data using a wallet's public key.
   *
   * @param data - The plaintext string to encrypt.
   *   Typically permission data or DLP metadata.
   * @param publicKey - The wallet's public key (with or without 0x prefix).
   *   Obtain from wallet connection or user profile.
   * @returns Encrypted data as a hex string
   *
   * @throws {Error} If encryption fails or key processing fails
   */
  async encryptWithWalletPublicKey(
    data: string,
    publicKey: string,
  ): Promise<string> {
    try {
      return await this.walletService.encryptWithWalletPublicKey(
        data,
        publicKey,
      );
    } catch (error) {
      throw wrapCryptoError("encrypt with wallet public key", error);
    }
  }

  /**
   * Decrypts data using a wallet's private key.
   *
   * @param encryptedData - Hex string containing encrypted data.
   *   Must be encrypted with corresponding wallet public key.
   * @param privateKey - The wallet's private key.
   *   Obtain from wallet connection (handle with care).
   * @returns The decrypted plaintext string
   *
   * @throws {Error} If decryption fails or key is invalid
   */
  async decryptWithWalletPrivateKey(
    encryptedData: string,
    privateKey: string,
  ): Promise<string> {
    try {
      return await this.walletService.decryptWithWalletPrivateKey(
        encryptedData,
        privateKey,
      );
    } catch (error) {
      throw wrapCryptoError("decrypt with wallet private key", error);
    }
  }

  /**
   * Encrypts binary data using password-based encryption.
   *
   * @param data - Binary data to encrypt.
   *   Typically file contents or serialized objects.
   * @param password - Password for encryption.
   *   Often derived from wallet signatures.
   * @returns Encrypted data as Uint8Array
   *
   * @remarks
   * Uses OpenPGP for password-based encryption. Note that this is not
   * deterministic due to OpenPGP's random salt generation.
   *
   * @throws {Error} If encryption fails
   */
  async encryptWithPassword(
    data: Uint8Array,
    password: string,
  ): Promise<Uint8Array> {
    try {
      const openpgp = await getOpenPGP();
      const message = await openpgp.createMessage({
        binary: data,
      });

      // Use password-based encryption with wallet signature as password
      // Note: For deterministic encryption, we would need to control the salt
      // This implementation is secure but not deterministic due to OpenPGP's design
      const encrypted = await openpgp.encrypt({
        message,
        passwords: [password],
        format: "binary",
      });

      // In Node.js, the encrypted result is already a Uint8Array
      if (encrypted instanceof Uint8Array) {
        return encrypted;
      }

      // If it's a stream (should not happen with format: "binary"), read it
      if (
        encrypted &&
        typeof encrypted === "object" &&
        "getReader" in encrypted
      ) {
        return await streamToUint8Array(
          encrypted as ReadableStream<Uint8Array>,
        );
      }

      throw new Error("Unexpected encrypted data format");
    } catch (error) {
      throw wrapCryptoError("encrypt with password", error);
    }
  }

  /**
   * Decrypts password-encrypted binary data.
   *
   * @param encryptedData - Password-encrypted data as Uint8Array.
   *   Must be encrypted with the same password.
   * @param password - Password for decryption.
   *   Must match the encryption password.
   * @returns Decrypted data as Uint8Array
   *
   * @throws {Error} If decryption fails or password is incorrect
   */
  async decryptWithPassword(
    encryptedData: Uint8Array,
    password: string,
  ): Promise<Uint8Array> {
    try {
      const openpgp = await getOpenPGP();
      const message = await openpgp.readMessage({
        binaryMessage: encryptedData,
      });

      // Use password-based decryption with wallet signature as password
      const { data: decrypted } = await openpgp.decrypt({
        message,
        passwords: [password],
        format: "binary",
      });

      // Convert decrypted data back to Uint8Array
      return new Uint8Array(decrypted as ArrayBuffer);
    } catch (error) {
      throw wrapCryptoError("decrypt with password", error);
    }
  }
}

/**
 * Implements PGP operations for Node.js environments.
 *
 * @remarks
 * Provides PGP encryption, decryption, and key generation using the OpenPGP.js
 * library with Node.js-specific optimizations like zlib compression.
 *
 * @internal
 */
class NodePGPAdapter implements VanaPGPAdapter {
  /**
   * Encrypts data using PGP public key encryption.
   *
   * @param data - The plaintext string to encrypt.
   *   Typically messages or structured data.
   * @param publicKeyArmored - ASCII-armored PGP public key.
   *   Obtain from PGP key generation or key servers.
   * @returns ASCII-armored encrypted message
   *
   * @throws {Error} If encryption fails or public key is invalid
   */
  async encrypt(data: string, publicKeyArmored: string): Promise<string> {
    try {
      const openpgp = await getOpenPGP();
      const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });

      const encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: data }),
        encryptionKeys: publicKey,
        config: {
          preferredCompressionAlgorithm: openpgp.enums.compression.zlib,
        },
      });

      return encrypted as string;
    } catch (error) {
      throw wrapCryptoError("PGP encryption", error);
    }
  }

  /**
   * Decrypts PGP-encrypted data using a private key.
   *
   * @param encryptedData - ASCII-armored encrypted message.
   *   Must be encrypted with corresponding public key.
   * @param privateKeyArmored - ASCII-armored PGP private key.
   *   Must correspond to the public key used for encryption.
   * @returns The decrypted plaintext string
   *
   * @throws {Error} If decryption fails or private key is invalid
   */
  async decrypt(
    encryptedData: string,
    privateKeyArmored: string,
  ): Promise<string> {
    try {
      const openpgp = await getOpenPGP();
      const privateKey = await openpgp.readPrivateKey({
        armoredKey: privateKeyArmored,
      });
      const message = await openpgp.readMessage({
        armoredMessage: encryptedData,
      });

      const { data: decrypted } = await openpgp.decrypt({
        message,
        decryptionKeys: privateKey,
      });

      return decrypted as string;
    } catch (error) {
      throw wrapCryptoError("PGP decryption", error);
    }
  }

  /**
   * Generates a new PGP key pair.
   *
   * @param options - Key generation options
   * @param options.name - Name for the key identity.
   *   Defaults to 'Vana User'.
   * @param options.email - Email for the key identity.
   *   Defaults to 'user@vana.com'.
   * @param options.passphrase - Passphrase to protect the private key.
   *   If not provided, key is unprotected.
   * @returns ASCII-armored public and private keys
   *
   * @throws {Error} If key generation fails
   */
  async generateKeyPair(options?: {
    name?: string;
    email?: string;
    passphrase?: string;
  }): Promise<{ publicKey: string; privateKey: string }> {
    try {
      const openpgp = await getOpenPGP();
      // Use shared utility to get standardized parameters
      const keyGenParams = getPGPKeyGenParams(options);

      const { privateKey, publicKey } = await openpgp.generateKey(keyGenParams);

      return { publicKey, privateKey };
    } catch (error) {
      throw wrapCryptoError("PGP key generation", error);
    }
  }
}

/**
 * Implements HTTP operations for Node.js environments.
 *
 * @remarks
 * Provides fetch functionality using the global fetch if available,
 * suitable for Node.js 18+ or environments with fetch polyfills.
 *
 * @internal
 */
class NodeHttpAdapter implements VanaHttpAdapter {
  /**
   * Performs an HTTP request using fetch.
   *
   * @param url - The URL to fetch.
   *   Must be a valid HTTP/HTTPS URL.
   * @param options - Standard fetch options.
   *   See MDN fetch documentation for details.
   * @returns Standard fetch Response object
   *
   * @throws {Error} If fetch is not available in the environment
   */
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    if (typeof globalThis.fetch !== "undefined") {
      return globalThis.fetch(url, options);
    }

    throw new Error("No fetch implementation available in Node.js environment");
  }
}

/**
 * Implements in-memory caching for Node.js environments.
 *
 * @remarks
 * Provides a simple TTL-based cache using a Map. Cached values expire
 * after 2 hours by default. This cache is not persistent and will be
 * cleared when the process exits.
 *
 * @internal
 */
class NodeCacheAdapter implements VanaCacheAdapter {
  private cache = new Map<string, { value: string; expires: number }>();
  private readonly defaultTtl = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

  /**
   * Retrieves a cached value by key.
   *
   * @param key - The cache key to look up.
   *   Typically derived from operation parameters.
   * @returns The cached value or null if not found/expired
   */
  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Stores a value in the cache with TTL.
   *
   * @param key - The cache key.
   *   Should be unique per operation.
   * @param value - The value to cache.
   *   Typically serialized data or signatures.
   */
  set(key: string, value: string): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + this.defaultTtl,
    });
  }

  /**
   * Removes a specific key from the cache.
   *
   * @param key - The cache key to remove.
   *   Use when cached data becomes invalid.
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clears all cached values.
   *
   * @remarks
   * Use with caution as this removes all cached signatures
   * and other performance optimizations.
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Provides complete platform abstraction for Node.js environments.
 *
 * @remarks
 * This adapter aggregates all Node.js-specific implementations of platform
 * operations using a custom ECIES implementation with native secp256k1 for
 * optimal performance and provides consistent APIs across all operations.
 *
 * @example
 * ```typescript
 * // Create a custom Node.js adapter instance
 * const adapter = new NodePlatformAdapter();
 *
 * // Use for encryption
 * const encrypted = await adapter.crypto.encryptWithPublicKey(
 *   'secret data',
 *   publicKeyHex
 * );
 *
 * // Use for caching
 * adapter.cache.set('signature_key', signatureValue);
 * ```
 *
 * @category Platform
 */
export class NodePlatformAdapter implements VanaPlatformAdapter {
  crypto: VanaCryptoAdapter;
  pgp: VanaPGPAdapter;
  http: VanaHttpAdapter;
  cache: VanaCacheAdapter;
  platform: "node" = "node" as const;

  constructor() {
    this.crypto = new NodeCryptoAdapter();
    this.pgp = new NodePGPAdapter();
    this.http = new NodeHttpAdapter();
    this.cache = new NodeCacheAdapter();
  }
}

/**
 * Pre-configured Node.js platform adapter instance.
 *
 * @remarks
 * This singleton instance is the default adapter used by the SDK when
 * running in Node.js environments. It's automatically selected based on
 * platform detection.
 *
 * @example
 * ```typescript
 * import { nodePlatformAdapter } from '@vana-sdk/platform/node';
 *
 * // Use directly for platform operations
 * const keys = await nodePlatformAdapter.crypto.generateKeyPair();
 * ```
 *
 * @category Platform
 */
export const nodePlatformAdapter: VanaPlatformAdapter =
  new NodePlatformAdapter();
