import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
  encryptFileKey,
  getEncryptionParameters,
  decryptWithPrivateKey,
  generateEncryptionKeyPair,
  generatePGPKeyPair,
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

describe("Additional Encryption Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("encryptWithWalletPublicKey", () => {
    it("should encrypt string data with wallet public key", async () => {
      const data = "test data";
      const publicKey = "0x1234567890abcdef";
      const expectedEncrypted = "encrypted-data";

      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockResolvedValue(expectedEncrypted);

      const result = await encryptWithWalletPublicKey(data, publicKey, mockPlatformAdapter);

      expect(result).toBe(expectedEncrypted);
      expect(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).toHaveBeenCalledWith(data, publicKey);
    });

    it("should encrypt Blob data with wallet public key", async () => {
      const data = new Blob(["test data"], { type: "text/plain" });
      const publicKey = "0x1234567890abcdef";
      const expectedEncrypted = "encrypted-blob-data";

      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockResolvedValue(expectedEncrypted);

      const result = await encryptWithWalletPublicKey(data, publicKey, mockPlatformAdapter);

      expect(result).toBe(expectedEncrypted);
      expect(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).toHaveBeenCalledWith("test data", publicKey);
    });

    it("should handle encryption errors", async () => {
      const data = "test data";
      const publicKey = "0x1234567890abcdef";

      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockRejectedValue(new Error("Encryption failed"));

      await expect(encryptWithWalletPublicKey(data, publicKey, mockPlatformAdapter)).rejects.toThrow(
        "Failed to encrypt with wallet public key: Error: Encryption failed",
      );
    });

    it("should handle non-Error exceptions", async () => {
      const data = "test data";
      const publicKey = "0x1234567890abcdef";

      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockRejectedValue("String error");

      await expect(encryptWithWalletPublicKey(data, publicKey, mockPlatformAdapter)).rejects.toThrow(
        "Failed to encrypt with wallet public key: String error",
      );
    });
  });

  describe("decryptWithWalletPrivateKey", () => {
    it("should decrypt data with wallet private key", async () => {
      const encryptedData = "encrypted-data";
      const privateKey = "0xprivatekey123";
      const expectedDecrypted = "decrypted data";

      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).mockResolvedValue(expectedDecrypted);

      const result = await decryptWithWalletPrivateKey(
        encryptedData,
        privateKey,
        mockPlatformAdapter,
      );

      expect(result).toBe(expectedDecrypted);
      expect(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).toHaveBeenCalledWith(encryptedData, privateKey);
    });

    it("should handle decryption errors", async () => {
      const encryptedData = "encrypted-data";
      const privateKey = "0xprivatekey123";

      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).mockRejectedValue(new Error("Decryption failed"));

      await expect(
        decryptWithWalletPrivateKey(encryptedData, privateKey, mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Error: Decryption failed",
      );
    });

    it("should handle non-Error exceptions", async () => {
      const encryptedData = "encrypted-data";
      const privateKey = "0xprivatekey123";

      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).mockRejectedValue("Decryption error");

      await expect(
        decryptWithWalletPrivateKey(encryptedData, privateKey, mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Decryption error",
      );
    });
  });

  describe("encryptFileKey", () => {
    it("should encrypt file key with public key", async () => {
      const fileKey = "symmetric-file-key-123";
      const publicKey = "0xdlppublickey456";
      const expectedEncrypted = "encrypted-file-key";

      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockResolvedValue(expectedEncrypted);

      const result = await encryptFileKey(fileKey, publicKey, mockPlatformAdapter);

      expect(result).toBe(expectedEncrypted);
      expect(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).toHaveBeenCalledWith(fileKey, publicKey);
    });

    it("should handle encryption errors", async () => {
      const fileKey = "symmetric-file-key-123";
      const publicKey = "0xdlppublickey456";

      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockRejectedValue(new Error("File key encryption failed"));

      await expect(encryptFileKey(fileKey, publicKey, mockPlatformAdapter)).rejects.toThrow(
        "Failed to encrypt file key: Error: File key encryption failed",
      );
    });

    it("should handle non-Error exceptions", async () => {
      const fileKey = "symmetric-file-key-123";
      const publicKey = "0xdlppublickey456";

      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockRejectedValue("Key encryption error");

      await expect(encryptFileKey(fileKey, publicKey, mockPlatformAdapter)).rejects.toThrow(
        "Failed to encrypt file key: Key encryption error",
      );
    });
  });

  describe("getEncryptionParameters", () => {
    it("should generate encryption parameters", async () => {
      const mockKeyPair = {
        publicKey:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
        privateKey:
          "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
      };

      vi.mocked(mockPlatformAdapter.crypto.generateKeyPair).mockResolvedValue(
        mockKeyPair,
      );

      const result = await getEncryptionParameters(mockPlatformAdapter);

      expect(result).toHaveProperty("iv");
      expect(result).toHaveProperty("key");
      expect(result.iv).toBe(mockKeyPair.publicKey.substring(0, 16));
      expect(result.key).toBe(mockKeyPair.privateKey.substring(0, 32));
      expect(mockPlatformAdapter.crypto.generateKeyPair).toHaveBeenCalled();
    });

    it("should handle key generation errors", async () => {
      vi.mocked(mockPlatformAdapter.crypto.generateKeyPair).mockRejectedValue(
        new Error("Key generation failed"),
      );

      await expect(getEncryptionParameters(mockPlatformAdapter)).rejects.toThrow(
        "Failed to generate encryption parameters: Error: Key generation failed",
      );
    });

    it("should handle non-Error exceptions", async () => {
      vi.mocked(mockPlatformAdapter.crypto.generateKeyPair).mockRejectedValue(
        "Generation error",
      );

      await expect(getEncryptionParameters(mockPlatformAdapter)).rejects.toThrow(
        "Failed to generate encryption parameters: Generation error",
      );
    });
  });

  describe("decryptWithPrivateKey", () => {
    it("should decrypt data with private key", async () => {
      const encryptedData = "encrypted-dlp-data";
      const privateKey = "0xdlpprivatekey789";
      const expectedDecrypted = "decrypted dlp data";

      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).mockResolvedValue(expectedDecrypted);

      const result = await decryptWithPrivateKey(encryptedData, privateKey, mockPlatformAdapter);

      expect(result).toBe(expectedDecrypted);
      expect(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).toHaveBeenCalledWith(encryptedData, privateKey);
    });

    it("should handle decryption errors", async () => {
      const encryptedData = "encrypted-dlp-data";
      const privateKey = "0xdlpprivatekey789";

      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).mockRejectedValue(new Error("DLP decryption failed"));

      await expect(
        decryptWithPrivateKey(encryptedData, privateKey, mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with private key: Error: DLP decryption failed",
      );
    });

    it("should handle non-Error exceptions", async () => {
      const encryptedData = "encrypted-dlp-data";
      const privateKey = "0xdlpprivatekey789";

      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).mockRejectedValue("DLP decryption error");

      await expect(
        decryptWithPrivateKey(encryptedData, privateKey, mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with private key: DLP decryption error",
      );
    });
  });

  describe("generateEncryptionKeyPair", () => {
    it("should generate encryption key pair", async () => {
      const mockKeyPair = {
        publicKey: "0xpublic123",
        privateKey: "0xprivate456",
      };

      vi.mocked(mockPlatformAdapter.crypto.generateKeyPair).mockResolvedValue(
        mockKeyPair,
      );

      const result = await generateEncryptionKeyPair(mockPlatformAdapter);

      expect(result).toEqual(mockKeyPair);
      expect(mockPlatformAdapter.crypto.generateKeyPair).toHaveBeenCalled();
    });

    it("should handle key generation errors", async () => {
      vi.mocked(mockPlatformAdapter.crypto.generateKeyPair).mockRejectedValue(
        new Error("Crypto key generation failed"),
      );

      await expect(generateEncryptionKeyPair(mockPlatformAdapter)).rejects.toThrow(
        "Failed to generate encryption key pair: Error: Crypto key generation failed",
      );
    });

    it("should handle non-Error exceptions", async () => {
      vi.mocked(mockPlatformAdapter.crypto.generateKeyPair).mockRejectedValue(
        "Crypto generation error",
      );

      await expect(generateEncryptionKeyPair(mockPlatformAdapter)).rejects.toThrow(
        "Failed to generate encryption key pair: Crypto generation error",
      );
    });
  });

  describe("generatePGPKeyPair", () => {
    it("should generate PGP key pair without options", async () => {
      const mockKeyPair = {
        publicKey:
          "-----BEGIN PGP PUBLIC KEY BLOCK-----\ntest\n-----END PGP PUBLIC KEY BLOCK-----",
        privateKey:
          "-----BEGIN PGP PRIVATE KEY BLOCK-----\ntest\n-----END PGP PRIVATE KEY BLOCK-----",
      };

      vi.mocked(mockPlatformAdapter.pgp.generateKeyPair).mockResolvedValue(
        mockKeyPair,
      );

      const result = await generatePGPKeyPair(mockPlatformAdapter);

      expect(result).toEqual(mockKeyPair);
      expect(mockPlatformAdapter.pgp.generateKeyPair).toHaveBeenCalledWith(
        undefined,
      );
    });

    it("should generate PGP key pair with options", async () => {
      const options = {
        name: "Test User",
        email: "test@example.com",
        passphrase: "secure-passphrase",
      };
      const mockKeyPair = {
        publicKey:
          "-----BEGIN PGP PUBLIC KEY BLOCK-----\ntest-with-options\n-----END PGP PUBLIC KEY BLOCK-----",
        privateKey:
          "-----BEGIN PGP PRIVATE KEY BLOCK-----\ntest-with-options\n-----END PGP PRIVATE KEY BLOCK-----",
      };

      vi.mocked(mockPlatformAdapter.pgp.generateKeyPair).mockResolvedValue(
        mockKeyPair,
      );

      const result = await generatePGPKeyPair(mockPlatformAdapter, options);

      expect(result).toEqual(mockKeyPair);
      expect(mockPlatformAdapter.pgp.generateKeyPair).toHaveBeenCalledWith(
        options,
      );
    });

    it("should handle PGP key generation errors", async () => {
      vi.mocked(mockPlatformAdapter.pgp.generateKeyPair).mockRejectedValue(
        new Error("PGP key generation failed"),
      );

      await expect(generatePGPKeyPair(mockPlatformAdapter)).rejects.toThrow(
        "Failed to generate PGP key pair: Error: PGP key generation failed",
      );
    });

    it("should handle non-Error exceptions", async () => {
      vi.mocked(mockPlatformAdapter.pgp.generateKeyPair).mockRejectedValue(
        "PGP generation error",
      );

      await expect(generatePGPKeyPair(mockPlatformAdapter)).rejects.toThrow(
        "Failed to generate PGP key pair: PGP generation error",
      );
    });

    it("should handle partial options", async () => {
      const options = {
        name: "Test User",
        // email and passphrase omitted
      };
      const mockKeyPair = {
        publicKey:
          "-----BEGIN PGP PUBLIC KEY BLOCK-----\npartial-options\n-----END PGP PUBLIC KEY BLOCK-----",
        privateKey:
          "-----BEGIN PGP PRIVATE KEY BLOCK-----\npartial-options\n-----END PGP PRIVATE KEY BLOCK-----",
      };

      vi.mocked(mockPlatformAdapter.pgp.generateKeyPair).mockResolvedValue(
        mockKeyPair,
      );

      const result = await generatePGPKeyPair(mockPlatformAdapter, options);

      expect(result).toEqual(mockKeyPair);
      expect(mockPlatformAdapter.pgp.generateKeyPair).toHaveBeenCalledWith(
        options,
      );
    });
  });

  describe("Integration tests", () => {
    it("should handle encrypt/decrypt workflow with wallet keys", async () => {
      const originalData = "sensitive data";
      const publicKey = "0xpublic123";
      const privateKey = "0xprivate456";
      const encryptedData = "encrypted-sensitive-data";

      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockResolvedValue(encryptedData);
      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).mockResolvedValue(originalData);

      // Encrypt
      const encrypted = await encryptWithWalletPublicKey(
        originalData,
        publicKey,
        mockPlatformAdapter,
      );
      expect(encrypted).toBe(encryptedData);

      // Decrypt
      const decrypted = await decryptWithWalletPrivateKey(
        encrypted,
        privateKey,
        mockPlatformAdapter,
      );
      expect(decrypted).toBe(originalData);
    });

    it("should handle file key encryption workflow", async () => {
      const fileKey = "symmetric-key-123";
      const dlpPublicKey = "0xdlppublic789";
      const dlpPrivateKey = "0xdlpprivate101";
      const encryptedFileKey = "encrypted-file-key-data";

      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockResolvedValue(encryptedFileKey);
      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).mockResolvedValue(fileKey);

      // Encrypt file key
      const encrypted = await encryptFileKey(fileKey, dlpPublicKey, mockPlatformAdapter);
      expect(encrypted).toBe(encryptedFileKey);

      // Decrypt file key (using decryptWithPrivateKey)
      const decrypted = await decryptWithPrivateKey(encrypted, dlpPrivateKey, mockPlatformAdapter);
      expect(decrypted).toBe(fileKey);
    });

    it("should generate consistent encryption parameters", async () => {
      const mockKeyPair = {
        publicKey:
          "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
        privateKey:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
      };

      vi.mocked(mockPlatformAdapter.crypto.generateKeyPair).mockResolvedValue(
        mockKeyPair,
      );

      const params1 = await getEncryptionParameters(mockPlatformAdapter);
      await getEncryptionParameters(mockPlatformAdapter);

      // Each call should generate new parameters
      expect(params1.iv).toBe("1234567890abcdef");
      expect(params1.key).toBe("abcdef1234567890abcdef1234567890");

      // Should be called twice
      expect(mockPlatformAdapter.crypto.generateKeyPair).toHaveBeenCalledTimes(
        2,
      );
    });
  });
});
