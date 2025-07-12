import { describe, it, expect, vi, afterEach } from "vitest";
import { browserPlatformAdapter } from "../platform/browser";
import { nodePlatformAdapter } from "../platform/node";

// Store original fetch for restoration
const originalFetch = globalThis.fetch;

describe("Platform Adapters", () => {
  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("Browser Platform Adapter", () => {
    describe("BrowserCryptoAdapter", () => {
      it("should encrypt data with public key", async () => {
        const data = "test data";
        const publicKey = "public-key-123";

        const result = await browserPlatformAdapter.crypto.encryptWithPublicKey(
          data,
          publicKey,
        );

        expect(result).toContain("browser-encrypted:");
        expect(result).toContain(btoa("test data"));
        expect(result).toContain(publicKey.substring(0, 8));
      });

      it("should decrypt data with private key", async () => {
        const data = "test data";
        const publicKey = "public-key-123";
        const privateKey = "private-key-456";

        // First encrypt
        const encrypted =
          await browserPlatformAdapter.crypto.encryptWithPublicKey(
            data,
            publicKey,
          );

        // Then decrypt
        const decrypted =
          await browserPlatformAdapter.crypto.decryptWithPrivateKey(
            encrypted,
            privateKey,
          );

        expect(decrypted).toBe(data);
      });

      it("should handle non-encrypted data in decryption", async () => {
        const plainData = "plain data";
        const privateKey = "private-key-456";

        const result =
          await browserPlatformAdapter.crypto.decryptWithPrivateKey(
            plainData,
            privateKey,
          );

        expect(result).toBe(plainData);
      });

      it("should generate key pair", async () => {
        const keyPair = await browserPlatformAdapter.crypto.generateKeyPair();

        expect(keyPair).toHaveProperty("publicKey");
        expect(keyPair).toHaveProperty("privateKey");
        expect(typeof keyPair.publicKey).toBe("string");
        expect(typeof keyPair.privateKey).toBe("string");
        expect(keyPair.publicKey.length).toBe(66); // 33 bytes * 2 hex chars
        expect(keyPair.privateKey.length).toBe(64); // 32 bytes * 2 hex chars
      });

      it("should generate different key pairs on subsequent calls", async () => {
        const keyPair1 = await browserPlatformAdapter.crypto.generateKeyPair();
        const keyPair2 = await browserPlatformAdapter.crypto.generateKeyPair();

        expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
        expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      });
    });

    describe("BrowserPGPAdapter", () => {
      it("should encrypt data with PGP", async () => {
        const data = "sensitive data";
        const publicKey = "pgp-public-key";

        const result = await browserPlatformAdapter.pgp.encrypt(
          data,
          publicKey,
        );

        expect(result).toContain("-----BEGIN PGP MESSAGE-----");
        expect(result).toContain("-----END PGP MESSAGE-----");
        expect(result).toContain("browser-pgp-encrypted:");
        expect(result).toContain(btoa(data));
      });

      it("should decrypt PGP data", async () => {
        const data = "sensitive data";
        const publicKey = "pgp-public-key";
        const privateKey = "pgp-private-key";

        // First encrypt
        const encrypted = await browserPlatformAdapter.pgp.encrypt(
          data,
          publicKey,
        );

        // Then decrypt
        const decrypted = await browserPlatformAdapter.pgp.decrypt(
          encrypted,
          privateKey,
        );

        expect(decrypted).toBe(data);
      });

      it("should handle non-PGP data in decryption", async () => {
        const plainData = "plain data";
        const privateKey = "pgp-private-key";

        const result = await browserPlatformAdapter.pgp.decrypt(
          plainData,
          privateKey,
        );

        expect(result).toBe(plainData);
      });

      it("should generate PGP key pair without options", async () => {
        const keyPair = await browserPlatformAdapter.pgp.generateKeyPair();

        expect(keyPair).toHaveProperty("publicKey");
        expect(keyPair).toHaveProperty("privateKey");
        expect(keyPair.publicKey).toContain(
          "-----BEGIN PGP PUBLIC KEY BLOCK-----",
        );
        expect(keyPair.publicKey).toContain(
          "-----END PGP PUBLIC KEY BLOCK-----",
        );
        expect(keyPair.privateKey).toContain(
          "-----BEGIN PGP PRIVATE KEY BLOCK-----",
        );
        expect(keyPair.privateKey).toContain(
          "-----END PGP PRIVATE KEY BLOCK-----",
        );
      });

      it("should generate PGP key pair with options", async () => {
        const options = {
          name: "Test User",
          email: "test@example.com",
          passphrase: "secure-passphrase",
        };

        const keyPair =
          await browserPlatformAdapter.pgp.generateKeyPair(options);

        expect(keyPair).toHaveProperty("publicKey");
        expect(keyPair).toHaveProperty("privateKey");
        expect(keyPair.publicKey).toContain("browser-placeholder-public-key");
        expect(keyPair.privateKey).toContain("browser-placeholder-private-key");
      });

      it("should generate different PGP key pairs on subsequent calls", async () => {
        const keyPair1 = await browserPlatformAdapter.pgp.generateKeyPair();
        // Wait a millisecond to ensure different timestamp
        await new Promise((resolve) => setTimeout(resolve, 1));
        const keyPair2 = await browserPlatformAdapter.pgp.generateKeyPair();

        expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
        expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      });
    });

    describe("BrowserHttpAdapter", () => {
      it("should make HTTP request using fetch", async () => {
        const mockResponse = new Response("test response", { status: 200 });
        globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

        const result = await browserPlatformAdapter.http.fetch(
          "https://example.com",
        );

        expect(result).toBe(mockResponse);
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "https://example.com",
          undefined,
        );
      });

      it("should pass options to fetch", async () => {
        const mockResponse = new Response("test response", { status: 200 });
        globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

        const options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test: "data" }),
        };

        const result = await browserPlatformAdapter.http.fetch(
          "https://example.com/api",
          options,
        );

        expect(result).toBe(mockResponse);
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "https://example.com/api",
          options,
        );
      });

      it("should throw error when fetch is not available", async () => {
        // Remove fetch from global
        globalThis.fetch = undefined as unknown as typeof fetch;

        await expect(
          browserPlatformAdapter.http.fetch("https://example.com"),
        ).rejects.toThrow(
          "Fetch API not available in this browser environment",
        );
      });
    });

    describe("Platform Integration", () => {
      it("should have correct platform identifier", () => {
        expect(browserPlatformAdapter.platform).toBe("browser");
      });

      it("should provide all required adapters", () => {
        expect(browserPlatformAdapter.crypto).toBeDefined();
        expect(browserPlatformAdapter.pgp).toBeDefined();
        expect(browserPlatformAdapter.http).toBeDefined();
      });
    });
  });

  describe("Node Platform Adapter", () => {
    describe("NodeCryptoAdapter", () => {
      it("should encrypt data with public key", async () => {
        const data = "test data";
        const publicKey = "public-key-123";

        const result = await nodePlatformAdapter.crypto.encryptWithPublicKey(
          data,
          publicKey,
        );

        expect(result).toContain("node-encrypted:");
        expect(result).toContain(Buffer.from(data).toString("base64"));
        expect(result).toContain(publicKey.substring(0, 8));
      });

      it("should decrypt data with private key", async () => {
        const data = "test data";
        const publicKey = "public-key-123";
        const privateKey = "private-key-456";

        // First encrypt
        const encrypted = await nodePlatformAdapter.crypto.encryptWithPublicKey(
          data,
          publicKey,
        );

        // Then decrypt
        const decrypted =
          await nodePlatformAdapter.crypto.decryptWithPrivateKey(
            encrypted,
            privateKey,
          );

        expect(decrypted).toBe(data);
      });

      it("should handle non-encrypted data in decryption", async () => {
        const plainData = "plain data";
        const privateKey = "private-key-456";

        const result = await nodePlatformAdapter.crypto.decryptWithPrivateKey(
          plainData,
          privateKey,
        );

        expect(result).toBe(plainData);
      });

      it("should generate key pair", async () => {
        const keyPair = await nodePlatformAdapter.crypto.generateKeyPair();

        expect(keyPair).toHaveProperty("publicKey");
        expect(keyPair).toHaveProperty("privateKey");
        expect(typeof keyPair.publicKey).toBe("string");
        expect(typeof keyPair.privateKey).toBe("string");
        expect(keyPair.publicKey.length).toBe(66); // 33 bytes * 2 hex chars
        expect(keyPair.privateKey.length).toBe(64); // 32 bytes * 2 hex chars
      });

      it("should generate different key pairs on subsequent calls", async () => {
        const keyPair1 = await nodePlatformAdapter.crypto.generateKeyPair();
        const keyPair2 = await nodePlatformAdapter.crypto.generateKeyPair();

        expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
        expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      });
    });

    describe("NodePGPAdapter", () => {
      it("should encrypt data with PGP", async () => {
        const data = "sensitive data";
        const publicKey = "pgp-public-key";

        const result = await nodePlatformAdapter.pgp.encrypt(data, publicKey);

        expect(result).toContain("-----BEGIN PGP MESSAGE-----");
        expect(result).toContain("-----END PGP MESSAGE-----");
        expect(result).toContain("node-pgp-encrypted:");
        expect(result).toContain(Buffer.from(data).toString("base64"));
      });

      it("should decrypt PGP data", async () => {
        const data = "sensitive data";
        const publicKey = "pgp-public-key";
        const privateKey = "pgp-private-key";

        // First encrypt
        const encrypted = await nodePlatformAdapter.pgp.encrypt(
          data,
          publicKey,
        );

        // Then decrypt
        const decrypted = await nodePlatformAdapter.pgp.decrypt(
          encrypted,
          privateKey,
        );

        expect(decrypted).toBe(data);
      });

      it("should handle non-PGP data in decryption", async () => {
        const plainData = "plain data";
        const privateKey = "pgp-private-key";

        const result = await nodePlatformAdapter.pgp.decrypt(
          plainData,
          privateKey,
        );

        expect(result).toBe(plainData);
      });

      it("should generate PGP key pair without options", async () => {
        const keyPair = await nodePlatformAdapter.pgp.generateKeyPair();

        expect(keyPair).toHaveProperty("publicKey");
        expect(keyPair).toHaveProperty("privateKey");
        expect(keyPair.publicKey).toContain(
          "-----BEGIN PGP PUBLIC KEY BLOCK-----",
        );
        expect(keyPair.publicKey).toContain(
          "-----END PGP PUBLIC KEY BLOCK-----",
        );
        expect(keyPair.privateKey).toContain(
          "-----BEGIN PGP PRIVATE KEY BLOCK-----",
        );
        expect(keyPair.privateKey).toContain(
          "-----END PGP PRIVATE KEY BLOCK-----",
        );
      });

      it("should generate PGP key pair with options", async () => {
        const options = {
          name: "Test User",
          email: "test@example.com",
          passphrase: "secure-passphrase",
        };

        const keyPair = await nodePlatformAdapter.pgp.generateKeyPair(options);

        expect(keyPair).toHaveProperty("publicKey");
        expect(keyPair).toHaveProperty("privateKey");
        expect(keyPair.publicKey).toContain("node-placeholder-public-key");
        expect(keyPair.privateKey).toContain("node-placeholder-private-key");
      });

      it("should generate different PGP key pairs on subsequent calls", async () => {
        const keyPair1 = await nodePlatformAdapter.pgp.generateKeyPair();
        // Wait a millisecond to ensure different timestamp
        await new Promise((resolve) => setTimeout(resolve, 1));
        const keyPair2 = await nodePlatformAdapter.pgp.generateKeyPair();

        expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
        expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      });
    });

    describe("NodeHttpAdapter", () => {
      it("should make HTTP request using global fetch", async () => {
        const mockResponse = new Response("test response", { status: 200 });
        globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

        const result = await nodePlatformAdapter.http.fetch(
          "https://example.com",
        );

        expect(result).toBe(mockResponse);
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "https://example.com",
          undefined,
        );
      });

      it("should pass options to fetch", async () => {
        const mockResponse = new Response("test response", { status: 200 });
        globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

        const options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test: "data" }),
        };

        const result = await nodePlatformAdapter.http.fetch(
          "https://example.com/api",
          options,
        );

        expect(result).toBe(mockResponse);
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "https://example.com/api",
          options,
        );
      });

      it("should throw error when fetch is not available", async () => {
        // Remove fetch from global
        globalThis.fetch = undefined as unknown as typeof fetch;

        await expect(
          nodePlatformAdapter.http.fetch("https://example.com"),
        ).rejects.toThrow(
          "No fetch implementation available in Node.js environment",
        );
      });
    });

    describe("Platform Integration", () => {
      it("should have correct platform identifier", () => {
        expect(nodePlatformAdapter.platform).toBe("node");
      });

      it("should provide all required adapters", () => {
        expect(nodePlatformAdapter.crypto).toBeDefined();
        expect(nodePlatformAdapter.pgp).toBeDefined();
        expect(nodePlatformAdapter.http).toBeDefined();
      });
    });
  });

  describe("Cross-Platform Compatibility", () => {
    it("should have consistent crypto interfaces", () => {
      const browserCrypto = browserPlatformAdapter.crypto;
      const nodeCrypto = nodePlatformAdapter.crypto;

      // Check that both have the same methods
      expect(typeof browserCrypto.encryptWithPublicKey).toBe("function");
      expect(typeof nodeCrypto.encryptWithPublicKey).toBe("function");
      expect(typeof browserCrypto.decryptWithPrivateKey).toBe("function");
      expect(typeof nodeCrypto.decryptWithPrivateKey).toBe("function");
      expect(typeof browserCrypto.generateKeyPair).toBe("function");
      expect(typeof nodeCrypto.generateKeyPair).toBe("function");
    });

    it("should have consistent PGP interfaces", () => {
      const browserPGP = browserPlatformAdapter.pgp;
      const nodePGP = nodePlatformAdapter.pgp;

      // Check that both have the same methods
      expect(typeof browserPGP.encrypt).toBe("function");
      expect(typeof nodePGP.encrypt).toBe("function");
      expect(typeof browserPGP.decrypt).toBe("function");
      expect(typeof nodePGP.decrypt).toBe("function");
      expect(typeof browserPGP.generateKeyPair).toBe("function");
      expect(typeof nodePGP.generateKeyPair).toBe("function");
    });

    it("should have consistent HTTP interfaces", () => {
      const browserHttp = browserPlatformAdapter.http;
      const nodeHttp = nodePlatformAdapter.http;

      // Check that both have the same methods
      expect(typeof browserHttp.fetch).toBe("function");
      expect(typeof nodeHttp.fetch).toBe("function");
    });
  });
});
