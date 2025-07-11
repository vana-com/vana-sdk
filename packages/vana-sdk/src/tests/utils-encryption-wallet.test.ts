/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
} from "../utils/encryption";
import * as eccrypto from "eccrypto";

// Mock eccrypto
vi.mock("eccrypto", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

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

      const mockEncryptedResult = {
        iv: Buffer.from("test-iv", "utf8"),
        ephemPublicKey: Buffer.from("test-ephemeral-key", "utf8"),
        ciphertext: Buffer.from("test-ciphertext", "utf8"),
        mac: Buffer.from("test-mac", "utf8"),
      };

      (eccrypto.encrypt as any).mockResolvedValue(mockEncryptedResult);

      const result = await encryptWithWalletPublicKey(testData, publicKey);

      expect(eccrypto.encrypt).toHaveBeenCalledWith(
        expect.any(Buffer),
        Buffer.from(testData),
      );
      expect(result).toBe(
        Buffer.concat([
          mockEncryptedResult.iv,
          mockEncryptedResult.ephemPublicKey,
          mockEncryptedResult.ciphertext,
          mockEncryptedResult.mac,
        ]).toString("hex"),
      );
    });

    it("should handle public key without 0x prefix", async () => {
      const testData = "test data";
      const publicKey =
        "04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      const mockEncryptedResult = {
        iv: Buffer.from("iv", "utf8"),
        ephemPublicKey: Buffer.from("ephemKey", "utf8"),
        ciphertext: Buffer.from("cipher", "utf8"),
        mac: Buffer.from("mac", "utf8"),
      };

      (eccrypto.encrypt as any).mockResolvedValue(mockEncryptedResult);

      await encryptWithWalletPublicKey(testData, publicKey);

      expect(eccrypto.encrypt as any).toHaveBeenCalledWith(
        expect.any(Buffer),
        Buffer.from(testData),
      );
    });

    it("should handle compressed public key (64 bytes) by adding uncompressed prefix", async () => {
      const testData = "test data";
      const compressedKey =
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"; // 64 bytes (32 * 2)

      const mockEncryptedResult = {
        iv: Buffer.from("iv", "utf8"),
        ephemPublicKey: Buffer.from("ephemKey", "utf8"),
        ciphertext: Buffer.from("cipher", "utf8"),
        mac: Buffer.from("mac", "utf8"),
      };

      (eccrypto.encrypt as any).mockResolvedValue(mockEncryptedResult);

      await encryptWithWalletPublicKey(testData, compressedKey);

      const expectedBuffer = Buffer.concat([
        Buffer.from([4]), // Uncompressed prefix
        Buffer.from(compressedKey.slice(2), "hex"),
      ]);

      expect(eccrypto.encrypt as any).toHaveBeenCalledWith(
        expectedBuffer,
        Buffer.from(testData),
      );
    });

    it("should handle uncompressed public key (65 bytes) without modification", async () => {
      const testData = "test data";
      const uncompressedKey =
        "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"; // 65 bytes

      const mockEncryptedResult = {
        iv: Buffer.from("iv", "utf8"),
        ephemPublicKey: Buffer.from("ephemKey", "utf8"),
        ciphertext: Buffer.from("cipher", "utf8"),
        mac: Buffer.from("mac", "utf8"),
      };

      (eccrypto.encrypt as any).mockResolvedValue(mockEncryptedResult);

      await encryptWithWalletPublicKey(testData, uncompressedKey);

      const expectedBuffer = Buffer.from(uncompressedKey.slice(2), "hex");

      expect(eccrypto.encrypt as any).toHaveBeenCalledWith(
        expectedBuffer,
        Buffer.from(testData),
      );
    });

    it("should throw error when encryption fails", async () => {
      const testData = "test data";
      const publicKey =
        "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      (eccrypto.encrypt as any).mockRejectedValue(
        new Error("Encryption failed"),
      );

      await expect(
        encryptWithWalletPublicKey(testData, publicKey),
      ).rejects.toThrow(
        "Failed to encrypt with wallet public key: Encryption failed",
      );
    });

    it("should handle unknown error types", async () => {
      const testData = "test data";
      const publicKey =
        "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      (eccrypto.encrypt as any).mockRejectedValue("Unknown error");

      await expect(
        encryptWithWalletPublicKey(testData, publicKey),
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

      (eccrypto.decrypt as any).mockResolvedValue(
        Buffer.from(expectedDecrypted),
      );

      const result = await decryptWithWalletPrivateKey(
        encryptedData,
        privateKey,
      );

      expect(eccrypto.decrypt as any).toHaveBeenCalledWith(
        Buffer.from(privateKey.slice(2), "hex"),
        expect.any(Object),
      );
      expect(result).toBe(expectedDecrypted);
    });

    it("should handle private key without 0x prefix", async () => {
      const encryptedData = "abcdef1234567890";
      const privateKey =
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";
      const expectedDecrypted = "decrypted data";

      (eccrypto.decrypt as any).mockResolvedValue(
        Buffer.from(expectedDecrypted),
      );

      await decryptWithWalletPrivateKey(encryptedData, privateKey);

      expect(eccrypto.decrypt as any).toHaveBeenCalledWith(
        Buffer.from(privateKey, "hex"),
        expect.any(Object),
      );
    });

    it("should properly parse encrypted data structure", async () => {
      // Create a realistic encrypted data structure
      // 16 bytes IV + 65 bytes ephemeral key + variable ciphertext + 32 bytes MAC
      const minimumSize = 16 + 65 + 10 + 32; // 123 bytes minimum
      const mockEncryptedData = "a".repeat(minimumSize * 2); // hex string (double length)

      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";
      const expectedDecrypted = "decrypted data";

      (eccrypto.decrypt as any).mockResolvedValue(
        Buffer.from(expectedDecrypted),
      );

      const result = await decryptWithWalletPrivateKey(
        mockEncryptedData,
        privateKey,
      );

      // Verify the decryption was called and returned expected result
      expect(eccrypto.decrypt as any).toHaveBeenCalledWith(
        Buffer.from(privateKey.slice(2), "hex"),
        expect.objectContaining({
          iv: expect.any(Buffer),
          ephemPublicKey: expect.any(Buffer),
          ciphertext: expect.any(Buffer),
          mac: expect.any(Buffer),
        }),
      );
      expect(result).toBe(expectedDecrypted);
    });

    it("should throw error when decryption fails", async () => {
      const encryptedData = "abcdef1234567890";
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

      (eccrypto.decrypt as any).mockRejectedValue(
        new Error("Decryption failed"),
      );

      await expect(
        decryptWithWalletPrivateKey(encryptedData, privateKey),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Decryption failed",
      );
    });

    it("should handle unknown error types in decryption", async () => {
      const encryptedData = "abcdef1234567890";
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

      (eccrypto.decrypt as any).mockRejectedValue("Unknown error");

      await expect(
        decryptWithWalletPrivateKey(encryptedData, privateKey),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Unknown error",
      );
    });

    it("should throw error for invalid encrypted data format", async () => {
      const invalidEncryptedData = "too-short";
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

      await expect(
        decryptWithWalletPrivateKey(invalidEncryptedData, privateKey),
      ).rejects.toThrow("Failed to decrypt with wallet private key");
    });
  });

  describe("Round-trip encryption/decryption", () => {
    it("should successfully encrypt and decrypt data", async () => {
      const originalData = "This is secret data that needs to be encrypted";
      const publicKey =
        "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

      // Mock encryption
      const mockEncryptedResult = {
        iv: Buffer.from("test-iv-16bytes!", "utf8"),
        ephemPublicKey: Buffer.from("04" + "a".repeat(128), "hex"),
        ciphertext: Buffer.from("encrypted-content", "utf8"),
        mac: Buffer.from("test-mac-32bytes-test-mac-32b", "utf8"),
      };

      (eccrypto.encrypt as any).mockResolvedValue(mockEncryptedResult);

      // Encrypt
      const encryptedData = await encryptWithWalletPublicKey(
        originalData,
        publicKey,
      );

      // Mock decryption to return original data
      (eccrypto.decrypt as any).mockResolvedValue(Buffer.from(originalData));

      // Decrypt
      const decryptedData = await decryptWithWalletPrivateKey(
        encryptedData,
        privateKey,
      );

      expect(decryptedData).toBe(originalData);
      expect(eccrypto.encrypt as any).toHaveBeenCalledTimes(1);
      expect(eccrypto.decrypt as any).toHaveBeenCalledTimes(1);
    });
  });
});
