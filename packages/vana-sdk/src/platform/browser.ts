/**
 * Browser implementation of the Vana Platform Adapter using Uint8Array
 *
 * This implementation uses browser-compatible libraries and native APIs
 * without requiring Buffer or other Node.js polyfills.
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
} from "./shared/crypto-utils-browser";
import { getPGPKeyGenParams } from "./shared/pgp-utils";
import { wrapCryptoError } from "./shared/error-utils";
import { lazyImport } from "../utils/lazy-import";
import {
  hexToBytes,
  bytesToHex,
  stringToBytes,
  bytesToString,
  concatBytes,
} from "../crypto/ecies/utils";
import * as secp256k1 from "@noble/secp256k1";

// Import browser ECIES provider
import { BrowserECIESUint8Provider } from "../crypto/ecies/browser";

// Lazy-loaded dependencies to avoid Turbopack TDZ issues
const getOpenPGP = lazyImport(() => import("openpgp"));

/**
 * Browser implementation of crypto operations using Uint8Array
 */
class BrowserCryptoAdapter implements VanaCryptoAdapter {
  private eciesProvider = new BrowserECIESUint8Provider();

  async encryptWithPublicKey(
    data: string,
    publicKeyHex: string,
  ): Promise<string> {
    try {
      // Convert hex public key to Uint8Array
      const publicKeyBytes = hexToBytes(publicKeyHex);

      // Encrypt data using ECIES
      const encrypted = await this.eciesProvider.encrypt(
        publicKeyBytes,
        stringToBytes(data),
      );

      // Concatenate all components and return as hex string
      const result = concatBytes(
        encrypted.iv,
        encrypted.ephemPublicKey,
        encrypted.ciphertext,
        encrypted.mac,
      );

      return bytesToHex(result);
    } catch (error) {
      throw wrapCryptoError("encryptWithPublicKey", error);
    }
  }

  async decryptWithPrivateKey(
    encryptedData: string,
    privateKeyHex: string,
  ): Promise<string> {
    try {
      // Convert hex strings to Uint8Array
      const encryptedBytes = hexToBytes(encryptedData);
      const privateKeyBytes = hexToBytes(privateKeyHex);

      // Parse the encrypted data into components
      const encrypted = parseEncryptedDataBuffer(encryptedBytes);

      // Decrypt using ECIES
      const decrypted = await this.eciesProvider.decrypt(
        privateKeyBytes,
        encrypted,
      );

      return bytesToString(decrypted);
    } catch (error) {
      throw wrapCryptoError("decryptWithPrivateKey", error);
    }
  }

  async encryptWithWalletPublicKey(
    data: string,
    publicKey: string,
  ): Promise<string> {
    try {
      const publicKeyBytes = processWalletPublicKey(publicKey);
      const dataBytes = stringToBytes(data);
      const encrypted = await this.eciesProvider.encrypt(
        publicKeyBytes,
        dataBytes,
      );

      // Convert to hex string for interface compatibility
      const result = concatBytes(
        encrypted.iv,
        encrypted.ephemPublicKey,
        encrypted.ciphertext,
        encrypted.mac,
      );
      return bytesToHex(result);
    } catch (error) {
      throw wrapCryptoError("encryptWithWalletPublicKey", error);
    }
  }

  async decryptWithWalletPrivateKey(
    encryptedData: string,
    privateKey: string,
  ): Promise<string> {
    try {
      const privateKeyBytes = processWalletPrivateKey(privateKey);
      const encryptedBytes = hexToBytes(encryptedData);
      const encrypted = parseEncryptedDataBuffer(encryptedBytes);
      const decrypted = await this.eciesProvider.decrypt(
        privateKeyBytes,
        encrypted,
      );
      return bytesToString(decrypted);
    } catch (error) {
      throw wrapCryptoError("decryptWithWalletPrivateKey", error);
    }
  }

  async generateKeyPair(): Promise<{
    privateKey: string;
    publicKey: string;
  }> {
    try {
      // Generate random private key
      const privateKeyBytes = secp256k1.utils.randomPrivateKey();

      // Generate public key (uncompressed for compatibility)
      const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false);

      return {
        privateKey: bytesToHex(privateKeyBytes),
        publicKey: bytesToHex(publicKeyBytes),
      };
    } catch (error) {
      throw wrapCryptoError("generateKeyPair", error);
    }
  }

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
 * Browser implementation of PGP operations
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
 * Browser implementation of HTTP operations using Fetch API
 */
class BrowserHttpAdapter implements VanaHttpAdapter {
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, options);
  }
}

/**
 * Browser implementation of caching using localStorage
 */
class BrowserCacheAdapter implements VanaCacheAdapter {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }

  delete(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  }

  clear(): void {
    try {
      localStorage.clear();
    } catch {
      // Ignore storage errors
    }
  }
}

/**
 * Browser implementation of the Vana Platform Adapter
 *
 * This adapter provides all platform-specific functionality for browser environments
 * without requiring any Node.js polyfills.
 */
export class BrowserPlatformAdapter implements VanaPlatformAdapter {
  public readonly crypto = new BrowserCryptoAdapter();
  public readonly pgp = new BrowserPGPAdapter();
  public readonly http = new BrowserHttpAdapter();
  public readonly cache = new BrowserCacheAdapter();
  public readonly platform = "browser" as const;
}
