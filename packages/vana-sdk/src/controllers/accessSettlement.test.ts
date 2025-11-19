import { describe, it, expect, vi, beforeEach } from "vitest";
import { AccessSettlementController } from "./accessSettlement";
import type { ControllerContext } from "./permissions";
import { BlockchainError } from "../errors";
import { mockPlatformAdapter } from "../tests/mocks/platformAdapter";

// Mock viem
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    getContract: vi.fn(() => ({
      read: {
        getOperationInvoice: vi.fn(),
        isOperationSettled: vi.fn(),
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
      name: "getOperationInvoice",
      type: "function",
      inputs: [{ name: "operationId", type: "bytes" }],
      outputs: [
        {
          components: [
            { name: "issuer", type: "address" },
            { name: "grantee", type: "address" },
            { name: "price", type: "uint256" },
            { name: "tokenAddress", type: "address" },
            { name: "isSettled", type: "bool" },
          ],
          type: "tuple",
        },
      ],
    },
  ]),
}));

describe("AccessSettlementController", () => {
  let controller: AccessSettlementController;
  let mockContext: ControllerContext;
  let mockContract: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { getContract } = await import("viem");
    mockContract = {
      read: {
        getOperationInvoice: vi.fn(),
        isOperationSettled: vi.fn(),
      },
    };
    vi.mocked(getContract).mockReturnValue(mockContract as any);

    mockContext = {
      walletClient: {
        account: { address: "0xConsumer" },
        chain: { id: 14800, name: "Moksha" },
        getChainId: vi.fn().mockResolvedValue(14800),
        writeContract: vi.fn().mockResolvedValue("0xTransactionHash"),
      } as any,
      publicClient: {
        getChainId: vi.fn().mockResolvedValue(14800),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          transactionHash: "0xTransactionHash",
          status: "success",
        }),
      } as any,
      userAddress: "0xConsumer",
      platform: mockPlatformAdapter,
    };

    controller = new AccessSettlementController(mockContext);
  });

  describe("getOperationInvoice", () => {
    it("should retrieve operation invoice successfully", async () => {
      const mockInvoice = {
        issuer: "0xIssuer",
        grantee: "0xConsumer",
        price: 1000000000000000000n,
        tokenAddress: "0x0000000000000000000000000000000000000000",
        isSettled: false,
      };

      mockContract.read.getOperationInvoice.mockResolvedValue(mockInvoice);

      const result = await controller.getOperationInvoice("op_123");

      expect(result).toEqual({
        issuer: "0xIssuer",
        grantee: "0xConsumer",
        price: 1000000000000000000n,
        tokenAddress: "0x0000000000000000000000000000000000000000",
        isSettled: false,
      });
    });

    it("should handle array-style tuple response from viem", async () => {
      const mockInvoice = [
        "0xIssuer",
        "0xConsumer",
        1000000000000000000n,
        "0x0000000000000000000000000000000000000000",
        false,
      ];

      mockContract.read.getOperationInvoice.mockResolvedValue(mockInvoice);

      const result = await controller.getOperationInvoice("op_123");

      expect(result.issuer).toBe("0xIssuer");
      expect(result.grantee).toBe("0xConsumer");
      expect(result.price).toBe(1000000000000000000n);
      expect(result.tokenAddress).toBe(
        "0x0000000000000000000000000000000000000000",
      );
      expect(result.isSettled).toBe(false);
    });

    it("should convert hex operationId to bytes", async () => {
      mockContract.read.getOperationInvoice.mockResolvedValue({
        issuer: "0xIssuer",
        grantee: "0xConsumer",
        price: 100n,
        tokenAddress: "0x0000000000000000000000000000000000000000",
        isSettled: false,
      });

      await controller.getOperationInvoice("0x123abc");

      expect(mockContract.read.getOperationInvoice).toHaveBeenCalledWith([
        "0x123abc",
      ]);
    });

    it("should convert string operationId to hex bytes", async () => {
      mockContract.read.getOperationInvoice.mockResolvedValue({
        issuer: "0xIssuer",
        grantee: "0xConsumer",
        price: 100n,
        tokenAddress: "0x0000000000000000000000000000000000000000",
        isSettled: false,
      });

      await controller.getOperationInvoice("test_op");

      const expectedBytes = "0x746573745f6f70"; // "test_op" in hex
      expect(mockContract.read.getOperationInvoice).toHaveBeenCalledWith([
        expectedBytes,
      ]);
    });

    it("should throw BlockchainError on contract read failure", async () => {
      mockContract.read.getOperationInvoice.mockRejectedValue(
        new Error("Contract reverted"),
      );

      await expect(controller.getOperationInvoice("op_123")).rejects.toThrow(
        BlockchainError,
      );

      await expect(controller.getOperationInvoice("op_123")).rejects.toThrow(
        "Failed to get operation invoice",
      );
    });
  });

  describe("isOperationSettled", () => {
    it("should return true when operation is settled", async () => {
      mockContract.read.isOperationSettled.mockResolvedValue(true);

      const result = await controller.isOperationSettled("op_123");

      expect(result).toBe(true);
    });

    it("should return false when operation is not settled", async () => {
      mockContract.read.isOperationSettled.mockResolvedValue(false);

      const result = await controller.isOperationSettled("op_123");

      expect(result).toBe(false);
    });

    it("should throw BlockchainError on contract read failure", async () => {
      mockContract.read.isOperationSettled.mockRejectedValue(
        new Error("Contract error"),
      );

      await expect(controller.isOperationSettled("op_123")).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("settlePaymentWithNative", () => {
    it("should settle payment with native VANA successfully", async () => {
      const result = await controller.settlePaymentWithNative(
        "op_123",
        1000000000000000000n,
      );

      expect(result).toEqual({
        hash: "0xTransactionHash",
        operationId: "op_123",
      });

      expect(mockContext.walletClient!.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "settlePaymentWithNative",
          value: 1000000000000000000n,
        }),
      );
    });

    it("should convert operationId to bytes when settling", async () => {
      await controller.settlePaymentWithNative("test_op", 100n);

      const expectedBytes = "0x746573745f6f70";
      expect(mockContext.walletClient!.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [expectedBytes],
        }),
      );
    });

    it("should throw error when wallet is not configured", async () => {
      const contextWithoutWallet = {
        ...mockContext,
        walletClient: undefined,
      };
      const controllerWithoutWallet = new AccessSettlementController(
        contextWithoutWallet,
      );

      await expect(
        controllerWithoutWallet.settlePaymentWithNative("op_123", 100n),
      ).rejects.toThrow("Operation 'settlePaymentWithNative' requires");
    });

    it("should throw BlockchainError on transaction failure", async () => {
      mockContext.walletClient!.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("Transaction reverted"));

      await expect(
        controller.settlePaymentWithNative("op_123", 100n),
      ).rejects.toThrow(BlockchainError);

      await expect(
        controller.settlePaymentWithNative("op_123", 100n),
      ).rejects.toThrow("Failed to settle payment with native VANA");
    });
  });

  describe("settlePaymentWithToken", () => {
    it("should settle payment with ERC20 token successfully", async () => {
      const tokenAddress = "0xTokenAddress" as `0x${string}`;
      const result = await controller.settlePaymentWithToken(
        "op_123",
        tokenAddress,
      );

      expect(result).toEqual({
        hash: "0xTransactionHash",
        operationId: "op_123",
      });

      expect(mockContext.walletClient!.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "settlePaymentWithToken",
          args: [expect.any(String), tokenAddress],
        }),
      );
    });

    it("should throw error when wallet is not configured", async () => {
      const contextWithoutWallet = {
        ...mockContext,
        walletClient: undefined,
      };
      const controllerWithoutWallet = new AccessSettlementController(
        contextWithoutWallet,
      );

      await expect(
        controllerWithoutWallet.settlePaymentWithToken(
          "op_123",
          "0xToken" as `0x${string}`,
        ),
      ).rejects.toThrow("Operation 'settlePaymentWithToken' requires");
    });

    it("should throw BlockchainError on transaction failure", async () => {
      mockContext.walletClient!.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("Insufficient allowance"));

      await expect(
        controller.settlePaymentWithToken("op_123", "0xToken" as `0x${string}`),
      ).rejects.toThrow(BlockchainError);

      await expect(
        controller.settlePaymentWithToken("op_123", "0xToken" as `0x${string}`),
      ).rejects.toThrow("Failed to settle payment with token");
    });
  });

  describe("stringToBytes conversion", () => {
    it("should pass through hex strings as-is", async () => {
      mockContract.read.getOperationInvoice.mockResolvedValue({
        issuer: "0xIssuer",
        grantee: "0xConsumer",
        price: 100n,
        tokenAddress: "0x0000000000000000000000000000000000000000",
        isSettled: false,
      });

      await controller.getOperationInvoice("0xdeadbeef");

      expect(mockContract.read.getOperationInvoice).toHaveBeenCalledWith([
        "0xdeadbeef",
      ]);
    });

    it("should convert ASCII strings to hex", async () => {
      mockContract.read.getOperationInvoice.mockResolvedValue({
        issuer: "0xIssuer",
        grantee: "0xConsumer",
        price: 100n,
        tokenAddress: "0x0000000000000000000000000000000000000000",
        isSettled: false,
      });

      await controller.getOperationInvoice("hello");

      // "hello" = 68 65 6c 6c 6f
      expect(mockContract.read.getOperationInvoice).toHaveBeenCalledWith([
        "0x68656c6c6f",
      ]);
    });
  });
});
