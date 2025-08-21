/**
 * Node.js implementation of the Vana Platform Adapter
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
import { getPGPKeyGenParams } from "./shared/pgp-utils";
import { wrapCryptoError } from "./shared/error-utils";
import { streamToUint8Array } from "./shared/stream-utils";
import { lazyImport } from "../utils/lazy-import";
import { features } from "../config/features";
import { WalletKeyEncryptionService } from "../crypto/services/WalletKeyEncryptionService";
import {
  processWalletPrivateKey,
  parseEncryptedDataBuffer,
  processWalletPublicKey,
} from "../utils/crypto-utils";

// Lazy-loaded dependencies to avoid Turbopack TDZ issues
const getOpenPGP = lazyImport(() => import("openpgp"));
const getEccryptoJS = lazyImport(() => import("eccrypto-js"));

// Import both ECIES implementations statically
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
 * Node.js implementation of crypto operations
 * Supports both eccrypto (default) and custom ECIES implementation
 */
class NodeCryptoAdapter implements VanaCryptoAdapter {
  // Initialize both providers - only one will be used based on feature flag
  private customEciesProvider = new NodeECIESUint8Provider();
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
        const publicKey = Buffer.from(publicKeyHex, "hex");
        const message = Buffer.from(data, "utf8");

        const encrypted = await this.customEciesProvider.encrypt(
          publicKey,
          message,
        );

        // Concatenate all components and return as hex string for API consistency
        const result = Buffer.concat([
          encrypted.iv,
          encrypted.ephemPublicKey,
          encrypted.ciphertext,
          encrypted.mac,
        ]);

        return result.toString("hex");
      } else {
        // Use eccrypto-js (default)
        const eccryptojs = await getEccryptoJS();
        const publicKey = Buffer.from(publicKeyHex, "hex");
        const message = Buffer.from(data, "utf8");

        const encrypted = await eccryptojs.encrypt(publicKey, message);

        // Concatenate all components and return as hex string for API consistency
        const result = Buffer.concat([
          encrypted.iv,
          encrypted.ephemPublicKey,
          encrypted.ciphertext,
          encrypted.mac,
        ]);

        return result.toString("hex");
      }
    } catch (error) {
      if (features.useCustomECIES && error instanceof ECIESError) {
        throw error;
      }
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async decryptWithPrivateKey(
    encryptedData: string,
    privateKeyHex: string,
  ): Promise<string> {
    try {
      if (features.useCustomECIES) {
        // Use custom ECIES implementation
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

        const decrypted = await this.customEciesProvider.decrypt(
          privateKeyBuffer,
          encryptedObj,
        );
        return new TextDecoder().decode(decrypted);
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
      if (features.useCustomECIES && error instanceof ECIESError) {
        throw error;
      }
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    try {
      if (features.useCustomECIES) {
        // Use custom implementation with secp256k1
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
      throw wrapCryptoError("key generation", error);
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
        const publicKeyBuffer = Buffer.from(processWalletPublicKey(publicKey));
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
      throw wrapCryptoError("encrypt with wallet public key", error);
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
        const privateKeyBuffer = Buffer.from(
          processWalletPrivateKey(privateKey),
        );
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
      throw wrapCryptoError("decrypt with wallet private key", error);
    }
  }

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
 * Node.js implementation of PGP operations using openpgp with Node-specific configuration
 */
class NodePGPAdapter implements VanaPGPAdapter {
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
 * Node.js implementation of cache operations using in-memory Map with TTL
 */
class NodeCacheAdapter implements VanaCacheAdapter {
  private cache = new Map<string, { value: string; expires: number }>();
  private readonly defaultTtl = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

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

  set(key: string, value: string): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + this.defaultTtl,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Complete Node.js platform adapter implementation
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
 * Default instance export for backwards compatibility
 */
export const nodePlatformAdapter: VanaPlatformAdapter =
  new NodePlatformAdapter();
