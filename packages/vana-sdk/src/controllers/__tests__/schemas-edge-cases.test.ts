import { describe, it, expect, vi, beforeEach } from "vitest";
import { SchemaController } from "../schemas";
import type { ControllerContext } from "../../types/controller-context";
import type { StorageManager } from "../../storage/manager";
import { createMockControllerContext } from "../../tests/factories/mockFactory";

// Mock dependencies
vi.mock("../../utils/blockchain/registry", () => ({
  fetchSchemaFromChain: vi.fn(),
  fetchSchemaCountFromChain: vi.fn(),
}));

vi.mock("../../utils/urlResolver", () => ({
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

vi.mock("../../utils/schemaValidation", () => ({
  validateDataSchemaAgainstMetaSchema: vi.fn(),
  SchemaValidationError: class SchemaValidationError extends Error {
    constructor(
      message: string,
      public errors: unknown[] = [],
    ) {
      super(message);
      this.name = "SchemaValidationError";
    }
  },
}));

vi.mock("../../generated/addresses", () => ({
  getContractAddress: vi.fn().mockReturnValue("0xRegistryAddress"),
  getUtilityAddress: vi
    .fn()
    .mockReturnValue("0xcA11bde05977b3631167028862bE2a173976CA11"),
}));

vi.mock("../../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

describe("SchemaController - Edge Cases", () => {
  let controller: SchemaController;
  let mockContext: ControllerContext;
  let mockStorageManager: Partial<StorageManager>;

  beforeEach(async () => {
    vi.clearAllMocks();

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
    mockContext = createMockControllerContext({
      storageManager: mockStorageManager as StorageManager,
      waitForTransactionEvents: vi.fn().mockResolvedValue({
        hash: "0xTransactionHash",
        from: "0xTestAddress",
        contract: "DataRefinerRegistry",
        fn: "addSchema",
        expectedEvents: {
          SchemaAdded: {
            schemaId: 1n,
            name: "Test Schema",
            dialect: "jsonschema",
            definitionUrl: "https://gateway.pinata.cloud/ipfs/QmTestHash",
          },
        },
        allEvents: [],
        hasExpectedEvents: true,
      }),
      validateStorageRequired: vi.fn(() => {
        throw new Error(
          "Storage manager not configured. Please provide storage providers in VanaConfig.",
        );
      }),
    });

    controller = new SchemaController(mockContext);
  });

  describe("create() edge cases", () => {
    it("should handle storage manager validation with validateStorageRequired", async () => {
      // Remove storage manager to trigger validation
      const contextWithoutStorage = {
        ...mockContext,
        storageManager: undefined,
        validateStorageRequired: vi.fn(() => {
          throw new Error("Storage validation failed: No providers configured");
        }),
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
      ).rejects.toThrow("Storage validation failed: No providers configured");

      expect(contextWithoutStorage.validateStorageRequired).toHaveBeenCalled();
    });

    it("should handle missing wallet account", async () => {
      const contextWithoutAccount = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          account: undefined,
          cacheTime: 0, // Add explicit cacheTime to match WalletClient type
          getAddresses: vi.fn().mockResolvedValue(["0xAddress1", "0xAddress2"]),
        },
      } as ControllerContext;
      const controllerWithoutAccount = new SchemaController(
        contextWithoutAccount,
      );

      await expect(
        controllerWithoutAccount.create({
          name: "Test Schema",
          dialect: "json",
          schema: { type: "object" },
        }),
      ).rejects.toThrow("No wallet account connected");
    });

    it("should handle non-Error exceptions in create", async () => {
      const { validateDataSchemaAgainstMetaSchema } = await import(
        "../../utils/schemaValidation"
      );
      vi.mocked(validateDataSchemaAgainstMetaSchema).mockImplementationOnce(
        () => {
          throw "string error"; // Non-Error thrown
        },
      );

      await expect(
        controller.create({
          name: "Test Schema",
          dialect: "json",
          schema: { type: "object" },
        }),
      ).rejects.toThrow("Schema creation failed: Unknown error");
    });
  });

  describe("create() additional edge cases", () => {
    it("should handle non-Error exceptions in create", async () => {
      if (!mockContext.walletClient) {
        throw new Error("WalletClient is required for this test");
      }
      vi.mocked(mockContext.walletClient.writeContract).mockRejectedValueOnce(
        "string error",
      );

      await expect(
        controller.create({
          name: "Test Schema",
          dialect: "json",
          schema: { type: "object", properties: {} },
        }),
      ).rejects.toThrow("Schema creation failed: Unknown error");
    });
  });

  describe("get() edge cases", () => {
    it("should handle subgraph fallback to RPC on error", async () => {
      const { fetchSchemaFromChain } = await import(
        "../../utils/blockchain/registry"
      );
      const { fetchFromUrl } = await import("../../utils/urlResolver");

      vi.mocked(fetchSchemaFromChain).mockResolvedValue({
        id: 1,
        name: "Fallback Schema",
        dialect: "json" as const,
        definitionUrl: "https://example.com/schema.json",
      });

      vi.mocked(fetchFromUrl).mockResolvedValue({
        name: "Fallback Schema",
        version: "1.0.0",
        dialect: "json" as const,
        schema: { type: "object" },
      });

      const contextWithSubgraph = {
        ...mockContext,
        subgraphUrl: "https://failing-subgraph.com/graphql",
      };
      const controllerWithSubgraph = new SchemaController(contextWithSubgraph);

      // Mock fetch to simulate subgraph failure
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValueOnce(new Error("Network error")),
      );

      const result = await controllerWithSubgraph.get(1);

      expect(result.name).toBe("Fallback Schema");
      expect(fetchSchemaFromChain).toHaveBeenCalledWith(contextWithSubgraph, 1);
    });

    it("should handle non-Error exceptions in get", async () => {
      const { fetchSchemaFromChain } = await import(
        "../../utils/blockchain/registry"
      );
      vi.mocked(fetchSchemaFromChain).mockRejectedValueOnce("string error");

      await expect(controller.get(1)).rejects.toThrow(
        "Failed to get schema: Unknown error",
      );
    });
  });

  describe("count() edge cases", () => {
    it("should handle non-Error exceptions in count", async () => {
      const { fetchSchemaCountFromChain } = await import(
        "../../utils/blockchain/registry"
      );
      vi.mocked(fetchSchemaCountFromChain).mockRejectedValueOnce(
        "string error",
      );

      await expect(controller.count()).rejects.toThrow(
        "Failed to get schemas count: Unknown error",
      );
    });
  });

  describe("list() edge cases", () => {
    it("should handle non-Error exceptions in list", async () => {
      vi.spyOn(controller, "count").mockRejectedValueOnce("string error");

      await expect(controller.list()).rejects.toThrow(
        "Failed to list schemas: Unknown error",
      );
    });
  });
});
