import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateEncryptionKey,
  encryptUserData,
  decryptUserData,
  DEFAULT_ENCRYPTION_SEED,
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

// Mock the platform module
vi.mock("../platform", () => ({
  getPlatformAdapter: () => mockPlatformAdapter,
}));

interface MockAccount {
  address: string;
}

interface MockWallet {
  account: MockAccount | null;
  signMessage: ReturnType<typeof vi.fn>;
}

describe("Encryption Utils", () => {
  let mockWallet: MockWallet;
  let mockAccount: MockAccount;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAccount = {
      address: "0x1234567890123456789012345678901234567890",
    };

    mockWallet = {
      account: mockAccount,
      signMessage: vi.fn(),
    };
  });

  describe("DEFAULT_ENCRYPTION_SEED", () => {
    it("should export the standard Vana encryption seed", () => {
      expect(DEFAULT_ENCRYPTION_SEED).toBe(
        "Please sign to retrieve your encryption key",
      );
    });
  });

  describe("generateEncryptionKey", () => {
    it("should generate encryption key using wallet signature", async () => {
      const expectedSignature = "0xsignature123";
      mockWallet.signMessage.mockResolvedValue(expectedSignature);

      const result = await generateEncryptionKey(
        mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
      );

      expect(result).toBe(expectedSignature);
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockAccount,
        message: DEFAULT_ENCRYPTION_SEED,
      });
    });

    it("should accept custom seed message", async () => {
      const customSeed = "Custom encryption seed";
      const expectedSignature = "0xcustomsignature";
      mockWallet.signMessage.mockResolvedValue(expectedSignature);

      const result = await generateEncryptionKey(
        mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
        customSeed,
      );

      expect(result).toBe(expectedSignature);
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockAccount,
        message: customSeed,
      });
    });

    it("should throw error if wallet has no account", async () => {
      const walletWithoutAccount = { ...mockWallet, account: null };

      await expect(
        generateEncryptionKey(
          walletWithoutAccount as unknown as Parameters<
            typeof generateEncryptionKey
          >[0],
        ),
      ).rejects.toThrow(
        "Wallet account is required for encryption key generation",
      );
    });

    it("should handle signing errors", async () => {
      mockWallet.signMessage.mockRejectedValue(new Error("Signing failed"));

      await expect(
        generateEncryptionKey(
          mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
        ),
      ).rejects.toThrow("Signing failed");
    });

    it("should handle user rejection", async () => {
      mockWallet.signMessage.mockRejectedValue(
        new Error("User rejected the request"),
      );

      await expect(
        generateEncryptionKey(
          mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
        ),
      ).rejects.toThrow("User rejected the request");
    });

    it("should handle network errors during signing", async () => {
      mockWallet.signMessage.mockRejectedValue(new Error("Network error"));

      await expect(
        generateEncryptionKey(
          mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
        ),
      ).rejects.toThrow("Network error");
    });
  });

  describe("Parameter validation", () => {
    it("should validate wallet parameter", async () => {
      await expect(
        generateEncryptionKey(
          null as unknown as Parameters<typeof generateEncryptionKey>[0],
        ),
      ).rejects.toThrow();
    });

    it("should validate wallet account property", async () => {
      const invalidWallet = { signMessage: vi.fn() };

      await expect(
        generateEncryptionKey(
          invalidWallet as unknown as Parameters<
            typeof generateEncryptionKey
          >[0],
        ),
      ).rejects.toThrow("Wallet account is required");
    });

    it("should handle empty string seed", async () => {
      mockWallet.signMessage.mockResolvedValue("0xsignature");

      const result = await generateEncryptionKey(
        mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
        "",
      );

      expect(result).toBe("0xsignature");
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockAccount,
        message: "",
      });
    });

    it("should handle very long seed messages", async () => {
      const longSeed = "a".repeat(1000);
      mockWallet.signMessage.mockResolvedValue("0xlongseedsignature");

      const result = await generateEncryptionKey(
        mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
        longSeed,
      );

      expect(result).toBe("0xlongseedsignature");
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockAccount,
        message: longSeed,
      });
    });
  });

  describe("Integration scenarios", () => {
    it("should work with different wallet implementations", async () => {
      const altWallet: MockWallet = {
        account: { address: "0xalternate" },
        signMessage: vi.fn().mockResolvedValue("0xaltsignature"),
      };

      const result = await generateEncryptionKey(
        altWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
      );

      expect(result).toBe("0xaltsignature");
    });

    it("should handle concurrent signing requests", async () => {
      mockWallet.signMessage.mockResolvedValue("0xconcurrent");

      const promises = [
        generateEncryptionKey(
          mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
          "seed1",
        ),
        generateEncryptionKey(
          mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
          "seed2",
        ),
        generateEncryptionKey(
          mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
          "seed3",
        ),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r === "0xconcurrent")).toBe(true);
      expect(mockWallet.signMessage).toHaveBeenCalledTimes(3);
    });
  });

  describe("Error message formatting", () => {
    it("should preserve original error messages", async () => {
      const originalError = new Error(
        "Specific wallet error: insufficient funds",
      );
      mockWallet.signMessage.mockRejectedValue(originalError);

      await expect(
        generateEncryptionKey(
          mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
        ),
      ).rejects.toThrow("Specific wallet error: insufficient funds");
    });

    it("should handle non-Error objects thrown by wallet", async () => {
      mockWallet.signMessage.mockRejectedValue("String error");

      await expect(
        generateEncryptionKey(
          mockWallet as unknown as Parameters<typeof generateEncryptionKey>[0],
        ),
      ).rejects.toThrow("String error");
    });
  });

  describe("encryptUserData", () => {
    it("should encrypt user data successfully", async () => {
      const testData = new Blob(["sensitive user data"], {
        type: "text/plain",
      });
      const encryptionKey = "0xencryptionkey123";
      const encryptedString = "encrypted-pgp-data";

      // Mock platform adapter PGP encrypt
      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockResolvedValue(
        encryptedString,
      );

      const result = await encryptUserData(testData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe("text/plain");
      const resultText = await result.text();
      expect(resultText).toBe(encryptedString);
      expect(mockPlatformAdapter.pgp.encrypt).toHaveBeenCalledWith(
        "sensitive user data",
        encryptionKey,
      );
    });

    it("should handle empty data", async () => {
      const emptyData = new Blob([]);
      const encryptionKey = "0xkey";
      const encryptedString = "encrypted-empty-data";

      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockResolvedValue(
        encryptedString,
      );

      const result = await encryptUserData(emptyData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
      expect(mockPlatformAdapter.pgp.encrypt).toHaveBeenCalledWith(
        "",
        encryptionKey,
      );
    });

    it("should handle encryption errors", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockRejectedValue(
        new Error("Invalid message format"),
      );

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: Error: Invalid message format",
      );
    });

    it("should handle different encryption errors", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockRejectedValue(
        new Error("Encryption failed"),
      );

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: Error: Encryption failed",
      );
    });

    it("should handle string data input", async () => {
      const testData = "string data to encrypt";
      const encryptionKey = "0xkey";
      const encryptedString = "encrypted-string-data";

      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockResolvedValue(
        encryptedString,
      );

      const result = await encryptUserData(testData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
      const resultText = await result.text();
      expect(resultText).toBe(encryptedString);
      expect(mockPlatformAdapter.pgp.encrypt).toHaveBeenCalledWith(
        testData,
        encryptionKey,
      );
    });

    it("should handle non-Error exceptions during encryption", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      // Mock a rejection with a non-Error object (e.g., string)
      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockRejectedValue(
        "String error message",
      );

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: String error message",
      );
    });

    it("should handle undefined/null exceptions during encryption", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      // Mock a rejection with null/undefined
      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockRejectedValue(null);

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: null",
      );
    });

    it("should handle object exceptions during encryption", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      // Mock a rejection with an object that's not an Error
      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockRejectedValue({
        code: 500,
        reason: "Server error",
      });

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: [object Object]",
      );
    });
  });

  describe("decryptUserData", () => {
    it("should decrypt user data successfully", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3, 4])]);
      const encryptionKey = "0xdecryptionkey123";
      const decryptedString = "decrypted";

      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockResolvedValue(
        decryptedString,
      );

      const result = await decryptUserData(encryptedData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe("text/plain");
      const resultText = await result.text();
      expect(resultText).toBe(decryptedString);
      expect(mockPlatformAdapter.pgp.decrypt).toHaveBeenCalledWith(
        expect.any(String),
        encryptionKey,
      );
    });

    it("should handle empty encrypted data", async () => {
      const emptyEncryptedData = new Blob([]);
      const encryptionKey = "0xkey";
      const decryptedString = "";

      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockResolvedValue(
        decryptedString,
      );

      const result = await decryptUserData(emptyEncryptedData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
      const resultText = await result.text();
      expect(resultText).toBe("");
    });

    it("should handle decryption errors", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const encryptionKey = "0xkey";

      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockRejectedValue(
        new Error("Invalid encrypted message"),
      );

      await expect(
        decryptUserData(encryptedData, encryptionKey),
      ).rejects.toThrow(
        "Failed to decrypt user data: Error: Invalid encrypted message",
      );
    });

    it("should handle string encrypted data input", async () => {
      const encryptedData = "encrypted-string-data";
      const encryptionKey = "0xkey";
      const decryptedString = "decrypted data";

      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockResolvedValue(
        decryptedString,
      );

      const result = await decryptUserData(encryptedData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
      const resultText = await result.text();
      expect(resultText).toBe(decryptedString);
      expect(mockPlatformAdapter.pgp.decrypt).toHaveBeenCalledWith(
        encryptedData,
        encryptionKey,
      );
    });

    it("should handle wrong encryption key", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const wrongKey = "0xwrongkey";

      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockRejectedValue(
        new Error("Session key decryption failed"),
      );

      await expect(decryptUserData(encryptedData, wrongKey)).rejects.toThrow(
        "Failed to decrypt user data: Error: Session key decryption failed",
      );
    });

    it("should handle non-Error exceptions during decryption", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const encryptionKey = "0xkey";

      // Mock a rejection with a non-Error object (e.g., string)
      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockRejectedValue(
        "Decryption string error",
      );

      await expect(
        decryptUserData(encryptedData, encryptionKey),
      ).rejects.toThrow("Failed to decrypt user data: Decryption string error");
    });

    it("should handle undefined/null exceptions during decryption", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const encryptionKey = "0xkey";

      // Mock a rejection with null/undefined
      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockRejectedValue(undefined);

      await expect(
        decryptUserData(encryptedData, encryptionKey),
      ).rejects.toThrow("Failed to decrypt user data: undefined");
    });

    it("should handle object exceptions during decryption", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const encryptionKey = "0xkey";

      // Mock a rejection with an object that's not an Error
      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockRejectedValue({
        status: "failed",
        details: "Crypto error",
      });

      await expect(
        decryptUserData(encryptedData, encryptionKey),
      ).rejects.toThrow("Failed to decrypt user data: [object Object]");
    });
  });

  describe("Encrypt-Decrypt Integration", () => {
    it("should handle full encrypt-decrypt workflow", async () => {
      const originalData = new Blob(["confidential document content"]);
      const encryptionKey = "0xworkflowkey";
      const encryptedString = "encrypted-pgp-data";
      const originalDataText = "confidential document content";

      // Mock encryption
      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockResolvedValue(
        encryptedString,
      );

      // Mock decryption to return original data
      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockResolvedValue(
        originalDataText,
      );

      // Test workflow
      const encrypted = await encryptUserData(originalData, encryptionKey);
      expect(encrypted).toBeInstanceOf(Blob);
      const encryptedText = await encrypted.text();
      expect(encryptedText).toBe(encryptedString);

      const decrypted = await decryptUserData(encrypted, encryptionKey);
      expect(decrypted).toBeInstanceOf(Blob);
      const decryptedText = await decrypted.text();
      expect(decryptedText).toBe(originalDataText);
    });

    it("should handle large file encryption and decryption", async () => {
      const largeData = new Blob([new Uint8Array(50000).fill(65)]); // 50KB of 'A' characters
      const encryptionKey = "0xlargefile";
      const encryptedString = "encrypted-large-data";
      const originalDataText = "A".repeat(50000);

      vi.mocked(mockPlatformAdapter.pgp.encrypt).mockResolvedValue(
        encryptedString,
      );
      vi.mocked(mockPlatformAdapter.pgp.decrypt).mockResolvedValue(
        originalDataText,
      );

      const encrypted = await encryptUserData(largeData, encryptionKey);
      const decrypted = await decryptUserData(encrypted, encryptionKey);

      expect(encrypted).toBeInstanceOf(Blob);
      expect(decrypted).toBeInstanceOf(Blob);
      const decryptedText = await decrypted.text();
      expect(decryptedText).toBe(originalDataText);
    });
  });
});
