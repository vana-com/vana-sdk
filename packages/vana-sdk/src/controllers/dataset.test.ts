import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatasetController } from "./dataset";
import type { ControllerContext } from "./permissions";
import { BlockchainError, ReadOnlyError } from "../errors";
import { mockPlatformAdapter } from "../tests/mocks/platformAdapter";

// Mock viem
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    getContract: vi.fn(() => ({
      read: {
        getDataset: vi.fn(),
      },
    })),
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
      name: "createDataset",
      type: "function",
      inputs: [
        { name: "owner", type: "address" },
        { name: "schemaId", type: "uint256" },
      ],
      outputs: [],
    },
    {
      name: "acceptFile",
      type: "function",
      inputs: [
        { name: "datasetId", type: "uint256" },
        { name: "fileId", type: "uint256" },
      ],
      outputs: [],
    },
    {
      name: "rejectFile",
      type: "function",
      inputs: [
        { name: "datasetId", type: "uint256" },
        { name: "fileId", type: "uint256" },
      ],
      outputs: [],
    },
    {
      name: "getDataset",
      type: "function",
      inputs: [{ name: "datasetId", type: "uint256" }],
      outputs: [
        {
          components: [
            { name: "owner", type: "address" },
            { name: "pendingFileIds", type: "uint256[]" },
            { name: "fileIds", type: "uint256[]" },
            { name: "schemaId", type: "uint256" },
            { name: "createdAt", type: "uint256" },
          ],
          type: "tuple",
        },
      ],
    },
  ]),
}));

// Mock multicall utility
vi.mock("../utils/multicall", () => ({
  gasAwareMulticall: vi.fn(),
}));

