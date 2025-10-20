import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the eccrypto-js module
vi.mock("eccrypto-js", () => ({
  // Mock the functions that your adapter actually calls
  getPublicCompressed: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

// Mock openpgp module
vi.mock("openpgp", () => ({
  createMessage: vi.fn(),
  encrypt: vi.fn(),
  readMessage: vi.fn(),
  decrypt: vi.fn(),
  readKey: vi.fn(),
  readPrivateKey: vi.fn(),
  generateKey: vi.fn(),
  enums: {
    compression: {
      zlib: 1,
    },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("BrowserPlatformAdapter", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("BrowserCryptoAdapter", () => {
    // Removed obsolete eccrypto-js error tests - we now use our own ECIES implementation

    describe("decryptWithPrivateKey", () => {
      it("should handle invalid hex data", async () => {
        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.decryptWithPrivateKey("invalid-hex", "privatekey"),
        ).rejects.toThrow("decryptWithPrivateKey failed:");
      });
    });

    describe("encryptWithWalletPublicKey", () => {
      it("should handle eccrypto-js import errors", async () => {
        // Re-mock eccrypto-js to fail on import
        vi.doMock("eccrypto-js", () => {
          throw new Error("Module not found");
        });

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.encryptWithWalletPublicKey("data", "publickey"),
        ).rejects.toThrow("encryptWithWalletPublicKey failed");
      });
    });

    describe("decryptWithWalletPrivateKey", () => {
      it("should handle eccrypto-js import errors", async () => {
        // Re-mock eccrypto-js to fail on import
        vi.doMock("eccrypto-js", () => {
          throw new Error("Module not found");
        });

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.decryptWithWalletPrivateKey("encrypted", "privatekey"),
        ).rejects.toThrow("decryptWithWalletPrivateKey failed");
      });
    });

    describe("encryptWithPassword", () => {
      it("should handle openpgp createMessage errors", async () => {
        // Import the mocked module
        const openpgp = await import("openpgp");

        // Set up the mock to throw an error
        vi.mocked(openpgp.createMessage).mockRejectedValue(
          new Error("CreateMessage failed"),
        );

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.encryptWithPassword(
            new Uint8Array([1, 2, 3]),
            "password",
          ),
        ).rejects.toThrow("encryptWithPassword failed");
      });
    });

    describe("decryptWithPassword", () => {
      it("should handle openpgp readMessage errors", async () => {
        // Import the mocked module
        const openpgp = await import("openpgp");

        // Set up the mock to throw an error
        vi.mocked(openpgp.readMessage).mockRejectedValue(
          new Error("ReadMessage failed"),
        );

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.crypto.decryptWithPassword(
            new Uint8Array([1, 2, 3]),
            "password",
          ),
        ).rejects.toThrow("decryptWithPassword failed");
      });
    });
  });

  describe("BrowserPGPAdapter", () => {
    describe("encrypt", () => {
      it("should handle openpgp errors", async () => {
        // Import the mocked module
        const openpgp = await import("openpgp");

        // Set up the mock to throw an error
        vi.mocked(openpgp.readKey).mockRejectedValue(new Error("Invalid key"));

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(adapter.pgp.encrypt("data", "public-key")).rejects.toThrow(
          "PGP encryption failed: Error: Invalid key",
        );
      });
    });

    describe("decrypt", () => {
      it("should handle openpgp errors", async () => {
        // Import the mocked module
        const openpgp = await import("openpgp");

        // Set up the mock to throw an error
        vi.mocked(openpgp.readPrivateKey).mockRejectedValue(
          new Error("Invalid private key"),
        );

        const { BrowserPlatformAdapter } = await import("../platform/browser");
        const adapter = new BrowserPlatformAdapter();

        await expect(
          adapter.pgp.decrypt("encrypted", "private-key"),
        ).rejects.toThrow("PGP decryption failed: Error: Invalid private key");
      });
    });

    describe("generateKeyPair", () => {
      it("should handle openpgp key generation errors", async () => {
        // Import the mocked module
        const openpgp = await import("openpgp");

        // Set up the mock to throw an error
        vi.mocked(openpgp.generateKey).mockRejectedValue(
          new Error("Key generation failed"),
        );

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
        mockFetch.mockResolvedValue(new Response());

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

        await expect(
          adapter.http.fetch("https://example.com"),
        ).rejects.toThrow();
      });
    });
  });
});
