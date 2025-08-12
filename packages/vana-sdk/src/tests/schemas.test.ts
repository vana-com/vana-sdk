import { describe, it, expect, vi, beforeEach } from "vitest";
import { SchemaController } from "../controllers/schemas";
import { ControllerContext } from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import type { StorageManager } from "../storage/manager";
import { SchemaValidationError } from "../utils/schemaValidation";
import { validateDataSchema } from "../utils/schemaValidation";
import {
  fetchSchemaFromChain,
  fetchSchemaCountFromChain,
} from "../utils/blockchain/registry";
import { Address } from "viem";

// Mock dependencies
vi.mock("../utils/blockchain/registry", () => ({
  fetchSchemaFromChain: vi.fn(),
  fetchSchemaCountFromChain: vi.fn(),
}));

vi.mock("../utils/schemaValidation", () => ({
  validateDataSchema: vi.fn(),
  SchemaValidationError: class SchemaValidationError extends Error {
    constructor(
      message: string,
      public errors: any[] = [],
    ) {
      super(message);
      this.name = "SchemaValidationError";
    }
  },
}));

vi.mock("viem", () => ({
  decodeEventLog: vi.fn(),
}));

vi.mock("../config/addresses", () => ({
  getContractAddress: vi.fn().mockReturnValue("0xRegistryAddress"),
}));

