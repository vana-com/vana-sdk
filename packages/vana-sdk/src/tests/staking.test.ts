import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import { StakingController } from "../controllers/staking";
import type { ControllerContext } from "../types/controller-context";
import { BlockchainError } from "../errors";
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
      getBlock: vi.fn().mockResolvedValue({ timestamp: BigInt(Date.now()) }),
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
      ).rejects.toThrow(BlockchainError);
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
      ).rejects.toThrow(BlockchainError);
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
});
