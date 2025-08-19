import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import { DataController } from "../controllers/data";
import {
  fetchAndValidateSchema,
  SchemaValidationError,
  validateDataAgainstSchema,
} from "../utils/schemaValidation";
import type { WalletClient, PublicClient } from "viem";
import type { VanaChain } from "../types";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import { moksha } from "../chains";

// Mock dependencies
vi.mock("../utils/schemaValidation", () => ({
  fetchAndValidateSchema: vi.fn(),
  SchemaValidationError: class extends Error {
    constructor(
      message: string,
      public errors?: unknown[],
    ) {
      super(message);
      this.name = "SchemaValidationError";
    }
  },
  validateDataAgainstSchema: vi.fn(),
  validateDataSchemaAgainstMetaSchema: vi.fn(),
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    getContract: vi.fn(),
  };
});

vi.mock("../config/addresses", () => ({
  getContractAddress: vi.fn().mockReturnValue("0x123"),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

describe("DataController Schema Validation", () => {
  let controller: DataController;
  let mockWalletClient: WalletClient;
  let mockPublicClient: PublicClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock wallet client
    mockWalletClient = {
      chain: moksha as VanaChain,
      account: "0xuser",
      writeContract: vi.fn(),
      getAddresses: vi.fn().mockResolvedValue(["0xuser"]),
    } as unknown as WalletClient;

    // Create mock public client
    mockPublicClient = {
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
      getTransactionReceipt: vi.fn(),
    } as unknown as PublicClient;

    // Create mock context
    const mockContext = {
      walletClient: mockWalletClient,
      publicClient: mockPublicClient,
      storageManager: undefined,
      subgraphUrl: undefined,
      platform: mockPlatformAdapter,
    };

    // Create controller instance
    controller = new DataController(mockContext);
  });

  describe("validateDataAgainstSchema", () => {
    it("should successfully validate data against schema", () => {
      const mockData = {
        name: "John Doe",
        age: 30,
      };

      const mockSchema = {
        name: "UserProfile",
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

      const mockValidate = validateDataAgainstSchema as Mock;
      mockValidate.mockReturnValue(undefined); // No errors

      controller.validateDataAgainstSchema(mockData, mockSchema);

      expect(mockValidate).toHaveBeenCalledWith(mockData, mockSchema);
    });

    it("should throw SchemaValidationError when validation fails", () => {
      const mockData = {
        name: "John Doe",
        // Missing required age
      };

      const mockSchema = {
        name: "UserProfile",
        version: "1.0.0",
        dialect: "json" as const,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name", "age"],
        },
      };

      const mockValidate = validateDataAgainstSchema as Mock;
      mockValidate.mockImplementation(() => {
        throw new SchemaValidationError("Validation failed", [
          {
            instancePath: "/",
            schemaPath: "#/required",
            keyword: "required",
            params: { missingProperty: "age" },
            message: "Missing required property: age",
          },
        ]);
      });

      expect(() =>
        controller.validateDataAgainstSchema(mockData, mockSchema),
      ).toThrow(SchemaValidationError);
    });
  });

  describe("fetchAndValidateSchema", () => {
    it("should successfully fetch and validate schema from URL", async () => {
      const mockSchema = {
        name: "TestSchema",
        version: "1.0.0",
        dialect: "json" as const,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
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

    it("should handle invalid schema URL", async () => {
      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockRejectedValue(
        new SchemaValidationError("Invalid schema format", []),
      );

      await expect(
        controller.fetchAndValidateSchema("https://invalid.com/schema.json"),
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

  describe("Edge cases and error handling", () => {
    it("should handle empty schema URL", async () => {
      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockRejectedValue(new Error("Invalid URL"));

      await expect(controller.fetchAndValidateSchema("")).rejects.toThrow();
    });

    it("should handle malformed JSON in schema", async () => {
      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockRejectedValue(new Error("Invalid JSON"));

      await expect(
        controller.fetchAndValidateSchema("https://example.com/bad.json"),
      ).rejects.toThrow();
    });

    it("should handle schemas with circular references", async () => {
      const circularSchema = {
        name: "CircularSchema",
        version: "1.0.0",
        dialect: "json" as const,
        schema: {
          type: "object",
          properties: {
            self: { $ref: "#" },
          },
        },
      };

      const mockFetchAndValidateSchema = fetchAndValidateSchema as Mock;
      mockFetchAndValidateSchema.mockResolvedValue(circularSchema);

      const result = await controller.fetchAndValidateSchema(
        "https://example.com/circular.json",
      );
      expect(result).toEqual(circularSchema);
    });
  });
});