vi.mock("../abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

describe("SchemaController", () => {
  let controller: SchemaController;
  let mockContext: ControllerContext;
  let mockStorageManager: Partial<StorageManager>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset validateDataSchema to not throw by default
    vi.mocked(validateDataSchema).mockImplementation(() => {});

    // Create mock storage manager
    mockStorageManager = {
      upload: vi.fn().mockResolvedValue({
        url: "https://ipfs.io/ipfs/QmTestHash",
        size: 1024,
        contentType: "application/json",
      }),
      download: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
      register: vi.fn(),
      getProvider: vi.fn(),
      setDefaultProvider: vi.fn(),
      listProviders: vi.fn().mockReturnValue(["ipfs"]),
      getDefaultProvider: vi.fn().mockReturnValue("ipfs"),
      getStorageProviders: vi.fn().mockReturnValue(["ipfs"]),
      getDefaultStorageProvider: vi.fn().mockReturnValue("ipfs"),
    };

    // Create mock context
    mockContext = {
      walletClient: {
        account: { address: "0xTestAddress" },
        chain: { id: 14800, name: "Moksha Testnet" },
        writeContract: vi.fn().mockResolvedValue("0xTransactionHash"),
      } as any,
      publicClient: {
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          logs: [{ data: "0x", topics: ["0xSchemaAdded"] }],
        }),
      } as any,
      platform: mockPlatformAdapter,
      storageManager: mockStorageManager as StorageManager,
    };

    controller = new SchemaController(mockContext);
  });

  describe("get()", () => {
    it("should get schema by ID", async () => {
      const mockSchema = {
        id: 1,
        name: "Test Schema",
        type: "json",
        definitionUrl: "https://example.com/schema.json",
      };

      vi.mocked(fetchSchemaFromChain).mockResolvedValue(mockSchema);

      const result = await controller.get(1);

      expect(result).toEqual(mockSchema);
      expect(fetchSchemaFromChain).toHaveBeenCalledWith(mockContext, 1);
    });

    it("should wrap errors from fetchSchemaFromChain", async () => {
      vi.mocked(fetchSchemaFromChain).mockRejectedValue(
        new Error("Chain ID not available"),
      );

      await expect(controller.get(1)).rejects.toThrow(
        "Failed to get schema: Chain ID not available",
      );
    });

    it("should handle non-Error exceptions", async () => {
      vi.mocked(fetchSchemaFromChain).mockRejectedValue("String error");

      await expect(controller.get(1)).rejects.toThrow(
        "Failed to get schema: Unknown error",
      );
    });
  });

  describe("count()", () => {
    it("should get total schema count", async () => {
      vi.mocked(fetchSchemaCountFromChain).mockResolvedValue(42);

      const result = await controller.count();

      expect(result).toBe(42);
      expect(fetchSchemaCountFromChain).toHaveBeenCalledWith(mockContext);
    });

    it("should wrap errors from fetchSchemaCountFromChain", async () => {
      vi.mocked(fetchSchemaCountFromChain).mockRejectedValue(
        new Error("Contract error"),
      );

      await expect(controller.count()).rejects.toThrow(
        "Failed to get schemas count: Contract error",
      );
    });
  });

  describe("list()", () => {
    it("should list schemas with pagination", async () => {
      const mockSchemas = [
        {
          id: 1,
          name: "Schema 1",
          type: "json",
          definitionUrl: "https://example.com/1.json",
        },
        {
          id: 2,
          name: "Schema 2",
          type: "json",
          definitionUrl: "https://example.com/2.json",
        },
      ];

      // Mock count to return 2
      vi.spyOn(controller, "count").mockResolvedValue(2);

      // Mock get to return schemas
      vi.spyOn(controller, "get")
        .mockResolvedValueOnce(mockSchemas[0])
        .mockResolvedValueOnce(mockSchemas[1]);

      const result = await controller.list({ limit: 10, offset: 0 });

      expect(result).toEqual(mockSchemas);
      expect(controller.count).toHaveBeenCalled();
      expect(controller.get).toHaveBeenCalledWith(1);
      expect(controller.get).toHaveBeenCalledWith(2);
    });

    it("should skip schemas that fail to retrieve", async () => {
      const mockSchema = {
        id: 2,
        name: "Schema 2",
        type: "json",
        definitionUrl: "https://example.com/2.json",
      };

      vi.spyOn(controller, "count").mockResolvedValue(3);
      vi.spyOn(controller, "get")
        .mockRejectedValueOnce(new Error("Schema 1 not found"))
        .mockResolvedValueOnce(mockSchema)
        .mockRejectedValueOnce(new Error("Schema 3 not found"));

      const result = await controller.list({ limit: 10, offset: 0 });

      expect(result).toEqual([mockSchema]);
      expect(controller.get).toHaveBeenCalledTimes(3);
    });

    it("should handle pagination correctly", async () => {
      vi.spyOn(controller, "count").mockResolvedValue(10);
      const mockGet = vi.spyOn(controller, "get").mockResolvedValue({
        id: 5,
        name: "Schema 5",
        type: "json",
        definitionUrl: "https://example.com/5.json",
      });

      await controller.list({ limit: 2, offset: 4 });

      // Should request schemas 5 and 6 (offset 4, limit 2)
      expect(mockGet).toHaveBeenCalledWith(5);
      expect(mockGet).toHaveBeenCalledWith(6);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it("should handle count errors", async () => {
      vi.spyOn(controller, "count").mockRejectedValue(
        new Error("Count failed"),
      );

      await expect(controller.list()).rejects.toThrow(
        "Failed to list schemas: Count failed",
      );
    });

    it("should use default pagination values", async () => {
      vi.spyOn(controller, "count").mockResolvedValue(0);

      const result = await controller.list();

      expect(result).toEqual([]);
      expect(controller.count).toHaveBeenCalled();
    });
  });

  describe("create()", () => {
    it("should validate and upload schema to IPFS", async () => {
      const { validateDataSchema } = await import("../utils/schemaValidation");
      const { decodeEventLog } = await import("viem");

      vi.mocked(decodeEventLog).mockReturnValue({
        eventName: "SchemaAdded",
        args: { schemaId: BigInt(123) },
      } as any);

      const schemaDefinition = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };

      const result = await controller.create({
        name: "Test Schema",
        type: "personal",
        definition: schemaDefinition,
      });

      expect(result).toEqual({
        schemaId: 123,
        definitionUrl: "https://ipfs.io/ipfs/QmTestHash",
        transactionHash: "0xTransactionHash",
      });

      expect(validateDataSchema).toHaveBeenCalledWith({
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json",
        schema: schemaDefinition,
      });

      expect(mockStorageManager.upload).toHaveBeenCalledWith(
        expect.any(Blob),
        "Test_Schema.json",
        "ipfs",
      );

      expect(mockContext.walletClient.writeContract).toHaveBeenCalledWith({
        address: "0xRegistryAddress",
        abi: [],
        functionName: "addSchema",
        args: ["Test Schema", "personal", "https://ipfs.io/ipfs/QmTestHash"],
        account: expect.any(Object),
        chain: expect.any(Object),
      });
    });

    it("should handle JSON string definition", async () => {
      const { validateDataSchema } = await import("../utils/schemaValidation");
      const { decodeEventLog } = await import("viem");

      vi.mocked(decodeEventLog).mockReturnValue({
        eventName: "SchemaAdded",
        args: { schemaId: BigInt(123) },
      } as any);

      const schemaDefinition = JSON.stringify({
        type: "object",
        properties: { name: { type: "string" } },
      });

      const result = await controller.create({
        name: "Test Schema",
        type: "personal",
        definition: schemaDefinition,
      });

      expect(result.schemaId).toBe(123);
      expect(validateDataSchema).toHaveBeenCalled();
    });

    it("should handle invalid JSON string", async () => {
      await expect(
        controller.create({
          name: "Test Schema",
          type: "personal",
          definition: "{ invalid json",
        }),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should handle validation errors", async () => {
      const { validateDataSchema } = await import("../utils/schemaValidation");
      vi.mocked(validateDataSchema).mockImplementationOnce(() => {
        throw new SchemaValidationError("Invalid schema", []);
      });

      await expect(
        controller.create({
          name: "Test Schema",
          type: "personal",
          definition: {},
        }),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should handle storage upload errors", async () => {
      vi.mocked(mockStorageManager.upload!).mockRejectedValue(
        new Error("Upload failed"),
      );

      await expect(
        controller.create({
          name: "Test Schema",
          type: "personal",
          definition: { type: "object" },
        }),
      ).rejects.toThrow("Schema creation failed: Upload failed");
    });

    it("should handle missing storage manager", async () => {
      const contextWithoutStorage = {
        ...mockContext,
        storageManager: undefined,
      };
      const controllerWithoutStorage = new SchemaController(
        contextWithoutStorage,
      );

      await expect(
        controllerWithoutStorage.create({
          name: "Test Schema",
          type: "personal",
          definition: { type: "object" },
        }),
      ).rejects.toThrow(
        "Storage manager not configured. Please provide storage providers in VanaConfig.",
      );
    });

    it("should handle missing chain ID", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined,
        },
      };
      const controllerWithoutChain = new SchemaController(contextWithoutChain);

      await expect(
        controllerWithoutChain.create({
          name: "Test Schema",
          type: "personal",
          definition: { type: "object" },
        }),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should parse SchemaAdded event correctly", async () => {
      const { decodeEventLog } = await import("viem");

      // First call throws (simulating non-matching event)
      // Second call returns SchemaAdded event
      vi.mocked(decodeEventLog)
        .mockImplementationOnce(() => {
          throw new Error("Not a SchemaAdded event");
        })
        .mockReturnValueOnce({
          eventName: "SchemaAdded",
          args: { schemaId: BigInt(456) },
        } as any);

      // Mock receipt with multiple logs
      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValue({
        logs: [
          { data: "0x1", topics: ["0xOtherEvent"] },
          { data: "0x2", topics: ["0xSchemaAdded"] },
        ],
      } as any);

      const result = await controller.create({
        name: "Test Schema",
        type: "personal",
        definition: { type: "object" },
      });

      expect(result.schemaId).toBe(456);
      expect(decodeEventLog).toHaveBeenCalledTimes(2);
    });

    it("should handle missing SchemaAdded event", async () => {
      const { decodeEventLog } = await import("viem");
      vi.mocked(decodeEventLog).mockImplementation(() => {
        throw new Error("No matching event");
      });

      const result = await controller.create({
        name: "Test Schema",
        type: "personal",
        definition: { type: "object" },
      });

      expect(result.schemaId).toBe(0); // Default when no event found
    });

    it("should handle empty logs in receipt", async () => {
      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValue({
        logs: [],
      } as any);

      const result = await controller.create({
        name: "Test Schema",
        type: "personal",
        definition: { type: "object" },
      });

      expect(result.schemaId).toBe(0);
    });

    it("should handle transaction timeout", async () => {
      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockRejectedValue(new Error("Transaction timeout"));

      await expect(
        controller.create({
          name: "Test Schema",
          type: "personal",
          definition: { type: "object" },
        }),
      ).rejects.toThrow("Schema creation failed: Transaction timeout");
    });

    it("should sanitize schema name for filename", async () => {
      const { decodeEventLog } = await import("viem");
      vi.mocked(decodeEventLog).mockReturnValue({
        eventName: "SchemaAdded",
        args: { schemaId: BigInt(123) },
      } as any);

      await controller.create({
        name: "Test/Schema*With<>Special|Chars",
        type: "personal",
        definition: { type: "object" },
      });

      expect(mockStorageManager.upload).toHaveBeenCalledWith(
        expect.any(Blob),
        "Test_Schema_With__Special_Chars.json",
        "ipfs",
      );
    });
  });

  describe("addSchema() - legacy method", () => {
    it("should add schema with pre-uploaded URL", async () => {
      const result = await controller.addSchema({
        name: "Test Schema",
        type: "json",
        definitionUrl: "https://example.com/schema.json",
      });

      expect(result).toEqual({
        schemaId: 0, // TODO comment in code
        transactionHash: "0xTransactionHash",
      });

      expect(mockContext.walletClient.writeContract).toHaveBeenCalledWith({
        address: "0xRegistryAddress",
        abi: [],
        functionName: "addSchema",
        args: ["Test Schema", "json", "https://example.com/schema.json"],
        account: expect.any(Object),
        chain: expect.any(Object),
      });
    });

    it("should handle missing chain ID", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined,
        },
      };
      const controllerWithoutChain = new SchemaController(contextWithoutChain);

      await expect(
        controllerWithoutChain.addSchema({
          name: "Test Schema",
          type: "json",
          definitionUrl: "https://example.com/schema.json",
        }),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should handle transaction errors", async () => {
      vi.mocked(mockContext.walletClient.writeContract).mockRejectedValue(
        new Error("Transaction failed"),
      );

      await expect(
        controller.addSchema({
          name: "Test Schema",
          type: "json",
          definitionUrl: "https://example.com/schema.json",
        }),
      ).rejects.toThrow("Failed to add schema: Transaction failed");
    });
  });

  describe("getUserAddress", () => {
    it("should handle wallet without account", async () => {
      const contextWithoutAccount = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          account: undefined,
        },
      };
      const controllerWithoutAccount = new SchemaController(
        contextWithoutAccount,
      );

      await expect(
        controllerWithoutAccount.addSchema({
          name: "Test",
          type: "json",
          definitionUrl: "https://example.com",
        }),
      ).rejects.toThrow("No wallet account connected");
    });

    it("should handle account as string", async () => {
      const contextWithStringAccount = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          account: "0xStringAddress" as Address,
        },
      } as unknown as ControllerContext;
      const controllerWithStringAccount = new SchemaController(
        contextWithStringAccount,
      );

      await controllerWithStringAccount.addSchema({
        name: "Test",
        type: "json",
        definitionUrl: "https://example.com",
      });

      expect(mockContext.walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          account: "0xStringAddress",
        }),
      );
    });
  });
});
