/**
 * Provides browser-specific implementations of platform abstraction interfaces.
 *
 * @remarks
 * This module implements all platform-specific operations for browser environments,
 * using native Web APIs and browser-compatible libraries. It avoids Node.js-specific
 * dependencies like Buffer, using Uint8Array and viem utilities instead. Supports
 * both standard eccrypto and custom ECIES implementations based on feature flags.
 *
 * @example
 * ```typescript
 * // Use the browser platform adapter
 * import { BrowserPlatformAdapter } from '@vana-sdk/platform/browser';
 *
 * const adapter = new BrowserPlatformAdapter();
 *
 * // Encrypt data with public key
 * const encrypted = await adapter.crypto.encryptWithPublicKey(
 *   'sensitive data',
 *   '0x04...' // Public key hex
 * );
 *
 * // Use sessionStorage-backed cache
 * adapter.cache.set('temp_key', 'cached_value');
 * ```
 *
 * @category Platform
 * @module platform/browser
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
import { lazyImport } from "../utils/lazy-import";
import { WalletKeyEncryptionService } from "../crypto/services/WalletKeyEncryptionService";
import { parseEncryptedDataBuffer } from "../utils/crypto-utils";
import { toHex, fromHex, stringToBytes, bytesToString, concat } from "viem";
import * as secp256k1 from "@noble/secp256k1";
import { features } from "../config/features";

// Import browser ECIES provider
import { BrowserECIESUint8Provider } from "../crypto/ecies/browser";

// Lazy-loaded dependencies to avoid Turbopack TDZ issues
const getOpenPGP = lazyImport(() => import("openpgp"));
const getEccryptoJS = lazyImport(() => import("eccrypto-js"));

/**
 * Implements cryptographic operations for browser environments.
 *
 * @remarks
 * Provides ECIES encryption/decryption, key generation, and password-based
 * encryption using either eccrypto-js or a custom ECIES implementation.
 * Uses Uint8Array and viem utilities for browser compatibility.
 *
 * @internal
 */
class BrowserCryptoAdapter implements VanaCryptoAdapter {
  // Initialize both providers - only one will be used based on feature flag
  private customEciesProvider = new BrowserECIESUint8Provider();
  private customWalletService = new WalletKeyEncryptionService({
    eciesProvider: this.customEciesProvider,
  });

  /**
   * Encrypts data using ECIES with a public key.
   *
   * @param data - The plaintext string to encrypt.
   *   Typically user data or sensitive information.
   * @param publicKeyHex - The recipient's public key in hex format.
   *   Can include or omit the '0x' prefix.
   * @returns Encrypted data as a hex string without '0x' prefix
   *
   * @throws {Error} If encryption fails or public key is invalid
   */
  async encryptWithPublicKey(
    data: string,
    publicKeyHex: string,
  ): Promise<string> {
    try {
      if (features.useCustomECIES) {
        // Use custom ECIES implementation
        const prefixedHex = publicKeyHex.startsWith("0x")
          ? publicKeyHex
          : `0x${publicKeyHex}`;
        const publicKeyBytes = fromHex(prefixedHex as `0x${string}`, "bytes");

        // Encrypt data using ECIES
        const encrypted = await this.customEciesProvider.encrypt(
          publicKeyBytes,
          stringToBytes(data),
        );

        // Concatenate all components and return as hex string
        const result = concat([
          encrypted.iv,
          encrypted.ephemPublicKey,
          encrypted.ciphertext,
          encrypted.mac,
        ]);

        return toHex(result).slice(2); // Remove '0x' prefix for backward compatibility
      } else {
        // Use eccrypto-js (default)
        const eccryptojs = await getEccryptoJS();

        // Remove 0x prefix if present
        const cleanKey = publicKeyHex.startsWith("0x")
          ? publicKeyHex.slice(2)
          : publicKeyHex;
        const publicKeyBytes = Buffer.from(cleanKey, "hex");

        // Ensure public key is in uncompressed format (65 bytes with 0x04 prefix)
        // If it's 64 bytes, add the 0x04 prefix; if already 65 bytes, use as-is
        const publicKeyBuffer =
          publicKeyBytes.length === 64
            ? Buffer.concat([Buffer.from([4]), publicKeyBytes])
            : publicKeyBytes;

        const message = Buffer.from(data, "utf8");

        const encrypted = await eccryptojs.encrypt(publicKeyBuffer, message);

        // Concatenate all components and return as hex string
        const result = Buffer.concat([
          encrypted.iv,
          encrypted.ephemPublicKey,
          encrypted.ciphertext,
          encrypted.mac,
        ]);

        return result.toString("hex");
      }
    } catch (error) {
      throw wrapCryptoError("encryptWithPublicKey", error);
    }
  }

