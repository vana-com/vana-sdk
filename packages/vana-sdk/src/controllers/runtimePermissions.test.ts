import { describe, it, expect, vi, beforeEach } from "vitest";
import { RuntimePermissionsController } from "./runtimePermissions";
import type { ControllerContext } from "./permissions";
import type { RuntimePermissionParams } from "../types/runtimePermissions";
import { NetworkError, BlockchainError } from "../errors";
import { mockPlatformAdapter } from "../tests/mocks/platformAdapter";

// Mock viem
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    getContract: vi.fn(() => ({
      read: {
        getPermission: vi.fn(),
        datasetPermissionsLength: vi.fn(),
        datasetPermissionsAt: vi.fn(),
      },
    })),
    parseEventLogs: vi.fn(() => []),
  };
});

// Mock generated modules
vi.mock("../generated/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([
    {
      name: "createPermission",
      type: "function",
      inputs: [
        { name: "datasetId", type: "uint256" },
        { name: "granteeAddress", type: "address" },
        { name: "grant", type: "string" },
        { name: "startBlock", type: "uint256" },
        { name: "endBlock", type: "uint256" },
      ],
      outputs: [],
    },
  ]),
}));

// Mock runtime grant files utility
vi.mock("../utils/runtimeGrantFiles", () => ({
  createRuntimeGrantFile: vi.fn((params) => ({
    grantee: params.grantee,
    task: params.task,
    operation: params.operation,
    pricing: params.pricing,
    parameters: params.parameters ?? {},
  })),
}));

