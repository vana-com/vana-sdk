import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { type PublicClient, type Address, parseEther } from "viem";
import { mainnet } from "viem/chains";
import {
  gasAwareMulticall,
  analyzeCallsForOptimalConfig,
  type ContractFunctionConfig,
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

// Mock config/addresses module
vi.mock("../../config/addresses", () => ({
  getUtilityAddress: vi
    .fn()
    .mockReturnValue("0xcA11bde05977b3631167028862bE2a173976CA11"),
}));

// Test data
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

describe("gasAwareMulticall", () => {
  let mockClient: PublicClient;
  let estimateGasSpy: ReturnType<typeof vi.fn>;
  let multicallSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock client
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

  describe("basic functionality", () => {
    it("should handle empty calls array", async () => {
      const result = await gasAwareMulticall(mockClient, { contracts: [] });

      expect(result).toEqual([]);
      expect(multicallSpy).not.toHaveBeenCalled();
      expect(estimateGasSpy).not.toHaveBeenCalled();
    });

    it("should handle single call", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
      ] as const;

      multicallSpy.mockResolvedValueOnce([parseEther("1")]);

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toEqual([parseEther("1")]);
      expect(multicallSpy).toHaveBeenCalledOnce();
      expect(multicallSpy).toHaveBeenCalledWith({
        contracts,
        multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
        allowFailure: false,
      });
    });

    it("should handle multiple calls that fit in one batch", async () => {
      const contracts = Array(10)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const expectedResults = Array(10).fill(parseEther("1"));
      multicallSpy.mockResolvedValueOnce(expectedResults);

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toEqual(expectedResults);
      expect(multicallSpy).toHaveBeenCalledOnce();
      // Should not need gas estimation for small batch
      expect(estimateGasSpy).not.toHaveBeenCalled();
    });
  });

  describe("gas limit scenarios", () => {
    it("should split batch when gas limit exceeded", async () => {
      // Create 100 calls
      const contracts = Array(100)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "transfer",
          args: [mockAddress, parseEther("1")],
        })) as ContractFunctionConfig[];

      // First gas estimate returns high value (will trigger split)
      estimateGasSpy.mockResolvedValueOnce(12_000_000n); // Over 10M limit

      // Subsequent estimates return reasonable values
      estimateGasSpy.mockResolvedValue(5_000_000n);

      // Mock multicall results - we don't know exact batch sizes, so be flexible
      let totalProcessed = 0;
      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        const batch = params.contracts;
        const batchSize = batch.length;
        totalProcessed += batchSize;
        return Promise.resolve(Array(batchSize).fill(true));
      });

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(100);
      expect(result.every((r: unknown) => r === true)).toBe(true);
      expect(totalProcessed).toBe(100);

      // Should have made at least one gas estimate (at checkpoint)
      expect(estimateGasSpy).toHaveBeenCalled();

      // Should have split into multiple multicalls (at least 2)
      expect(multicallSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("should checkpoint at configured intervals", async () => {
      const contracts = Array(50)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      // Configure more frequent checkpoints
      const options = {
        checkpointFrequency: { calls: 10, bytes: 1000 },
      };

      multicallSpy.mockResolvedValueOnce(Array(50).fill(parseEther("1")));
      estimateGasSpy.mockResolvedValue(1_000_000n); // Well under limit

      await gasAwareMulticall(mockClient, { contracts }, options);

      // Should have made multiple gas estimates (approximately every 10 calls)
      // Could be 3-5 depending on exact algorithm behavior
      expect(estimateGasSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(estimateGasSpy.mock.calls.length).toBeLessThanOrEqual(5);
    });

    it("should handle gas estimation failure gracefully", async () => {
      const contracts = Array(50)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      // First checkpoint fails
      estimateGasSpy.mockRejectedValueOnce(new Error("Gas estimation failed"));

      // Multicall for split batches
      multicallSpy
        .mockResolvedValueOnce(Array(16).fill(parseEther("1"))) // Half of first 32
        .mockResolvedValueOnce(Array(34).fill(parseEther("1"))); // Remainder

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(50);
      // Should have recovered and completed
      expect(multicallSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("calldata limit scenarios", () => {
    it("should split when calldata size exceeds limit", async () => {
      // Create calls with large calldata (use large address array instead of huge number)
      const manyAddresses = Array(500).fill(mockAddress);
      const contracts = Array(15)
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
          args: [manyAddresses], // Large array as calldata
        })) as ContractFunctionConfig[];

      // Set lower calldata limit
      const options = { maxCalldataBytes: 50_000 }; // 50KB

      // Each batch should have max ~5 calls (5 * 10KB = 50KB)
      multicallSpy
        .mockResolvedValueOnce(Array(5).fill(true))
        .mockResolvedValueOnce(Array(5).fill(true))
        .mockResolvedValueOnce(Array(5).fill(true));

      const result = await gasAwareMulticall(
        mockClient,
        { contracts },
        options,
      );

      expect(result).toHaveLength(15);
      // Should have split into multiple batches due to calldata size
      expect(multicallSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("should handle mixed small and large calls efficiently", async () => {
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
        // 1 large call
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
          args: [Array(2500).fill(mockAddress)], // ~50KB of addresses
        },
        // 5 more small calls
        ...Array(5)
          .fill(null)
          .map(() => ({
            address: mockAddress,
            abi: mockAbi,
            functionName: "balanceOf",
            args: [mockAddress],
          })),
      ];

      const options = { maxCalldataBytes: 60_000 }; // 60KB limit

      multicallSpy
        .mockResolvedValueOnce(Array(6).fill(parseEther("1"))) // First 5 small + 1 large
        .mockResolvedValueOnce(Array(5).fill(parseEther("1"))); // Last 5 small

      const result = await gasAwareMulticall(
        mockClient,
        { contracts },
        options,
      );

      expect(result).toHaveLength(11); // 5 small + 1 large + 5 small
      // Should have made at least 2 calls due to large item
      expect(multicallSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("configuration options", () => {
    it("should respect custom gas limit", async () => {
      const contracts = Array(100)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "transfer",
          args: [mockAddress, parseEther("1")],
        })) as ContractFunctionConfig[];

      const options = { maxGasPerBatch: 5_000_000n }; // Lower limit

      // First estimate at checkpoint
      estimateGasSpy.mockResolvedValueOnce(6_000_000n); // Over custom limit

      multicallSpy
        .mockResolvedValueOnce(Array(32).fill(true))
        .mockResolvedValueOnce(Array(68).fill(true));

      await gasAwareMulticall(mockClient, { contracts }, options);

      // Should have split due to lower gas limit
      expect(multicallSpy).toHaveBeenCalledTimes(2);
    });

    it("should call progress callback", async () => {
      const contracts = Array(100)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const onProgress = vi.fn();
      const options = { onProgress };

      // Force split into 2 batches
      estimateGasSpy.mockResolvedValueOnce(12_000_000n);
      multicallSpy
        .mockResolvedValueOnce(Array(32).fill(parseEther("1")))
        .mockResolvedValueOnce(Array(68).fill(parseEther("1")));

      await gasAwareMulticall(mockClient, { contracts }, options);

      // Should report progress
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenLastCalledWith(100, 100); // Final call
    });

    it("should use custom multicall address", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        },
      ] as const;

      const customMulticall =
        "0x1234567890123456789012345678901234567890" as Address;
      const options = { multicallAddress: customMulticall };

      multicallSpy.mockResolvedValueOnce([parseEther("1")]);

      await gasAwareMulticall(mockClient, { contracts }, options);

      expect(multicallSpy).toHaveBeenCalledWith({
        contracts,
        multicallAddress: customMulticall,
        allowFailure: false,
      });
    });

    it("should respect allowFailure option", async () => {
      const contracts = Array(3)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      const mockResults = [
        { success: true, value: parseEther("1") },
        { success: false, value: null },
        { success: true, value: parseEther("2") },
      ];

      multicallSpy.mockResolvedValueOnce(mockResults);

      const result = await gasAwareMulticall(mockClient, {
        contracts,
        allowFailure: true,
      });

      expect(result).toEqual(mockResults);
      expect(multicallSpy).toHaveBeenCalledWith({
        contracts,
        allowFailure: true,
        multicallAddress: expect.any(String),
      });
    });
  });

  describe("edge cases", () => {
    it("should handle very large number of calls", async () => {
      const contracts = Array(1000)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      // Mock progressive gas estimates
      estimateGasSpy
        .mockResolvedValueOnce(2_000_000n) // First checkpoint
        .mockResolvedValueOnce(4_000_000n) // Second checkpoint
        .mockResolvedValueOnce(6_000_000n) // Third checkpoint
        .mockResolvedValueOnce(8_000_000n) // Fourth checkpoint
        .mockResolvedValueOnce(11_000_000n) // Exceeds limit
        .mockResolvedValue(3_000_000n); // Subsequent batches

      // Set up multicall to return appropriate results for any batch size
      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        const batch = params.contracts;
        return Promise.resolve(Array(batch.length).fill(parseEther("1")));
      });

      const result = await gasAwareMulticall(mockClient, { contracts });

      expect(result).toHaveLength(1000);
      expect(multicallSpy.mock.calls.length).toBeGreaterThan(1);

      // Verify total results
      const totalReturned = multicallSpy.mock.calls.reduce(
        (sum: number, call: unknown[]) => {
          const args = call[0] as { contracts: ContractFunctionConfig[] };
          return sum + args.contracts.length;
        },
        0,
      );
      expect(totalReturned).toBe(1000);
    });

    it("should handle single large call that exceeds gas limit", async () => {
      const contracts = [
        {
          address: mockAddress,
          abi: mockAbi,
          functionName: "transfer",
          args: [mockAddress, parseEther("1000000")], // Very large transfer
        },
      ] as const;

      // Single call should execute without estimation since it's below checkpoint threshold
      // But if it fails, it should throw
      multicallSpy.mockRejectedValueOnce(new Error("Gas limit exceeded"));

      // Should throw since we can't split a single call
      await expect(
        gasAwareMulticall(mockClient, { contracts }),
      ).rejects.toThrow("Gas limit exceeded");
    });

    it("should handle estimation failure with allowFailure", async () => {
      const contracts = Array(50)
        .fill(null)
        .map(() => ({
          address: mockAddress,
          abi: mockAbi,
          functionName: "balanceOf",
          args: [mockAddress],
        })) as ContractFunctionConfig[];

      // Estimation fails
      estimateGasSpy.mockRejectedValue(new Error("Estimation failed"));

      // But we allow failures
      const options = { allowFailure: true };

      // Should still work, just less optimally
      multicallSpy.mockImplementation((args: unknown) => {
        const params = args as { contracts: ContractFunctionConfig[] };
        const batch = params.contracts;
        return Promise.resolve(
          Array(batch.length).fill({
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

      expect(result).toHaveLength(50);
    });
  });

  describe("analyzeCallsForOptimalConfig", () => {
    it("should suggest more frequent checkpoints for large calls", () => {
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
          args: [Array(50).fill(mockAddress)], // Large array args
        })) as ContractFunctionConfig[];

      const config = analyzeCallsForOptimalConfig(contracts);

      expect(config.checkpointFrequency?.calls).toBeLessThan(32);
      expect(config.checkpointFrequency?.bytes).toBeLessThan(8192);
    });

    it("should suggest higher calldata limit for very large datasets", () => {
      const contracts = Array(1000)
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
          args: [Array(5).fill(mockAddress)], // Small arrays but many calls
        })) as ContractFunctionConfig[];

      const config = analyzeCallsForOptimalConfig(contracts);

      // Should suggest 128KB for large datasets
      expect(config.maxCalldataBytes).toBe(128_000);
    });
  });
});
