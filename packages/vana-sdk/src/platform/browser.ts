/**
 * Browser implementation of the Vana Platform Adapter
 *
 * This implementation uses browser-compatible libraries and configurations
 * to provide crypto, PGP, and HTTP functionality without Node.js dependencies.
 *
 * WARNING: Dependencies that access globals during init
 * MUST be dynamically imported to support Turbopack.
 * See: https://github.com/vercel/next.js/issues/82632
 */

import type {
  VanaPlatformAdapter,
  VanaCryptoAdapter,
  VanaPGPAdapter,
  VanaHttpAdapter,
  VanaCacheAdapter,
} from "./interface";
import {
  processWalletPublicKey,
  processWalletPrivateKey,
  parseEncryptedDataBuffer,
} from "./shared/crypto-utils";
import { getPGPKeyGenParams } from "./shared/pgp-utils";
import { wrapCryptoError } from "./shared/error-utils";
import { lazyImport } from "../utils/lazy-import";

// Import browser ECIES provider
import { BrowserECIESProvider } from "../crypto/ecies/browser";
import type { ECIESEncrypted } from "../crypto/ecies";

// Lazy-loaded dependencies to avoid Turbopack TDZ issues
const getOpenPGP = lazyImport(() => import("openpgp"));

/**
 * Browser implementation of crypto operations using @noble/secp256k1
 */
class BrowserCryptoAdapter implements VanaCryptoAdapter {
  private eciesProvider = new BrowserECIESProvider();

  async encryptWithPublicKey(
    data: string,
    publicKeyHex: string,
  ): Promise<string> {
    try {
      // Convert hex public key to Buffer
      const publicKeyBuffer = Buffer.from(publicKeyHex, "hex");

      // Encrypt data using secp256k1 ECDH
      const encrypted = await this.eciesProvider.encrypt(
        publicKeyBuffer,
        Buffer.from(data, "utf8"),
      );

      // Concatenate all components and return as hex string for API consistency
      const result = Buffer.concat([
        encrypted.iv,
        encrypted.ephemPublicKey,
        encrypted.ciphertext,
        encrypted.mac,
      ]);

      return result.toString("hex");
    } catch (error) {
      throw new Error(`Encryption failed: ${error}`);
    }
  }