describe("DatasetController", () => {
  let controller: DatasetController;
  let mockContext: ControllerContext;
  let mockContract: any;
  let mockWalletClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { getContract } = await import("viem");
    mockContract = {
      read: {
        getDataset: vi.fn(),
      },
    };
    vi.mocked(getContract).mockReturnValue(mockContract as any);

    mockWalletClient = {
      account: { address: "0xOwner" },
      chain: { id: 14800, name: "Moksha" },
      getChainId: vi.fn().mockResolvedValue(14800),
      writeContract: vi.fn().mockResolvedValue("0xTransactionHash"),
    };

    mockContext = {
      walletClient: mockWalletClient,
      publicClient: {
        getChainId: vi.fn().mockResolvedValue(14800),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          transactionHash: "0xTransactionHash",
          status: "success",
        }),
      } as any,
      userAddress: "0xOwner" as `0x${string}`,
      platform: mockPlatformAdapter,
    };

    controller = new DatasetController(mockContext);
  });

  describe("createDataset", () => {
    it("should create dataset successfully with schema ID", async () => {
      const schemaId = 42;

      const result = await controller.createDataset(schemaId);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x1234567890123456789012345678901234567890",
          functionName: "createDataset",
          args: ["0xOwner", BigInt(schemaId)],
        }),
      );

      expect(result).toMatchObject({
        hash: "0xTransactionHash",
        from: "0xOwner",
        contract: "DatasetRegistry",
        fn: "createDataset",
      });
    });

    it("should throw ReadOnlyError when no wallet is configured", async () => {
      const readOnlyContext = {
        ...mockContext,
        walletClient: undefined,
      };
      const readOnlyController = new DatasetController(readOnlyContext);

      await expect(readOnlyController.createDataset(42)).rejects.toThrow(
        ReadOnlyError,
      );
    });

    it("should handle blockchain errors with proper wrapping", async () => {
      mockWalletClient.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("Transaction failed"));

      await expect(controller.createDataset(42)).rejects.toThrow(
        BlockchainError,
      );
      await expect(controller.createDataset(42)).rejects.toThrow(
        /Failed to create dataset/,
      );
    });

    it("should convert schemaId number to BigInt for contract", async () => {
      await controller.createDataset(123);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ["0xOwner", BigInt(123)],
        }),
      );
    });

    it("should include transaction hash in return value", async () => {
      const result = await controller.createDataset(42);

      expect(result.hash).toBe("0xTransactionHash");
      expect(result.from).toBe("0xOwner");
      expect(result.contract).toBe("DatasetRegistry");
      expect(result.fn).toBe("createDataset");
    });

    it("should pass through transaction options", async () => {
      const options = {
        gas: BigInt(100000),
        gasPrice: BigInt(1000000000),
      };

      await controller.createDataset(42, options);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          gas: BigInt(100000),
          gasPrice: BigInt(1000000000),
        }),
      );
    });
  });

  describe("acceptFile", () => {
    it("should accept file successfully", async () => {
      const datasetId = 1;
      const fileId = 42;

      const result = await controller.acceptFile(datasetId, fileId);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x1234567890123456789012345678901234567890",
          functionName: "acceptFile",
          args: [BigInt(datasetId), BigInt(fileId)],
        }),
      );

      expect(result).toMatchObject({
        hash: "0xTransactionHash",
        from: "0xOwner",
        contract: "DatasetRegistry",
        fn: "acceptFile",
      });
    });

    it("should throw ReadOnlyError when no wallet is configured", async () => {
      const readOnlyContext = {
        ...mockContext,
        walletClient: undefined,
      };
      const readOnlyController = new DatasetController(readOnlyContext);

      await expect(readOnlyController.acceptFile(1, 42)).rejects.toThrow(
        ReadOnlyError,
      );
    });

    it("should handle blockchain errors with proper wrapping", async () => {
      mockWalletClient.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("Transaction failed"));

      await expect(controller.acceptFile(1, 42)).rejects.toThrow(
        BlockchainError,
      );
      await expect(controller.acceptFile(1, 42)).rejects.toThrow(
        /Failed to accept file/,
      );
    });

    it("should convert IDs to BigInt for contract", async () => {
      await controller.acceptFile(123, 456);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [BigInt(123), BigInt(456)],
        }),
      );
    });

    it("should pass through transaction options", async () => {
      const options = {
        gas: BigInt(100000),
      };

      await controller.acceptFile(1, 42, options);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          gas: BigInt(100000),
        }),
      );
    });
  });

  describe("rejectFile", () => {
    it("should reject file successfully", async () => {
      const datasetId = 1;
      const fileId = 42;

      const result = await controller.rejectFile(datasetId, fileId);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x1234567890123456789012345678901234567890",
          functionName: "rejectFile",
          args: [BigInt(datasetId), BigInt(fileId)],
        }),
      );

      expect(result).toMatchObject({
        hash: "0xTransactionHash",
        from: "0xOwner",
        contract: "DatasetRegistry",
        fn: "rejectFile",
      });
    });

    it("should throw ReadOnlyError when no wallet is configured", async () => {
      const readOnlyContext = {
        ...mockContext,
        walletClient: undefined,
      };
      const readOnlyController = new DatasetController(readOnlyContext);

      await expect(readOnlyController.rejectFile(1, 42)).rejects.toThrow(
        ReadOnlyError,
      );
    });

    it("should handle blockchain errors with proper wrapping", async () => {
      mockWalletClient.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("Transaction failed"));

      await expect(controller.rejectFile(1, 42)).rejects.toThrow(
        BlockchainError,
      );
      await expect(controller.rejectFile(1, 42)).rejects.toThrow(
        /Failed to reject file/,
      );
    });

    it("should convert IDs to BigInt for contract", async () => {
      await controller.rejectFile(123, 456);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [BigInt(123), BigInt(456)],
        }),
      );
    });

    it("should pass through transaction options", async () => {
      const options = {
        gasPrice: BigInt(1000000000),
      };

      await controller.rejectFile(1, 42, options);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          gasPrice: BigInt(1000000000),
        }),
      );
    });
  });

  describe("getDataset", () => {
    it("should fetch dataset details successfully", async () => {
      const datasetId = 1;
      const mockDataset = {
        owner: "0xOwnerAddress" as `0x${string}`,
        pendingFileIds: [BigInt(1), BigInt(2)],
        fileIds: [BigInt(10), BigInt(11)],
        schemaId: BigInt(42),
        createdAt: BigInt(1234567890),
      };

      mockContract.read.getDataset.mockResolvedValue(mockDataset);

      const result = await controller.getDataset(datasetId);

      expect(mockContract.read.getDataset).toHaveBeenCalledWith([
        BigInt(datasetId),
      ]);

      expect(result).toEqual({
        owner: "0xOwnerAddress",
        pendingFileIds: [1, 2],
        fileIds: [10, 11],
        schemaId: 42,
        createdAt: 1234567890,
      });
    });

    it("should handle blockchain errors with proper wrapping", async () => {
      mockContract.read.getDataset.mockRejectedValue(
        new Error("Dataset not found"),
      );

      await expect(controller.getDataset(1)).rejects.toThrow(BlockchainError);
      await expect(controller.getDataset(1)).rejects.toThrow(
        /Failed to get dataset/,
      );
    });

    it("should work in read-only mode without wallet", async () => {
      const readOnlyContext = {
        ...mockContext,
        walletClient: undefined,
      };
      const readOnlyController = new DatasetController(readOnlyContext);

      const mockDataset = {
        owner: "0xOwnerAddress" as `0x${string}`,
        pendingFileIds: [],
        fileIds: [],
        schemaId: BigInt(42),
        createdAt: BigInt(1000),
      };

      mockContract.read.getDataset.mockResolvedValue(mockDataset);

      const result = await readOnlyController.getDataset(1);

      expect(result.owner).toBe("0xOwnerAddress");
      expect(result.schemaId).toBe(42);
    });

    it("should convert BigInt values to numbers", async () => {
      const mockDataset = {
        owner: "0xOwner" as `0x${string}`,
        pendingFileIds: [BigInt(999)],
        fileIds: [BigInt(1000)],
        schemaId: BigInt(123),
        createdAt: BigInt(9876543210),
      };

      mockContract.read.getDataset.mockResolvedValue(mockDataset);

      const result = await controller.getDataset(1);

      expect(result.pendingFileIds[0]).toBe(999);
      expect(result.fileIds[0]).toBe(1000);
      expect(result.schemaId).toBe(123);
      expect(result.createdAt).toBe(9876543210);
    });
  });

  describe("getUserDatasets", () => {
    let mockGasAwareMulticall: any;

    beforeEach(async () => {
      const { gasAwareMulticall } = await import("../utils/multicall");
      mockGasAwareMulticall = vi.mocked(gasAwareMulticall);
    });

    it("should fetch datasets for a specific owner using sequential multicall", async () => {
      const ownerAddress = "0xOwner" as `0x${string}`;
      const otherAddress = "0xOther" as `0x${string}`;

      // Mock multicall to return datasets 1-3, where 1 and 3 are owned by ownerAddress
      // Dataset 2 is owned by someone else, dataset 4 doesn't exist (triggers end)
      mockGasAwareMulticall.mockResolvedValue([
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [BigInt(1), BigInt(2)],
            fileIds: [BigInt(10), BigInt(11)],
            schemaId: BigInt(42),
            createdAt: BigInt(1000),
          },
        },
        {
          status: "success",
          result: {
            owner: otherAddress, // Different owner - should be filtered out
            pendingFileIds: [],
            fileIds: [BigInt(20)],
            schemaId: BigInt(43),
            createdAt: BigInt(1001),
          },
        },
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [BigInt(30)],
            schemaId: BigInt(44),
            createdAt: BigInt(1002),
          },
        },
        {
          status: "failure", // End of datasets
          error: new Error("Dataset not found"),
        },
        // Remaining 96 calls in the batch would follow...
      ]);

      const result = await controller.getUserDatasets({ owner: ownerAddress });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(3); // Sorted by createdAt descending
      expect(result[0].owner).toBe(ownerAddress);
      expect(result[0].schemaId).toBe(44);
      expect(result[0].fileIds).toEqual([30]);
      expect(result[1].id).toBe(1);
      expect(result[1].pendingFileIds).toEqual([1, 2]);
      expect(result[1].fileIds).toEqual([10, 11]);
    });

    it("should return empty array when owner has no datasets", async () => {
      const ownerAddress = "0xOwner" as `0x${string}`;

      // First dataset query returns failure (no datasets exist)
      mockGasAwareMulticall.mockResolvedValue([
        {
          status: "failure",
          error: new Error("Dataset not found"),
        },
      ]);

      const result = await controller.getUserDatasets({ owner: ownerAddress });

      expect(result).toEqual([]);
    });

    it("should apply pagination correctly", async () => {
      const ownerAddress = "0xOwner" as `0x${string}`;

      // Mock 4 datasets owned by the user
      mockGasAwareMulticall.mockResolvedValue([
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(1),
            createdAt: BigInt(1000),
          },
        },
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(2),
            createdAt: BigInt(1001),
          },
        },
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(3),
            createdAt: BigInt(1002),
          },
        },
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(4),
            createdAt: BigInt(1003),
          },
        },
        {
          status: "failure", // End
          error: new Error("Dataset not found"),
        },
      ]);

      const result = await controller.getUserDatasets(
        { owner: ownerAddress },
        { limit: 2, offset: 2 },
      );

      expect(result).toHaveLength(2);
      // After sorting by createdAt desc: [4, 3, 2, 1]
      // With offset 2, limit 2: [2, 1]
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(1);
    });

    it("should handle fetchAll option", async () => {
      const ownerAddress = "0xOwner" as `0x${string}`;

      mockGasAwareMulticall.mockResolvedValue([
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(1),
            createdAt: BigInt(1000),
          },
        },
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(2),
            createdAt: BigInt(1001),
          },
        },
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(3),
            createdAt: BigInt(1002),
          },
        },
        {
          status: "failure",
          error: new Error("End"),
        },
      ]);

      const result = await controller.getUserDatasets(
        { owner: ownerAddress },
        { fetchAll: true },
      );

      expect(result).toHaveLength(3);
    });

    it("should stop at first failed result", async () => {
      const ownerAddress = "0xOwner" as `0x${string}`;

      // Failure at dataset 2 should stop iteration
      mockGasAwareMulticall.mockResolvedValue([
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(1),
            createdAt: BigInt(1000),
          },
        },
        {
          status: "failure", // This should stop iteration
          error: new Error("Dataset not found"),
        },
        {
          status: "success", // This should not be processed
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(3),
            createdAt: BigInt(1002),
          },
        },
      ]);

      const result = await controller.getUserDatasets({ owner: ownerAddress });

      // Should only have dataset 1 (stopped at failure)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it("should sort datasets by creation time descending", async () => {
      const ownerAddress = "0xOwner" as `0x${string}`;

      mockGasAwareMulticall.mockResolvedValue([
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(1),
            createdAt: BigInt(1000), // Oldest
          },
        },
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(2),
            createdAt: BigInt(2000), // Newest
          },
        },
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(3),
            createdAt: BigInt(1500), // Middle
          },
        },
        {
          status: "failure",
          error: new Error("End"),
        },
      ]);

      const result = await controller.getUserDatasets({ owner: ownerAddress });

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(2); // Newest first
      expect(result[0].createdAt).toBe(2000);
      expect(result[1].id).toBe(3);
      expect(result[1].createdAt).toBe(1500);
      expect(result[2].id).toBe(1); // Oldest last
      expect(result[2].createdAt).toBe(1000);
    });

    it("should work in read-only mode without wallet", async () => {
      const readOnlyContext = {
        ...mockContext,
        walletClient: undefined,
      };
      const readOnlyController = new DatasetController(readOnlyContext);

      const ownerAddress = "0xOwner" as `0x${string}`;

      mockGasAwareMulticall.mockResolvedValue([
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(42),
            createdAt: BigInt(1000),
          },
        },
        {
          status: "failure",
          error: new Error("End"),
        },
      ]);

      const result = await readOnlyController.getUserDatasets({
        owner: ownerAddress,
      });

      expect(result).toHaveLength(1);
      expect(result[0].owner).toBe(ownerAddress);
    });

    it("should handle blockchain errors with proper wrapping", async () => {
      const ownerAddress = "0xOwner" as `0x${string}`;

      mockGasAwareMulticall.mockRejectedValue(new Error("RPC error"));

      await expect(
        controller.getUserDatasets({ owner: ownerAddress }),
      ).rejects.toThrow(BlockchainError);
      await expect(
        controller.getUserDatasets({ owner: ownerAddress }),
      ).rejects.toThrow(/Failed to get user datasets/);
    });

    it("should convert dataset fields to numbers correctly", async () => {
      const ownerAddress = "0xOwner" as `0x${string}`;

      mockGasAwareMulticall.mockResolvedValue([
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [BigInt(1), BigInt(2)],
            fileIds: [BigInt(10), BigInt(11)],
            schemaId: BigInt(42),
            createdAt: BigInt(1000),
          },
        },
        {
          status: "failure",
          error: new Error("End"),
        },
      ]);

      const result = await controller.getUserDatasets({ owner: ownerAddress });

      expect(result[0].id).toBe(1);
      expect(result[0].pendingFileIds).toEqual([1, 2]);
      expect(result[0].fileIds).toEqual([10, 11]);
      expect(result[0].schemaId).toBe(42);
      expect(result[0].createdAt).toBe(1000);
    });

    it("should stop at zero address (non-existent dataset)", async () => {
      const ownerAddress = "0xOwner" as `0x${string}`;
      const zeroAddress =
        "0x0000000000000000000000000000000000000000" as `0x${string}`;

      mockGasAwareMulticall.mockResolvedValue([
        {
          status: "success",
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(1),
            createdAt: BigInt(1000),
          },
        },
        {
          status: "success",
          result: {
            owner: zeroAddress, // Zero address indicates non-existent dataset
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(0),
            createdAt: BigInt(0),
          },
        },
        {
          status: "success", // Should not be processed
          result: {
            owner: ownerAddress,
            pendingFileIds: [],
            fileIds: [],
            schemaId: BigInt(3),
            createdAt: BigInt(1002),
          },
        },
      ]);

      const result = await controller.getUserDatasets({ owner: ownerAddress });

      // Should only have dataset 1 (stopped at zero address)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });
});