describe("RuntimePermissionsController", () => {
  let controller: RuntimePermissionsController;
  let mockContext: ControllerContext;
  let mockContract: any;
  let mockRelayer: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { getContract, parseEventLogs } = await import("viem");
    mockContract = {
      read: {
        getPermission: vi.fn(),
        getDatasetPermissions: vi.fn(),
      },
    };
    vi.mocked(getContract).mockReturnValue(mockContract as any);
    vi.mocked(parseEventLogs).mockReturnValue([
      {
        eventName: "PermissionCreated",
        args: {
          id: 1024n, // Note: The contract event uses "id" not "permissionId"
          datasetId: 123n,
          granteeId: 456n,
          grant: "ipfs://QmTestHash",
        },
      },
    ] as any);

    mockRelayer = vi.fn().mockResolvedValue({
      type: "direct",
      result: {
        url: "ipfs://QmTestGrantFile",
      },
    });

    mockContext = {
      walletClient: {
        account: { address: "0xOwner" },
        chain: { id: 14800, name: "Moksha" },
        getChainId: vi.fn().mockResolvedValue(14800),
        writeContract: vi.fn().mockResolvedValue("0xTransactionHash"),
      } as any,
      publicClient: {
        getChainId: vi.fn().mockResolvedValue(14800),
        getBlockNumber: vi.fn().mockResolvedValue(1000n),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          transactionHash: "0xTransactionHash",
          status: "success",
          logs: [
            {
              address: "0x1234567890123456789012345678901234567890",
              topics: [],
              data: "0x",
            },
          ],
        }),
      } as any,
      userAddress: "0xOwner",
      relayer: mockRelayer,
      platform: mockPlatformAdapter,
      waitForTransactionEvents: vi.fn().mockResolvedValue({
        hash: "0xTransactionHash",
        expectedEvents: {
          PermissionCreated: {
            permissionId: 1024n,
            datasetId: 123n,
            granteeId: 456n,
            grant: "ipfs://QmTestHash",
          },
        },
      }),
    };

    controller = new RuntimePermissionsController(mockContext);
  });

  describe("createPermission", () => {
    const validParams: RuntimePermissionParams = {
      datasetId: 123n,
      grantee: "456" as `0x${string}`, // Using numeric string that can be converted to BigInt
      task: "thinker/task:v1",
      operation: "aggregate_keywords",
      pricing: {
        price_per_file_vana: 0.1,
        minimum_price_vana: 0.01,
        maximum_price_vana: 10,
      },
      parameters: {
        max_files: 100,
      },
    };

    it("should create permission with relayer for grant file upload", async () => {
      const result = await controller.createPermission(validParams);

      expect(result.permissionId).toBe(1024n);
      expect(result.hash).toBe("0xTransactionHash");
      expect(result.grantUrl).toBe("ipfs://QmTestGrantFile");

      // Verify relayer was called for grant file upload
      expect(mockRelayer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "direct",
          operation: "storeGrantFile",
          params: expect.objectContaining({
            grantee: "456",
            task: "thinker/task:v1",
            operation: "aggregate_keywords",
          }),
        }),
      );

      // Verify contract call
      expect(mockContext.walletClient!.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "createPermission",
          args: expect.arrayContaining([
            123n, // datasetId
            456n, // granteeId (converted from "456")
            "ipfs://QmTestGrantFile", // grant URL
          ]),
        }),
      );
    });

    it("should use provided grantUrl if specified", async () => {
      const paramsWithUrl = {
        ...validParams,
        grantUrl: "ipfs://QmProvidedHash",
      };

      const result = await controller.createPermission(paramsWithUrl);

      expect(result.grantUrl).toBe("ipfs://QmProvidedHash");
      expect(mockRelayer).not.toHaveBeenCalled();
    });

    it("should throw error if no relayer and no grantUrl", async () => {
      const contextWithoutRelayer = {
        ...mockContext,
        relayer: undefined,
      };
      const controllerWithoutRelayer = new RuntimePermissionsController(
        contextWithoutRelayer,
      );

      await expect(
        controllerWithoutRelayer.createPermission(validParams),
      ).rejects.toThrow("No relayer configured and no grantUrl provided");
    });

    it("should throw NetworkError when relayer upload fails", async () => {
      mockRelayer.mockResolvedValue({
        type: "error",
        error: "IPFS upload failed",
      });

      await expect(controller.createPermission(validParams)).rejects.toThrow(
        NetworkError,
      );

      await expect(controller.createPermission(validParams)).rejects.toThrow(
        "Failed to store grant file",
      );
    });

    it("should throw error when relayer response has no URL", async () => {
      mockRelayer.mockResolvedValue({
        type: "direct",
        result: { success: true }, // No URL field
      });

      await expect(controller.createPermission(validParams)).rejects.toThrow(
        "Upload succeeded but no URL was returned",
      );
    });

    it("should set default endBlock to max uint256 if not specified", async () => {
      await controller.createPermission(validParams);

      expect(mockContext.walletClient!.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining([
            expect.any(BigInt), // startBlock
            2n ** 256n - 1n, // endBlock = max uint256
          ]),
        }),
      );
    });

    it("should throw error when wallet is not configured", async () => {
      const contextWithoutWallet = {
        ...mockContext,
        walletClient: undefined,
      };
      const controllerWithoutWallet = new RuntimePermissionsController(
        contextWithoutWallet,
      );

      await expect(
        controllerWithoutWallet.createPermission({
          ...validParams,
          grantUrl: "ipfs://QmTest",
        }),
      ).rejects.toThrow("Operation 'createPermission' requires");
    });

    it("should throw BlockchainError on transaction failure", async () => {
      mockContext.walletClient!.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("Transaction reverted"));

      await expect(
        controller.createPermission({
          ...validParams,
          grantUrl: "ipfs://QmTest",
        }),
      ).rejects.toThrow(BlockchainError);
    });

    it("should throw error when no PermissionCreated event found", async () => {
      // Mock waitForTransactionEvents to return no PermissionCreated event
      const contextWithNoEvents = {
        ...mockContext,
        waitForTransactionEvents: vi.fn().mockResolvedValue({
          hash: "0xTransactionHash",
          expectedEvents: {}, // No PermissionCreated event
        }),
      };
      const controllerWithNoEvents = new RuntimePermissionsController(
        contextWithNoEvents,
      );

      await expect(
        controllerWithNoEvents.createPermission({
          ...validParams,
          grantUrl: "ipfs://QmTest",
        }),
      ).rejects.toThrow("No PermissionCreated event found in transaction");
    });
  });

  describe("getPermission", () => {
    it("should retrieve permission by ID successfully", async () => {
      const mockPermission = {
        id: 1024n,
        datasetId: 123n,
        granteeId: 456n,
        grant: "ipfs://QmTestHash",
        nonce: 1n,
        startBlock: 1000n,
        endBlock: 2n ** 256n - 1n,
      };

      mockContract.read.getPermission.mockResolvedValue(mockPermission);

      const result = await controller.getPermission(1024n);

      expect(result).toEqual(mockPermission);
      expect(mockContract.read.getPermission).toHaveBeenCalledWith([1024n]);
    });

    it("should throw error on contract read failure", async () => {
      mockContract.read.getPermission.mockRejectedValue(
        new Error("Contract error"),
      );

      await expect(controller.getPermission(1024n)).rejects.toThrow();
    });
  });

  describe("getDatasetPermissions", () => {
    it("should retrieve all permissions for a dataset", async () => {
      const mockPermissions = [
        {
          id: 100n,
          datasetId: 123n,
          granteeId: 1n,
          grant: "ipfs://Qm1",
          nonce: 1n,
          startBlock: 1000n,
          endBlock: 2000n,
        },
        {
          id: 101n,
          datasetId: 123n,
          granteeId: 2n,
          grant: "ipfs://Qm2",
          nonce: 1n,
          startBlock: 1000n,
          endBlock: 2n ** 256n - 1n,
        },
      ];

      mockContract.read.getDatasetPermissions.mockResolvedValue(
        mockPermissions,
      );

      const result = await controller.getDatasetPermissions(123n);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockPermissions[0]);
      expect(result[1]).toEqual(mockPermissions[1]);
    });

    it("should return empty array for dataset with no permissions", async () => {
      mockContract.read.getDatasetPermissions.mockResolvedValue([]);

      const result = await controller.getDatasetPermissions(123n);

      expect(result).toEqual([]);
    });

    it("should throw error on contract read failure", async () => {
      mockContract.read.getDatasetPermissions.mockRejectedValue(
        new Error("Contract error"),
      );

      await expect(controller.getDatasetPermissions(123n)).rejects.toThrow();
    });
  });

  describe("grant file creation", () => {
    beforeEach(() => {
      mockContext.publicClient.getBlockNumber = vi
        .fn()
        .mockResolvedValue(1000n);
    });

    it("should create grant file with all pricing parameters", async () => {
      const { createRuntimeGrantFile } = await import(
        "../utils/runtimeGrantFiles"
      );

      const params: RuntimePermissionParams = {
        datasetId: 123n,
        grantee: "456" as `0x${string}`,
        task: "task:v1",
        operation: "aggregate",
        pricing: {
          price_per_file_vana: 0.5,
          minimum_price_vana: 0.1,
          maximum_price_vana: 100,
        },
        parameters: { key: "value" },
      };

      await controller.createPermission(params);

      expect(createRuntimeGrantFile).toHaveBeenCalledWith(params);
    });

    it("should create grant file without optional pricing parameters", async () => {
      const { createRuntimeGrantFile } = await import(
        "../utils/runtimeGrantFiles"
      );

      const params: RuntimePermissionParams = {
        datasetId: 123n,
        grantee: "456" as `0x${string}`,
        task: "task:v1",
        operation: "query",
        pricing: {
          price_per_file_vana: 0.1,
        },
      };

      await controller.createPermission(params);

      expect(createRuntimeGrantFile).toHaveBeenCalledWith(
        expect.objectContaining({
          pricing: {
            price_per_file_vana: 0.1,
          },
        }),
      );
    });
  });
});
