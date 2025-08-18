import { describe, it, expect, vi } from "vitest";
import { WalletKeyEncryptionService } from "./WalletKeyEncryptionService";
import type { ECIESProvider, ECIESEncrypted } from "../ecies/interface";

describe("WalletKeyEncryptionService", () => {
  const mockECIESProvider: ECIESProvider = {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    normalizeToUncompressed: vi.fn((key) => {
      // Mock implementation - just return uncompressed key or add prefix
      if (key.length === 65 && key[0] === 0x04) {
        return key;
      }
      if (key.length === 64) {
        // Mock doesn't actually accept this per strict policy, but for test purposes
        throw new Error(
          "Raw public key coordinates (64 bytes) are not accepted",
        );
      }
      // For test purposes, just return a dummy uncompressed key
      const result = new Uint8Array(65);
      result[0] = 0x04;
      return result;
    }),
  };

  const service = new WalletKeyEncryptionService({
    eciesProvider: mockECIESProvider,
  });

  describe("encryptWithWalletPublicKey", () => {
    it("processes public key and encrypts data", async () => {
      const mockEncrypted: ECIESEncrypted = {
        iv: new Uint8Array(16),
        ephemPublicKey: new Uint8Array(65),
        ciphertext: new Uint8Array(32),
        mac: new Uint8Array(32),
      };

      vi.mocked(mockECIESProvider.encrypt).mockResolvedValue(mockEncrypted);

      const result = await service.encryptWithWalletPublicKey(
        "test data",
        "0x1234567890abcdef",
      );

      expect(mockECIESProvider.encrypt).toHaveBeenCalled();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles Uint8Array public key", async () => {
      const mockEncrypted: ECIESEncrypted = {
        iv: new Uint8Array(16).fill(1),
        ephemPublicKey: new Uint8Array(65).fill(2),
        ciphertext: new Uint8Array(10).fill(3),
        mac: new Uint8Array(32).fill(4),
      };

      vi.mocked(mockECIESProvider.encrypt).mockResolvedValue(mockEncrypted);

      // Use properly formatted uncompressed key (65 bytes with 0x04 prefix)
      const publicKey = new Uint8Array(65);
      publicKey[0] = 0x04;
      publicKey.fill(42, 1);
      const result = await service.encryptWithWalletPublicKey(
        "test",
        publicKey,
      );

      expect(result).toBeTruthy();
      expect(mockECIESProvider.encrypt).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.any(Uint8Array),
      );
    });
  });

  describe("decryptWithWalletPrivateKey", () => {
    it("processes encrypted data and decrypts", async () => {
      const decryptedBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      vi.mocked(mockECIESProvider.decrypt).mockResolvedValue(decryptedBytes);

      // Create a valid encrypted data hex string (113 bytes minimum)
      const encryptedHex = "00".repeat(113);
      const result = await service.decryptWithWalletPrivateKey(
        encryptedHex,
        "0xabcdef1234567890",
      );

      expect(mockECIESProvider.decrypt).toHaveBeenCalled();
      expect(result).toBe("Hello");
    });

    it("handles Uint8Array private key", async () => {
      const decryptedBytes = new Uint8Array([84, 101, 115, 116]); // "Test"
      vi.mocked(mockECIESProvider.decrypt).mockResolvedValue(decryptedBytes);

      const privateKey = new Uint8Array(32).fill(7);
      const encryptedHex = "ff".repeat(150);

      const result = await service.decryptWithWalletPrivateKey(
        encryptedHex,
        privateKey,
      );

      expect(result).toBe("Test");
    });
  });

  describe("encryptBinary", () => {
    it("encrypts binary data", async () => {
      const mockEncrypted: ECIESEncrypted = {
        iv: new Uint8Array(16),
        ephemPublicKey: new Uint8Array(65),
        ciphertext: new Uint8Array(20),
        mac: new Uint8Array(32),
      };

      vi.mocked(mockECIESProvider.encrypt).mockResolvedValue(mockEncrypted);

      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      const publicKey = "0x" + "42".repeat(32);

      const result = await service.encryptBinary(binaryData, publicKey);

      expect(result).toBe(mockEncrypted);
      expect(mockECIESProvider.encrypt).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        binaryData,
      );
    });
  });

  describe("decryptBinary", () => {
    it("decrypts to binary data", async () => {
      const decryptedBytes = new Uint8Array([10, 20, 30]);
      vi.mocked(mockECIESProvider.decrypt).mockResolvedValue(decryptedBytes);

      const encrypted: ECIESEncrypted = {
        iv: new Uint8Array(16),
        ephemPublicKey: new Uint8Array(65),
        ciphertext: new Uint8Array(20),
        mac: new Uint8Array(32),
      };
      const privateKey = new Uint8Array(32).fill(99);

      const result = await service.decryptBinary(encrypted, privateKey);

      expect(result).toBe(decryptedBytes);
      expect(mockECIESProvider.decrypt).toHaveBeenCalledWith(
        privateKey,
        encrypted,
      );
    });
  });

  describe("getECIESProvider", () => {
    it("returns the ECIES provider", () => {
      const provider = service.getECIESProvider();
      expect(provider).toBe(mockECIESProvider);
    });
  });
});
