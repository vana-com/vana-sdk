import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import { StakingController } from "../controllers/staking";
import type { ControllerContext } from "../types/controller-context";
import { ReadOnlyError, BlockchainError } from "../errors";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock the config and ABI modules
vi.mock("../generated/addresses", () => ({
  getContractAddress: vi.fn(),
  CONTRACT_ADDRESSES: {
    14800: {
      VanaPoolStaking: "0x641C18E2F286c86f96CE95C8ec1EB9fC0415Ca0e",
      VanaPoolEntity: "0xEntity123456789012345678901234567890",
    },
  },
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

// Import the mocked functions
import { getContractAddress } from "../generated/addresses";
import { getAbi } from "../generated/abi";

// Type the mocked functions
const mockGetContractAddress = getContractAddress as ReturnType<typeof vi.fn>;
const mockGetAbi = getAbi as ReturnType<typeof vi.fn>;

// Test account
const testAccount = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

describe("StakingController", () => {
  let controller: StakingController;
  let mockContext: ControllerContext;
  let mockWalletClient: ReturnType<typeof createWalletClient>;
  let mockPublicClient: {
    waitForTransactionReceipt: ReturnType<typeof vi.fn>;
    getTransactionReceipt: ReturnType<typeof vi.fn>;
    getBlock: ReturnType<typeof vi.fn>;
    multicall: ReturnType<typeof vi.fn>;
    chain: { id: number };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockWalletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http("https://rpc.moksha.vana.org"),
    });

    // Mock writeContract method
    mockWalletClient.writeContract = vi
      .fn()
      .mockResolvedValue("0xTransactionHash");

    mockPublicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        transactionHash: "0xTransactionHash",
        blockNumber: 12345n,
        gasUsed: 100000n,
        status: "success" as const,
        logs: [],
      }),
      getBlock: vi
        .fn()
        .mockResolvedValue({ number: 12345n, timestamp: BigInt(Date.now()) }),
      multicall: vi.fn(),
      chain: { id: 14800 },
    };

    mockContext = {
      walletClient:
        mockWalletClient as unknown as ControllerContext["walletClient"],
      publicClient:
        mockPublicClient as unknown as ControllerContext["publicClient"],
      userAddress: testAccount.address,
      platform: mockPlatformAdapter,
    };

    // Setup default mocks
    mockGetContractAddress.mockReturnValue(
      "0x641C18E2F286c86f96CE95C8ec1EB9fC0415Ca0e",
    );
    mockGetAbi.mockReturnValue([]);

    controller = new StakingController(mockContext);
  });

  describe("stake", () => {
    it("should stake VANA with string amount", async () => {
      const txHash = await controller.stake({
        entityId: 1n,
        amount: "10",
      });

      expect(txHash).toBe("0xTransactionHash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "stake",
          args: [1n, testAccount.address, 0n],
          value: parseEther("10"),
        }),
      );
    });

    it("should stake VANA with bigint amount", async () => {
      const amount = parseEther("5");
      const txHash = await controller.stake({
        entityId: 2n,
        amount,
      });

      expect(txHash).toBe("0xTransactionHash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "stake",
          args: [2n, testAccount.address, 0n],
          value: amount,
        }),
      );
    });

    it("should stake with custom recipient", async () => {
      const recipient = "0x1234567890123456789012345678901234567890" as const;
      await controller.stake({
        entityId: 1n,
        amount: "1",
        recipient,
      });

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [1n, recipient, 0n],
        }),
      );
    });

    it("should stake with minShares for slippage protection", async () => {
      const minShares = parseEther("9");
      await controller.stake({
        entityId: 1n,
        amount: "10",
        minShares,
      });

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [1n, testAccount.address, minShares],
        }),
      );
    });

    it("should throw error when wallet client is not configured", async () => {
      const readOnlyContext = {
        ...mockContext,
        walletClient: undefined,
      };
      const readOnlyController = new StakingController(readOnlyContext);

      await expect(
        readOnlyController.stake({
          entityId: 1n,
          amount: "10",
        }),
      ).rejects.toThrow(ReadOnlyError);
    });
  });

  describe("getMaxUnstakeAmount", () => {
    it("should return max unstake amount from contract", async () => {
      // Mock the contract read
      const mockRead = vi.fn().mockResolvedValue([
        parseEther("100"), // maxVana
        parseEther("95"), // maxShares
        0n, // limitingFactor (user)
        false, // isInBondingPeriod
      ]);

      // Mock getContract to return our mock
      vi.spyOn(controller as never, "getStakingContract").mockReturnValue({
        read: {
          getMaxUnstakeAmount: mockRead,
        },
      } as never);

      const result = await controller.getMaxUnstakeAmount(
        testAccount.address,
        1n,
      );

      expect(result.maxVana).toBe(parseEther("100"));
      expect(result.maxShares).toBe(parseEther("95"));
      expect(result.limitingFactor).toBe(0);
      expect(result.isInBondingPeriod).toBe(false);
      expect(mockRead).toHaveBeenCalledWith([testAccount.address, 1n]);
    });

    it("should handle bonding period scenario", async () => {
      const mockRead = vi.fn().mockResolvedValue([
        parseEther("50"), // maxVana (cost basis only during bonding)
        parseEther("48"), // maxShares
        0n, // limitingFactor
        true, // isInBondingPeriod
      ]);

      vi.spyOn(controller as never, "getStakingContract").mockReturnValue({
        read: {
          getMaxUnstakeAmount: mockRead,
        },
      } as never);

      const result = await controller.getMaxUnstakeAmount(
        testAccount.address,
        1n,
      );

      expect(result.isInBondingPeriod).toBe(true);
      expect(result.maxVana).toBe(parseEther("50"));
    });

    it("should handle pool-limited scenario", async () => {
      const mockRead = vi.fn().mockResolvedValue([
        parseEther("25"), // maxVana (limited by pool)
        parseEther("24"), // maxShares
        1n, // limitingFactor (activePool)
        false,
      ]);

      vi.spyOn(controller as never, "getStakingContract").mockReturnValue({
        read: {
          getMaxUnstakeAmount: mockRead,
        },
      } as never);

      const result = await controller.getMaxUnstakeAmount(
        testAccount.address,
        1n,
      );

      expect(result.limitingFactor).toBe(1);
    });

    it("should handle treasury-limited scenario", async () => {
      const mockRead = vi.fn().mockResolvedValue([
        parseEther("10"), // maxVana (limited by treasury)
        parseEther("9"), // maxShares
        2n, // limitingFactor (treasury)
        false,
      ]);

      vi.spyOn(controller as never, "getStakingContract").mockReturnValue({
        read: {
          getMaxUnstakeAmount: mockRead,
        },
      } as never);

      const result = await controller.getMaxUnstakeAmount(
        testAccount.address,
        1n,
      );

      expect(result.limitingFactor).toBe(2);
    });
  });

  describe("unstake", () => {
    it("should unstake VANA with bigint amount", async () => {
      const amount = parseEther("50");
      const txHash = await controller.unstake({
        entityId: 1n,
        amount,
      });

      expect(txHash).toBe("0xTransactionHash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "unstakeVana",
          args: [1n, amount, 0n], // Default maxShares is 0
        }),
      );
    });

    it("should unstake VANA with string amount", async () => {
      const txHash = await controller.unstake({
        entityId: 1n,
        amount: "25.5",
      });

      expect(txHash).toBe("0xTransactionHash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "unstakeVana",
          args: [1n, parseEther("25.5"), 0n],
        }),
      );
    });

    it("should unstake with maxShares for slippage protection", async () => {
      const amount = parseEther("100");
      const maxShares = parseEther("95");

      await controller.unstake({
        entityId: 1n,
        amount,
        maxShares,
      });

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [1n, amount, maxShares],
        }),
      );
    });

    it("should pass transaction options", async () => {
      const gas = 500000n;

      await controller.unstake(
        {
          entityId: 1n,
          amount: parseEther("10"),
        },
        { gas },
      );

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          gas,
        }),
      );
    });

    it("should throw error when wallet client is not configured", async () => {
      const readOnlyContext = {
        ...mockContext,
        walletClient: undefined,
      };
      const readOnlyController = new StakingController(readOnlyContext);

      await expect(
        readOnlyController.unstake({
          entityId: 1n,
          amount: parseEther("10"),
        }),
      ).rejects.toThrow(ReadOnlyError);
    });

    it("should pass maxFeePerGas and maxPriorityFeePerGas options", async () => {
      const options = {
        maxFeePerGas: 100n * 10n ** 9n,
        maxPriorityFeePerGas: 2n * 10n ** 9n,
      };

      await controller.unstake(
        {
          entityId: 1n,
          amount: parseEther("10"),
        },
        options,
      );

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFeePerGas: options.maxFeePerGas,
          maxPriorityFeePerGas: options.maxPriorityFeePerGas,
        }),
      );
    });
  });

  describe("computeNewBondingPeriod", () => {
    const bondingPeriodDuration = 5n * 24n * 60n * 60n; // 5 days in seconds
    const currentTimestamp = 1700000000n; // Fixed timestamp for testing

    beforeEach(() => {
      mockPublicClient.getBlock.mockResolvedValue({
        number: 12345n,
        timestamp: currentTimestamp,
      });
    });

    it("should compute bonding period for first stake (no existing position)", async () => {
      // Mock multicall results for first-time staker
      mockPublicClient.multicall.mockResolvedValue([
        {
          status: "success",
          result: {
            shares: 0n,
            costBasis: 0n,
            rewardEligibilityTimestamp: 0n,
            realizedRewards: 0n,
            vestedRewards: 0n,
          },
        },
        { status: "success", result: bondingPeriodDuration },
        { status: "success", result: parseEther("1") }, // 1:1 vanaToShare ratio
      ]);

      const result = await controller.computeNewBondingPeriod({
        staker: testAccount.address,
        entityId: 1n,
        stakeAmount: parseEther("100"),
      });

      // First stake: eligibility = currentTimestamp + bondingPeriod
      const expectedEligibility = currentTimestamp + bondingPeriodDuration;
      expect(result.newEligibilityTimestamp).toBe(expectedEligibility);
      expect(result.newRemainingBondingTime).toBe(bondingPeriodDuration);
      expect(result.currentShares).toBe(0n);
      expect(result.estimatedNewShares).toBe(parseEther("100"));
      expect(result.totalSharesAfter).toBe(parseEther("100"));
      expect(result.bondingPeriodDuration).toBe(bondingPeriodDuration);
    });

    it("should compute weighted average bonding period for additional stake", async () => {
      const existingShares = parseEther("100");
      // Existing eligibility: 2.5 days from now (half through 5-day bonding period)
      const existingEligibility =
        currentTimestamp + (5n * 24n * 60n * 60n) / 2n;

      mockPublicClient.multicall.mockResolvedValue([
        {
          status: "success",
          result: {
            shares: existingShares,
            costBasis: parseEther("100"),
            rewardEligibilityTimestamp: existingEligibility,
            realizedRewards: 0n,
            vestedRewards: 0n,
          },
        },
        { status: "success", result: bondingPeriodDuration },
        { status: "success", result: parseEther("1") }, // 1:1 ratio
      ]);

      const newStakeAmount = parseEther("100"); // Same amount as existing
      const result = await controller.computeNewBondingPeriod({
        staker: testAccount.address,
        entityId: 1n,
        stakeAmount: newStakeAmount,
      });

      // Weighted average: (100 * (now+2.5d) + 100 * (now+5d)) / 200 = now + 3.75d
      const newStakeEligibility = currentTimestamp + bondingPeriodDuration;
      const expectedEligibility =
        (existingShares * existingEligibility +
          parseEther("100") * newStakeEligibility) /
        parseEther("200");

      expect(result.newEligibilityTimestamp).toBe(expectedEligibility);
      expect(result.currentShares).toBe(existingShares);
      expect(result.estimatedNewShares).toBe(parseEther("100"));
      expect(result.totalSharesAfter).toBe(parseEther("200"));
    });

    it("should handle expired bonding period with additional stake", async () => {
      const existingShares = parseEther("100");
      // Eligibility already passed (1 day ago)
      const existingEligibility = currentTimestamp - 24n * 60n * 60n;

      mockPublicClient.multicall.mockResolvedValue([
        {
          status: "success",
          result: {
            shares: existingShares,
            costBasis: parseEther("100"),
            rewardEligibilityTimestamp: existingEligibility,
            realizedRewards: 0n,
            vestedRewards: 0n,
          },
        },
        { status: "success", result: bondingPeriodDuration },
        { status: "success", result: parseEther("1") },
      ]);

      const result = await controller.computeNewBondingPeriod({
        staker: testAccount.address,
        entityId: 1n,
        stakeAmount: parseEther("100"),
      });

      // Current remaining bonding time should be 0 (already eligible)
      expect(result.currentRemainingBondingTime).toBe(0n);
      // New remaining time should be > 0 because of new stake
      expect(result.newRemainingBondingTime).toBeGreaterThan(0n);
    });

    it("should account for different vanaToShare ratios", async () => {
      // 2:1 ratio means 100 VANA = 50 shares
      const vanaToShareRatio = parseEther("0.5");

      mockPublicClient.multicall.mockResolvedValue([
        {
          status: "success",
          result: {
            shares: 0n,
            costBasis: 0n,
            rewardEligibilityTimestamp: 0n,
            realizedRewards: 0n,
            vestedRewards: 0n,
          },
        },
        { status: "success", result: bondingPeriodDuration },
        { status: "success", result: vanaToShareRatio },
      ]);

      const result = await controller.computeNewBondingPeriod({
        staker: testAccount.address,
        entityId: 1n,
        stakeAmount: parseEther("100"),
      });

      // 100 VANA * 0.5 ratio = 50 shares
      expect(result.estimatedNewShares).toBe(parseEther("50"));
      expect(result.totalSharesAfter).toBe(parseEther("50"));
    });

    it("should throw BlockchainError when multicall fails", async () => {
      mockPublicClient.multicall.mockResolvedValue([
        { status: "failure", error: new Error("Call failed") },
        { status: "success", result: bondingPeriodDuration },
        { status: "success", result: parseEther("1") },
      ]);

      await expect(
        controller.computeNewBondingPeriod({
          staker: testAccount.address,
          entityId: 1n,
          stakeAmount: parseEther("100"),
        }),
      ).rejects.toThrow(BlockchainError);
    });

    it("should return correct current timestamp", async () => {
      mockPublicClient.multicall.mockResolvedValue([
        {
          status: "success",
          result: {
            shares: 0n,
            costBasis: 0n,
            rewardEligibilityTimestamp: 0n,
            realizedRewards: 0n,
            vestedRewards: 0n,
          },
        },
        { status: "success", result: bondingPeriodDuration },
        { status: "success", result: parseEther("1") },
      ]);

      const result = await controller.computeNewBondingPeriod({
        staker: testAccount.address,
        entityId: 1n,
        stakeAmount: parseEther("100"),
      });

      expect(result.currentTimestamp).toBe(currentTimestamp);
    });

    it("should handle large stake amounts with proper weighted average", async () => {
      const existingShares = parseEther("100");
      // 1 day remaining in bonding period
      const existingEligibility = currentTimestamp + 1n * 24n * 60n * 60n;

      mockPublicClient.multicall.mockResolvedValue([
        {
          status: "success",
          result: {
            shares: existingShares,
            costBasis: parseEther("100"),
            rewardEligibilityTimestamp: existingEligibility,
            realizedRewards: 0n,
            vestedRewards: 0n,
          },
        },
        { status: "success", result: bondingPeriodDuration },
        { status: "success", result: parseEther("1") },
      ]);

      // Large new stake (10x existing)
      const newStakeAmount = parseEther("1000");
      const result = await controller.computeNewBondingPeriod({
        staker: testAccount.address,
        entityId: 1n,
        stakeAmount: newStakeAmount,
      });

      // With 100 shares at 1 day and 1000 new shares at 5 days,
      // weighted average should be much closer to 5 days
      const newStakeEligibility = currentTimestamp + bondingPeriodDuration;
      const expectedEligibility =
        (existingShares * existingEligibility +
          parseEther("1000") * newStakeEligibility) /
        parseEther("1100");

      expect(result.newEligibilityTimestamp).toBe(expectedEligibility);
      expect(result.totalSharesAfter).toBe(parseEther("1100"));
      // New remaining time should be close to 5 days (at least 4.5 days)
      expect(result.newRemainingBondingTime).toBeGreaterThanOrEqual(
        (9n * 24n * 60n * 60n) / 2n, // 4.5 days
      );
    });
  });
});
