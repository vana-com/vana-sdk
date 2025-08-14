import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { DataController } from "../controllers/data";
import { ControllerContext } from "../controllers/permissions";
import type { StorageManager } from "../storage/manager";
import { SchemaValidationError } from "../utils/schemaValidation";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import type { VanaChain } from "../types";

// Mock viem getContract to return a mocked contract object
vi.mock("viem", () => ({
  getContract: vi.fn(() => ({
    read: {
      schemas: vi.fn(),
    },
  })),
}));

// Mock ALL external dependencies for pure unit tests
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
      contentdialecte: "application/octet-stream",
    }),
  })),
}));

vi.mock("../utils/schemaValidation", () => ({
  validateDataSchema: vi.fn(),
  validateDataAgainstSchema: vi.fn(),
  fetchAndValidateSchema: vi.fn(),
  SchemaValidationError: class SchemaValidationError extends Error {
    constructor(
      message: string,
      public errors: Array<{
        instancePath: string;
        schemaPath: string;
        keyword: string;
        params: Record<string, unknown>;
        message?: string;
      }>,
    ) {
      super(message);
      this.name = "SchemaValidationError";
    }
  },
}));

vi.mock("../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x8C8788f98385F6ba1adD4234e551ABba0f82Cb7C"),
}));

vi.mock("../../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([
    {
      name: "totalSchemas",
      type: "function",
      inputs: [],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      name: "schemas",
      type: "function",
      inputs: [{ name: "id", type: "uint256" }],
      outputs: [
        { name: "name", type: "string" },
        { name: "dialect", type: "string" },
        { name: "definitionUrl", type: "string" },
      ],
    },
  ]),
}));

// Mock fetch globally - no real network calls
global.fetch = vi.fn();

// Import the mocked functions for configuration
import { fetchAndValidateSchema } from "../utils/schemaValidation";
import { getContract } from "viem";

interface MockWalletClient {
  account: {
    address: string;
  };
  chain: {
    id: number;
    name: string;
  };
  getChainId: ReturnType<typeof vi.fn>;
  getAddresses: ReturnType<typeof vi.fn>;
  writeContract: ReturnType<typeof vi.fn>;
}

interface MockPublicClient {
  readContract: ReturnType<typeof vi.fn>;
  waitForTransactionReceipt: ReturnType<typeof vi.fn>;
}

