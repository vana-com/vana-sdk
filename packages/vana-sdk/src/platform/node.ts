/**
 * Node.js implementation of the Vana Platform Adapter
 *
 * This implementation uses Node.js-specific libraries and configurations
 * to provide crypto, PGP, and HTTP functionality.
 */

import { randomBytes } from "crypto";
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
import { streamToUint8Array } from "./shared/stream-utils";

// Eccrypto type definitions removed - using dynamic imports instead

// Dynamically import eccrypto for Node.js
let eccrypto: {
  encrypt: (
    publicKey: Buffer,
    message: Buffer,
  ) => Promise<{
    iv: Buffer;
    ephemPublicKey: Buffer;
    ciphertext: Buffer;
    mac: Buffer;
  }>;
  decrypt: (
    privateKey: Buffer,
    encrypted: {
      iv: Buffer;
      ephemPublicKey: Buffer;
      ciphertext: Buffer;
      mac: Buffer;
    },
  ) => Promise<Buffer>;
  getPublicCompressed: (privateKey: Buffer) => Buffer;
} | null = null;

// Lazy load eccrypto
async function getEccrypto() {
  if (!eccrypto) {
    try {
      // Import the eccrypto library for Node.js
      const eccryptoLib = await import("eccrypto");

      eccrypto = {
        encrypt: eccryptoLib.encrypt,
        decrypt: eccryptoLib.decrypt,
        getPublicCompressed: eccryptoLib.getPublicCompressed,
      };
    } catch (error) {
      throw new Error(`Failed to load eccrypto library: ${error}`);
    }
  }
  return eccrypto;
}

/**
 * Node.js implementation of crypto operations using secp256k1
 */
class NodeCryptoAdapter implements VanaCryptoAdapter {
  async encryptWithPublicKey(
    data: string,
    publicKeyHex: string,
  ): Promise<string> {
    try {
      const eccryptoLib = await getEccrypto();
      const publicKey = Buffer.from(publicKeyHex, "hex");
      const message = Buffer.from(data, "utf8");

      const encrypted = await eccryptoLib.encrypt(publicKey, message);

      // Serialize encrypted data as JSON
      const serialized = {
        iv: encrypted.iv.toString("hex"),
        ephemPublicKey: encrypted.ephemPublicKey.toString("hex"),
        ciphertext: encrypted.ciphertext.toString("hex"),
        mac: encrypted.mac.toString("hex"),
      };

      return JSON.stringify(serialized);
    } catch (error) {
      throw new Error(`Encryption failed: ${error}`);
    }
  }

  async decryptWithPrivateKey(
    encryptedData: string,
    privateKeyHex: string,
  ): Promise<string> {
    try {
      const eccryptoLib = await getEccrypto();
      const privateKey = Buffer.from(privateKeyHex, "hex");

      // Deserialize encrypted data
      const serialized = JSON.parse(encryptedData);
      const encrypted = {
        iv: Buffer.from(serialized.iv, "hex"),
        ephemPublicKey: Buffer.from(serialized.ephemPublicKey, "hex"),
        ciphertext: Buffer.from(serialized.ciphertext, "hex"),
        mac: Buffer.from(serialized.mac, "hex"),
      };

      const decrypted = await eccryptoLib.decrypt(privateKey, encrypted);
      return decrypted.toString("utf8");
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`);
    }
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    try {
      const eccryptoLib = await getEccrypto();
      const privateKey = randomBytes(32);
      const publicKey = eccryptoLib.getPublicCompressed(privateKey);

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
      const eccryptoLib = await getEccrypto();

      // Use shared utility to process public key
      const uncompressedKey = processWalletPublicKey(publicKey);

      const encrypted = await eccryptoLib.encrypt(
        uncompressedKey,
        Buffer.from(data),
      );

      // Concatenate all components and return as hex (same format as browser)
      const result = Buffer.concat([
        encrypted.iv,
        encrypted.ephemPublicKey,
        encrypted.ciphertext,
        encrypted.mac,
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
      const eccryptoLib = await getEccrypto();

      // Use shared utilities to process keys and parse data
      const privateKeyBuffer = processWalletPrivateKey(privateKey);
      const encryptedBuffer = Buffer.from(encryptedData, "hex");
      const { iv, ephemPublicKey, ciphertext, mac } =
        parseEncryptedDataBuffer(encryptedBuffer);

      // Reconstruct the encrypted data structure for eccrypto
      const encryptedObj = { iv, ephemPublicKey, ciphertext, mac };

      // Decrypt using ECDH
      const decryptedBuffer = await eccryptoLib.decrypt(
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

  async decryptWithPassword(
    encryptedData: Uint8Array,
    password: string,
  ): Promise<Uint8Array> {
    try {
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
 * Node.js implementation of PGP operations using openpgp with Node-specific configuration
 */
class NodePGPAdapter implements VanaPGPAdapter {
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
      throw wrapCryptoError("PGP encryption", error);
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
      throw wrapCryptoError("PGP decryption", error);
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
 * Node.js implementation of HTTP operations using node-fetch or native fetch
 */
class NodeHttpAdapter implements VanaHttpAdapter {
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    if (typeof globalThis.fetch !== "undefined") {
      return globalThis.fetch(url, options);
    }

    throw new Error("No fetch implementation available in Node.js environment");
  }
}

/**
 * Complete Node.js platform adapter implementation
 */
export class NodePlatformAdapter implements VanaPlatformAdapter {
  crypto: VanaCryptoAdapter;
  pgp: VanaPGPAdapter;
  http: VanaHttpAdapter;
  platform: "node" = "node" as const;

  constructor() {
    this.crypto = new NodeCryptoAdapter();
    this.pgp = new NodePGPAdapter();
    this.http = new NodeHttpAdapter();
  }
}

/**
 * Default instance export for backwards compatibility
 */
export const nodePlatformAdapter: VanaPlatformAdapter =
  new NodePlatformAdapter();
