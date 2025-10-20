import { describe, it, expect, vi, beforeEach } from "vitest";
import { VanaCore } from "../core";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import * as encryptionUtils from "../utils/encryption";

// Mock controllers to avoid initialization issues
vi.mock("../controllers/permissions", () => ({
  PermissionsController: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../controllers/data", () => ({
  DataController: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../controllers/server", () => ({
  ServerController: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../controllers/protocol", () => ({
  ProtocolController: vi.fn().mockImplementation(() => ({
    getChainId: vi.fn().mockReturnValue(14800),
    getChainName: vi.fn().mockReturnValue("VANA - Moksha"),
  })),
}));

vi.mock("../storage", () => ({
  StorageManager: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    setDefaultProvider: vi.fn(),
    getProvider: vi.fn(),
    getStorageProviders: vi.fn().mockReturnValue([]),
    getDefaultStorageProvider: vi.fn().mockReturnValue(undefined),
  })),
}));

// Mock the encryption utilities
vi.mock("../utils/encryption", () => ({
  encryptBlobWithSignedKey: vi.fn(),
  decryptBlobWithSignedKey: vi.fn(),
}));

describe("VanaCore Encryption Methods", () => {
  const testAccount = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  let vanaCore: VanaCore;
  let mockEncryptBlob: ReturnType<typeof vi.fn>;
  let mockDecryptBlob: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mocked functions
    mockEncryptBlob = vi.mocked(encryptionUtils.encryptBlobWithSignedKey);
    mockDecryptBlob = vi.mocked(encryptionUtils.decryptBlobWithSignedKey);

    // Create VanaCore instance
    const walletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http("https://rpc.moksha.vana.org"),
    });

    vanaCore = new VanaCore(mockPlatformAdapter, {
      walletClient,
    });
  });

  describe("encryptBlob", () => {
    it("should call encryptBlobWithSignedKey utility with correct parameters", async () => {
      const testData = "test data to encrypt";
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });

      mockEncryptBlob.mockResolvedValue(expectedBlob);

      const result = await vanaCore.encryptBlob(testData, testSignature);

      expect(mockEncryptBlob).toHaveBeenCalledWith(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockEncryptBlob).toHaveBeenCalledTimes(1);
      expect(result).toBe(expectedBlob);
    });

    it("should handle Blob input data", async () => {
      const testBlob = new Blob(["test blob data"], { type: "text/plain" });
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });

      mockEncryptBlob.mockResolvedValue(expectedBlob);

      const result = await vanaCore.encryptBlob(testBlob, testSignature);

      expect(mockEncryptBlob).toHaveBeenCalledWith(
        testBlob,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockEncryptBlob).toHaveBeenCalledTimes(1);
      expect(result).toBe(expectedBlob);
    });

    it("should propagate errors from encryptBlobWithSignedKey utility", async () => {
      const testData = "test data";
      const testSignature = "0x1234567890abcdef";
      const expectedError = new Error("Encryption failed");

      mockEncryptBlob.mockRejectedValue(expectedError);

      await expect(
        vanaCore.encryptBlob(testData, testSignature),
      ).rejects.toThrow("Encryption failed");

      expect(mockEncryptBlob).toHaveBeenCalledWith(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockEncryptBlob).toHaveBeenCalledTimes(1);
    });

    it("should handle empty string data", async () => {
      const testData = "";
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });

      mockEncryptBlob.mockResolvedValue(expectedBlob);

      const result = await vanaCore.encryptBlob(testData, testSignature);

      expect(mockEncryptBlob).toHaveBeenCalledWith(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(result).toBe(expectedBlob);
    });

    it("should handle long wallet signature", async () => {
      const testData = "test data";
      const longSignature = `0x${"a".repeat(128)}`; // Long signature
      const expectedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });

      mockEncryptBlob.mockResolvedValue(expectedBlob);

      const result = await vanaCore.encryptBlob(testData, longSignature);

      expect(mockEncryptBlob).toHaveBeenCalledWith(
        testData,
        longSignature,
        mockPlatformAdapter,
      );
      expect(result).toBe(expectedBlob);
    });
  });

  describe("decryptBlob", () => {
    it("should call decryptBlobWithSignedKey utility with correct parameters", async () => {
      const testEncryptedData = "encrypted data";
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["decrypted"], { type: "text/plain" });

      mockDecryptBlob.mockResolvedValue(expectedBlob);

      const result = await vanaCore.decryptBlob(
        testEncryptedData,
        testSignature,
      );

      expect(mockDecryptBlob).toHaveBeenCalledWith(
        testEncryptedData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockDecryptBlob).toHaveBeenCalledTimes(1);
      expect(result).toBe(expectedBlob);
    });

    it("should handle Blob input data", async () => {
      const testBlob = new Blob(["encrypted blob data"], {
        type: "application/octet-stream",
      });
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["decrypted"], { type: "text/plain" });

      mockDecryptBlob.mockResolvedValue(expectedBlob);

      const result = await vanaCore.decryptBlob(testBlob, testSignature);

      expect(mockDecryptBlob).toHaveBeenCalledWith(
        testBlob,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockDecryptBlob).toHaveBeenCalledTimes(1);
      expect(result).toBe(expectedBlob);
    });

    it("should propagate errors from decryptBlobWithSignedKey utility", async () => {
      const testEncryptedData = "encrypted data";
      const testSignature = "0x1234567890abcdef";
      const expectedError = new Error("Decryption failed");

      mockDecryptBlob.mockRejectedValue(expectedError);

      await expect(
        vanaCore.decryptBlob(testEncryptedData, testSignature),
      ).rejects.toThrow("Decryption failed");

      expect(mockDecryptBlob).toHaveBeenCalledWith(
        testEncryptedData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockDecryptBlob).toHaveBeenCalledTimes(1);
    });

    it("should handle empty string encrypted data", async () => {
      const testEncryptedData = "";
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["decrypted"], { type: "text/plain" });

      mockDecryptBlob.mockResolvedValue(expectedBlob);

      const result = await vanaCore.decryptBlob(
        testEncryptedData,
        testSignature,
      );

      expect(mockDecryptBlob).toHaveBeenCalledWith(
        testEncryptedData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(result).toBe(expectedBlob);
    });

    it("should handle invalid signature gracefully", async () => {
      const testEncryptedData = "encrypted data";
      const invalidSignature = "invalid-signature";
      const expectedError = new Error("Invalid signature format");

      mockDecryptBlob.mockRejectedValue(expectedError);

      await expect(
        vanaCore.decryptBlob(testEncryptedData, invalidSignature),
      ).rejects.toThrow("Invalid signature format");

      expect(mockDecryptBlob).toHaveBeenCalledWith(
        testEncryptedData,
        invalidSignature,
        mockPlatformAdapter,
      );
    });
  });

  describe("encryption methods integration", () => {
    it("should work with typical encrypt-decrypt flow", async () => {
      const originalData = "sensitive user data";
      const testSignature = "0x1234567890abcdef";
      const encryptedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });
      const decryptedBlob = new Blob(["decrypted"], { type: "text/plain" });

      mockEncryptBlob.mockResolvedValue(encryptedBlob);
      mockDecryptBlob.mockResolvedValue(decryptedBlob);

      // Encrypt
      const encrypted = await vanaCore.encryptBlob(originalData, testSignature);
      expect(encrypted).toBe(encryptedBlob);

      // Decrypt
      const decrypted = await vanaCore.decryptBlob(encrypted, testSignature);
      expect(decrypted).toBe(decryptedBlob);

      // Verify both methods were called with correct parameters
      expect(mockEncryptBlob).toHaveBeenCalledWith(
        originalData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockDecryptBlob).toHaveBeenCalledWith(
        encryptedBlob,
        testSignature,
        mockPlatformAdapter,
      );
    });

    it("should handle null/undefined platform adapter gracefully", async () => {
      const testData = "test data";
      const testSignature = "0x1234567890abcdef";
      const expectedError = new Error("Platform adapter is null");

      mockEncryptBlob.mockRejectedValue(expectedError);

      await expect(
        vanaCore.encryptBlob(testData, testSignature),
      ).rejects.toThrow("Platform adapter is null");

      expect(mockEncryptBlob).toHaveBeenCalledWith(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
    });

    it("should pass through platform adapter correctly", async () => {
      const testData = "test data";
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });

      mockEncryptBlob.mockResolvedValue(expectedBlob);

      await vanaCore.encryptBlob(testData, testSignature);

      // Verify the exact platform adapter instance was passed
      expect(mockEncryptBlob).toHaveBeenCalledWith(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
    });
  });
});
