import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("NodePlatformAdapter", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("NodeCryptoAdapter", () => {
    // Removed obsolete eccrypto error handling tests - we now use our own ECIES implementation

    describe("encryptWithPublicKey 0x prefix handling", () => {
      it("should handle public keys with 0x prefix", async () => {
        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        // Generate a test key pair
        const keyPair = await adapter.crypto.generateKeyPair();

        // Add 0x prefix to public key
        const publicKeyWith0x = `0x${keyPair.publicKey}`;
        const testData = "test message";

        // Should not throw when using 0x-prefixed public key
        const encrypted = await adapter.crypto.encryptWithPublicKey(
          testData,
          publicKeyWith0x,
        );

        expect(encrypted).toBeTruthy();
        expect(typeof encrypted).toBe("string");
        expect(encrypted.length).toBeGreaterThan(0);

        // Verify we can decrypt it
        const decrypted = await adapter.crypto.decryptWithPrivateKey(
          encrypted,
          keyPair.privateKey,
        );
        expect(decrypted).toBe(testData);
      });

      it("should handle public keys without 0x prefix", async () => {
        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        const keyPair = await adapter.crypto.generateKeyPair();
        const testData = "test message";

        // Should work without 0x prefix as well
        const encrypted = await adapter.crypto.encryptWithPublicKey(
          testData,
          keyPair.publicKey,
        );

        expect(encrypted).toBeTruthy();
        expect(typeof encrypted).toBe("string");

        const decrypted = await adapter.crypto.decryptWithPrivateKey(
          encrypted,
          keyPair.privateKey,
        );
        expect(decrypted).toBe(testData);
      });

      it("should handle encrypted data with 0x prefix in decryption", async () => {
        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        const keyPair = await adapter.crypto.generateKeyPair();
        const testData = "test message";

        const encrypted = await adapter.crypto.encryptWithPublicKey(
          testData,
          keyPair.publicKey,
        );

        // Add 0x prefix to encrypted data (as viem.toHex would do)
        const encryptedWith0x = `0x${encrypted}`;

        // Should handle 0x-prefixed encrypted data
        const decrypted = await adapter.crypto.decryptWithPrivateKey(
          encryptedWith0x,
          keyPair.privateKey,
        );
        expect(decrypted).toBe(testData);
      });
    });

    describe("encryptWithPassword edge cases", () => {
      it("should handle unexpected encrypted data format", async () => {
        // Mock openpgp to return unexpected format
        vi.doMock("openpgp", () => ({
          createMessage: vi.fn().mockResolvedValue({}),
          encrypt: vi.fn().mockResolvedValue("unexpected-string-format"),
        }));

        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        await expect(
          adapter.crypto.encryptWithPassword(
            new Uint8Array([1, 2, 3]),
            "password",
          ),
        ).rejects.toThrow("Unexpected encrypted data format");
      });

      it("should handle stream response from encrypt", async () => {
        const mockStream = {
          getReader: vi.fn().mockReturnValue({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                value: new Uint8Array([1, 2]),
                done: false,
              })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        };

        vi.doMock("openpgp", () => ({
          createMessage: vi.fn().mockResolvedValue({}),
          encrypt: vi.fn().mockResolvedValue(mockStream),
        }));

        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        const result = await adapter.crypto.encryptWithPassword(
          new Uint8Array([1, 2, 3]),
          "password",
        );

        expect(result).toEqual(new Uint8Array([1, 2]));
      });
    });
  });

  describe("NodeHttpAdapter", () => {
    describe("fetch implementation", () => {
      it("should use globalThis.fetch when available", async () => {
        const mockFetch = vi.fn().mockResolvedValue({});
        global.globalThis.fetch = mockFetch;

        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        await adapter.http.fetch("https://example.com");

        expect(mockFetch).toHaveBeenCalledWith(
          "https://example.com",
          undefined,
        );
      });

      it("should throw error when no fetch implementation is available", async () => {
        const originalFetch = global.globalThis.fetch;
        delete (global.globalThis as unknown as { fetch?: typeof fetch }).fetch;

        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        await expect(adapter.http.fetch("https://example.com")).rejects.toThrow(
          "No fetch implementation available in Node.js environment",
        );

        // Restore original fetch
        global.globalThis.fetch = originalFetch;
      });
    });
  });

  describe("NodePGPAdapter", () => {
    describe("decrypt error handling", () => {
      it("should handle PGP decryption errors", async () => {
        // Mock openpgp to throw an error during decryption
        vi.doMock("openpgp", () => ({
          readPrivateKey: vi
            .fn()
            .mockRejectedValue(new Error("Invalid private key")),
        }));

        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        await expect(
          adapter.pgp.decrypt("encrypted-data", "private-key"),
        ).rejects.toThrow("PGP decryption failed: Invalid private key");
      });

      it("should handle PGP message read errors", async () => {
        // Mock openpgp to throw an error during message reading
        vi.doMock("openpgp", () => ({
          readPrivateKey: vi.fn().mockResolvedValue({}),
          readMessage: vi
            .fn()
            .mockRejectedValue(new Error("Invalid message format")),
        }));

        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        await expect(
          adapter.pgp.decrypt("encrypted-data", "private-key"),
        ).rejects.toThrow("PGP decryption failed: Invalid message format");
      });
    });

    describe("generateKeyPair error handling", () => {
      it("should handle PGP key generation errors", async () => {
        // Mock openpgp to throw an error during key generation
        vi.doMock("openpgp", () => ({
          generateKey: vi
            .fn()
            .mockRejectedValue(new Error("Key generation failed")),
        }));

        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        await expect(adapter.pgp.generateKeyPair()).rejects.toThrow(
          "PGP key generation failed: Key generation failed",
        );
      });
    });
  });
});
