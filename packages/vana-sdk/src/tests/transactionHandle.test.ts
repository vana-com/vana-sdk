import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hash, TransactionReceipt } from "viem";
import { TransactionHandle } from "../utils/transactionHandle";
import type { ControllerContext } from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

describe("TransactionHandle", () => {
  let mockContext: ControllerContext;
  let mockReceipt: TransactionReceipt;
  const testHash =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hash;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReceipt = {
      blockHash: "0xblock123",
      blockNumber: 12345n,
      contractAddress: null,
      cumulativeGasUsed: 100000n,
      effectiveGasPrice: 1000000000n,
      from: "0xfrom",
      gasUsed: 50000n,
      logs: [],
      logsBloom: "0x00",
      status: "success",
      to: "0xto",
      transactionHash: testHash,
      transactionIndex: 0,
      type: "eip1559",
    };

    mockContext = {
      walletClient: {
        getChainId: vi.fn().mockResolvedValue(14800),
      },
      publicClient: {
        waitForTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
      },
      platform: mockPlatformAdapter,
    } as unknown as ControllerContext;
  });

  describe("waitForReceipt", () => {
    it("should use default timeout when no options provided", async () => {
      const handle = new TransactionHandle(mockContext, testHash);

      await handle.waitForReceipt();

      expect(
        mockContext.publicClient.waitForTransactionReceipt,
      ).toHaveBeenCalledWith({
        hash: testHash,
        timeout: 30_000, // Default 30 seconds
      });
    });

    it("should use custom timeout when provided", async () => {
      const handle = new TransactionHandle(mockContext, testHash);
      const customTimeout = 180000; // 3 minutes

      await handle.waitForReceipt({ timeout: customTimeout });

      expect(
        mockContext.publicClient.waitForTransactionReceipt,
      ).toHaveBeenCalledWith({
        hash: testHash,
        timeout: customTimeout,
      });
    });

    it("should use custom gas options when provided", async () => {
      const handle = new TransactionHandle(mockContext, testHash);

      await handle.waitForReceipt({
        timeout: 120000,
        gasLimit: 500000n,
        maxFeePerGas: 50000000000n,
      });

      expect(
        mockContext.publicClient.waitForTransactionReceipt,
      ).toHaveBeenCalledWith({
        hash: testHash,
        timeout: 120000,
      });
    });

    it("should memoize results", async () => {
      const handle = new TransactionHandle(mockContext, testHash);

      const result1 = await handle.waitForReceipt();
      const result2 = await handle.waitForReceipt();

      expect(result1).toBe(result2);
      expect(result1).toBe(mockReceipt);
      expect(
        mockContext.publicClient.waitForTransactionReceipt,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe("waitForEvents", () => {
    it("should throw error when no operation is specified", async () => {
      const handle = new TransactionHandle(mockContext, testHash); // No operation

      await expect(handle.waitForEvents()).rejects.toThrow(
        "Cannot parse events: no operation specified",
      );
    });
  });

  describe("string conversion", () => {
    it("should convert to string via toString()", () => {
      const handle = new TransactionHandle(mockContext, testHash);
      expect(handle.toString()).toBe(testHash);
    });

    it("should serialize to JSON as hash", () => {
      const handle = new TransactionHandle(mockContext, testHash);
      expect(handle.toJSON()).toBe(testHash);
      expect(JSON.stringify(handle)).toBe(`"${testHash}"`);
    });
  });
});
