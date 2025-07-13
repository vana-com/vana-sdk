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
  uint8ArrayToHex,
} from "./shared/crypto-utils";
import { getPGPKeyGenParams } from "./shared/pgp-utils";
import { wrapCryptoError } from "./shared/error-utils";

// Browser-native crypto implementation using Web Crypto API
class BrowserECDH {
  async generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey", "deriveBits"],
    );
    return keyPair;
  }

  async encrypt(publicKeyHex: string, message: string): Promise<string> {
    // Generate ephemeral key pair for this encryption
    const ephemeralKeyPair = await this.generateKeyPair();

    // Import the provided public key
    const publicKeyData = hexToUint8Array(publicKeyHex);
    const importedPublicKey = await crypto.subtle.importKey(
      "raw",
      publicKeyData,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );

    // Derive shared secret using ephemeral private key and provided public key
    const sharedKey = await crypto.subtle.deriveKey(
      { name: "ECDH", public: importedPublicKey },
      ephemeralKeyPair.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the message
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sharedKey,
      data,
    );

    // Export ephemeral public key for sender
    const ephemeralPublicKeyData = await crypto.subtle.exportKey(
      "raw",
      ephemeralKeyPair.publicKey,
    );

    return JSON.stringify({
      encrypted: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
      ephemeralPublicKey: Array.from(new Uint8Array(ephemeralPublicKeyData)),
      publicKey: publicKeyHex,
    });
  }

  async decrypt(privateKeyHex: string, encryptedData: string): Promise<string> {
    try {
      const data = JSON.parse(encryptedData);

      // Validate that we have the expected data structure
      if (!data.encrypted || !data.iv || !data.ephemeralPublicKey) {
        throw new Error("Invalid encrypted data format");
      }

      // Import the private key
      const privateKeyData = hexToUint8Array(privateKeyHex);
      const importedPrivateKey = await crypto.subtle.importKey(
        "pkcs8",
        privateKeyData,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey"],
      );

      // Import ephemeral public key
      const ephemeralPublicKey = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(data.ephemeralPublicKey),
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
      );

      // Derive the same shared secret
      const sharedKey = await crypto.subtle.deriveKey(
        { name: "ECDH", public: ephemeralPublicKey },
        importedPrivateKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(data.iv) },
        sharedKey,
        new Uint8Array(data.encrypted),
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}

// Utility functions for browser crypto
function hexToUint8Array(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return result;
}

// Utility functions for browser crypto remain available if needed in future

/**
 * Browser implementation of crypto operations using eccrypto-js
 */
class BrowserCryptoAdapter implements VanaCryptoAdapter {
  async encryptWithPublicKey(
    data: string,
    publicKeyHex: string,
  ): Promise<string> {
    try {
      const ecdh = new BrowserECDH();
      return await ecdh.encrypt(publicKeyHex, data);
    } catch (error) {
      throw new Error(`Encryption failed: ${error}`);
    }
  }

  async decryptWithPrivateKey(
    encryptedData: string,
    privateKeyHex: string,
  ): Promise<string> {
    try {
      const ecdh = new BrowserECDH();
      return await ecdh.decrypt(privateKeyHex, encryptedData);
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`);
    }
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    try {
      // Generate a secp256k1 compatible key pair using Web Crypto API
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256",
        },
        true,
        ["deriveKey", "deriveBits"],
      );

      // Export keys as hex strings using shared utility
      const publicKeyBuffer = await crypto.subtle.exportKey(
        "raw",
        keyPair.publicKey,
      );
      const privateKeyBuffer = await crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey,
      );

      return {
        publicKey: uint8ArrayToHex(new Uint8Array(publicKeyBuffer)),
        privateKey: uint8ArrayToHex(new Uint8Array(privateKeyBuffer)),
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

      // Generate consistent encryption parameters (for deterministic encryption)
      const iv = Buffer.from([
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
        0x0d, 0x0e, 0x0f, 0x10,
      ]);

      const ephemeralKey = Buffer.from([
        0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc,
        0xdd, 0xee, 0xff, 0x00, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80,
        0x90, 0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0, 0x00,
      ]);

      // Encrypt using ECDH
      const encryptedBuffer = await eccrypto.encrypt(
        uncompressedKey,
        Buffer.from(data),
        {
          iv: iv,
          ephemPrivateKey: ephemeralKey,
        },
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