  async decryptWithPrivateKey(
    encryptedData: string,
    privateKeyHex: string,
  ): Promise<string> {
    try {
      // Use shared utilities to process keys and parse data
      const privateKeyBuffer = processWalletPrivateKey(privateKeyHex);
      const encryptedBuffer = Buffer.from(encryptedData, "hex");
      const { iv, ephemPublicKey, ciphertext, mac } =
        parseEncryptedDataBuffer(encryptedBuffer);

      // Reconstruct the encrypted data structure
      const encryptedObj: ECIESEncrypted = {
        iv,
        ephemPublicKey,
        ciphertext,
        mac,
      };

      // Decrypt using secp256k1 ECDH
      const decryptedBuffer = await this.eciesProvider.decrypt(
        privateKeyBuffer,
        encryptedObj,
      );

      return decryptedBuffer.toString("utf8");
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`);
    }
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    try {
      // Generate a random 32-byte private key for secp256k1
      let privateKey: Uint8Array;
      do {
        privateKey = this.eciesProvider["generateRandomBytes"](32);
      } while (!this.eciesProvider["verifyPrivateKey"](privateKey));

      // Generate the corresponding compressed public key
      const publicKey = this.eciesProvider["createPublicKey"](privateKey, true);

      if (!publicKey) {
        throw new Error("Failed to generate public key");
      }

      return {
        privateKey: Buffer.from(privateKey).toString("hex"),
        publicKey: Buffer.from(publicKey).toString("hex"),
      };
    } catch (error) {
      throw wrapCryptoError("key generation", error);
    }
  }

  async encryptWithWalletPublicKey(
    data: string,
    publicKey: string,
  ): Promise<string> {
    try {
      // Use shared utility to process public key
      const uncompressedKey = processWalletPublicKey(publicKey);

      // Encrypt using ECDH with randomly generated parameters
      const encryptedBuffer = await this.eciesProvider.encrypt(
        uncompressedKey,
        Buffer.from(data),
      );

      // Concatenate all components and return as hex
      const result = Buffer.concat([
        encryptedBuffer.iv,
        encryptedBuffer.ephemPublicKey,
        encryptedBuffer.ciphertext,
        encryptedBuffer.mac,
      ]);

      return result.toString("hex");
    } catch (error) {
      throw wrapCryptoError("encrypt with wallet public key", error);
    }
  }

  async decryptWithWalletPrivateKey(
    encryptedData: string,
    privateKey: string,
  ): Promise<string> {
    try {
      // Use shared utilities to process keys and parse data
      const privateKeyBuffer = processWalletPrivateKey(privateKey);
      const encryptedBuffer = Buffer.from(encryptedData, "hex");
      const { iv, ephemPublicKey, ciphertext, mac } =
        parseEncryptedDataBuffer(encryptedBuffer);

      // Reconstruct the encrypted data structure
      const encryptedObj: ECIESEncrypted = {
        iv,
        ephemPublicKey,
        ciphertext,
        mac,
      };

      // Decrypt using ECDH
      const decryptedBuffer = await this.eciesProvider.decrypt(
        privateKeyBuffer,
        encryptedObj,
      );

      return decryptedBuffer.toString("utf8");
    } catch (error) {
      throw wrapCryptoError("decrypt with wallet private key", error);
    }
  }

  async encryptWithPassword(
    data: Uint8Array,
    password: string,
  ): Promise<Uint8Array> {
    try {
      // Import openpgp for password-based encryption
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

      // Convert WebStream<Uint8Array> to Uint8Array
      const response = new Response(encrypted as ReadableStream<Uint8Array>);
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      throw new Error(`Failed to encrypt with password: ${error}`);
    }
  }

  async decryptWithPassword(
    encryptedData: Uint8Array,
    password: string,
  ): Promise<Uint8Array> {
    try {
      // Import openpgp for password-based decryption
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
      throw new Error(`Failed to decrypt with password: ${error}`);
    }
  }
}

/**
 * Browser implementation of PGP operations using openpgp with browser-specific configuration
 */
class BrowserPGPAdapter implements VanaPGPAdapter {
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
      throw new Error(`PGP encryption failed: ${error}`);
    }
  }

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
      throw new Error(`PGP decryption failed: ${error}`);
    }
  }

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
 * Browser implementation of HTTP operations using fetch API
 */
class BrowserHttpAdapter implements VanaHttpAdapter {
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    if (typeof fetch === "undefined") {
      throw new Error("Fetch API not available in this browser environment");
    }

    return fetch(url, options);
  }
}

/**
 * Browser implementation of cache operations using sessionStorage
 */
class BrowserCacheAdapter implements VanaCacheAdapter {
  private readonly prefix = "vana_cache_";

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

  set(key: string, value: string): void {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(this.prefix + key, value);
      }
    } catch {
      // Silently ignore storage errors (quota exceeded, etc.)
    }
  }

  delete(key: string): void {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(this.prefix + key);
      }
    } catch {
      // Silently ignore storage errors
    }
  }

  clear(): void {
    try {
      if (typeof sessionStorage === "undefined") {
        return;
      }

      const keys = Object.keys(sessionStorage);
      for (const key of keys) {
        if (key.startsWith(this.prefix)) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      // Silently ignore storage errors
    }
  }
}

/**
 * Complete browser platform adapter implementation
 */
export class BrowserPlatformAdapter implements VanaPlatformAdapter {
  crypto: VanaCryptoAdapter;
  pgp: VanaPGPAdapter;
  http: VanaHttpAdapter;
  cache: VanaCacheAdapter;
  platform: "browser" = "browser" as const;

  constructor() {
    this.crypto = new BrowserCryptoAdapter();
    this.pgp = new BrowserPGPAdapter();
    this.http = new BrowserHttpAdapter();
    this.cache = new BrowserCacheAdapter();
  }
}

/**
 * Default instance export for backwards compatibility
 */
export const browserPlatformAdapter: VanaPlatformAdapter =
  new BrowserPlatformAdapter();
