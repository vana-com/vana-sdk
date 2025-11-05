import { describe, it, expect, vi, beforeEach } from "vitest";

import { PermissionsController } from "../controllers/permissions";
import type { ControllerContext } from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import type { Hash } from "viem";

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

vi.mock("../generated/addresses", () => ({
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
      signTypedData: vi
        .fn()
        .mockResolvedValue(`0x${"0".repeat(130)}` as `0x${string}`),
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
      userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
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
      verifyingContract:
        "0x1234567890123456789012345678901234567890" as `0x${string}`,
    });
  });

  describe("submitAddServerFilesAndPermissions", () => {
    const baseParams = {
      granteeId: BigInt(1),
      grant: "ipfs://QmTestGrant123",
      fileUrls: ["https://storage.example.com/file1.json"],
      schemaIds: [0],
      serverAddress:
        "0x1234567890123456789012345678901234567890" as `0x${string}`,
      serverUrl: "https://server.example.com",
      serverPublicKey: "server-public-key",
      filePermissions: [
        [
          {
            account:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
            key: "encrypted-key",
          },
        ],
      ],
    };

    it("should include schemaIds in the typed data message", async () => {
      let capturedTypedData: any;
      mockWalletClient.signTypedData.mockImplementation((data) => {
        capturedTypedData = data;
        return Promise.resolve(`0x${"0".repeat(130)}` as `0x${string}`);
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
              account:
                "0x1234567890123456789012345678901234567890" as `0x${string}`,
              key: "key1",
            },
          ],
          [
            {
              account:
                "0x1234567890123456789012345678901234567890" as `0x${string}`,
              key: "key2",
            },
          ],
          [
            {
              account:
                "0x1234567890123456789012345678901234567890" as `0x${string}`,
              key: "key3",
            },
          ],
        ],
      };

      let capturedTypedData: any;
      mockWalletClient.signTypedData.mockImplementation((data) => {
        capturedTypedData = data;
        return Promise.resolve(`0x${"0".repeat(130)}` as `0x${string}`);
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
        return Promise.resolve(`0x${"0".repeat(130)}` as `0x${string}`);
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
        return Promise.resolve(`0x${"0".repeat(130)}` as `0x${string}`);
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

      expect(result).toHaveProperty("hash");
      expect(result).toHaveProperty("from");
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.functionName).toBe("addServerFilesAndPermissions");

      // The first argument should be the serverFilesAndPermissionInput struct
      const inputStruct = capturedArgs.args[0];
      expect(inputStruct.schemaIds).toBeDefined();
      expect(inputStruct.schemaIds).toEqual([BigInt(0)]);
    });

    it("should use relayer callback when available", async () => {
      const mockRelayerCallback = vi.fn().mockResolvedValue({
        type: "signed",
        hash: "0xrelaytxhash" as Hash,
      });
      const contextWithRelayer = {
        ...mockContext,
        relayer: mockRelayerCallback,
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
        verifyingContract:
          "0x1234567890123456789012345678901234567890" as `0x${string}`,
      });

      const result =
        await controllerWithRelayer.submitAddServerFilesAndPermissions(
          baseParams,
        );

      expect(mockRelayerCallback).toHaveBeenCalled();
      expect(result).toHaveProperty("hash");
      expect(result).toHaveProperty("from");

      // Verify the request passed to relayer has schemaIds
      const request = mockRelayerCallback.mock.calls[0][0];
      expect(request.type).toBe("signed");
      if (request.type === "signed") {
        expect(request.typedData.message.schemaIds).toEqual([BigInt(0)]);
      }
    });

    it("should handle large schema IDs correctly", async () => {
      const params = {
        ...baseParams,
        schemaIds: [999999999], // Large number
      };

      let capturedTypedData: any;
      mockWalletClient.signTypedData.mockImplementation((data) => {
        capturedTypedData = data;
        return Promise.resolve(`0x${"0".repeat(130)}` as `0x${string}`);
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
        return Promise.resolve(`0x${"0".repeat(130)}` as `0x${string}`);
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

  describe("TransactionOptions support", () => {
    const baseParams = {
      granteeId: BigInt(1),
      grant: "ipfs://QmTestGrant",
      fileUrls: ["https://example.com/file1.json"],
      schemaIds: [123],
      serverAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb" as const,
      serverUrl: "https://server.example.com",
      serverPublicKey: "0x123456789abcdef",
      filePermissions: [
        [
          {
            account:
              "0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb" as `0x${string}`,
            key: "key1",
          },
        ],
      ],
    };

    beforeEach(() => {
      // Reset mocks before each test
      vi.clearAllMocks();
      mockPublicClient.readContract.mockResolvedValue(1n); // nonce
    });

    it("should pass EIP-1559 gas parameters to writeContract", async () => {
      const options = {
        maxFeePerGas: 100n * 10n ** 9n, // 100 gwei
        maxPriorityFeePerGas: 2n * 10n ** 9n, // 2 gwei
        gas: 500000n,
      };

      await controller.submitAddServerFilesAndPermissions(baseParams, options);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "addServerFilesAndPermissions",
          gas: 500000n,
          maxFeePerGas: 100n * 10n ** 9n,
          maxPriorityFeePerGas: 2n * 10n ** 9n,
        }),
      );
    });

    it("should pass legacy gas parameters to writeContract", async () => {
      const options = {
        gasPrice: 50n * 10n ** 9n, // 50 gwei
        gas: 300000n,
        nonce: 42,
      };

      await controller.submitAddServerFilesAndPermissions(baseParams, options);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "addServerFilesAndPermissions",
          gas: 300000n,
          gasPrice: 50n * 10n ** 9n,
          nonce: 42,
        }),
      );
    });

    it("should prefer EIP-1559 over legacy gas when both are provided", async () => {
      const options = {
        gasPrice: 30n * 10n ** 9n, // Should be ignored
        maxFeePerGas: 100n * 10n ** 9n,
        maxPriorityFeePerGas: 2n * 10n ** 9n,
      };

      await controller.submitAddServerFilesAndPermissions(baseParams, options);

      const writeContractCall = mockWalletClient.writeContract.mock.calls[0][0];
      expect(writeContractCall).toHaveProperty(
        "maxFeePerGas",
        100n * 10n ** 9n,
      );
      expect(writeContractCall).toHaveProperty(
        "maxPriorityFeePerGas",
        2n * 10n ** 9n,
      );
      expect(writeContractCall).not.toHaveProperty("gasPrice");
    });

    it("should include gas parameter when provided", async () => {
      const options = {
        gas: 21000n,
      };

      await controller.submitAddServerFilesAndPermissions(baseParams, options);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          gas: 21000n,
        }),
      );
      // Note: addServerFilesAndPermissions is not a payable function, so value parameter is not supported
    });

    it("should work without any options (backward compatibility)", async () => {
      await controller.submitAddServerFilesAndPermissions(baseParams);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "addServerFilesAndPermissions",
        }),
      );

      const writeContractCall = mockWalletClient.writeContract.mock.calls[0][0];
      expect(writeContractCall).not.toHaveProperty("gas");
      expect(writeContractCall).not.toHaveProperty("gasPrice");
      expect(writeContractCall).not.toHaveProperty("maxFeePerGas");
    });

    it("should only include provided gas parameters", async () => {
      const options = {
        maxFeePerGas: 100n * 10n ** 9n,
        // maxPriorityFeePerGas intentionally omitted
      };

      await controller.submitAddServerFilesAndPermissions(baseParams, options);

      const writeContractCall = mockWalletClient.writeContract.mock.calls[0][0];
      expect(writeContractCall).toHaveProperty(
        "maxFeePerGas",
        100n * 10n ** 9n,
      );
      expect(writeContractCall).not.toHaveProperty("maxPriorityFeePerGas");
      expect(writeContractCall).not.toHaveProperty("gasPrice");
    });
  });
});
