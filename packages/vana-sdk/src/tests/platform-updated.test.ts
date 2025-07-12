import { describe, it, expect, vi, afterEach } from "vitest";
import { browserPlatformAdapter } from "../platform/browser";
import { nodePlatformAdapter } from "../platform/node";

// Store original fetch for restoration
const originalFetch = globalThis.fetch;

describe("Platform Adapters - Production Ready", () => {
  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("Browser Platform Adapter", () => {
    describe("BrowserCryptoAdapter", () => {
      it("should encrypt and decrypt data with generated keys", async () => {
        // Generate real keys
        const keyPair = await browserPlatformAdapter.crypto.generateKeyPair();
        const data = "test data for encryption";

        // Encrypt
        const encrypted = await browserPlatformAdapter.crypto.encryptWithPublicKey(
          data,
          keyPair.publicKey,
        );

        // Should be JSON format (not placeholder)
        expect(() => JSON.parse(encrypted)).not.toThrow();
        expect(encrypted).not.toBe(data);

        // Decrypt
        const decrypted = await browserPlatformAdapter.crypto.decryptWithPrivateKey(
          encrypted,
          keyPair.privateKey,
        );

        expect(decrypted).toBe(data);
      });

      it("should generate valid key pairs", async () => {
        const keyPair = await browserPlatformAdapter.crypto.generateKeyPair();

        expect(keyPair).toHaveProperty("publicKey");
        expect(keyPair).toHaveProperty("privateKey");
        expect(typeof keyPair.publicKey).toBe("string");
        expect(typeof keyPair.privateKey).toBe("string");
        expect(keyPair.publicKey.length).toBeGreaterThan(0);
        expect(keyPair.privateKey.length).toBeGreaterThan(0);
      });

      it("should generate different keys on each call", async () => {
        const keyPair1 = await browserPlatformAdapter.crypto.generateKeyPair();
        const keyPair2 = await browserPlatformAdapter.crypto.generateKeyPair();

        expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
        expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      });

      it("should fail to decrypt malformed data", async () => {
        const keyPair = await browserPlatformAdapter.crypto.generateKeyPair();

        await expect(
          browserPlatformAdapter.crypto.decryptWithPrivateKey(
            "invalid-data",
            keyPair.privateKey,
          )
        ).rejects.toThrow();
      });
    });

    describe("BrowserPGPAdapter", () => {
      it("should encrypt and decrypt with PGP", async () => {
        // Generate real PGP keys
        const keyPair = await browserPlatformAdapter.pgp.generateKeyPair({
          name: "Test User",
          email: "test@vana.org"
        });

        const data = "sensitive pgp data";

        // Encrypt
        const encrypted = await browserPlatformAdapter.pgp.encrypt(
          data,
          keyPair.publicKey,
        );

        expect(encrypted).toContain("-----BEGIN PGP MESSAGE-----");
        expect(encrypted).toContain("-----END PGP MESSAGE-----");

        // Decrypt
        const decrypted = await browserPlatformAdapter.pgp.decrypt(
          encrypted,
          keyPair.privateKey,
        );

        expect(decrypted).toBe(data);
      }, 10000);

      it("should generate valid PGP key pairs", async () => {
        const keyPair = await browserPlatformAdapter.pgp.generateKeyPair();

        expect(keyPair).toHaveProperty("publicKey");
        expect(keyPair).toHaveProperty("privateKey");
        expect(keyPair.publicKey).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");
        expect(keyPair.publicKey).toContain("-----END PGP PUBLIC KEY BLOCK-----");
        expect(keyPair.privateKey).toContain("-----BEGIN PGP PRIVATE KEY BLOCK-----");
        expect(keyPair.privateKey).toContain("-----END PGP PRIVATE KEY BLOCK-----");
      }, 10000);

      it("should generate PGP keys with user options", async () => {
        const options = {
          name: "Production User",
          email: "production@vana.org",
          passphrase: "secure-passphrase",
        };

        const keyPair = await browserPlatformAdapter.pgp.generateKeyPair(options);

        expect(keyPair.publicKey).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");
        expect(keyPair.privateKey).toContain("-----BEGIN PGP PRIVATE KEY BLOCK-----");
      }, 10000);

      it("should fail to decrypt with wrong private key", async () => {
        const keyPair1 = await browserPlatformAdapter.pgp.generateKeyPair();
        const keyPair2 = await browserPlatformAdapter.pgp.generateKeyPair();

        const data = "secret message";
        const encrypted = await browserPlatformAdapter.pgp.encrypt(data, keyPair1.publicKey);

        await expect(
          browserPlatformAdapter.pgp.decrypt(encrypted, keyPair2.privateKey)
        ).rejects.toThrow();
      }, 15000);
    });

    describe("BrowserHttpAdapter", () => {
      it("should make HTTP requests", async () => {
        const mockResponse = new Response("test response", { status: 200 });
        globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

        const result = await browserPlatformAdapter.http.fetch("https://example.com");

        expect(result).toBe(mockResponse);
        expect(globalThis.fetch).toHaveBeenCalledWith("https://example.com", undefined);
      });

      it("should pass options to fetch", async () => {
        const mockResponse = new Response("test response", { status: 200 });
        globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

        const options = { method: "POST", headers: { "Content-Type": "application/json" } };
        const result = await browserPlatformAdapter.http.fetch("https://api.example.com", options);

        expect(result).toBe(mockResponse);
        expect(globalThis.fetch).toHaveBeenCalledWith("https://api.example.com", options);
      });

      it("should handle fetch errors", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

        await expect(
          browserPlatformAdapter.http.fetch("https://example.com")
        ).rejects.toThrow("Network error");
      });
    });
  });

  describe("Node Platform Adapter", () => {
    describe("NodeCryptoAdapter", () => {
      it("should encrypt and decrypt with eccrypto", async () => {
        const keyPair = await nodePlatformAdapter.crypto.generateKeyPair();
        const data = "node test data";

        const encrypted = await nodePlatformAdapter.crypto.encryptWithPublicKey(
          data,
          keyPair.publicKey,
        );

        expect(() => JSON.parse(encrypted)).not.toThrow();
        expect(encrypted).not.toBe(data);

        const decrypted = await nodePlatformAdapter.crypto.decryptWithPrivateKey(
          encrypted,
          keyPair.privateKey,
        );

        expect(decrypted).toBe(data);
      });

      it("should generate valid crypto keys", async () => {
        const keyPair = await nodePlatformAdapter.crypto.generateKeyPair();

        expect(keyPair.publicKey).toMatch(/^[0-9a-f]+$/i);
        expect(keyPair.privateKey).toMatch(/^[0-9a-f]+$/i);
        expect(keyPair.publicKey.length).toBeGreaterThan(0);
        expect(keyPair.privateKey.length).toBeGreaterThan(0);
      });
    });

    describe("NodePGPAdapter", () => {
      it("should encrypt and decrypt with OpenPGP", async () => {
        const keyPair = await nodePlatformAdapter.pgp.generateKeyPair({
          name: "Node User",
          email: "node@vana.org"
        });

        const data = "node pgp data";
        const encrypted = await nodePlatformAdapter.pgp.encrypt(data, keyPair.publicKey);

        expect(encrypted).toContain("-----BEGIN PGP MESSAGE-----");

        const decrypted = await nodePlatformAdapter.pgp.decrypt(encrypted, keyPair.privateKey);
        expect(decrypted).toBe(data);
      }, 10000);

      it("should generate PGP keys", async () => {
        const keyPair = await nodePlatformAdapter.pgp.generateKeyPair();

        expect(keyPair.publicKey).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");
        expect(keyPair.privateKey).toContain("-----BEGIN PGP PRIVATE KEY BLOCK-----");
      }, 10000);
    });

    describe("NodeHttpAdapter", () => {
      it("should use global fetch when available", async () => {
        const mockResponse = new Response("node response");
        globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

        const result = await nodePlatformAdapter.http.fetch("https://node-test.com");
        expect(result).toBe(mockResponse);
      });

      it("should throw error when fetch unavailable", async () => {
        globalThis.fetch = undefined as unknown as typeof fetch;

        await expect(
          nodePlatformAdapter.http.fetch("https://example.com")
        ).rejects.toThrow("No fetch implementation available");
      });
    });
  });
});