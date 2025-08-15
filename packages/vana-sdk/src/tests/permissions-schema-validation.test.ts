import { describe, it, expect, vi, beforeEach } from "vitest";
import { Address } from "viem";
import {
  PermissionsController,
  ControllerContext,
} from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import { SchemaValidationError } from "../utils/schemaValidation";

// Mock ALL external dependencies to ensure pure unit tests
vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
  })),
  getContract: vi.fn(() => ({
    read: {
      userPermissionIdsLength: vi.fn(),
      userPermissionIdsAt: vi.fn(),
      permissions: vi.fn(),
    },
  })),
  http: vi.fn(),
  createWalletClient: vi.fn(),
}));

vi.mock("../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

// Mock the blockchain registry utility
vi.mock("../utils/blockchain/registry", () => ({
  fetchSchemaFromChain: vi.fn(),
}));

// Mock the schema validation utility
vi.mock("../utils/schemaValidation", () => ({
  validateDataAgainstSchema: vi.fn(),
  SchemaValidationError: class extends Error {
    constructor(
      message: string,
      public errors: unknown[],
    ) {
      super(message);
      this.name = "SchemaValidationError";
    }
  },
}));

// Mock fetch globally
global.fetch = vi.fn();

describe("Permissions Schema Validation", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockWalletClient: {
    writeContract: ReturnType<typeof vi.fn>;
    signTypedData: ReturnType<typeof vi.fn>;
    account: { address: string };
    chain: { id: number };
    getChainId: ReturnType<typeof vi.fn>;
    getAddresses: ReturnType<typeof vi.fn>;
  };
  let mockPublicClient: {
    readContract: ReturnType<typeof vi.fn>;
    getChainId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockWalletClient = {
      writeContract: vi.fn(),
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
      account: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
      chain: { id: 14800 },
      getChainId: vi.fn().mockResolvedValue(14800),
      getAddresses: vi
        .fn()
        .mockResolvedValue(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]),
    };

    mockPublicClient = {
      readContract: vi.fn().mockResolvedValue(123n), // Default nonce
      getChainId: vi.fn().mockResolvedValue(14800),
    };

    mockContext = {
      walletClient:
        mockWalletClient as unknown as ControllerContext["walletClient"],
      publicClient:
        mockPublicClient as unknown as ControllerContext["publicClient"],
      platform: mockPlatformAdapter,
    };

    controller = new PermissionsController(mockContext);

    // Mock getPermissionDomain
    vi.spyOn(
      controller as unknown as {
        getPermissionDomain: () => Promise<unknown>;
      },
      "getPermissionDomain",
    ).mockResolvedValue({
      name: "DataPermissions",
      version: "1",
      chainId: 14800,
      verifyingContract: "0x1234567890123456789012345678901234567890",
    });
  });

  describe("submitAddServerFilesAndPermissions with schemas", () => {
    const baseParams = {
      granteeId: BigInt(1),
      grant: "ipfs://grant123",
      fileUrls: ["https://storage.example.com/file1.json"],
      schemaIds: [0], // Default to no schema
      serverAddress: "0x1234567890123456789012345678901234567890" as Address,
      serverUrl: "https://server.example.com",
      serverPublicKey: "server-public-key",
      filePermissions: [
        [
          {
            account: "0x1234567890123456789012345678901234567890" as Address,
            key: "encrypted-key",
          },
        ],
      ],
    };

    it("should accept files without schemas (schemaId = 0)", async () => {
      const params = { ...baseParams };

      // Mock the relayer callback
      (mockContext as any).submitAddServerFilesAndPermissions = vi
        .fn()
        .mockResolvedValue("0xtxhash");

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).resolves.toBeDefined();

      // Should not fetch any schemas or validate
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should validate files with schemas before submission", async () => {
      const params = {
        ...baseParams,
        schemaIds: [123], // Valid schema ID
      };

      // Mock schema fetch from chain
      const { fetchSchemaFromChain } = await import(
        "../utils/blockchain/registry"
      );
      vi.mocked(fetchSchemaFromChain).mockResolvedValue({
        id: 123,
        name: "TestSchema",
        dialect: "json",
        definitionUrl: "https://ipfs.io/ipfs/schema123",
      });

      // Mock schema definition fetch
      const schemaDefinition = {
        name: "TestSchema",
        version: "1.0.0",
        dialect: "json",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      };

      // Mock file data fetch
      const fileData = {
        name: "Test User",
      };

      vi.mocked(global.fetch).mockImplementation((url) => {
        if (url === "https://ipfs.io/ipfs/schema123") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(schemaDefinition),
          } as Response);
        }
        if (url === "https://storage.example.com/file1.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(fileData),
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      // Mock validation to pass
      const { validateDataAgainstSchema } = await import(
        "../utils/schemaValidation"
      );
      vi.mocked(validateDataAgainstSchema).mockReturnValue(undefined);

      // Mock the relayer callback
      (mockContext as any).submitAddServerFilesAndPermissions = vi
        .fn()
        .mockResolvedValue("0xtxhash");

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).resolves.toBeDefined();

      // Verify schema was fetched
      expect(fetchSchemaFromChain).toHaveBeenCalledWith(mockContext, 123);

      // Verify validation was called
      expect(validateDataAgainstSchema).toHaveBeenCalledWith(
        fileData,
        schemaDefinition,
      );
    });

    it("should throw error if schemaIds array length doesn't match fileUrls", async () => {
      const params = {
        ...baseParams,
        fileUrls: ["file1.json", "file2.json"],
        schemaIds: [123], // Only one schema ID for two files
      };

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).rejects.toThrow(
        "schemaIds array length (1) must match fileUrls array length (2)",
      );
    });

    it("should throw error if schema validation fails", async () => {
      const params = {
        ...baseParams,
        schemaIds: [123],
      };

      // Mock schema fetch
      const { fetchSchemaFromChain } = await import(
        "../utils/blockchain/registry"
      );
      vi.mocked(fetchSchemaFromChain).mockResolvedValue({
        id: 123,
        name: "TestSchema",
        dialect: "json",
        definitionUrl: "https://ipfs.io/ipfs/schema123",
      });

      // Mock successful fetches
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      // Mock validation to fail
      const { validateDataAgainstSchema } = await import(
        "../utils/schemaValidation"
      );
      vi.mocked(validateDataAgainstSchema).mockImplementation(() => {
        throw new SchemaValidationError("Validation failed", [
          {
            instancePath: "/name",
            schemaPath: "#/properties/name/type",
            keyword: "type",
            params: { type: "string" },
            message: "must be string",
          },
        ]);
      });

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).rejects.toThrow(
        /Schema validation failed for file 0.*against schema 123/,
      );
    });

    it("should validate multiple files with different schemas", async () => {
      const params = {
        ...baseParams,
        fileUrls: [
          "https://storage.example.com/file1.json",
          "https://storage.example.com/file2.json",
          "https://storage.example.com/file3.json",
        ],
        schemaIds: [123, 0, 456], // Mixed: schema, no schema, different schema
        filePermissions: [
          [
            {
              account: "0x1234567890123456789012345678901234567890" as Address,
              key: "key1",
            },
          ],
          [
            {
              account: "0x1234567890123456789012345678901234567890" as Address,
              key: "key2",
            },
          ],
          [
            {
              account: "0x1234567890123456789012345678901234567890" as Address,
              key: "key3",
            },
          ],
        ],
      };

      // Mock schema fetches
      const { fetchSchemaFromChain } = await import(
        "../utils/blockchain/registry"
      );
      vi.mocked(fetchSchemaFromChain)
        .mockResolvedValueOnce({
          id: 123,
          name: "Schema1",
          dialect: "json",
          definitionUrl: "https://ipfs.io/ipfs/schema123",
        })
        .mockResolvedValueOnce({
          id: 456,
          name: "Schema2",
          dialect: "json",
          definitionUrl: "https://ipfs.io/ipfs/schema456",
        });

      // Mock all fetches to succeed
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      // Mock validation to pass
      const { validateDataAgainstSchema } = await import(
        "../utils/schemaValidation"
      );
      vi.mocked(validateDataAgainstSchema).mockReturnValue(undefined);

      // Mock the relayer callback
      (mockContext as any).submitAddServerFilesAndPermissions = vi
        .fn()
        .mockResolvedValue("0xtxhash");

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).resolves.toBeDefined();

      // Verify correct number of validations (2 - schemas 123 and 456, not 0)
      expect(validateDataAgainstSchema).toHaveBeenCalledTimes(2);
      expect(fetchSchemaFromChain).toHaveBeenCalledTimes(2);
    });

    it("should handle schema fetch failures gracefully", async () => {
      const params = {
        ...baseParams,
        schemaIds: [123],
      };

      // Mock schema fetch to fail
      const { fetchSchemaFromChain } = await import(
        "../utils/blockchain/registry"
      );
      vi.mocked(fetchSchemaFromChain).mockRejectedValue(
        new Error("Schema not found on chain"),
      );

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).rejects.toThrow(/Schema validation failed.*Schema not found on chain/);
    });

    it("should handle schema definition fetch failures", async () => {
      const params = {
        ...baseParams,
        schemaIds: [123],
      };

      // Mock schema fetch succeeds
      const { fetchSchemaFromChain } = await import(
        "../utils/blockchain/registry"
      );
      vi.mocked(fetchSchemaFromChain).mockResolvedValue({
        id: 123,
        name: "TestSchema",
        dialect: "json",
        definitionUrl: "https://ipfs.io/ipfs/schema123",
      });

      // Mock schema definition fetch to fail
      vi.mocked(global.fetch).mockImplementation((url) => {
        if (url === "https://ipfs.io/ipfs/schema123") {
          return Promise.resolve({
            ok: false,
            status: 500,
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).rejects.toThrow(/Failed to fetch schema definition.*500/);
    });

    it("should handle file fetch failures gracefully", async () => {
      const params = {
        ...baseParams,
        schemaIds: [123],
      };

      // Mock schema fetch
      const { fetchSchemaFromChain } = await import(
        "../utils/blockchain/registry"
      );
      vi.mocked(fetchSchemaFromChain).mockResolvedValue({
        id: 123,
        name: "TestSchema",
        dialect: "json",
        definitionUrl: "https://ipfs.io/ipfs/schema123",
      });

      // Mock schema definition fetch to succeed, file fetch to fail
      vi.mocked(global.fetch).mockImplementation((url) => {
        if (url === "https://ipfs.io/ipfs/schema123") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }
        if (url === "https://storage.example.com/file1.json") {
          return Promise.resolve({
            ok: false,
            status: 404,
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).rejects.toThrow(/Failed to fetch file data.*404/);
    });
  });
});
