/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
} from "../utils/encryption";
import type { VanaPlatformAdapter } from "../platform/interface";

// Create a mock platform adapter
const mockPlatformAdapter: VanaPlatformAdapter = {
  crypto: {
    encryptWithPublicKey: vi.fn(),
    decryptWithPrivateKey: vi.fn(),
    generateKeyPair: vi.fn(),
  },
  pgp: {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    generateKeyPair: vi.fn(),
  },
  http: {
    fetch: vi.fn(),
  },
  platform: "node",
};

// No longer need to mock the platform module since we pass platform adapters directly

describe("Wallet Encryption Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("encryptWithWalletPublicKey", () => {
    it("should encrypt data with wallet public key", async () => {
      const testData = "test data to encrypt";
      const publicKey =
        "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      const expectedEncryptedData = "encrypted-hex-data";

      (
        mockPlatformAdapter.crypto.encryptWithPublicKey as any
      ).mockResolvedValue(expectedEncryptedData);

      const result = await encryptWithWalletPublicKey(testData, publicKey, mockPlatformAdapter);

      expect(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).toHaveBeenCalledWith(testData, publicKey);
      expect(result).toBe(expectedEncryptedData);
    });

    it("should handle public key without 0x prefix", async () => {
      const testData = "test data";
      const publicKey =
        "04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      const expectedEncryptedData = "encrypted-hex-data";

      (
        mockPlatformAdapter.crypto.encryptWithPublicKey as any
      ).mockResolvedValue(expectedEncryptedData);

      await encryptWithWalletPublicKey(testData, publicKey, mockPlatformAdapter);

      expect(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).toHaveBeenCalledWith(testData, publicKey);
    });

    it("should handle compressed public key (64 bytes)", async () => {
      const testData = "test data";
      const compressedKey =
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"; // 64 bytes (32 * 2)

      const expectedEncryptedData = "encrypted-hex-data";

      (
        mockPlatformAdapter.crypto.encryptWithPublicKey as any
      ).mockResolvedValue(expectedEncryptedData);

      await encryptWithWalletPublicKey(testData, compressedKey, mockPlatformAdapter);

      expect(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).toHaveBeenCalledWith(testData, compressedKey);
    });

    it("should handle uncompressed public key (65 bytes) without modification", async () => {
      const testData = "test data";
      const uncompressedKey =
        "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"; // 65 bytes

      const expectedEncryptedData = "encrypted-hex-data";

      (
        mockPlatformAdapter.crypto.encryptWithPublicKey as any
      ).mockResolvedValue(expectedEncryptedData);

      await encryptWithWalletPublicKey(testData, uncompressedKey, mockPlatformAdapter);

      expect(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).toHaveBeenCalledWith(testData, uncompressedKey);
    });

    it("should throw error when encryption fails", async () => {
      const testData = "test data";
      const publicKey =
        "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      (
        mockPlatformAdapter.crypto.encryptWithPublicKey as any
      ).mockRejectedValue(new Error("Encryption failed"));

      await expect(
        encryptWithWalletPublicKey(testData, publicKey, mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to encrypt with wallet public key: Error: Encryption failed",
      );
    });

    it("should handle unknown error types", async () => {
      const testData = "test data";
      const publicKey =
        "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      (
        mockPlatformAdapter.crypto.encryptWithPublicKey as any
      ).mockRejectedValue("Unknown error");

      await expect(
        encryptWithWalletPublicKey(testData, publicKey, mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to encrypt with wallet public key: Unknown error",
      );
    });
  });

  describe("decryptWithWalletPrivateKey", () => {
    it("should decrypt data with wallet private key", async () => {
      const encryptedData = "abcdef1234567890";
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";
      const expectedDecrypted = "decrypted data";

      (
        mockPlatformAdapter.crypto.decryptWithPrivateKey as any
      ).mockResolvedValue(expectedDecrypted);

      const result = await decryptWithWalletPrivateKey(
        encryptedData,
        privateKey,
        mockPlatformAdapter,
      );

      expect(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).toHaveBeenCalledWith(encryptedData, privateKey);
      expect(result).toBe(expectedDecrypted);
    });

    it("should handle private key without 0x prefix", async () => {
      const encryptedData = "abcdef1234567890";
      const privateKey =
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";
      const expectedDecrypted = "decrypted data";

      (
        mockPlatformAdapter.crypto.decryptWithPrivateKey as any
      ).mockResolvedValue(expectedDecrypted);

      await decryptWithWalletPrivateKey(encryptedData, privateKey, mockPlatformAdapter);

      expect(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).toHaveBeenCalledWith(encryptedData, privateKey);
    });

    it("should properly parse encrypted data structure", async () => {
      // Create a realistic encrypted data structure
      // 16 bytes IV + 65 bytes ephemeral key + variable ciphertext + 32 bytes MAC
      const minimumSize = 16 + 65 + 10 + 32; // 123 bytes minimum
      const mockEncryptedData = "a".repeat(minimumSize * 2); // hex string (double length)

      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";
      const expectedDecrypted = "decrypted data";

      (
        mockPlatformAdapter.crypto.decryptWithPrivateKey as any
      ).mockResolvedValue(expectedDecrypted);

      const result = await decryptWithWalletPrivateKey(
        mockEncryptedData,
        privateKey,
        mockPlatformAdapter,
      );

      // Verify the decryption was called and returned expected result
      expect(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).toHaveBeenCalledWith(mockEncryptedData, privateKey);
      expect(result).toBe(expectedDecrypted);
    });

    it("should throw error when decryption fails", async () => {
      const encryptedData = "abcdef1234567890";
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

      (
        mockPlatformAdapter.crypto.decryptWithPrivateKey as any
      ).mockRejectedValue(new Error("Decryption failed"));

      await expect(
        decryptWithWalletPrivateKey(encryptedData, privateKey, mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Error: Decryption failed",
      );
    });

    it("should handle unknown error types in decryption", async () => {
      const encryptedData = "abcdef1234567890";
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

      (
        mockPlatformAdapter.crypto.decryptWithPrivateKey as any
      ).mockRejectedValue("Unknown error");

      await expect(
        decryptWithWalletPrivateKey(encryptedData, privateKey, mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Unknown error",
      );
    });

    it("should throw error for invalid encrypted data format", async () => {
      const invalidEncryptedData = "too-short";
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

      (
        mockPlatformAdapter.crypto.decryptWithPrivateKey as any
      ).mockRejectedValue(new Error("Invalid encrypted data format"));

      await expect(
        decryptWithWalletPrivateKey(invalidEncryptedData, privateKey, mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Error: Invalid encrypted data format",
      );
    });
  });

  describe("Round-trip encryption/decryption", () => {
    it("should successfully encrypt and decrypt data", async () => {
      const originalData = "This is secret data that needs to be encrypted";
      const publicKey =
        "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

      const encryptedHexData = "encrypted-hex-data";

      // Mock encryption to return encrypted data
      (
        mockPlatformAdapter.crypto.encryptWithPublicKey as any
      ).mockResolvedValue(encryptedHexData);

      // Encrypt
      const encryptedData = await encryptWithWalletPublicKey(
        originalData,
        publicKey,
        mockPlatformAdapter,
      );

      // Mock decryption to return original data
      (
        mockPlatformAdapter.crypto.decryptWithPrivateKey as any
      ).mockResolvedValue(originalData);

      // Decrypt
      const decryptedData = await decryptWithWalletPrivateKey(
        encryptedData,
        privateKey,
        mockPlatformAdapter,
      );

      expect(decryptedData).toBe(originalData);
      expect(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