  /**
   * Decrypts ECIES-encrypted data using a private key.
   *
   * @param encryptedData - Hex string containing encrypted data.
   *   Can include or omit the '0x' prefix.
   * @param privateKeyHex - The private key in hex format.
   *   Must correspond to the public key used for encryption.
   * @returns The decrypted plaintext string
   *
   * @throws {Error} If decryption fails or MAC verification fails
   */
  async decryptWithPrivateKey(
    encryptedData: string,
    privateKeyHex: string,
  ): Promise<string> {
    try {
      if (features.useCustomECIES) {
        // Use custom ECIES implementation
        const encryptedHex = encryptedData.startsWith("0x")
          ? encryptedData
          : `0x${encryptedData}`;
        const privateHex = privateKeyHex.startsWith("0x")
          ? privateKeyHex
          : `0x${privateKeyHex}`;
        const encryptedBytes = fromHex(encryptedHex as `0x${string}`, "bytes");
        const privateKeyBytes = fromHex(privateHex as `0x${string}`, "bytes");

        // Parse the encrypted data into components
        const encrypted = parseEncryptedDataBuffer(encryptedBytes);

        // Decrypt using ECIES
        const decrypted = await this.customEciesProvider.decrypt(
          privateKeyBytes,
          encrypted,
        );

        return bytesToString(decrypted);
      } else {
        // Use eccrypto-js (default)
        const eccryptojs = await getEccryptoJS();
        const privateKey = Buffer.from(privateKeyHex, "hex");
        const encryptedBuffer = Buffer.from(encryptedData, "hex");

        // Parse the encrypted data
        const { iv, ephemPublicKey, ciphertext, mac } =
          parseEncryptedDataBuffer(encryptedBuffer);

        const decrypted = await eccryptojs.decrypt(privateKey, {
          iv: Buffer.from(iv),
          ephemPublicKey: Buffer.from(ephemPublicKey),
          ciphertext: Buffer.from(ciphertext),
          mac: Buffer.from(mac),
        });

        return decrypted.toString("utf8");
      }
    } catch (error) {
      throw wrapCryptoError("decryptWithPrivateKey", error);
    }
  }