describe("DataController - Schema Validation Methods", () => {
  let controller: DataController;
  let mockContext: ControllerContext;
  let mockWalletClient: MockWalletClient;
  let mockPublicClient: MockPublicClient;
  let mockStorageManager: StorageManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset fetch mock to a working state
    const mockFetch = fetch as Mock;
    mockFetch.mockReset();

    // Set up default mock for fetchAndValidateSchema
    const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
    mockFetchAndValidateSchema.mockReset();

    // Create a fully mocked wallet client
    mockWalletClient = {
      account: {
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      },
      chain: {
        id: 14800,
        name: "Moksha Testnet",
      },
      getChainId: vi.fn().mockResolvedValue(14800),
      getAddresses: vi
        .fn()
        .mockResolvedValue(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]),
      writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    };

    // Create a mock publicClient
    mockPublicClient = {
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    };

    // Create a mock storage manager
    mockStorageManager = {
      upload: vi.fn().mockResolvedValue({
        url: "https://ipfs.io/ipfs/QmTestHash",
        size: 1024,
        contentdialecte: "application/octet-stream",
      }),
    } as unknown as StorageManager;

    // Set up the context with all required mocks
    mockContext = {
      walletClient:
        mockWalletClient as unknown as ControllerContext["walletClient"],
      publicClient:
        mockPublicClient as unknown as ControllerContext["publicClient"],
      storageManager: mockStorageManager,
      platform: mockPlatformAdapter,
    } as ControllerContext;

    controller = new DataController(mockContext);
  });

  describe("fetchAndValidateSchema", () => {
    it("should successfully fetch and validate schema", async () => {
      const mockSchema = {
        name: "TestSchema",
        version: "1.0.0",
        dialect: "json",
        definition: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
        },
      };

      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockResolvedValue(mockSchema);

      const result = await controller.fetchAndValidateSchema(
        "https://example.com/schema.json",
      );

      expect(result).toEqual(mockSchema);
      expect(mockFetchAndValidateSchema).toHaveBeenCalledWith(
        "https://example.com/schema.json",
      );
    });

    it("should handle schema validation errors", async () => {
      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockRejectedValue(
        new SchemaValidationError("Invalid schema", [
          {
            instancePath: "/",
            schemaPath: "#/required",
            keyword: "required",
            params: { missingProperty: "required_field" },
            message: "Missing required field",
          },
        ]),
      );

      await expect(
        controller.fetchAndValidateSchema(
          "https://example.com/invalid-schema.json",
        ),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should handle network errors", async () => {
      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockRejectedValue(new Error("Network error"));

      await expect(
        controller.fetchAndValidateSchema("https://example.com/schema.json"),
      ).rejects.toThrow("Network error");
    });
  });

  describe("getValidatedSchema", () => {
    it("should successfully get and validate schema", async () => {
      // Mock the contract read method
      const mockContract = {
        read: {
          schemas: vi.fn().mockResolvedValue({
            name: "TestSchema",
            dialect: "json",
            definitionUrl: "https://example.com/schema.json",
          }),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      // Mock fetchAndValidateSchema to return validated schema
      const mockValidatedSchema = {
        name: "TestSchema",
        version: "1.0.0",
        dialect: "json",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
        },
      };

      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockResolvedValue(mockValidatedSchema);

      const result = await controller.getValidatedSchema(123);

      expect(result).toEqual(mockValidatedSchema);
      expect(mockContract.read.schemas).toHaveBeenCalledWith([BigInt(123)]);
      expect(mockFetchAndValidateSchema).toHaveBeenCalledWith(
        "https://example.com/schema.json",
      );
    });

    it("should handle schema name mismatch", async () => {
      // Mock the contract read method
      const mockContract = {
        read: {
          schemas: vi.fn().mockResolvedValue({
            name: "OnChainSchema",
            dialect: "json",
            definitionUrl: "https://example.com/schema.json",
          }),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      // Mock fetchAndValidateSchema to return schema with different name
      const mockValidatedSchema = {
        name: "FetchedSchema", // Different name
        version: "1.0.0",
        dialect: "json",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
        },
      };

      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockResolvedValue(mockValidatedSchema);

      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        SchemaValidationError,
      );
      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        'Schema name mismatch: on-chain name "OnChainSchema" does not match schema name "FetchedSchema"',
      );
    });

    it("should handle getSchema errors", async () => {
      // Mock the contract read method to throw
      const mockContract = {
        read: {
          schemas: vi.fn().mockRejectedValue(new Error("Contract read failed")),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        SchemaValidationError,
      );
      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        "Failed to get validated schema 123:",
      );
    });

    it("should handle fetchAndValidateSchema errors", async () => {
      // Mock the contract read method
      const mockContract = {
        read: {
          schemas: vi.fn().mockResolvedValue({
            name: "TestSchema",
            dialect: "json",
            definitionUrl: "https://example.com/schema.json",
          }),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      // Mock fetchAndValidateSchema to throw an error
      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockRejectedValue(new Error("Fetch failed"));

      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        SchemaValidationError,
      );
      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        "Failed to get validated schema 123:",
      );
    });

    it("should preserve SchemaValidationError from fetchAndValidateSchema", async () => {
      // Mock the contract read method
      const mockContract = {
        read: {
          schemas: vi.fn().mockResolvedValue({
            name: "TestSchema",
            dialect: "json",
            definitionUrl: "https://example.com/schema.json",
          }),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      // Mock fetchAndValidateSchema to throw SchemaValidationError
      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      const originalError = new SchemaValidationError("Invalid schema", [
        {
          instancePath: "/",
          schemaPath: "#/required",
          keyword: "required",
          params: { missingProperty: "required_field" },
          message: "Missing required field",
        },
      ]);
      mockFetchAndValidateSchema.mockRejectedValue(originalError);

      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        originalError,
      );
    });

    it("should handle non-Error exceptions in getValidatedSchema", async () => {
      // Mock the contract read method to throw a non-Error
      const mockContract = {
        read: {
          schemas: vi.fn().mockRejectedValue("String error"),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        SchemaValidationError,
      );
      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        "Failed to get validated schema 123: Unknown error",
      );
    });

    it("should handle missing chainId in getValidatedSchema", async () => {
      // Mock missing chain
      mockWalletClient.chain = undefined as unknown as VanaChain;

      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        SchemaValidationError,
      );
    });

    it("should successfully validate schema with exact name match", async () => {
      // Mock the contract read method
      const mockContract = {
        read: {
          schemas: vi.fn().mockResolvedValue({
            name: "ExactMatch",
            dialect: "json",
            definitionUrl: "https://example.com/schema.json",
          }),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      // Mock fetchAndValidateSchema to return schema with exact matching name
      const mockValidatedSchema = {
        name: "ExactMatch", // Exact match
        version: "1.0.0",
        dialect: "json",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
        },
      };

      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockResolvedValue(mockValidatedSchema);

      const result = await controller.getValidatedSchema(456);

      expect(result).toEqual(mockValidatedSchema);
      expect(result.name).toBe("ExactMatch");
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle empty schema URL", async () => {
      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockRejectedValue(new Error("Invalid URL"));

      await expect(controller.fetchAndValidateSchema("")).rejects.toThrow();
    });

    it("should handle invalid schema ID", async () => {
      const mockContract = {
        read: {
          schemas: vi.fn().mockRejectedValue(new Error("Invalid schema ID")),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      await expect(controller.getValidatedSchema(-1)).rejects.toThrow(
        SchemaValidationError,
      );
    });

    it("should handle schema with undefined name", async () => {
      // Mock the contract read method with undefined name
      const mockContract = {
        read: {
          schemas: vi.fn().mockResolvedValue({
            name: undefined,
            dialect: "json",
            definitionUrl: "https://example.com/schema.json",
          }),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      // Mock fetchAndValidateSchema to return schema with proper name
      const mockValidatedSchema = {
        name: "ValidName",
        version: "1.0.0",
        dialect: "json",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      };

      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockResolvedValue(mockValidatedSchema);

      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        SchemaValidationError,
      );
    });

    it("should handle schema with null definition URL", async () => {
      // Mock the contract read method with null definitionUrl
      const mockContract = {
        read: {
          schemas: vi.fn().mockResolvedValue({
            name: "TestSchema",
            dialect: "json",
            definitionUrl: null,
          }),
        },
      };
      (getContract as Mock).mockReturnValue(mockContract);

      await expect(controller.getValidatedSchema(123)).rejects.toThrow(
        SchemaValidationError,
      );
    });
  });
});
