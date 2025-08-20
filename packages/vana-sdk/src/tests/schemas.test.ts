import { describe, it, expect, vi, beforeEach } from "vitest";
import { SchemaController } from "../controllers/schemas";
import { ControllerContext } from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import type { StorageManager } from "../storage/manager";
import { SchemaValidationError } from "../utils/schemaValidation";
import { validateDataSchemaAgainstMetaSchema } from "../utils/schemaValidation";
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

vi.mock("../utils/urlResolver", () => ({
  fetchFromUrl: vi.fn(),
  UrlResolutionError: class UrlResolutionError extends Error {
    constructor(
      message: string,
      public url: string,
    ) {
      super(message);
      this.name = "UrlResolutionError";
    }
  },
}));

vi.mock("../utils/schemaValidation", () => ({
  validateDataSchemaAgainstMetaSchema: vi.fn(),
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

vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    getAddress: vi.fn((address) => address),
    decodeEventLog: vi.fn(),
    parseEventLogs: vi.fn().mockReturnValue([
      {
        eventName: "SchemaAdded",
        args: {
          schemaId: 1n,
          name: "Test Schema",
          dialect: "jsonschema",
          definitionUrl: "https://gateway.pinata.cloud/ipfs/QmTestHash",
        },
      },
    ]),
  };
});

vi.mock("../config/addresses", () => ({
  getContractAddress: vi.fn().mockReturnValue("0xRegistryAddress"),
  getUtilityAddress: vi
    .fn()
    .mockReturnValue("0xcA11bde05977b3631167028862bE2a173976CA11"),
}));

