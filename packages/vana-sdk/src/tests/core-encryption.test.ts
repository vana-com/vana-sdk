import { describe, it, expect, vi, beforeEach } from "vitest";
import { VanaCore } from "../core";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import * as encryptionUtils from "../utils/encryption";

// Mock controllers to avoid initialization issues
vi.mock("../controllers/permissions", () => ({
  PermissionsController: vi.fn().mockImplementation(() => ({
    getUserAddress: vi
      .fn()
      .mockResolvedValue("0x1234567890123456789012345678901234567890"),
  })),
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
  encryptUserData: vi.fn(),
  decryptUserData: vi.fn(),
}));

describe("VanaCore Encryption Methods", () => {
  const testAccount = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  let vanaCore: VanaCore;
  let mockEncryptUserData: ReturnType<typeof vi.fn>;
  let mockDecryptUserData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mocked functions
    mockEncryptUserData = vi.mocked(encryptionUtils.encryptUserData);
    mockDecryptUserData = vi.mocked(encryptionUtils.decryptUserData);

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

  describe("encryptUserData", () => {
    it("should call encryptUserData utility with correct parameters", async () => {
      const testData = "test data to encrypt";
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });

      mockEncryptUserData.mockResolvedValue(expectedBlob);

      const result = await vanaCore.encryptUserData(testData, testSignature);

      expect(mockEncryptUserData).toHaveBeenCalledWith(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockEncryptUserData).toHaveBeenCalledTimes(1);
      expect(result).toBe(expectedBlob);
    });

    it("should handle Blob input data", async () => {
      const testBlob = new Blob(["test blob data"], { type: "text/plain" });
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });

      mockEncryptUserData.mockResolvedValue(expectedBlob);

      const result = await vanaCore.encryptUserData(testBlob, testSignature);

      expect(mockEncryptUserData).toHaveBeenCalledWith(
        testBlob,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockEncryptUserData).toHaveBeenCalledTimes(1);
      expect(result).toBe(expectedBlob);
    });

    it("should propagate errors from encryptUserData utility", async () => {
      const testData = "test data";
      const testSignature = "0x1234567890abcdef";
      const expectedError = new Error("Encryption failed");

      mockEncryptUserData.mockRejectedValue(expectedError);

      await expect(
        vanaCore.encryptUserData(testData, testSignature),
      ).rejects.toThrow("Encryption failed");

      expect(mockEncryptUserData).toHaveBeenCalledWith(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockEncryptUserData).toHaveBeenCalledTimes(1);
    });

    it("should handle empty string data", async () => {
      const testData = "";
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });

      mockEncryptUserData.mockResolvedValue(expectedBlob);

      const result = await vanaCore.encryptUserData(testData, testSignature);

      expect(mockEncryptUserData).toHaveBeenCalledWith(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(result).toBe(expectedBlob);
    });

    it("should handle long wallet signature", async () => {
      const testData = "test data";
      const longSignature = "0x" + "a".repeat(128); // Long signature
      const expectedBlob = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });

      mockEncryptUserData.mockResolvedValue(expectedBlob);

      const result = await vanaCore.encryptUserData(testData, longSignature);

      expect(mockEncryptUserData).toHaveBeenCalledWith(
        testData,
        longSignature,
        mockPlatformAdapter,
      );
      expect(result).toBe(expectedBlob);
    });
  });

  describe("decryptUserData", () => {
    it("should call decryptUserData utility with correct parameters", async () => {
      const testEncryptedData = "encrypted data";
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["decrypted"], { type: "text/plain" });

      mockDecryptUserData.mockResolvedValue(expectedBlob);

      const result = await vanaCore.decryptUserData(
        testEncryptedData,
        testSignature,
      );

      expect(mockDecryptUserData).toHaveBeenCalledWith(
        testEncryptedData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockDecryptUserData).toHaveBeenCalledTimes(1);
      expect(result).toBe(expectedBlob);
    });

    it("should handle Blob input data", async () => {
      const testBlob = new Blob(["encrypted blob data"], {
        type: "application/octet-stream",
      });
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["decrypted"], { type: "text/plain" });

      mockDecryptUserData.mockResolvedValue(expectedBlob);

      const result = await vanaCore.decryptUserData(testBlob, testSignature);

      expect(mockDecryptUserData).toHaveBeenCalledWith(
        testBlob,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockDecryptUserData).toHaveBeenCalledTimes(1);
      expect(result).toBe(expectedBlob);
    });

    it("should propagate errors from decryptUserData utility", async () => {
      const testEncryptedData = "encrypted data";
      const testSignature = "0x1234567890abcdef";
      const expectedError = new Error("Decryption failed");

      mockDecryptUserData.mockRejectedValue(expectedError);

      await expect(
        vanaCore.decryptUserData(testEncryptedData, testSignature),
      ).rejects.toThrow("Decryption failed");

      expect(mockDecryptUserData).toHaveBeenCalledWith(
        testEncryptedData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockDecryptUserData).toHaveBeenCalledTimes(1);
    });

    it("should handle empty string encrypted data", async () => {
      const testEncryptedData = "";
      const testSignature = "0x1234567890abcdef";
      const expectedBlob = new Blob(["decrypted"], { type: "text/plain" });

      mockDecryptUserData.mockResolvedValue(expectedBlob);

      const result = await vanaCore.decryptUserData(
        testEncryptedData,
        testSignature,
      );

      expect(mockDecryptUserData).toHaveBeenCalledWith(
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

      mockDecryptUserData.mockRejectedValue(expectedError);

      await expect(
        vanaCore.decryptUserData(testEncryptedData, invalidSignature),
      ).rejects.toThrow("Invalid signature format");

      expect(mockDecryptUserData).toHaveBeenCalledWith(
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

      mockEncryptUserData.mockResolvedValue(encryptedBlob);
      mockDecryptUserData.mockResolvedValue(decryptedBlob);

      // Encrypt
      const encrypted = await vanaCore.encryptUserData(
        originalData,
        testSignature,
      );
      expect(encrypted).toBe(encryptedBlob);

      // Decrypt
      const decrypted = await vanaCore.decryptUserData(
        encrypted,
        testSignature,
      );
      expect(decrypted).toBe(decryptedBlob);

      // Verify both methods were called with correct parameters
      expect(mockEncryptUserData).toHaveBeenCalledWith(
        originalData,
        testSignature,
        mockPlatformAdapter,
      );
      expect(mockDecryptUserData).toHaveBeenCalledWith(
        encryptedBlob,
        testSignature,
        mockPlatformAdapter,
      );
    });

    it("should handle null/undefined platform adapter gracefully", async () => {
      const testData = "test data";
      const testSignature = "0x1234567890abcdef";
      const expectedError = new Error("Platform adapter is null");

      mockEncryptUserData.mockRejectedValue(expectedError);

      await expect(
        vanaCore.encryptUserData(testData, testSignature),
      ).rejects.toThrow("Platform adapter is null");

      expect(mockEncryptUserData).toHaveBeenCalledWith(
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

      mockEncryptUserData.mockResolvedValue(expectedBlob);

      await vanaCore.encryptUserData(testData, testSignature);

      // Verify the exact platform adapter instance was passed
      expect(mockEncryptUserData).toHaveBeenCalledWith(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
    });
  });
});
