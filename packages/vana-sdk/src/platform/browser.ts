/**
 * Browser implementation of the Vana Platform Adapter
 *
 * This implementation uses browser-compatible libraries and configurations
 * to provide crypto, PGP, and HTTP functionality without Node.js dependencies.
 */

import {
  VanaPlatformAdapter,
  VanaCryptoAdapter,
  VanaPGPAdapter,
  VanaHttpAdapter,
} from "./interface";

/**
 * Browser implementation of crypto operations using eccrypto-js
 */
class BrowserCryptoAdapter implements VanaCryptoAdapter {
  async encryptWithPublicKey(
    data: string,
    _publicKey: string,
  ): Promise<string> {
    console.warn(
      "BrowserCryptoAdapter: Using placeholder encryption - not secure for production",
    );
    const encoder = new TextEncoder();
    const dataArray = encoder.encode(data);
    return `browser-encrypted:${btoa(String.fromCharCode(...dataArray))}:${_publicKey.substring(0, 8)}`;
  }

  async decryptWithPrivateKey(
    encryptedData: string,
    _privateKey: string,
  ): Promise<string> {
    console.warn(
      "BrowserCryptoAdapter: Using placeholder decryption - not secure for production",
    );
    if (encryptedData.startsWith("browser-encrypted:")) {
      const [, encodedData] = encryptedData.split(":");
      const decodedData = atob(encodedData);
      return Array.from(decodedData, (char) => char.charCodeAt(0))
        .map((byte) => String.fromCharCode(byte))
        .join("");
    }
    return encryptedData;
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    console.warn(
      "BrowserCryptoAdapter: Using placeholder key generation - not secure for production",
    );
    const privateKey = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 256),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const publicKey = Array.from({ length: 33 }, () =>
      Math.floor(Math.random() * 256),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { publicKey, privateKey };
  }
}

/**
 * Browser implementation of PGP operations using openpgp with browser-specific configuration
 */
class BrowserPGPAdapter implements VanaPGPAdapter {
  async encrypt(data: string, _publicKey: string): Promise<string> {
    console.warn(
      "BrowserPGPAdapter: Using placeholder PGP encryption - not secure for production",
    );
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    return `-----BEGIN PGP MESSAGE-----\nbrowser-pgp-encrypted:${btoa(String.fromCharCode(...encodedData))}\n-----END PGP MESSAGE-----`;
  }

  async decrypt(encryptedData: string, _privateKey: string): Promise<string> {
    console.warn(
      "BrowserPGPAdapter: Using placeholder PGP decryption - not secure for production",
    );
    const match = encryptedData.match(
      /browser-pgp-encrypted:([A-Za-z0-9+/=]+)/,
    );
    if (match) {
      const decodedData = atob(match[1]);
      const dataArray = Array.from(decodedData, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(new Uint8Array(dataArray));
    }
    return encryptedData;
  }

  async generateKeyPair(_options?: {
    name?: string;
    email?: string;
    passphrase?: string;
  }): Promise<{ publicKey: string; privateKey: string }> {
    console.warn(
      "BrowserPGPAdapter: Using placeholder PGP key generation - not secure for production",
    );

    return {
      publicKey: `-----BEGIN PGP PUBLIC KEY BLOCK-----\nbrowser-placeholder-public-key-${Date.now()}\n-----END PGP PUBLIC KEY BLOCK-----`,
      privateKey: `-----BEGIN PGP PRIVATE KEY BLOCK-----\nbrowser-placeholder-private-key-${Date.now()}\n-----END PGP PRIVATE KEY BLOCK-----`,
    };
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
export const browserPlatformAdapter: VanaPlatformAdapter = {
  crypto: new BrowserCryptoAdapter(),
  pgp: new BrowserPGPAdapter(),
  http: new BrowserHttpAdapter(),
  platform: "browser" as const,
};