vi.mock("../utils/multicall", () => ({
  gasAwareMulticall: vi.fn().mockImplementation(async (client, params) => {
    // Return array of results based on the contracts passed
    return params.contracts.map((_: any, i: number) => BigInt(i + 1));
  }),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

describe("SchemaController", () => {
  let controller: SchemaController;
  let mockContext: ControllerContext;
  let mockStorageManager: Partial<StorageManager>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset validateDataSchemaAgainstMetaSchema to not throw by default
    vi.mocked(validateDataSchemaAgainstMetaSchema).mockImplementation(
      (schema) => schema as any,
    );

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
        getChainId: vi.fn().mockResolvedValue(14800),
        multicall: vi.fn().mockResolvedValue([]),
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
        dialect: "json" as const,
        definitionUrl: "https://example.com/schema.json",
      };

      const mockDataSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json" as const,
        schema: { type: "object" },
      };

      vi.mocked(fetchSchemaFromChain).mockResolvedValue(mockSchema);

      const { fetchFromUrl } = await import("../utils/urlResolver");
      vi.mocked(fetchFromUrl).mockResolvedValue(mockDataSchema);

      const result = await controller.get(1);

      expect(result.id).toEqual(mockSchema.id);
      expect(result.name).toEqual(mockSchema.name);
      expect(result.dialect).toEqual(mockSchema.dialect);
      expect(result.definitionUrl).toEqual(mockSchema.definitionUrl);
      expect(result.schema).toEqual(mockDataSchema.schema);
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
          dialect: "json",
          definitionUrl: "https://example.com/1.json",
        },
        {
          id: 2,
          name: "Schema 2",
          dialect: "json",
          definitionUrl: "https://example.com/2.json",
        },
      ];

      // Mock count to return 2
      vi.spyOn(controller, "count").mockResolvedValue(2);

      // Mock gasAwareMulticall to return schema data
      const { gasAwareMulticall } = await import("../utils/multicall");
      vi.mocked(gasAwareMulticall).mockResolvedValueOnce([
        {
          status: "success",
          result: {
            name: "Schema 1",
            dialect: "json",
            definitionUrl: "https://example.com/1.json",
          },
        },
        {
          status: "success",
          result: {
            name: "Schema 2",
            dialect: "json",
            definitionUrl: "https://example.com/2.json",
          },
        },
      ]);

      const result = await controller.list({ limit: 10, offset: 0 });

      expect(result).toEqual(mockSchemas);
      expect(controller.count).toHaveBeenCalled();
    });

    it("should skip schemas that fail to retrieve", async () => {
      const mockSchema = {
        id: 2,
        name: "Schema 2",
        dialect: "json",
        definitionUrl: "https://example.com/2.json",
      };

      vi.spyOn(controller, "count").mockResolvedValue(3);

      // Mock gasAwareMulticall to return mixed success/failure results
      const { gasAwareMulticall } = await import("../utils/multicall");
      vi.mocked(gasAwareMulticall).mockResolvedValueOnce([
        {
          status: "failure",
          error: new Error("Schema 1 not found"),
        },
        {
          status: "success",
          result: {
            name: "Schema 2",
            dialect: "json",
            definitionUrl: "https://example.com/2.json",
          },
        },
        {
          status: "failure",
          error: new Error("Schema 3 not found"),
        },
      ]);

      const result = await controller.list({ limit: 10, offset: 0 });

      expect(result).toEqual([mockSchema]);
    });

    it("should handle pagination correctly", async () => {
      vi.spyOn(controller, "count").mockResolvedValue(10);

      // Mock gasAwareMulticall to return paginated results
      const { gasAwareMulticall } = await import("../utils/multicall");
      vi.mocked(gasAwareMulticall).mockResolvedValueOnce([
        {
          status: "success",
          result: {
            name: "Schema 5",
            dialect: "json",
            definitionUrl: "https://example.com/5.json",
          },
        },
        {
          status: "success",
          result: {
            name: "Schema 6",
            dialect: "json",
            definitionUrl: "https://example.com/6.json",
          },
        },
      ]);

      const result = await controller.list({ limit: 2, offset: 4 });

      // Should return schemas 5 and 6 (offset 4, limit 2)
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(5);
      expect(result[1].id).toBe(6);
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
      const { validateDataSchemaAgainstMetaSchema } = await import(
        "../utils/schemaValidation"
      );
      const { parseEventLogs } = await import("viem");

      vi.mocked(parseEventLogs).mockReturnValueOnce([
        {
          eventName: "SchemaAdded",
          args: {
            schemaId: BigInt(123),
            name: "Test Schema",
            dialect: "jsonschema",
            definitionUrl: "https://ipfs.io/ipfs/QmTestHash",
          },
        },
      ] as any);

      const schemaDefinition = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };

      const result = await controller.create({
        name: "Test Schema",
        dialect: "json",
        schema: schemaDefinition,
      });

      expect(result).toEqual({
        schemaId: 123,
        definitionUrl: "https://ipfs.io/ipfs/QmTestHash",
        transactionHash: "0xTransactionHash",
      });

      expect(validateDataSchemaAgainstMetaSchema).toHaveBeenCalledWith({
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
        args: ["Test Schema", "json", "https://ipfs.io/ipfs/QmTestHash"],
        account: expect.any(Object),
        chain: expect.any(Object),
      });
    });

    it("should handle JSON string definition", async () => {
      const { validateDataSchemaAgainstMetaSchema } = await import(
        "../utils/schemaValidation"
      );
      const { parseEventLogs } = await import("viem");

      vi.mocked(parseEventLogs).mockReturnValueOnce([
        {
          eventName: "SchemaAdded",
          args: {
            schemaId: BigInt(123),
            name: "Test Schema",
            dialect: "jsonschema",
            definitionUrl: "https://ipfs.io/ipfs/QmTestHash",
          },
        },
      ] as any);

      const schemaDefinition = JSON.stringify({
        type: "object",
        properties: { name: { type: "string" } },
      });

      const result = await controller.create({
        name: "Test Schema",
        dialect: "json",
        schema: schemaDefinition,
      });

      expect(result.schemaId).toBe(123);
      expect(validateDataSchemaAgainstMetaSchema).toHaveBeenCalled();
    });

    it("should handle invalid JSON string", async () => {
      await expect(
        controller.create({
          name: "Test Schema",
          dialect: "json",
          schema: "{ invalid json",
        }),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should handle validation errors", async () => {
      const { validateDataSchemaAgainstMetaSchema } = await import(
        "../utils/schemaValidation"
      );
      vi.mocked(validateDataSchemaAgainstMetaSchema).mockImplementationOnce(
        () => {
          throw new SchemaValidationError("Invalid schema", []);
        },
      );

      await expect(
        controller.create({
          name: "Test Schema",
          dialect: "json",
          schema: {},
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
          dialect: "json",
          schema: { type: "object" },
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
          dialect: "json",
          schema: { type: "object" },
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
          dialect: "json",
          schema: { type: "object" },
        }),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should parse SchemaAdded event correctly", async () => {
      const { parseEventLogs } = await import("viem");

      // Mock parseEventLogs to return SchemaAdded event
      vi.mocked(parseEventLogs).mockReturnValueOnce([
        {
          eventName: "SchemaAdded",
          args: {
            schemaId: BigInt(456),
            name: "Test Schema",
            dialect: "jsonschema",
            definitionUrl: "https://ipfs.io/ipfs/QmTestHash",
          },
        },
      ] as any);

      const result = await controller.create({
        name: "Test Schema",
        dialect: "json",
        schema: { type: "object" },
      });

      expect(result.schemaId).toBe(456);
      expect(parseEventLogs).toHaveBeenCalled();
    });

    it("should handle missing SchemaAdded event", async () => {
      const { parseEventLogs } = await import("viem");
      vi.mocked(parseEventLogs).mockReturnValueOnce([]);

      await expect(
        controller.create({
          name: "Test Schema",
          dialect: "json",
          schema: { type: "object" },
        }),
      ).rejects.toThrow("No SchemaAdded event found");
    });

    it("should handle empty logs in receipt", async () => {
      const { parseEventLogs } = await import("viem");
      vi.mocked(parseEventLogs).mockReturnValueOnce([]);

      await expect(
        controller.create({
          name: "Test Schema",
          dialect: "json",
          schema: { type: "object" },
        }),
      ).rejects.toThrow("No SchemaAdded event found");
    });

    it("should handle transaction timeout", async () => {
      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockRejectedValue(new Error("Transaction timeout"));

      await expect(
        controller.create({
          name: "Test Schema",
          dialect: "json",
          schema: { type: "object" },
        }),
      ).rejects.toThrow(
        "Schema creation failed: Transaction 0xTransactionHash confirmation timeout after 30 seconds. The transaction may still be pending.",
      );
    });

    it("should sanitize schema name for filename", async () => {
      const { parseEventLogs } = await import("viem");
      vi.mocked(parseEventLogs).mockReturnValueOnce([
        {
          eventName: "SchemaAdded",
          args: {
            schemaId: BigInt(123),
            name: "Test/Schema:With<>Special|Characters",
            dialect: "jsonschema",
            definitionUrl: "https://ipfs.io/ipfs/QmTestHash",
          },
        },
      ] as any);

      await controller.create({
        name: "Test/Schema*With<>Special|Chars",
        dialect: "json",
        schema: { type: "object" },
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
        dialect: "json",
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
          dialect: "json",
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
          dialect: "json",
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
          dialect: "json",
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
        dialect: "json",
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
