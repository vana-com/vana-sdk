import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateEncryptionKey,
  encryptUserData,
  decryptUserData,
  DEFAULT_ENCRYPTION_SEED,
} from "../utils/encryption";

// Mock OpenPGP
vi.mock("openpgp", () => ({
  createMessage: vi.fn(),
  encrypt: vi.fn(),
  readMessage: vi.fn(),
  decrypt: vi.fn(),
}));

describe("Encryption Utils", () => {
  let mockWallet: any;
  let mockAccount: any;

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

      const result = await generateEncryptionKey(mockWallet);

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

      const result = await generateEncryptionKey(mockWallet, customSeed);

      expect(result).toBe(expectedSignature);
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockAccount,
        message: customSeed,
      });
    });

    it("should throw error if wallet has no account", async () => {
      const walletWithoutAccount = { ...mockWallet, account: null };

      await expect(generateEncryptionKey(walletWithoutAccount)).rejects.toThrow(
        "Wallet account is required for encryption key generation",
      );
    });

    it("should handle signing errors", async () => {
      mockWallet.signMessage.mockRejectedValue(new Error("Signing failed"));

      await expect(generateEncryptionKey(mockWallet)).rejects.toThrow(
        "Signing failed",
      );
    });

    it("should handle user rejection", async () => {
      mockWallet.signMessage.mockRejectedValue(
        new Error("User rejected the request"),
      );

      await expect(generateEncryptionKey(mockWallet)).rejects.toThrow(
        "User rejected the request",
      );
    });

    it("should handle network errors during signing", async () => {
      mockWallet.signMessage.mockRejectedValue(new Error("Network error"));

      await expect(generateEncryptionKey(mockWallet)).rejects.toThrow(
        "Network error",
      );
    });
  });

  describe("Parameter validation", () => {
    it("should validate wallet parameter", async () => {
      await expect(generateEncryptionKey(null as any)).rejects.toThrow();
    });

    it("should validate wallet account property", async () => {
      const invalidWallet = { signMessage: vi.fn() };

      await expect(generateEncryptionKey(invalidWallet as any)).rejects.toThrow(
        "Wallet account is required",
      );
    });

    it("should handle empty string seed", async () => {
      mockWallet.signMessage.mockResolvedValue("0xsignature");

      const result = await generateEncryptionKey(mockWallet, "");

      expect(result).toBe("0xsignature");
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockAccount,
        message: "",
      });
    });

    it("should handle very long seed messages", async () => {
      const longSeed = "a".repeat(1000);
      mockWallet.signMessage.mockResolvedValue("0xlongseedsignature");

      const result = await generateEncryptionKey(mockWallet, longSeed);

      expect(result).toBe("0xlongseedsignature");
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockAccount,
        message: longSeed,
      });
    });
  });

  describe("Integration scenarios", () => {
    it("should work with different wallet implementations", async () => {
      const altWallet = {
        account: { address: "0xalternate" },
        signMessage: vi.fn().mockResolvedValue("0xaltsignature"),
      } as any;

      const result = await generateEncryptionKey(altWallet);

      expect(result).toBe("0xaltsignature");
    });

    it("should handle concurrent signing requests", async () => {
      mockWallet.signMessage.mockResolvedValue("0xconcurrent");

      const promises = [
        generateEncryptionKey(mockWallet, "seed1"),
        generateEncryptionKey(mockWallet, "seed2"),
        generateEncryptionKey(mockWallet, "seed3"),
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

      await expect(generateEncryptionKey(mockWallet)).rejects.toThrow(
        "Specific wallet error: insufficient funds",
      );
    });

    it("should handle non-Error objects thrown by wallet", async () => {
      mockWallet.signMessage.mockRejectedValue("String error");

      await expect(generateEncryptionKey(mockWallet)).rejects.toThrow(
        "String error",
      );
    });
  });

  describe("encryptUserData", () => {
    let mockOpenpgp: any;

    beforeEach(async () => {
      mockOpenpgp = await import("openpgp");
    });

    it("should encrypt user data successfully", async () => {
      const testData = new Blob(["sensitive user data"], {
        type: "text/plain",
      });
      const encryptionKey = "0xencryptionkey123";

      // Mock OpenPGP functions
      const mockMessage = { data: "mock-message" };
      const mockEncryptedStream = new ReadableStream();

      mockOpenpgp.createMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.encrypt.mockResolvedValue(mockEncryptedStream);

      // Mock Response and arrayBuffer
      global.Response = vi.fn().mockImplementation(() => ({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      })) as any;

      const result = await encryptUserData(testData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
      expect(mockOpenpgp.createMessage).toHaveBeenCalledWith({
        binary: expect.any(Uint8Array),
      });
      expect(mockOpenpgp.encrypt).toHaveBeenCalledWith({
        message: mockMessage,
        passwords: [encryptionKey],
        format: "binary",
      });
    });

    it("should handle empty data", async () => {
      const emptyData = new Blob([]);
      const encryptionKey = "0xkey";

      const mockMessage = { data: "empty-message" };
      const mockEncryptedStream = new ReadableStream();

      mockOpenpgp.createMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.encrypt.mockResolvedValue(mockEncryptedStream);

      global.Response = vi.fn().mockImplementation(() => ({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      })) as any;

      const result = await encryptUserData(emptyData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
    });

    it("should handle createMessage errors", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      mockOpenpgp.createMessage.mockRejectedValue(
        new Error("Invalid message format"),
      );

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: Invalid message format",
      );
    });

    it("should handle encryption errors", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      const mockMessage = { data: "mock-message" };
      mockOpenpgp.createMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.encrypt.mockRejectedValue(new Error("Encryption failed"));

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: Encryption failed",
      );
    });

    it("should handle Response processing errors", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      const mockMessage = { data: "mock-message" };
      const mockEncryptedStream = new ReadableStream();

      mockOpenpgp.createMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.encrypt.mockResolvedValue(mockEncryptedStream);

      global.Response = vi.fn().mockImplementation(() => ({
        arrayBuffer: () =>
          Promise.reject(new Error("Response processing failed")),
      })) as any;

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: Response processing failed",
      );
    });

    it("should handle non-Error exceptions during encryption", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      // Mock a rejection with a non-Error object (e.g., string)
      mockOpenpgp.createMessage.mockRejectedValue("String error message");

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: Unknown error",
      );
    });

    it("should handle undefined/null exceptions during encryption", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      // Mock a rejection with null/undefined
      mockOpenpgp.createMessage.mockRejectedValue(null);

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: Unknown error",
      );
    });

    it("should handle object exceptions during encryption", async () => {
      const testData = new Blob(["test data"]);
      const encryptionKey = "0xkey";

      // Mock a rejection with an object that's not an Error
      mockOpenpgp.createMessage.mockRejectedValue({
        code: 500,
        reason: "Server error",
      });

      await expect(encryptUserData(testData, encryptionKey)).rejects.toThrow(
        "Failed to encrypt user data: Unknown error",
      );
    });
  });

  describe("decryptUserData", () => {
    let mockOpenpgp: any;

    beforeEach(async () => {
      mockOpenpgp = await import("openpgp");
    });

    it("should decrypt user data successfully", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3, 4])]);
      const encryptionKey = "0xdecryptionkey123";

      const mockMessage = { data: "encrypted-message" };
      const mockDecryptedData = new Uint8Array([
        100, 101, 99, 114, 121, 112, 116, 101, 100,
      ]); // 'decrypted'

      mockOpenpgp.readMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.decrypt.mockResolvedValue({ data: mockDecryptedData });

      const result = await decryptUserData(encryptedData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
      expect(mockOpenpgp.readMessage).toHaveBeenCalledWith({
        binaryMessage: expect.any(Uint8Array),
      });
      expect(mockOpenpgp.decrypt).toHaveBeenCalledWith({
        message: mockMessage,
        passwords: [encryptionKey],
        format: "binary",
      });
    });

    it("should handle empty encrypted data", async () => {
      const emptyEncryptedData = new Blob([]);
      const encryptionKey = "0xkey";

      const mockMessage = { data: "empty-encrypted-message" };
      const mockDecryptedData = new Uint8Array([]);

      mockOpenpgp.readMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.decrypt.mockResolvedValue({ data: mockDecryptedData });

      const result = await decryptUserData(emptyEncryptedData, encryptionKey);

      expect(result).toBeInstanceOf(Blob);
    });

    it("should handle readMessage errors", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const encryptionKey = "0xkey";

      mockOpenpgp.readMessage.mockRejectedValue(
        new Error("Invalid encrypted message"),
      );

      await expect(
        decryptUserData(encryptedData, encryptionKey),
      ).rejects.toThrow(
        "Failed to decrypt file: Invalid encrypted message. This file may not be compatible with PGP decryption or was encrypted using a different method.",
      );
    });

    it("should handle decryption errors", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const encryptionKey = "0xkey";

      const mockMessage = { data: "encrypted-message" };
      mockOpenpgp.readMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.decrypt.mockRejectedValue(new Error("Wrong password"));

      await expect(
        decryptUserData(encryptedData, encryptionKey),
      ).rejects.toThrow(
        "Failed to decrypt file: Wrong password. This file may not be compatible with PGP decryption or was encrypted using a different method.",
      );
    });

    it("should handle wrong encryption key", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const wrongKey = "0xwrongkey";

      const mockMessage = { data: "encrypted-message" };
      mockOpenpgp.readMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.decrypt.mockRejectedValue(
        new Error("Session key decryption failed"),
      );

      await expect(decryptUserData(encryptedData, wrongKey)).rejects.toThrow(
        "Failed to decrypt file: Wrong encryption key. This file may have been encrypted with a different key than your current wallet signature.",
      );
    });

    it("should handle non-Error exceptions during decryption", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const encryptionKey = "0xkey";

      // Mock a rejection with a non-Error object (e.g., string)
      mockOpenpgp.readMessage.mockRejectedValue("Decryption string error");

      await expect(
        decryptUserData(encryptedData, encryptionKey),
      ).rejects.toThrow(
        "Failed to decrypt file: Unknown error occurred during decryption process.",
      );
    });

    it("should handle undefined/null exceptions during decryption", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const encryptionKey = "0xkey";

      // Mock a rejection with null/undefined
      mockOpenpgp.readMessage.mockRejectedValue(undefined);

      await expect(
        decryptUserData(encryptedData, encryptionKey),
      ).rejects.toThrow(
        "Failed to decrypt file: Unknown error occurred during decryption process.",
      );
    });

    it("should handle object exceptions during decryption", async () => {
      const encryptedData = new Blob([new Uint8Array([1, 2, 3])]);
      const encryptionKey = "0xkey";

      // Mock a rejection with an object that's not an Error
      mockOpenpgp.readMessage.mockRejectedValue({
        status: "failed",
        details: "Crypto error",
      });

      await expect(
        decryptUserData(encryptedData, encryptionKey),
      ).rejects.toThrow(
        "Failed to decrypt file: Unknown error occurred during decryption process.",
      );
    });
  });

  describe("Encrypt-Decrypt Integration", () => {
    let mockOpenpgp: any;

    beforeEach(async () => {
      mockOpenpgp = await import("openpgp");
    });

    it("should handle full encrypt-decrypt workflow", async () => {
      const originalData = new Blob(["confidential document content"]);
      const encryptionKey = "0xworkflowkey";

      // Mock encryption
      const mockMessage = { data: "message-object" };
      const mockEncryptedStream = new ReadableStream();

      mockOpenpgp.createMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.encrypt.mockResolvedValue(mockEncryptedStream);

      global.Response = vi.fn().mockImplementation(() => ({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(20)),
      })) as any;

      // Mock decryption
      const mockDecryptedData = new Uint8Array([
        99, 111, 110, 102, 105, 100, 101, 110, 116, 105, 97, 108,
      ]);
      mockOpenpgp.readMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.decrypt.mockResolvedValue({ data: mockDecryptedData });

      // Test workflow
      const encrypted = await encryptUserData(originalData, encryptionKey);
      expect(encrypted).toBeInstanceOf(Blob);

      const decrypted = await decryptUserData(encrypted, encryptionKey);
      expect(decrypted).toBeInstanceOf(Blob);
    });

    it("should handle large file encryption and decryption", async () => {
      const largeData = new Blob([new Uint8Array(50000).fill(65)]); // 50KB of 'A' characters
      const encryptionKey = "0xlargefile";

      const mockMessage = { data: "large-message-object" };
      const mockEncryptedStream = new ReadableStream();

      mockOpenpgp.createMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.encrypt.mockResolvedValue(mockEncryptedStream);

      global.Response = vi.fn().mockImplementation(() => ({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(50000)),
      })) as any;

      const mockDecryptedData = new Uint8Array(50000).fill(65);
      mockOpenpgp.readMessage.mockResolvedValue(mockMessage);
      mockOpenpgp.decrypt.mockResolvedValue({ data: mockDecryptedData });

      const encrypted = await encryptUserData(largeData, encryptionKey);
      const decrypted = await decryptUserData(encrypted, encryptionKey);

      expect(encrypted).toBeInstanceOf(Blob);
      expect(decrypted).toBeInstanceOf(Blob);
    });
  });
});