  /**
   * Encrypts data using a wallet's public key.
   *
   * @param data - The plaintext string to encrypt.
   *   Typically permission data or DLP metadata.
   * @param publicKey - The wallet's public key.
   *   Automatically handles compressed/uncompressed formats.
   * @returns Encrypted data as a hex string
   *
   * @throws {Error} If encryption fails or key processing fails
   */
  async encryptWithWalletPublicKey(
    data: string,
    publicKey: string,
  ): Promise<string> {
    try {
      if (features.useCustomECIES) {
        // Use custom ECIES implementation via WalletKeyEncryptionService
        return await this.customWalletService.encryptWithWalletPublicKey(
          data,
          publicKey,
        );
      } else {
        // Use eccrypto-js directly for wallet encryption
        const eccryptojs = await getEccryptoJS();

        // Remove 0x prefix if present
        const cleanKey = publicKey.startsWith("0x")
          ? publicKey.slice(2)
          : publicKey;
        const publicKeyBytes = Buffer.from(cleanKey, "hex");

        // Ensure public key is in uncompressed format (65 bytes with 0x04 prefix)
        // If it's 64 bytes, add the 0x04 prefix; if already 65 bytes, use as-is
        const publicKeyBuffer =
          publicKeyBytes.length === 64
            ? Buffer.concat([Buffer.from([4]), publicKeyBytes])
            : publicKeyBytes;

        const message = Buffer.from(data, "utf8");

        const encrypted = await eccryptojs.encrypt(publicKeyBuffer, message);

        // Concatenate all components and return as hex string
        const result = Buffer.concat([
          encrypted.iv,
          encrypted.ephemPublicKey,
          encrypted.ciphertext,
          encrypted.mac,
        ]);

        return result.toString("hex");
      }
    } catch (error) {
      throw wrapCryptoError("encryptWithWalletPublicKey", error);
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
      if (features.useCustomECIES) {
        // Use custom ECIES implementation via WalletKeyEncryptionService
        return await this.customWalletService.decryptWithWalletPrivateKey(
          encryptedData,
          privateKey,
        );
      } else {
        // Use eccrypto-js directly for wallet decryption
        const eccryptojs = await getEccryptoJS();
        const privateKeyBuffer = Buffer.from(privateKey, "hex");
        const encryptedBuffer = Buffer.from(encryptedData, "hex");

        // Parse the encrypted data
        const { iv, ephemPublicKey, ciphertext, mac } =
          parseEncryptedDataBuffer(encryptedBuffer);

        const decrypted = await eccryptojs.decrypt(privateKeyBuffer, {
          iv: Buffer.from(iv),
          ephemPublicKey: Buffer.from(ephemPublicKey),
          ciphertext: Buffer.from(ciphertext),
          mac: Buffer.from(mac),
        });

        return decrypted.toString("utf8");
      }
    } catch (error) {
      throw wrapCryptoError("decryptWithWalletPrivateKey", error);
    }
  }

  /**
   * Generates a new secp256k1 key pair for ECIES operations.
   *
   * @returns Object containing hex-encoded public and private keys
   * @returns returns.privateKey - Private key in hex format without '0x'
   * @returns returns.publicKey - Compressed public key in hex format without '0x'
   *
   * @throws {Error} If key generation fails
   */
  async generateKeyPair(): Promise<{
    privateKey: string;
    publicKey: string;
  }> {
    try {
      if (features.useCustomECIES) {
        // Use custom implementation with @noble/secp256k1
        // Generate random private key
        const privateKeyBytes = secp256k1.utils.randomPrivateKey();

        // Generate public key (compressed for consistency with Node implementation)
        const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);

        return {
          privateKey: toHex(privateKeyBytes).slice(2),
          publicKey: toHex(publicKeyBytes).slice(2),
        };
      } else {
        // Use eccrypto-js (default)
        const eccryptojs = await getEccryptoJS();
        const privateKey = eccryptojs.generatePrivate();
        const publicKey = eccryptojs.getPublic(privateKey);

        return {
          privateKey: privateKey.toString("hex"),
          publicKey: publicKey.toString("hex"),
        };
      }
    } catch (error) {
      throw wrapCryptoError("generateKeyPair", error);
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
   * Uses OpenPGP for password-based encryption with automatic
   * salt generation for security.
   *
   * @throws {Error} If encryption fails
   */
  async encryptWithPassword(
    data: Uint8Array,
    password: string,
  ): Promise<Uint8Array> {
    try {
      const openpgp = await getOpenPGP();

      // Create a message from the data
      const message = await openpgp.createMessage({ binary: data });

      // Encrypt with password
      const encrypted = await openpgp.encrypt({
        message,
        passwords: [password],
        format: "binary",
      });

      return new Uint8Array(encrypted as ArrayBuffer);
    } catch (error) {
      throw wrapCryptoError("encryptWithPassword", error);
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

      // Read the encrypted message
      const message = await openpgp.readMessage({
        binaryMessage: encryptedData,
      });

      // Decrypt with password
      const { data } = await openpgp.decrypt({
        message,
        passwords: [password],
        format: "binary",
      });

      return new Uint8Array(data as ArrayBuffer);
    } catch (error) {
      throw wrapCryptoError("decryptWithPassword", error);
    }
  }
}

/**
 * Implements PGP operations for browser environments.
 *
 * @remarks
 * Provides PGP encryption, decryption, and key generation using the OpenPGP.js
 * library with browser-optimized configuration.
 *
 * @internal
 */
class BrowserPGPAdapter implements VanaPGPAdapter {
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
      throw new Error(`PGP encryption failed: ${String(error)}`);
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
      throw new Error(`PGP decryption failed: ${String(error)}`);
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
 * Implements HTTP operations for browser environments.
 *
 * @remarks
 * Uses the native Fetch API available in all modern browsers.
 *
 * @internal
 */
class BrowserHttpAdapter implements VanaHttpAdapter {
  /**
   * Performs an HTTP request using the Fetch API.
   *
   * @param url - The URL to fetch.
   *   Must be a valid HTTP/HTTPS URL.
   * @param options - Standard fetch options.
   *   See MDN fetch documentation for details.
   * @returns Standard fetch Response object
   */
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, options);
  }
}

