import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("NodePlatformAdapter", () => {
  let _NodePlatformAdapter: unknown;

  beforeEach(async () => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("NodeCryptoAdapter", () => {
    describe("getEccrypto error handling", () => {
      it("should throw error when eccrypto library fails to load", async () => {
        // Mock eccrypto import to fail
        vi.doMock("eccrypto", () => {
          throw new Error("Module not found");
        });

        // Import NodePlatformAdapter after mocking
        const { NodePlatformAdapter: NPAdapter } = await import(
          "../platform/node"
        );
        const adapter = new NPAdapter();

        // Test should fail initially - this tests the error handling branch
        await expect(adapter.crypto.generateKeyPair()).rejects.toThrow(
          "key generation failed: Failed to load module",
        );
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
