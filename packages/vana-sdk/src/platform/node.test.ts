import { describe, it, expect } from "vitest";
import { NodePlatformAdapter } from "./node";

describe("Node Platform Adapter Error Handling", () => {
  const adapter = new NodePlatformAdapter();

  describe("Crypto Adapter Error Paths", () => {
    it("should handle decryptWithPassword errors (lines 258-259)", async () => {
      // Test with invalid encrypted data to trigger error
      const invalidEncryptedData = new Uint8Array([1, 2, 3, 4, 5]);
      const password = "test-password";

      await expect(
        adapter.crypto.decryptWithPassword(invalidEncryptedData, password),
      ).rejects.toThrow("decrypt with password");
    });

    it("should handle invalid password in decryptWithPassword", async () => {
      // Create some invalid encrypted data that will cause OpenPGP to throw
      const invalidData = new Uint8Array(Buffer.from("invalid-pgp-data"));
      const password = "wrong-password";

      await expect(
        adapter.crypto.decryptWithPassword(invalidData, password),
      ).rejects.toThrow("decrypt with password");
    });
  });

  describe("PGP Adapter Error Paths", () => {
    it("should handle PGP encrypt errors (lines 281-282)", async () => {
      // Test with invalid public key to trigger error
      const data = "test data";
      const invalidPublicKey = "invalid-public-key-format";

      await expect(adapter.pgp.encrypt(data, invalidPublicKey)).rejects.toThrow(
        "PGP encryption",
      );
    });

    it("should handle malformed PGP public key", async () => {
      // Test with malformed but more realistic looking key
      const data = "test data";
      const malformedKey =
        "-----BEGIN PGP PUBLIC KEY BLOCK-----\nmalformed\n-----END PGP PUBLIC KEY BLOCK-----";

      await expect(adapter.pgp.encrypt(data, malformedKey)).rejects.toThrow(
        "PGP encryption",
      );
    });
  });

  describe("HTTP Adapter Error Paths", () => {
    it("should handle missing fetch implementation", async () => {
      // Mock globalThis.fetch to be undefined
      const originalFetch = globalThis.fetch;
      // @ts-expect-error - Intentionally setting fetch to undefined to test error handling
      globalThis.fetch = undefined;

      try {
        await expect(adapter.http.fetch("https://example.com")).rejects.toThrow(
          "No fetch implementation available",
        );
      } finally {
        // Restore original fetch
        globalThis.fetch = originalFetch;
      }
    });
  });
});
