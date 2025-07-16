import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the global crypto object for testing
const mockCrypto = {
  subtle: {
    generateKey: vi.fn(),
    importKey: vi.fn(),
    exportKey: vi.fn(),
    deriveKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
  getRandomValues: vi.fn(),
};

// Mock global fetch
const mockFetch = vi.fn();

describe("BrowserPlatformAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Setup crypto mocks using vi.stubGlobal
    vi.stubGlobal("crypto", mockCrypto);
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe("BrowserCryptoAdapter Internal ECDH", () => {
    describe("decryptWithPrivateKey with invalid data", () => {
      it("should handle invalid JSON format", async () => {
        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        // Test with invalid JSON format
        await expect(
          adapter.crypto.decryptWithPrivateKey("invalid-json", "privatekey"),
        ).rejects.toThrow("Decryption failed:");
      });

      it("should handle missing required fields", async () => {
        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        // Test with missing fields
        const invalidData = JSON.stringify({
          encrypted: [1, 2, 3],
          // Missing iv and ephemeralPublicKey
        });

        await expect(
          adapter.crypto.decryptWithPrivateKey(invalidData, "privatekey"),
        ).rejects.toThrow("Decryption failed:");
      });

      it("should handle crypto.subtle errors during decryption", async () => {
        // Mock crypto.subtle to throw an error
        mockCrypto.subtle.importKey.mockRejectedValue(
          new Error("Import key failed"),
        );

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        const validData = JSON.stringify({
          encrypted: [1, 2, 3],
          iv: [4, 5, 6],
          ephemeralPublicKey: [7, 8, 9],
        });

        await expect(
          adapter.crypto.decryptWithPrivateKey(validData, "privatekey"),
        ).rejects.toThrow("Decryption failed:");
      });
    });
  });

  describe("BrowserCryptoAdapter", () => {
    describe("generateKeyPair", () => {
      it("should handle Web Crypto API errors", async () => {
        // Mock crypto.subtle.generateKey to throw an error
        mockCrypto.subtle.generateKey.mockRejectedValue(
          new Error("Key generation failed"),
        );

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(adapter.crypto.generateKeyPair()).rejects.toThrow(
          "key generation failed: Key generation failed",
        );
      });
    });

    describe("encryptWithPublicKey", () => {
      it("should handle Web Crypto API errors during encryption", async () => {
        // Mock crypto.subtle to throw an error during encryption
        mockCrypto.subtle.generateKey.mockRejectedValue(
          new Error("Key generation failed"),
        );

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.encryptWithPublicKey("data", "publickey"),
        ).rejects.toThrow("Encryption failed:");
      });
    });

    describe("decryptWithPrivateKey", () => {
      it("should handle Web Crypto API errors during decryption", async () => {
        // Mock crypto.subtle to throw an error during decryption
        mockCrypto.subtle.decrypt.mockRejectedValue(
          new Error("Decryption failed"),
        );

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        const validData = JSON.stringify({
          encrypted: [1, 2, 3],
          iv: [4, 5, 6],
          ephemeralPublicKey: [7, 8, 9],
        });

        await expect(
          adapter.crypto.decryptWithPrivateKey(validData, "privatekey"),
        ).rejects.toThrow("Decryption failed:");
      });
    });

    describe("encryptWithWalletPublicKey", () => {
      it("should handle eccrypto-js import errors", async () => {
        // Mock eccrypto-js import to fail
        vi.doMock("eccrypto-js", () => {
          throw new Error("Module not found");
        });

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.encryptWithWalletPublicKey("data", "publickey"),
        ).rejects.toThrow("encrypt with wallet public key failed");
      });
    });

    describe("decryptWithWalletPrivateKey", () => {
      it("should handle eccrypto-js import errors", async () => {
        // Mock eccrypto-js import to fail
        vi.doMock("eccrypto-js", () => {
          throw new Error("Module not found");
        });

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.decryptWithWalletPrivateKey("encrypted", "privatekey"),
        ).rejects.toThrow("decrypt with wallet private key failed");
      });
    });

    describe("encryptWithPassword", () => {
      it("should handle openpgp createMessage errors", async () => {
        // Mock openpgp createMessage to fail
        vi.doMock("openpgp", () => ({
          createMessage: vi
            .fn()
            .mockRejectedValue(new Error("CreateMessage failed")),
        }));

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.encryptWithPassword(
            new Uint8Array([1, 2, 3]),
            "password",
          ),
        ).rejects.toThrow("Failed to encrypt with password");
      });
    });

    describe("decryptWithPassword", () => {
      it("should handle openpgp readMessage errors", async () => {
        // Mock openpgp readMessage to fail
        vi.doMock("openpgp", () => ({
          readMessage: vi
            .fn()
            .mockRejectedValue(new Error("ReadMessage failed")),
        }));

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.decryptWithPassword(
            new Uint8Array([1, 2, 3]),
            "password",
          ),
        ).rejects.toThrow("Failed to decrypt with password");
      });
    });
  });

  describe("BrowserPGPAdapter", () => {
    describe("encrypt", () => {
      it("should handle openpgp errors", async () => {
        // Mock openpgp to throw an error
        vi.doMock("openpgp", () => ({
          readKey: vi.fn().mockRejectedValue(new Error("Invalid key")),
        }));

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(adapter.pgp.encrypt("data", "public-key")).rejects.toThrow(
          "PGP encryption failed: Error: Invalid key",
        );
      });
    });

    describe("decrypt", () => {
      it("should handle openpgp errors", async () => {
        // Mock openpgp to throw an error
        vi.doMock("openpgp", () => ({
          readPrivateKey: vi
            .fn()
            .mockRejectedValue(new Error("Invalid private key")),
        }));

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.pgp.decrypt("encrypted", "private-key"),
        ).rejects.toThrow("PGP decryption failed: Error: Invalid private key");
      });
    });

    describe("generateKeyPair", () => {
      it("should handle openpgp key generation errors", async () => {
        // Mock openpgp to throw an error
        vi.doMock("openpgp", () => ({
          generateKey: vi
            .fn()
            .mockRejectedValue(new Error("Key generation failed")),
        }));

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(adapter.pgp.generateKeyPair()).rejects.toThrow(
          "PGP key generation failed: Key generation failed",
        );
      });
    });
  });

  describe("BrowserHttpAdapter", () => {
    describe("fetch", () => {
      it("should use global fetch when available", async () => {
        mockFetch.mockResolvedValue({});

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await adapter.http.fetch("https://example.com");

        expect(mockFetch).toHaveBeenCalledWith(
          "https://example.com",
          undefined,
        );
      });

      it("should throw error when fetch is not available", async () => {
        // Remove fetch from global by stubbing it as undefined
        vi.stubGlobal("fetch", undefined);

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(adapter.http.fetch("https://example.com")).rejects.toThrow(
          "Fetch API not available in this browser environment",
        );
      });
    });
  });
});
