/**
 * Browser implementation of the Vana Platform Adapter
 *
 * This implementation uses browser-compatible libraries and configurations
 * to provide crypto, PGP, and HTTP functionality without Node.js dependencies.
 */

import * as openpgp from "openpgp";
import {
  VanaPlatformAdapter,
  VanaCryptoAdapter,
  VanaPGPAdapter,
  VanaHttpAdapter,
} from "./interface";
import {
  processWalletPublicKey,
  processWalletPrivateKey,
  parseEncryptedDataBuffer,
} from "./shared/crypto-utils";
import { getPGPKeyGenParams } from "./shared/pgp-utils";
import { wrapCryptoError } from "./shared/error-utils";

/**
 * Browser implementation of crypto operations using eccrypto-js
 */
class BrowserCryptoAdapter implements VanaCryptoAdapter {
  async encryptWithPublicKey(
    data: string,
    publicKeyHex: string,
  ): Promise<string> {
    try {
      // Import eccrypto-js for secp256k1 encryption
      const eccrypto = await import("eccrypto-js");

      // Convert hex public key to Buffer
      const publicKeyBuffer = Buffer.from(publicKeyHex, "hex");

      // Encrypt data using secp256k1 ECDH
      const encrypted = await eccrypto.encrypt(
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
      // Import eccrypto-js for secp256k1 decryption
      const eccrypto = await import("eccrypto-js");

      // Use shared utilities to process keys and parse data
      const privateKeyBuffer = processWalletPrivateKey(privateKeyHex);
      const encryptedBuffer = Buffer.from(encryptedData, "hex");
      const { iv, ephemPublicKey, ciphertext, mac } =
        parseEncryptedDataBuffer(encryptedBuffer);

      // Reconstruct the encrypted data structure for eccrypto
      const encryptedObj = { iv, ephemPublicKey, ciphertext, mac };

      // Decrypt using secp256k1 ECDH
      const decryptedBuffer = await eccrypto.decrypt(
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
      // Import eccrypto-js for secp256k1 key generation (browser-compatible)
      const eccrypto = await import("eccrypto-js");

      // Generate a random 32-byte private key for secp256k1
      const privateKeyBytes = new Uint8Array(32);
      crypto.getRandomValues(privateKeyBytes);
      const privateKey = Buffer.from(privateKeyBytes);

      // Generate the corresponding compressed public key
      const publicKey = eccrypto.getPublicCompressed(privateKey);

      return {
        privateKey: privateKey.toString("hex"),
        publicKey: publicKey.toString("hex"),
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
      // Import eccrypto for ECDH encryption
      const eccrypto = await import("eccrypto-js");

      // Use shared utility to process public key
      const uncompressedKey = processWalletPublicKey(publicKey);

      // Encrypt using ECDH with randomly generated parameters
      const encryptedBuffer = await eccrypto.encrypt(
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
      // Import eccrypto for ECDH decryption
      const eccrypto = await import("eccrypto-js");

      // Use shared utilities to process keys and parse data
      const privateKeyBuffer = processWalletPrivateKey(privateKey);
      const encryptedBuffer = Buffer.from(encryptedData, "hex");
      const { iv, ephemPublicKey, ciphertext, mac } =
        parseEncryptedDataBuffer(encryptedBuffer);

      // Reconstruct the encrypted data structure for eccrypto
      const encryptedObj = { iv, ephemPublicKey, ciphertext, mac };

      // Decrypt using ECDH
      const decryptedBuffer = await eccrypto.decrypt(
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
      const openpgp = await import("openpgp");

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
      const openpgp = await import("openpgp");

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
 * Complete browser platform adapter implementation
 */
export class BrowserPlatformAdapter implements VanaPlatformAdapter {
  crypto: VanaCryptoAdapter;
  pgp: VanaPGPAdapter;
  http: VanaHttpAdapter;
  platform: "browser" = "browser" as const;

  constructor() {
    this.crypto = new BrowserCryptoAdapter();
    this.pgp = new BrowserPGPAdapter();
    this.http = new BrowserHttpAdapter();
  }
}

/**
 * Default instance export for backwards compatibility
 */
export const browserPlatformAdapter: VanaPlatformAdapter =
  new BrowserPlatformAdapter();
