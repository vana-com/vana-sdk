import { describe, it, expect, vi } from "vitest";
import { DataController } from "../controllers/data";
import type { ControllerContext } from "../controllers/permissions";
import { mokshaTestnet } from "../config/chains";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import type { DataSchema } from "../utils/schemaValidation";

// Mock external dependencies
vi.mock("../utils/encryption", () => ({
  generateEncryptionKey: vi.fn(),
  decryptBlobWithSignedKey: vi.fn(),
  encryptBlobWithSignedKey: vi.fn(),
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
  SchemaValidationError: Error,
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    getAddress: vi.fn((address) => address),
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
  };
});

/**
 * Tests to improve coverage for specific uncovered lines in data.ts
 * These target lines 2044, 2074-2075 which are wrapper functions
 */

describe("DataController Edge Cases Coverage", () => {
  const context: ControllerContext = {
    walletClient: {
      account: { address: "0x123" },
      chain: mokshaTestnet,
    } as unknown as ControllerContext["walletClient"],
    publicClient: {
      readContract: vi.fn(),
    } as unknown as ControllerContext["publicClient"],
    platform: mockPlatformAdapter,
    userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  };

  describe("Schema validation wrapper methods", () => {
    it("should call validateDataSchemaAgainstMetaSchema utility function (line 2044)", () => {
      const dataController = new DataController(context);
      const mockSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      };

      // This should call the utility function and not throw
      const validateFunc: (schema: unknown) => DataSchema =
        dataController.validateDataSchemaAgainstMetaSchema.bind(dataController);
      expect(() => validateFunc(mockSchema)).not.toThrow();
    });

    it("should call validateDataAgainstSchema utility function (lines 2074-2075)", () => {
      const dataController = new DataController(context);
      const mockData = { name: "Alice", age: 30 };
      const mockSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json" as const,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name"],
        },
      };

      // This should call the utility function and not throw
      expect((): void => {
        dataController.validateDataAgainstSchema(mockData, mockSchema);
      }).not.toThrow();
    });

    it("should call validateDataSchemaAgainstMetaSchema with proper arguments", async () => {
      const schemaValidationModule = await import("../utils/schemaValidation");
      const validateDataSchemaAgainstMetaSchemaMock = vi.mocked(
        schemaValidationModule.validateDataSchemaAgainstMetaSchema,
      );

      const dataController = new DataController(context);
      const mockSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json" as const,
        schema: { type: "object" },
      };

      const validateFunc: (schema: unknown) => DataSchema =
        dataController.validateDataSchemaAgainstMetaSchema.bind(dataController);
      validateFunc(mockSchema);

      expect(validateDataSchemaAgainstMetaSchemaMock).toHaveBeenCalledWith(
        mockSchema,
      );
    });

    it("should call validateDataAgainstSchema with proper arguments", async () => {
      const schemaValidationModule = await import("../utils/schemaValidation");
      const validateDataAgainstSchemaMock = vi.mocked(
        schemaValidationModule.validateDataAgainstSchema,
      );

      const dataController = new DataController(context);
      const mockData = { name: "Alice" };
      const mockSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json" as const,
        schema: { type: "object" },
      };

      dataController.validateDataAgainstSchema(mockData, mockSchema);

      expect(validateDataAgainstSchemaMock).toHaveBeenCalledWith(
        mockData,
        mockSchema,
      );
    });
  });

  describe("Error handling in decryptFileWithPermission", () => {
    it("should handle errors in decryptFileWithPermission method", async () => {
      const dataController = new DataController(context);
      const mockFile = {
        id: 123,
        url: "ipfs://QmTestHash",
        size: 1024,
        contentType: "text/plain",
        owner: "0x123" as `0x${string}`,
        addedAtBlock: BigInt(123),
        addedAtTimestamp: BigInt(1234567890),
        transactionHash: "0xhash" as `0x${string}`,
        schemaId: 123,
        ownerAddress: "0x123" as `0x${string}`,
      };

      // Clear the userAddress to simulate error
      (dataController as any).context.userAddress = undefined;

      await expect(
        dataController.decryptFileWithPermission(mockFile, "private-key"),
      ).rejects.toThrow("Failed to decrypt file with permission");
    });
  });
});
