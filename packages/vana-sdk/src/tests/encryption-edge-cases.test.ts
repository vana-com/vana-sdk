import { describe, it, expect, vi } from "vitest";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import {
  generateEncryptionKey,
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
  encryptBlobWithSignedKey,
  decryptBlobWithSignedKey,
  encryptFileKey,
  decryptWithPrivateKey,
  getEncryptionParameters,
  generateEncryptionKeyPair,
  generatePGPKeyPair,
} from "../utils/encryption";
import type { WalletClient } from "viem";

/**
 * Tests to improve coverage for encryption utilities edge cases
 * These test error conditions and edge cases that weren't covered by existing tests
 */

describe("Encryption Edge Cases Coverage", () => {
  describe("generateEncryptionKey", () => {
    it("should throw error when wallet account is missing", async () => {
      const mockWallet = {
        account: undefined,
        signMessage: vi.fn(),
      } as unknown as WalletClient;

      await expect(
        generateEncryptionKey(mockWallet, mockPlatformAdapter),
      ).rejects.toThrow(
        "Wallet account is required for encryption key generation",
      );
    });

    it("should handle custom seed parameter", async () => {
      const mockWallet = {
        account: { address: "0x123" },
        signMessage: vi.fn().mockResolvedValue("0xsignature"),
      } as unknown as WalletClient;

      const result = await generateEncryptionKey(
        mockWallet,
        mockPlatformAdapter,
        "custom-seed",
      );
      expect(result).toBe("0xsignature");
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: { address: "0x123" },
        message: "custom-seed",
      });
    });
  });

  describe("encryptWithWalletPublicKey error handling", () => {
    it("should handle platform adapter errors", async () => {
      const errorAdapter = {
        ...mockPlatformAdapter,
        crypto: {
          ...mockPlatformAdapter.crypto,
          encryptWithWalletPublicKey: vi
            .fn()
            .mockRejectedValue(new Error("Platform error")),
        },
      };

      await expect(
        encryptWithWalletPublicKey("test data", "publickey", errorAdapter),
      ).rejects.toThrow(
        "Failed to encrypt with wallet public key: Error: Platform error",
      );
    });
  });

  describe("decryptWithWalletPrivateKey error handling", () => {
    it("should handle platform adapter errors", async () => {
      const errorAdapter = {
        ...mockPlatformAdapter,
        crypto: {
          ...mockPlatformAdapter.crypto,
          decryptWithWalletPrivateKey: vi
            .fn()
            .mockRejectedValue(new Error("Decryption failed")),
        },
      };

      await expect(
        decryptWithWalletPrivateKey("encrypted", "privatekey", errorAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Error: Decryption failed",
      );
    });
  });

  describe("encryptBlobWithSignedKey with string input", () => {
    it("should handle string input correctly", async () => {
      const testData = "String data for encryption";
      const testSignature = "0xsignature";

      const result = await encryptBlobWithSignedKey(
        testData,
        testSignature,
        mockPlatformAdapter,
      );

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe("application/octet-stream");
    });

    it("should handle encryption errors", async () => {
      const errorAdapter = {
        ...mockPlatformAdapter,
        crypto: {
          ...mockPlatformAdapter.crypto,
          encryptWithPassword: vi
            .fn()
            .mockRejectedValue(new Error("Encryption failed")),
        },
      };

      await expect(
        encryptBlobWithSignedKey("test", "signature", errorAdapter),
      ).rejects.toThrow("Failed to encrypt data: Error: Encryption failed");
    });
  });

  describe("decryptBlobWithSignedKey with string input", () => {
    it("should handle string input correctly", async () => {
      const testEncryptedData = "encrypted-string-data";
      const testSignature = "0xsignature";

      const result = await decryptBlobWithSignedKey(
        testEncryptedData,
        testSignature,
        mockPlatformAdapter,
      );

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe("text/plain");
    });

    it("should handle decryption errors", async () => {
      const errorAdapter = {
        ...mockPlatformAdapter,
        crypto: {
          ...mockPlatformAdapter.crypto,
          decryptWithPassword: vi
            .fn()
            .mockRejectedValue(new Error("Decryption failed")),
        },
      };

      await expect(
        decryptBlobWithSignedKey("encrypted", "signature", errorAdapter),
      ).rejects.toThrow("Failed to decrypt data: Error: Decryption failed");
    });
  });

  describe("encryptFileKey error handling", () => {
    it("should handle platform adapter errors", async () => {
      const errorAdapter = {
        ...mockPlatformAdapter,
        crypto: {
          ...mockPlatformAdapter.crypto,
          encryptWithPublicKey: vi
            .fn()
            .mockRejectedValue(new Error("File key encryption failed")),
        },
      };

      await expect(
        encryptFileKey("filekey", "publickey", errorAdapter),
      ).rejects.toThrow(
        "Failed to encrypt file key: Error: File key encryption failed",
      );
    });
  });

  describe("decryptWithPrivateKey error handling", () => {
    it("should handle platform adapter errors", async () => {
      const errorAdapter = {
        ...mockPlatformAdapter,
        crypto: {
          ...mockPlatformAdapter.crypto,
          decryptWithPrivateKey: vi
            .fn()
            .mockRejectedValue(new Error("Private key decryption failed")),
        },
      };

      await expect(
        decryptWithPrivateKey("encrypted", "privatekey", errorAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with private key: Error: Private key decryption failed",
      );
    });
  });

  describe("getEncryptionParameters error handling", () => {
    it("should handle platform adapter errors", async () => {
      const errorAdapter = {
        ...mockPlatformAdapter,
        crypto: {
          ...mockPlatformAdapter.crypto,
          generateKeyPair: vi
            .fn()
            .mockRejectedValue(new Error("Key generation failed")),
        },
      };

      await expect(getEncryptionParameters(errorAdapter)).rejects.toThrow(
        "Failed to generate encryption parameters: Error: Key generation failed",
      );
    });
  });

  describe("generateEncryptionKeyPair error handling", () => {
    it("should handle platform adapter errors", async () => {
      const errorAdapter = {
        ...mockPlatformAdapter,
        crypto: {
          ...mockPlatformAdapter.crypto,
          generateKeyPair: vi
            .fn()
            .mockRejectedValue(new Error("Key pair generation failed")),
        },
      };

      await expect(generateEncryptionKeyPair(errorAdapter)).rejects.toThrow(
        "Failed to generate encryption key pair: Error: Key pair generation failed",
      );
    });
  });

  describe("generatePGPKeyPair error handling", () => {
    it("should handle platform adapter errors", async () => {
      const errorAdapter = {
        ...mockPlatformAdapter,
        pgp: {
          ...mockPlatformAdapter.pgp,
          generateKeyPair: vi
            .fn()
            .mockRejectedValue(new Error("PGP key generation failed")),
        },
      };

      await expect(generatePGPKeyPair(errorAdapter)).rejects.toThrow(
        "Failed to generate PGP key pair: Error: PGP key generation failed",
      );
    });
  });
});
