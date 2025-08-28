import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataController } from "./data";
import type { ControllerContext } from "./permissions";
import { mokshaTestnet } from "../config/chains";
import { mockPlatformAdapter } from "../tests/mocks/platformAdapter";

// Mock external dependencies
vi.mock("../utils/encryption", () => ({
  generateEncryptionKey: vi.fn(),
  decryptBlobWithSignedKey: vi.fn(),
  encryptBlobWithSignedKey: vi.fn(),
  decryptWithWalletPrivateKey: vi.fn(),
  DEFAULT_ENCRYPTION_SEED: "Please sign to retrieve your encryption key",
}));

vi.mock("../storage", () => ({
  StorageManager: vi.fn().mockImplementation(() => ({
    upload: vi.fn().mockResolvedValue({
      url: "https://ipfs.io/ipfs/QmTestHash",
      size: 1024,
      contentType: "application/octet-stream",
    }),
  })),
}));

vi.mock("../utils/schemaValidation", () => ({
  validateDataSchemaAgainstMetaSchema: vi.fn(),
  validateDataAgainstSchema: vi.fn(),
  fetchAndValidateSchema: vi.fn(),
  SchemaValidationError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SchemaValidationError";
    }
  },
}));

vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
  })),
  getContract: vi.fn(() => ({
    read: {
      filesCount: vi.fn().mockResolvedValue(BigInt(42)),
    },
  })),
  http: vi.fn(),
  decodeEventLog: vi.fn(),
  defineChain: vi.fn((config) => config),
}));

// Mock global fetch
global.fetch = vi.fn();

describe("DataController Error Handling", () => {
  let dataController: DataController;
  let mockContext: ControllerContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      walletClient: {
        account: { address: "0x123" },
        chain: mokshaTestnet,
        getAddresses: vi.fn().mockResolvedValue(["0x123"]),
      } as unknown as ControllerContext["walletClient"],
      publicClient: {} as ControllerContext["publicClient"],
      platform: mockPlatformAdapter,
    };

    dataController = new DataController(mockContext);
  });

  // Note: Server identity tests removed as getTrustedServerPublicKey was refactored
  // out of DataController into the new ServerController in the Gateway architecture.

  describe("decryptFileWithPermission error handling (lines 1982-2009)", () => {
    const mockFile = {
      id: 1,
      url: "ipfs://QmTestHash",
      size: 1024,
      contentType: "text/plain",
      owner: "0x123",
      addedAtBlock: BigInt(123),
      addedAtTimestamp: BigInt(1234567890),
      transactionHash: "0xhash" as `0x${string}`,
      schemaId: 123,
      ownerAddress: "0x123" as `0x${string}`,
    };

    it("should throw error when no file permission found (lines 1982-1986)", async () => {
      // Mock getUserAddress to return a valid address
      vi.spyOn(
        dataController as DataController & {
          getUserAddress: () => Promise<string>;
        },
        "getUserAddress",
      ).mockResolvedValue("0x123");
      vi.spyOn(dataController, "getFilePermission").mockResolvedValue("");

      await expect(
        dataController.decryptFileWithPermission(mockFile, "privateKey"),
      ).rejects.toThrow("No permission found for account");
    });

    it("should handle HTTP fetch errors during file download (lines 1997-1999)", async () => {
      vi.spyOn(
        dataController as DataController & {
          getUserAddress: () => Promise<string>;
        },
        "getUserAddress",
      ).mockResolvedValue("0x123");
      vi.spyOn(dataController, "getFilePermission").mockResolvedValue(
        "encryptedKey",
      );
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        statusText: "Not Found",
      } as Response);

      await expect(
        dataController.decryptFileWithPermission(mockFile, "privateKey"),
      ).rejects.toThrow(
        "Failed to decrypt file with permission: HTTP error! status: undefined Not Found",
      );
    });

    it("should handle decryption errors in catch block (lines 2005-2009)", async () => {
      vi.spyOn(
        dataController as DataController & {
          getUserAddress: () => Promise<string>;
        },
        "getUserAddress",
      ).mockResolvedValue("0x123");
      vi.spyOn(dataController, "getFilePermission").mockResolvedValue(
        "encryptedKey",
      );
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["test content"])),
      } as Response);

      // Mock decryptWithWalletPrivateKey to throw an error
      const { decryptWithWalletPrivateKey } = await import(
        "../utils/encryption"
      );
      vi.mocked(decryptWithWalletPrivateKey).mockRejectedValue(
        new Error("Decryption failed"),
      );

      await expect(
        dataController.decryptFileWithPermission(mockFile, "privateKey"),
      ).rejects.toThrow(
        "Failed to decrypt file with permission: Decryption failed",
      );
    });

    it("should successfully decrypt file with permission (success path lines 1977-2009)", async () => {
      // Mock all dependencies to return successful results
      vi.spyOn(
        dataController as DataController & {
          getUserAddress: () => Promise<string>;
        },
        "getUserAddress",
      ).mockResolvedValue("0x123");
      vi.spyOn(dataController, "getFilePermission").mockResolvedValue(
        "encryptedKey",
      );

      // Mock successful fetch response
      const mockEncryptedBlob = new Blob(["encrypted content"], {
        type: "application/octet-stream",
      });
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockEncryptedBlob),
      } as Response);

      // Mock successful decryption functions
      const { decryptWithWalletPrivateKey, decryptBlobWithSignedKey } =
        await import("../utils/encryption");
      vi.mocked(decryptWithWalletPrivateKey).mockResolvedValue("decryptionKey");

      const mockDecryptedBlob = new Blob(["decrypted content"], {
        type: "text/plain",
      });
      vi.mocked(decryptBlobWithSignedKey).mockResolvedValue(mockDecryptedBlob);

      // Call the method
      const result = await dataController.decryptFileWithPermission(
        mockFile,
        "privateKey",
      );

      // Verify the result
      expect(result).toBe(mockDecryptedBlob);

      // Verify all mocks were called with correct parameters
      expect(dataController.getFilePermission).toHaveBeenCalledWith(1, "0x123");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://dweb.link/ipfs/QmTestHash",
      );
      expect(decryptWithWalletPrivateKey).toHaveBeenCalledWith(
        "encryptedKey",
        "privateKey",
        mockContext.platform,
      );
      expect(decryptBlobWithSignedKey).toHaveBeenCalledWith(
        mockEncryptedBlob,
        "decryptionKey",
        mockContext.platform,
      );
    });
  });

  describe("Schema validation error handling", () => {
    it("should handle fetchAndValidateSchema wrapper function", async () => {
      const mockSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json" as const,
        schema: { type: "object" },
      };

      const { fetchAndValidateSchema } = await import(
        "../utils/schemaValidation"
      );
      vi.mocked(fetchAndValidateSchema).mockResolvedValue(mockSchema);

      const result =
        await dataController.fetchAndValidateSchema("test-schema-id");
      expect(result).toEqual(mockSchema);
      expect(fetchAndValidateSchema).toHaveBeenCalledWith("test-schema-id");
    });
  });
});
