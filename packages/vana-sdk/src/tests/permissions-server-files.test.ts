import { describe, it, expect, vi, beforeEach } from "vitest";
import { Address } from "viem";
import {
  PermissionsController,
  ControllerContext,
} from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import type { TransactionResult } from "../types/operations";

// Mock external dependencies
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
        userNonce: vi.fn(),
      },
    })),
    http: vi.fn(),
    createWalletClient: vi.fn(),
  };
});

vi.mock("../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

// Mock the blockchain registry for schema fetching
vi.mock("../utils/blockchain/registry", () => ({
  fetchSchemaFromChain: vi.fn().mockResolvedValue({
    id: 123,
    name: "TestSchema",
    dialect: "json",
    definitionUrl: "https://ipfs.io/ipfs/schema123",
  }),
}));

// Mock the schema validation utility to avoid actual validation
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

// Mock fetch globally to handle schema and file data requests
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
} as Response);

describe("Permissions Server Files and Permissions", () => {
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
      writeContract: vi.fn().mockResolvedValue("0xmocktxhash"),
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
      account: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
      chain: { id: 14800 },
      getChainId: vi.fn().mockResolvedValue(14800),
      getAddresses: vi
        .fn()
        .mockResolvedValue(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]),
    };

    mockPublicClient = {
      readContract: vi.fn().mockResolvedValue(0n), // Default nonce
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
      name: "VanaDataPortabilityPermissions",
      version: "1",
      chainId: 14800,
      verifyingContract: "0x1234567890123456789012345678901234567890",
    });
  });

  describe("submitAddServerFilesAndPermissions", () => {
    const baseParams = {
      granteeId: BigInt(1),
      grant: "ipfs://QmTestGrant123",
      fileUrls: ["https://storage.example.com/file1.json"],
      schemaIds: [0],
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

    it("should include schemaIds in the typed data message", async () => {
      let capturedTypedData: any;
      mockWalletClient.signTypedData.mockImplementation((data) => {
        capturedTypedData = data;
        return Promise.resolve("0xmocksignature");
      });

      await controller.submitAddServerFilesAndPermissions(baseParams);

      expect(capturedTypedData).toBeDefined();
      expect(capturedTypedData.message.schemaIds).toEqual([BigInt(0)]);
      expect(capturedTypedData.types.ServerFilesAndPermission).toContainEqual({
        name: "schemaIds",
        type: "uint256[]",
      });
    });

    it("should validate schemaIds array length matches fileUrls", async () => {
      const params = {
        ...baseParams,
        fileUrls: ["file1.json", "file2.json"],
        schemaIds: [0], // Only one schema ID for two files
      };

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).rejects.toThrow(
        "schemaIds array length (1) must match fileUrls array length (2)",
      );
    });

    it("should accept multiple files with different schema IDs", async () => {
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

      let capturedTypedData: any;
      mockWalletClient.signTypedData.mockImplementation((data) => {
        capturedTypedData = data;
        return Promise.resolve("0xmocksignature");
      });

      await controller.submitAddServerFilesAndPermissions(params);

      expect(capturedTypedData.message.schemaIds).toEqual([
        BigInt(123),
        BigInt(0),
        BigInt(456),
      ]);
    });

    it("should handle empty schemaIds array for empty fileUrls", async () => {
      const params = {
        ...baseParams,
        fileUrls: [],
        schemaIds: [],
        filePermissions: [],
      };

      let capturedTypedData: any;
      mockWalletClient.signTypedData.mockImplementation((data) => {
        capturedTypedData = data;
        return Promise.resolve("0xmocksignature");
      });

      await controller.submitAddServerFilesAndPermissions(params);

      expect(capturedTypedData.message.fileUrls).toEqual([]);
      expect(capturedTypedData.message.schemaIds).toEqual([]);
      expect(capturedTypedData.message.filePermissions).toEqual([]);
    });

    it("should convert number schemaIds to bigint in typed data", async () => {
      let capturedTypedData: any;
      mockWalletClient.signTypedData.mockImplementation((data) => {
        capturedTypedData = data;
        return Promise.resolve("0xmocksignature");
      });

      await controller.submitAddServerFilesAndPermissions(baseParams);

      // Verify the schemaIds are bigints in the message
      expect(capturedTypedData.message.schemaIds[0]).toBeTypeOf("bigint");
      expect(capturedTypedData.message.schemaIds[0]).toBe(BigInt(0));
    });

    it("should include schemaIds in direct transaction path", async () => {
      // No relayer callbacks - will use direct transaction
      let capturedArgs: any;
      mockWalletClient.writeContract.mockImplementation((args) => {
        capturedArgs = args;
        return Promise.resolve("0xmocktxhash");
      });

      const result =
        await controller.submitAddServerFilesAndPermissions(baseParams);

      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('from');
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.functionName).toBe("addServerFilesAndPermissions");

      // The first argument should be the serverFilesAndPermissionInput struct
      const inputStruct = capturedArgs.args[0];
      expect(inputStruct.schemaIds).toBeDefined();
      expect(inputStruct.schemaIds).toEqual([BigInt(0)]);
    });

    it("should use relayer callback when available", async () => {
      const mockRelayerCallback = vi.fn().mockResolvedValue("0xrelaytxhash");
      const contextWithRelayer = {
        ...mockContext,
        relayerCallbacks: {
          submitAddServerFilesAndPermissions: mockRelayerCallback,
        },
      };

      const controllerWithRelayer = new PermissionsController(
        contextWithRelayer as unknown as ControllerContext,
      );

      // Mock getPermissionDomain for this controller too
      vi.spyOn(
        controllerWithRelayer as unknown as {
          getPermissionDomain: () => Promise<unknown>;
        },
        "getPermissionDomain",
      ).mockResolvedValue({
        name: "VanaDataPortabilityPermissions",
        version: "1",
        chainId: 14800,
        verifyingContract: "0x1234567890123456789012345678901234567890",
      });

      const result =
        await controllerWithRelayer.submitAddServerFilesAndPermissions(
          baseParams,
        );

      expect(mockRelayerCallback).toHaveBeenCalled();
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('from');

      // Verify the typed data passed to relayer has schemaIds
      const [typedData] = mockRelayerCallback.mock.calls[0];
      expect(typedData.message.schemaIds).toEqual([BigInt(0)]);
    });

    it("should handle large schema IDs correctly", async () => {
      const params = {
        ...baseParams,
        schemaIds: [999999999], // Large number
      };

      let capturedTypedData: any;
      mockWalletClient.signTypedData.mockImplementation((data) => {
        capturedTypedData = data;
        return Promise.resolve("0xmocksignature");
      });

      await controller.submitAddServerFilesAndPermissions(params);

      expect(capturedTypedData.message.schemaIds[0]).toBe(BigInt(999999999));
    });

    it("should maintain order of schemaIds array", async () => {
      const params = {
        ...baseParams,
        fileUrls: ["file1", "file2", "file3", "file4"],
        schemaIds: [100, 0, 200, 150],
        filePermissions: [
          [{ account: baseParams.serverAddress, key: "key1" }],
          [{ account: baseParams.serverAddress, key: "key2" }],
          [{ account: baseParams.serverAddress, key: "key3" }],
          [{ account: baseParams.serverAddress, key: "key4" }],
        ],
      };

      let capturedTypedData: any;
      mockWalletClient.signTypedData.mockImplementation((data) => {
        capturedTypedData = data;
        return Promise.resolve("0xmocksignature");
      });

      await controller.submitAddServerFilesAndPermissions(params);

      expect(capturedTypedData.message.schemaIds).toEqual([
        BigInt(100),
        BigInt(0),
        BigInt(200),
        BigInt(150),
      ]);
    });
  });
});
