/**
 * Node.js implementation of the Vana Platform Adapter
 *
 * This implementation uses Node.js-specific libraries and configurations
 * to provide crypto, PGP, and HTTP functionality.
 */

import {
  VanaPlatformAdapter,
  VanaCryptoAdapter,
  VanaPGPAdapter,
  VanaHttpAdapter,
} from "./interface";

/**
 * Node.js implementation of crypto operations using eccrypto
 */
class NodeCryptoAdapter implements VanaCryptoAdapter {
  async encryptWithPublicKey(
    data: string,
    _publicKey: string,
  ): Promise<string> {
    console.warn(
      "NodeCryptoAdapter: Using placeholder encryption - not secure for production",
    );
    return `node-encrypted:${Buffer.from(data).toString("base64")}:${_publicKey.substring(0, 8)}`;
  }

  async decryptWithPrivateKey(
    encryptedData: string,
    _privateKey: string,
  ): Promise<string> {
    console.warn(
      "NodeCryptoAdapter: Using placeholder decryption - not secure for production",
    );
    if (encryptedData.startsWith("node-encrypted:")) {
      const [, encodedData] = encryptedData.split(":");
      return Buffer.from(encodedData, "base64").toString("utf8");
    }
    return encryptedData;
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    console.warn(
      "NodeCryptoAdapter: Using placeholder key generation - not secure for production",
    );
    const privateKey = Buffer.from(
      Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
    ).toString("hex");
    const publicKey = Buffer.from(
      Array.from({ length: 33 }, () => Math.floor(Math.random() * 256)),
    ).toString("hex");
    return { publicKey, privateKey };
  }
}

/**
 * Node.js implementation of PGP operations using openpgp with Node-specific configuration
 */
class NodePGPAdapter implements VanaPGPAdapter {
  async encrypt(data: string, _publicKey: string): Promise<string> {
    console.warn(
      "NodePGPAdapter: Using placeholder PGP encryption - not secure for production",
    );
    return `-----BEGIN PGP MESSAGE-----\nnode-pgp-encrypted:${Buffer.from(data).toString("base64")}\n-----END PGP MESSAGE-----`;
  }

  async decrypt(encryptedData: string, _privateKey: string): Promise<string> {
    console.warn(
      "NodePGPAdapter: Using placeholder PGP decryption - not secure for production",
    );
    const match = encryptedData.match(/node-pgp-encrypted:([A-Za-z0-9+/=]+)/);
    if (match) {
      return Buffer.from(match[1], "base64").toString("utf8");
    }
    return encryptedData;
  }

  async generateKeyPair(_options?: {
    name?: string;
    email?: string;
    passphrase?: string;
  }): Promise<{ publicKey: string; privateKey: string }> {
    console.warn(
      "NodePGPAdapter: Using placeholder PGP key generation - not secure for production",
    );

    return {
      publicKey: `-----BEGIN PGP PUBLIC KEY BLOCK-----\nnode-placeholder-public-key-${Date.now()}\n-----END PGP PUBLIC KEY BLOCK-----`,
      privateKey: `-----BEGIN PGP PRIVATE KEY BLOCK-----\nnode-placeholder-private-key-${Date.now()}\n-----END PGP PRIVATE KEY BLOCK-----`,
    };
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
export const nodePlatformAdapter: VanaPlatformAdapter = {
  crypto: new NodeCryptoAdapter(),
  pgp: new NodePGPAdapter(),
  http: new NodeHttpAdapter(),
  platform: "node" as const,
};