/**
 * Implements secure caching for browser environments.
 *
 * @remarks
 * Uses sessionStorage for temporary caching that's automatically cleared
 * when the browser tab closes. This provides better security for sensitive
 * data like signatures compared to localStorage. All keys are prefixed to
 * avoid conflicts with other applications.
 *
 * @internal
 */
class BrowserCacheAdapter implements VanaCacheAdapter {
  private readonly prefix = "vana_cache_";

  /**
   * Retrieves a cached value by key.
   *
   * @param key - The cache key to look up.
   *   Automatically prefixed to avoid conflicts.
   * @returns The cached value or null if not found
   */
  get(key: string): string | null {
    try {
      if (typeof sessionStorage === "undefined") {
        return null;
      }
      return sessionStorage.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }

  /**
   * Stores a value in sessionStorage.
   *
   * @param key - The cache key.
   *   Automatically prefixed with 'vana_cache_'.
   * @param value - The value to cache.
   *   Will be cleared when tab closes.
   */
  set(key: string, value: string): void {
    try {
      if (typeof sessionStorage === "undefined") {
        return;
      }
      sessionStorage.setItem(this.prefix + key, value);
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }

  /**
   * Removes a specific key from the cache.
   *
   * @param key - The cache key to remove.
   *   Only removes the prefixed key.
   */
  delete(key: string): void {
    try {
      if (typeof sessionStorage === "undefined") {
        return;
      }
      sessionStorage.removeItem(this.prefix + key);
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Clears all Vana-prefixed cache entries.
   *
   * @remarks
   * Only removes entries with the 'vana_cache_' prefix,
   * preserving other sessionStorage data.
   */
  clear(): void {
    try {
      if (typeof sessionStorage === "undefined") {
        return;
      }
      // Only clear our prefixed keys to avoid affecting other data
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => {
        sessionStorage.removeItem(key);
      });
    } catch {
      // Ignore storage errors
    }
  }
}

/**
 * Provides complete platform abstraction for browser environments.
 *
 * @remarks
 * This adapter aggregates all browser-specific implementations of platform
 * operations. It uses native Web APIs where possible and browser-compatible
 * libraries for crypto and PGP operations. The adapter automatically selects
 * appropriate cryptographic implementations based on feature flags.
 *
 * @example
 * ```typescript
 * // Create a browser adapter instance
 * const adapter = new BrowserPlatformAdapter();
 *
 * // All platform operations are available
 * const encrypted = await adapter.crypto.encryptWithPublicKey(
 *   'secret',
 *   publicKey
 * );
 *
 * const response = await adapter.http.fetch('/api/data');
 *
 * adapter.cache.set('key', 'value'); // Uses sessionStorage
 * ```
 *
 * @category Platform
 */
export class BrowserPlatformAdapter implements VanaPlatformAdapter {
  public readonly crypto = new BrowserCryptoAdapter();
  public readonly pgp = new BrowserPGPAdapter();
  public readonly http = new BrowserHttpAdapter();
  public readonly cache = new BrowserCacheAdapter();
  public readonly platform = "browser" as const;
}
