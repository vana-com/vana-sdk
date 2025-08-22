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
import { getPGPKeyGenParams } from "./shared/pgp-utils";
import { wrapCryptoError } from "./shared/error-utils";
import { lazyImport } from "../utils/lazy-import";
import { WalletKeyEncryptionService } from "../crypto/services/WalletKeyEncryptionService";
import { parseEncryptedDataBuffer } from "../utils/crypto-utils";
import { toHex, fromHex, stringToBytes, bytesToString } from "viem";
import { concatBytes } from "../crypto/ecies/utils";
import * as secp256k1 from "@noble/secp256k1";
import { features } from "../config/features";

// Import browser ECIES provider
import { BrowserECIESUint8Provider } from "../crypto/ecies/browser";

// Lazy-loaded dependencies to avoid Turbopack TDZ issues
const getOpenPGP = lazyImport(() => import("openpgp"));
const getEccryptoJS = lazyImport(() => import("eccrypto-js"));

/**
 * Browser implementation of crypto operations using Uint8Array
 * Supports both eccrypto-js (default) and custom ECIES implementation
 */
class BrowserCryptoAdapter implements VanaCryptoAdapter {
  // Initialize both providers - only one will be used based on feature flag
  private customEciesProvider = new BrowserECIESUint8Provider();
  private customWalletService = new WalletKeyEncryptionService({
    eciesProvider: this.customEciesProvider,
  });

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
        const result = concatBytes(
          encrypted.iv,
          encrypted.ephemPublicKey,
          encrypted.ciphertext,
          encrypted.mac,
        );

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
 * Browser implementation of caching using sessionStorage for security
 * SessionStorage is cleared when the tab closes, making it more secure for signature caching
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
      if (typeof sessionStorage === "undefined") {
        return;
      }
      sessionStorage.setItem(this.prefix + key, value);
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }

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
      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
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
