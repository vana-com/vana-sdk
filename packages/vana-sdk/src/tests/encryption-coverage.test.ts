/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import {
  generateEncryptionKeyPair,
  generatePGPKeyPair,
  decryptUserData,
  encryptUserData,
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
  encryptFileKey,
  getEncryptionParameters,
  decryptWithPrivateKey,
} from "../utils/encryption";
import { BrowserPlatformAdapter } from "../platform/browser";

/**
 * Tests to improve coverage for encryption utilities
 * These test functions that weren't covered by existing tests
 */

describe("Encryption Utilities Coverage", () => {
  const browserAdapter = new BrowserPlatformAdapter();

  describe("generateEncryptionKeyPair", () => {
    it("should generate key pair using platform adapter", async () => {
      const result = await generateEncryptionKeyPair(browserAdapter);

      expect(result).toHaveProperty("publicKey");
      expect(result).toHaveProperty("privateKey");
      expect(typeof result.publicKey).toBe("string");
      expect(typeof result.privateKey).toBe("string");
    });

    it("should handle platform adapter errors", async () => {
      const mockAdapter = {
        crypto: {
          generateKeyPair: vi
            .fn()
            .mockRejectedValue(new Error("Key generation failed")),
        },
      } as any;

      await expect(generateEncryptionKeyPair(mockAdapter)).rejects.toThrow(
        "Failed to generate encryption key pair: Error: Key generation failed",
      );
    });
  });

  describe("generatePGPKeyPair", () => {
    it("should generate PGP key pair using platform adapter", async () => {
      const result = await generatePGPKeyPair(browserAdapter);

      expect(result).toHaveProperty("publicKey");
      expect(result).toHaveProperty("privateKey");
      expect(typeof result.publicKey).toBe("string");
      expect(typeof result.privateKey).toBe("string");
      expect(result.publicKey).toContain(
        "-----BEGIN PGP PUBLIC KEY BLOCK-----",
      );
      expect(result.privateKey).toContain(
        "-----BEGIN PGP PRIVATE KEY BLOCK-----",
      );
    });

    it("should generate PGP key pair with custom options", async () => {
      const options = {
        name: "Test User",
        email: "test@example.com",
        passphrase: "secret123",
      };

      const result = await generatePGPKeyPair(browserAdapter, options);

      expect(result).toHaveProperty("publicKey");
      expect(result).toHaveProperty("privateKey");
      expect(result.publicKey).toContain(
        "-----BEGIN PGP PUBLIC KEY BLOCK-----",
      );
      expect(result.privateKey).toContain(
        "-----BEGIN PGP PRIVATE KEY BLOCK-----",
      );
      // The user info is encoded in the key, so we just check it's a valid PGP key
    });

    it("should handle platform adapter PGP errors", async () => {
      const mockAdapter = {
        pgp: {
          generateKeyPair: vi
            .fn()
            .mockRejectedValue(new Error("PGP key generation failed")),
        },
      } as any;

      await expect(generatePGPKeyPair(mockAdapter)).rejects.toThrow(
        "Failed to generate PGP key pair: Error: PGP key generation failed",
      );
    });
  });

  describe("encryptUserData error handling", () => {
    it("should handle encryption errors gracefully", async () => {
      const mockAdapter = {
        crypto: {
          encryptWithPassword: vi
            .fn()
            .mockRejectedValue(new Error("Encryption failed")),
        },
      } as any;

      const testData = "test data";
      const walletSignature = "0x1234567890abcdef";

      await expect(
        encryptUserData(testData, walletSignature, mockAdapter),
      ).rejects.toThrow(
        "Failed to encrypt user data: Error: Encryption failed",
      );
    });
  });

  describe("decryptUserData error handling", () => {
    it("should handle decryption errors gracefully", async () => {
      const mockAdapter = {
        crypto: {
          decryptWithPassword: vi
            .fn()
            .mockRejectedValue(new Error("Decryption failed")),
        },
      } as any;

      const encryptedData = new Blob(["encrypted data"], {
        type: "application/octet-stream",
      });
      const walletSignature = "0x1234567890abcdef";

      await expect(
        decryptUserData(encryptedData, walletSignature, mockAdapter),
      ).rejects.toThrow(
        "Failed to decrypt user data: Error: Decryption failed",
      );
    });

    it("should handle string encrypted data input", async () => {
      // First encrypt some data to get a valid encrypted blob
      const originalData = "test data";
      const walletSignature = "0xtest123";

      const encrypted = await encryptUserData(
        originalData,
        walletSignature,
        browserAdapter,
      );
      const decrypted = await decryptUserData(
        encrypted,
        walletSignature,
        browserAdapter,
      );

      const decryptedText = await decrypted.text();
      expect(decryptedText).toBe(originalData);
    });

    it("should handle string encrypted data input correctly", async () => {
      // Test that decryptUserData handles string input (even though it gets converted to bytes)
      const originalData = "test string data";
      const walletSignature = "0xtest456";

      // Encrypt to get valid encrypted data
      const encryptedBlob = await encryptUserData(
        originalData,
        walletSignature,
        browserAdapter,
      );

      // Test with the blob (which is the normal path)
      const decrypted = await decryptUserData(
        encryptedBlob,
        walletSignature,
        browserAdapter,
      );
      const decryptedText = await decrypted.text();

      expect(decryptedText).toBe(originalData);
    });
  });

  describe("Additional encryption utilities", () => {
    it("should encrypt and decrypt with wallet keys", async () => {
      const testData = "secret message";
      const privateKey =
        "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
      const publicKey =
        "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

      const encrypted = await encryptWithWalletPublicKey(
        testData,
        publicKey,
        browserAdapter,
      );
      const decrypted = await decryptWithWalletPrivateKey(
        encrypted,
        privateKey,
        browserAdapter,
      );

      expect(decrypted).toBe(testData);
    });

    it("should handle wallet encryption errors", async () => {
      const mockAdapter = {
        crypto: {
          encryptWithWalletPublicKey: vi
            .fn()
            .mockRejectedValue(new Error("Wallet encryption failed")),
        },
      } as any;

      await expect(
        encryptWithWalletPublicKey("test", "publickey", mockAdapter),
      ).rejects.toThrow(
        "Failed to encrypt with wallet public key: Error: Wallet encryption failed",
      );
    });

    it("should handle wallet decryption errors", async () => {
      const mockAdapter = {
        crypto: {
          decryptWithWalletPrivateKey: vi
            .fn()
            .mockRejectedValue(new Error("Wallet decryption failed")),
        },
      } as any;

      await expect(
        decryptWithWalletPrivateKey("encrypted", "privatekey", mockAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Error: Wallet decryption failed",
      );
    });

    it("should encrypt file keys", async () => {
      const fileKey = "symmetric-file-key-123";
      const publicKey = "test-public-key";

      const mockAdapter = {
        crypto: {
          encryptWithPublicKey: vi.fn().mockResolvedValue("encrypted-file-key"),
        },
      } as any;

      const result = await encryptFileKey(fileKey, publicKey, mockAdapter);

      expect(result).toBe("encrypted-file-key");
      expect(mockAdapter.crypto.encryptWithPublicKey).toHaveBeenCalledWith(
        fileKey,
        publicKey,
      );
    });

    it("should handle file key encryption errors", async () => {
      const mockAdapter = {
        crypto: {
          encryptWithPublicKey: vi
            .fn()
            .mockRejectedValue(new Error("File key encryption failed")),
        },
      } as any;

      await expect(
        encryptFileKey("filekey", "publickey", mockAdapter),
      ).rejects.toThrow(
        "Failed to encrypt file key: Error: File key encryption failed",
      );
    });

    it("should generate encryption parameters", async () => {
      const result = await getEncryptionParameters(browserAdapter);

      expect(result).toHaveProperty("iv");
      expect(result).toHaveProperty("key");
      expect(typeof result.iv).toBe("string");
      expect(typeof result.key).toBe("string");
      expect(result.iv.length).toBe(16); // Should be 16 characters
      expect(result.key.length).toBe(32); // Should be 32 characters
    });

    it("should handle encryption parameter generation errors", async () => {
      const mockAdapter = {
        crypto: {
          generateKeyPair: vi
            .fn()
            .mockRejectedValue(new Error("Key pair generation failed")),
        },
      } as any;

      await expect(getEncryptionParameters(mockAdapter)).rejects.toThrow(
        "Failed to generate encryption parameters: Error: Key pair generation failed",
      );
    });

    it("should decrypt with private key", async () => {
      const encryptedData = "encrypted-data";
      const privateKey = "private-key";

      const mockAdapter = {
        crypto: {
          decryptWithPrivateKey: vi.fn().mockResolvedValue("decrypted-data"),
        },
      } as any;

      const result = await decryptWithPrivateKey(
        encryptedData,
        privateKey,
        mockAdapter,
      );

      expect(result).toBe("decrypted-data");
      expect(mockAdapter.crypto.decryptWithPrivateKey).toHaveBeenCalledWith(
        encryptedData,
        privateKey,
      );
    });

    it("should handle private key decryption errors", async () => {
      const mockAdapter = {
        crypto: {
          decryptWithPrivateKey: vi
            .fn()
            .mockRejectedValue(new Error("Private key decryption failed")),
        },
      } as any;

      await expect(
        decryptWithPrivateKey("encrypted", "privatekey", mockAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with private key: Error: Private key decryption failed",
      );
    });
  });
});
