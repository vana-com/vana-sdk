/**
 * @file Comprehensive tests for multicall utility
 *
 * This test suite covers the gas-aware multicall batching algorithm,
 * including edge cases, error handling, and optimization strategies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { type PublicClient, type Address, parseEther } from "viem";
import { mainnet } from "viem/chains";
import {
  gasAwareMulticall,
  analyzeCallsForOptimalConfig,
  type ContractFunctionConfig,
  type GasAwareMulticallOptions,
} from "../multicall";

// Mock viem functions
vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    size: vi.fn((hex: string) => {
      // Simple approximation: 2 chars per byte in hex (minus 0x prefix)
      return Math.floor((hex.length - 2) / 2);
    }),
  };
});

// Mock generated/addresses module
vi.mock("../../generated/addresses", () => ({
  getUtilityAddress: vi
    .fn()
    .mockReturnValue("0xcA11bde05977b3631167028862bE2a173976CA11"),
}));

// Test data - minimal ERC20-like ABI
const mockAddress = "0x0000000000000000000000000000000000000001" as Address;
const mockAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

describe("multicall utility - comprehensive tests", () => {
  let mockClient: PublicClient;
  let estimateGasSpy: ReturnType<typeof vi.fn>;
  let multicallSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock client with all required methods
    mockClient = {
      chain: mainnet,
      multicall: vi.fn().mockResolvedValue([]),
      estimateGas: vi.fn().mockResolvedValue(100_000n),
      getChainId: vi.fn().mockResolvedValue(1),
    } as unknown as PublicClient;

    estimateGasSpy = vi.mocked(mockClient.estimateGas);
    multicallSpy = vi.mocked(mockClient.multicall);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("gasAwareMulticall - empty and minimal cases", () => {
    it("should handle empty contracts array", async () => {
      const result = await gasAwareMulticall(mockClient, { contracts: [] });

      expect(result).toEqual([]);
      expect(multicallSpy).not.toHaveBeenCalled();
      expect(estimateGasSpy).not.toHaveBeenCalled();
    });

    it("should handle undefined contracts gracefully", async () => {
      const result = await gasAwareMulticall(mockClient, {
        contracts: undefined as unknown as [],
      });

      expect(result).toEqual([]);
      expect(multicallSpy).not.toHaveBeenCalled();
    });

    it("should handle single contract call without gas estimation", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
      ] as const;

      multicallSpy.mockResolvedValueOnce([parseEther("100")]);

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toEqual([parseEther("100")]);
      expect(multicallSpy).toHaveBeenCalledOnce();
      expect(estimateGasSpy).not.toHaveBeenCalled();
    });
  });

  describe("gasAwareMulticall - gas limit scenarios", () => {
    it("should split batches when estimated gas exceeds limit", async () => {
      const contracts = Array(100)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "transfer",
          args: [mockAddress, parseEther("1")],
        })) as ContractFunctionConfig[];

      // First checkpoint hits gas limit
      estimateGasSpy
        .mockResolvedValueOnce(12_000_000n) // Over 10M default limit
        .mockResolvedValue(5_000_000n); // Subsequent estimates

      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        return Promise.resolve(Array(params.contracts.length).fill(true));
      });

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(100);
      expect(multicallSpy.mock.calls.length).toBeGreaterThan(1);
    });

    it("should respect custom maxGasPerBatch option", async () => {
      const contracts = Array(50)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const options: GasAwareMulticallOptions = {
        maxGasPerBatch: 3_000_000n, // Lower than default
      };

      estimateGasSpy.mockResolvedValueOnce(4_000_000n); // Over custom limit

      multicallSpy
        .mockResolvedValueOnce(Array(32).fill(parseEther("1")))
        .mockResolvedValueOnce(Array(18).fill(parseEther("1")));

      await gasAwareMulticall(mockClient, { contracts }, options);

      expect(multicallSpy).toHaveBeenCalledTimes(2);
    });

    it("should use extrapolation for gas estimation between checkpoints", async () => {
      const contracts = Array(40)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      // Gas grows progressively, triggering extrapolation
      estimateGasSpy
        .mockResolvedValueOnce(8_000_000n) // At checkpoint (call 32)
        .mockResolvedValue(3_000_000n);

      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        return Promise.resolve(
          Array(params.contracts.length).fill(parseEther("1")),
        );
      });

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(40);
    });

    it("should handle gas estimation failure at checkpoint", async () => {
      const contracts = Array(50)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      // First checkpoint fails
      estimateGasSpy.mockRejectedValueOnce(new Error("RPC error"));

      // Should split batch in half when estimation fails
      multicallSpy
        .mockResolvedValueOnce(Array(16).fill(parseEther("1")))
        .mockResolvedValueOnce(Array(34).fill(parseEther("1")));

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(50);
      expect(multicallSpy).toHaveBeenCalledTimes(2);
    });

    it("should throw on estimation failure with allowFailure=false for single call", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
      ] as const;

      // Make it reach checkpoint by having 32+ calls in batch initially
      const manyContracts = Array(35)
        .fill(null)
        .map(() => contracts[0]) as ContractFunctionConfig[];

      estimateGasSpy.mockRejectedValue(new Error("Gas estimation failed"));

      const options: GasAwareMulticallOptions = {
        allowFailure: false,
      };

      // When batch is split to single call and estimation still fails
      multicallSpy.mockRejectedValue(new Error("Gas estimation failed"));

      await expect(
        gasAwareMulticall(mockClient, { contracts: manyContracts }, options),
      ).rejects.toThrow();
    });

    it("should continue on estimation failure with allowFailure=true", async () => {
      const contracts = Array(35)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      estimateGasSpy.mockRejectedValue(new Error("Estimation failed"));

      const options: GasAwareMulticallOptions = {
        allowFailure: true,
      };

      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        return Promise.resolve(
          Array(params.contracts.length).fill({
            success: true,
            value: parseEther("1"),
          }),
        );
      });

      const result = await gasAwareMulticall(
        mockClient,
        { contracts },
        options,
      );

      expect(result.length).toBeGreaterThan(0);
    });

    it("should throw when single call fails estimation with allowFailure=false", async () => {
      // Create exactly 32 calls to hit checkpoint immediately
      const contracts = Array(32)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      let estimateCallCount = 0;
      // Make estimation fail each time, forcing recursive splits down to single call
      estimateGasSpy.mockImplementation(() => {
        estimateCallCount++;
        throw new Error(`RPC error ${estimateCallCount}`);
      });

      const options: GasAwareMulticallOptions = {
        allowFailure: false,
        checkpointFrequency: { calls: 1, bytes: 1 }, // Force immediate checkpoints
      };

      await expect(
        gasAwareMulticall(mockClient, { contracts }, options),
      ).rejects.toThrow("Gas estimation failed for call");
    });

    it("should skip single call when estimation fails with allowFailure=true", async () => {
      // Create calls that will hit checkpoint
      const contracts = Array(32)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      let estimateCallCount = 0;
      // Make estimation fail, forcing recursive splits down to single call
      estimateGasSpy.mockImplementation(() => {
        estimateCallCount++;
        throw new Error(`RPC error ${estimateCallCount}`);
      });

      const options: GasAwareMulticallOptions = {
        allowFailure: true,
        checkpointFrequency: { calls: 1, bytes: 1 }, // Force immediate checkpoints
      };

      // Should not throw, just skip problematic calls
      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        return Promise.resolve(
          Array(params.contracts.length).fill({
            success: true,
            value: parseEther("1"),
          }),
        );
      });

      // This should complete without throwing
      const result = await gasAwareMulticall(
        mockClient,
        { contracts },
        options,
      );

      // Some calls may be skipped, but should return results
      expect(result).toBeDefined();
    });
  });

  describe("gasAwareMulticall - calldata size scenarios", () => {
    it("should split batches when calldata exceeds maxCalldataBytes", async () => {
      // Create calls with large calldata
      const largeArray = Array(1000).fill(mockAddress);
      const contracts = Array(10)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: [
            {
              name: "batchTransfer",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [{ name: "recipients", type: "address[]" }],
              outputs: [],
            },
          ] as const,
          functionName: "batchTransfer",
          args: [largeArray],
        })) as ContractFunctionConfig[];

      const options: GasAwareMulticallOptions = {
        maxCalldataBytes: 30_000, // 30KB
      };

      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        return Promise.resolve(Array(params.contracts.length).fill(true));
      });

      const result = await gasAwareMulticall(
        mockClient,
        { contracts },
        options,
      );

      expect(result).toHaveLength(10);
      // Should split due to calldata size
      expect(multicallSpy.mock.calls.length).toBeGreaterThan(1);
    });

    it("should handle mixed small and large calldata efficiently", async () => {
      const contracts: ContractFunctionConfig[] = [
        // Small calls
        ...Array(10)
          .fill(null)
          .map(() => ({
            address: mockAddress,
            abi: mockAbi,
            functionName: "balanceOf",
            args: [mockAddress],
          })),
        // One large call
        {
          address: mockAddress,
          abi: [
            {
              name: "batchTransfer",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [{ name: "recipients", type: "address[]" }],
              outputs: [],
            },
          ] as const,
          functionName: "batchTransfer",
          args: [Array(3000).fill(mockAddress)], // ~60KB
        },
        // More small calls
        ...Array(10)
          .fill(null)
          .map(() => ({
            address: mockAddress,
            abi: mockAbi,
            functionName: "balanceOf",
            args: [mockAddress],
          })),
      ];

      const options: GasAwareMulticallOptions = {
        maxCalldataBytes: 70_000, // 70KB
      };

      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        return Promise.resolve(
          Array(params.contracts.length).fill(parseEther("1")),
        );
      });

      const result = await gasAwareMulticall(
        mockClient,
        { contracts },
        options,
      );

      expect(result).toHaveLength(21);
    });

    it("should respect custom maxCalldataBytes limit", async () => {
      const contracts = Array(20)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const options: GasAwareMulticallOptions = {
        maxCalldataBytes: 500, // Very small limit
      };

      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        return Promise.resolve(
          Array(params.contracts.length).fill(parseEther("1")),
        );
      });

      const result = await gasAwareMulticall(
        mockClient,
        { contracts },
        options,
      );

      expect(result).toHaveLength(20);
      // Should create at least 2 batches due to small limit
      expect(multicallSpy.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe("gasAwareMulticall - checkpoint frequency", () => {
    it("should checkpoint at configured call frequency", async () => {
      const contracts = Array(60)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const options: GasAwareMulticallOptions = {
        checkpointFrequency: { calls: 10, bytes: 100_000 },
      };

      estimateGasSpy.mockResolvedValue(2_000_000n);
      multicallSpy.mockResolvedValue(Array(60).fill(parseEther("1")));

      await gasAwareMulticall(mockClient, { contracts }, options);

      // Should checkpoint approximately every 10 calls (6 checkpoints for 60 calls)
      expect(estimateGasSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it("should checkpoint based on bytes accumulated", async () => {
      const contracts = Array(20)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: [
            {
              name: "batchOp",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [{ name: "data", type: "bytes" }],
              outputs: [],
            },
          ] as const,
          functionName: "batchOp",
          args: ["0x" + "00".repeat(1000)], // 1KB of data per call
        })) as ContractFunctionConfig[];

      const options: GasAwareMulticallOptions = {
        checkpointFrequency: { calls: 100, bytes: 5000 }, // Every 5KB
      };

      estimateGasSpy.mockResolvedValue(2_000_000n);
      multicallSpy.mockResolvedValue(Array(20).fill(true));

      await gasAwareMulticall(mockClient, { contracts }, options);

      // Should checkpoint based on bytes (20KB total / 5KB = ~4 checkpoints)
      expect(estimateGasSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("should not checkpoint on first call", async () => {
      const contracts = Array(5)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      estimateGasSpy.mockResolvedValue(100_000n);
      multicallSpy.mockResolvedValue(Array(5).fill(parseEther("1")));

      await gasAwareMulticall(mockClient, { contracts });

      // Should not need any gas estimation for small batch
      expect(estimateGasSpy).not.toHaveBeenCalled();
    });
  });

  describe("gasAwareMulticall - progress callbacks", () => {
    it("should call onProgress callback with correct values", async () => {
      const contracts = Array(100)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const onProgress = vi.fn();
      const options: GasAwareMulticallOptions = { onProgress };

      // Force multiple batches
      estimateGasSpy.mockResolvedValueOnce(12_000_000n);
      multicallSpy
        .mockResolvedValueOnce(Array(32).fill(parseEther("1")))
        .mockResolvedValueOnce(Array(68).fill(parseEther("1")));

      await gasAwareMulticall(mockClient, { contracts }, options);

      expect(onProgress).toHaveBeenCalled();
      // Last call should be (total, total)
      expect(onProgress).toHaveBeenLastCalledWith(100, 100);
      // Should have intermediate progress calls
      expect(onProgress.mock.calls.length).toBeGreaterThan(1);
    });

    it("should not call onProgress on first batch", async () => {
      const contracts = Array(50)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const onProgress = vi.fn();
      const options: GasAwareMulticallOptions = { onProgress };

      multicallSpy.mockResolvedValue(Array(50).fill(parseEther("1")));

      await gasAwareMulticall(mockClient, { contracts }, options);

      // Should only call at the end (100, 100)
      expect(onProgress).toHaveBeenCalledOnce();
      expect(onProgress).toHaveBeenCalledWith(50, 50);
    });

    it("should report accurate progress across multiple batches", async () => {
      const contracts = Array(90)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const progressCalls: Array<[number, number]> = [];
      const onProgress = vi.fn((completed, total) => {
        progressCalls.push([completed, total]);
      });

      const options: GasAwareMulticallOptions = { onProgress };

      // Force 3 batches
      estimateGasSpy
        .mockResolvedValueOnce(12_000_000n)
        .mockResolvedValueOnce(12_000_000n);

      multicallSpy
        .mockResolvedValueOnce(Array(32).fill(parseEther("1")))
        .mockResolvedValueOnce(Array(32).fill(parseEther("1")))
        .mockResolvedValueOnce(Array(26).fill(parseEther("1")));

      await gasAwareMulticall(mockClient, { contracts }, options);

      // Should have progress updates
      expect(progressCalls.length).toBeGreaterThan(1);
      // All progress calls should have total = 90
      progressCalls.forEach(([, total]) => {
        expect(total).toBe(90);
      });
      // Last call should be complete
      expect(progressCalls[progressCalls.length - 1]).toEqual([90, 90]);
    });
  });

  describe("gasAwareMulticall - allowFailure option", () => {
    it("should pass allowFailure to multicall from parameters", async () => {
      const contracts = Array(3)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      multicallSpy.mockResolvedValue([
        { success: true, value: parseEther("1") },
        { success: false, error: new Error("Reverted") },
        { success: true, value: parseEther("2") },
      ]);

      await gasAwareMulticall(mockClient, {
        contracts,
        allowFailure: true,
      });

      expect(multicallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          allowFailure: true,
        }),
      );
    });

    it("should override option allowFailure with parameter allowFailure", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
      ] as const;

      multicallSpy.mockResolvedValue([parseEther("1")]);

      // Options say false, but parameters say true - parameters win
      await gasAwareMulticall(
        mockClient,
        { contracts, allowFailure: true },
        { allowFailure: false },
      );

      expect(multicallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          allowFailure: true,
        }),
      );
    });

    it("should use option allowFailure when parameter not specified", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
      ] as const;

      multicallSpy.mockResolvedValue([parseEther("1")]);

      await gasAwareMulticall(
        mockClient,
        { contracts },
        { allowFailure: true },
      );

      expect(multicallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          allowFailure: true,
        }),
      );
    });
  });

  describe("gasAwareMulticall - multicall address", () => {
    it("should use custom multicall address when provided", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
      ] as const;

      const customAddress =
        "0x1234567890123456789012345678901234567890" as Address;
      const options: GasAwareMulticallOptions = {
        multicallAddress: customAddress,
      };

      multicallSpy.mockResolvedValue([parseEther("1")]);

      await gasAwareMulticall(mockClient, { contracts }, options);

      expect(multicallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          multicallAddress: customAddress,
        }),
      );
    });

    it("should use chain-specific multicall address by default", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
      ] as const;

      multicallSpy.mockResolvedValue([parseEther("1")]);

      await gasAwareMulticall(mockClient, { contracts });

      expect(multicallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
        }),
      );
    });
  });

  describe("gasAwareMulticall - parallel batch execution", () => {
    it("should execute multiple batches in parallel", async () => {
      const contracts = Array(100)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      // Force multiple batches
      estimateGasSpy.mockResolvedValueOnce(12_000_000n);

      const batchCallTimes: number[] = [];

      multicallSpy.mockImplementation(async (args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        const batchSize = params.contracts.length;
        const startTime = Date.now();

        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 5));

        batchCallTimes.push(startTime);
        return Array(batchSize).fill(parseEther("1"));
      });

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(100);
      // Should have created multiple batches
      expect(multicallSpy.mock.calls.length).toBeGreaterThan(1);
      // All batches should be called (tracking via timestamps)
      expect(batchCallTimes.length).toBeGreaterThan(1);
    });
  });

  describe("gasAwareMulticall - edge cases and stress tests", () => {
    it("should handle very large number of calls (1000+)", async () => {
      const contracts = Array(1500)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      estimateGasSpy.mockResolvedValue(8_000_000n);

      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        return Promise.resolve(
          Array(params.contracts.length).fill(parseEther("1")),
        );
      });

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(1500);
      // Verify all calls were processed
      const totalProcessed = multicallSpy.mock.calls.reduce(
        (sum: number, call: unknown[]) => {
          const args = call[0] as { contracts: ContractFunctionConfig[] };
          return sum + args.contracts.length;
        },
        0,
      );
      expect(totalProcessed).toBe(1500);
    }, 15000);

    it("should handle calls with no args", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: [
            {
              name: "totalSupply",
              type: "function",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "supply", type: "uint256" }],
            },
          ] as const,
          functionName: "totalSupply",
          args: [],
        },
      ] as const;

      multicallSpy.mockResolvedValue([parseEther("1000000")]);

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(parseEther("1000000"));
    });

    it("should handle calls with undefined args", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: [
            {
              name: "totalSupply",
              type: "function",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "supply", type: "uint256" }],
            },
          ] as const,
          functionName: "totalSupply",
          // args intentionally undefined
        },
      ] as ContractFunctionConfig[];

      multicallSpy.mockResolvedValue([parseEther("1000000")]);

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(1);
    });

    it("should handle multiple contract addresses in same batch", async () => {
      const addresses = Array(5)
        .fill(null)
        .map(
          (_, i) => `0x000000000000000000000000000000000000000${i}` as Address,
        );

      const contracts = addresses.map((addr) => ({
        address: addr,
        abi: mockAbi,
        functionName: "balanceOf",
        args: [mockAddress],
      })) as ContractFunctionConfig[];

      multicallSpy.mockResolvedValue(Array(5).fill(parseEther("1")));

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(5);
    });

    it("should handle different function names in same batch", async () => {
      const contracts: ContractFunctionConfig[] = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "transfer",
          args: [mockAddress, parseEther("1")],
        },
      ];

      multicallSpy.mockResolvedValue([parseEther("100"), true]);

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toEqual([parseEther("100"), true]);
    });

    it("should handle batch that becomes exactly one call after split", async () => {
      const contracts = Array(33)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      // Fail estimation, forcing split
      estimateGasSpy.mockRejectedValueOnce(new Error("Gas estimation failed"));

      // After split: 16 calls in first batch, 17 remaining
      multicallSpy
        .mockResolvedValueOnce(Array(16).fill(parseEther("1")))
        .mockResolvedValueOnce(Array(17).fill(parseEther("1")));

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(33);
    });
  });

  describe("analyzeCallsForOptimalConfig", () => {
    it("should suggest default config for small calls", () => {
      const contracts = Array(10)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const config = analyzeCallsForOptimalConfig(contracts);

      expect(config.checkpointFrequency.calls).toBe(32);
      expect(config.checkpointFrequency.bytes).toBe(8192);
      expect(config.maxCalldataBytes).toBe(100_000);
    });

    it("should suggest frequent checkpoints for large calls", () => {
      const contracts = Array(10)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: [
            {
              name: "batchOp",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [{ name: "data", type: "bytes" }],
              outputs: [],
            },
          ] as const,
          functionName: "batchOp",
          args: ["0x" + "00".repeat(2000)], // 2KB per call (avg > 500 bytes)
        })) as ContractFunctionConfig[];

      const config = analyzeCallsForOptimalConfig(contracts);

      expect(config.checkpointFrequency.calls).toBe(16);
      expect(config.checkpointFrequency.bytes).toBe(4096);
    });

    it("should suggest higher calldata limit for many calls", () => {
      const contracts = Array(1000)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const config = analyzeCallsForOptimalConfig(contracts);

      expect(config.maxCalldataBytes).toBe(128_000);
    });

    it("should suggest higher calldata limit for large total bytes", () => {
      const contracts = Array(100)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: [
            {
              name: "batchOp",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [{ name: "data", type: "bytes" }],
              outputs: [],
            },
          ] as const,
          functionName: "batchOp",
          args: ["0x" + "00".repeat(1000)], // 1KB per call = 100KB total
        })) as ContractFunctionConfig[];

      const config = analyzeCallsForOptimalConfig(contracts);

      expect(config.maxCalldataBytes).toBe(128_000);
    });

    it("should handle single call analysis", () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
      ] as ContractFunctionConfig[];

      const config = analyzeCallsForOptimalConfig(contracts);

      expect(config.checkpointFrequency).toBeDefined();
      expect(config.maxCalldataBytes).toBeDefined();
    });

    it("should analyze calls with mixed sizes correctly", () => {
      const contracts: ContractFunctionConfig[] = [
        // 5 small calls
        ...Array(5)
          .fill(null)
          .map(() => ({
            address: mockAddress,
            abi: mockAbi,
            functionName: "balanceOf",
            args: [mockAddress],
          })),
        // 5 large calls
        ...Array(5)
          .fill(null)
          .map(() => ({
            address: mockAddress,
            abi: [
              {
                name: "batchOp",
                type: "function",
                stateMutability: "nonpayable",
                inputs: [{ name: "data", type: "bytes" }],
                outputs: [],
              },
            ] as const,
            functionName: "batchOp",
            args: ["0x" + "00".repeat(2000)], // 2KB
          })),
      ];

      const config = analyzeCallsForOptimalConfig(contracts);

      // Average is (5 * small + 5 * 2000) / 10 > 500
      expect(config.checkpointFrequency.calls).toBe(16);
      expect(config.checkpointFrequency.bytes).toBe(4096);
    });
  });
});
