/**
 * Tests for TransactionHandle utility
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransactionHandle } from "../transactionHandle";
import type { ControllerContext } from "../../controllers/permissions";
import type { TransactionOperation } from "../../config/eventMappings";

// Mock the transactionParsing module
vi.mock("../transactionParsing", () => ({
  parseTransactionResult: vi.fn(),
}));

const { parseTransactionResult } = await import("../transactionParsing");

describe("TransactionHandle", () => {
  let mockContext: ControllerContext;
  let mockPublicClient: any;
  const testHash = "0x1234567890abcdef" as const;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPublicClient = {
      waitForTransactionReceipt: vi.fn(),
    };

    mockContext = {
      publicClient: mockPublicClient,
      walletClient: {} as any,
      relayerUrl: "https://test-relayer.com",
      relayerCallbacks: undefined,
    };
  });

  describe("constructor", () => {
    it("should create handle with hash only", () => {
      const handle = new TransactionHandle(mockContext, testHash);

      expect(handle.hash).toBe(testHash);
    });

    it("should create handle with operation", () => {
      const operation: TransactionOperation = "submitPermissionGrant";
      const handle = new TransactionHandle(mockContext, testHash, operation);

      expect(handle.hash).toBe(testHash);
    });
  });

  describe("waitForReceipt", () => {
    it("should wait for transaction receipt", async () => {
      const mockReceipt = {
        transactionHash: testHash,
        gasUsed: BigInt(21000),
        status: "success" as const,
        blockNumber: BigInt(123),
      };

      mockPublicClient.waitForTransactionReceipt.mockResolvedValueOnce(
        mockReceipt,
      );

      const handle = new TransactionHandle(mockContext, testHash);
      const receipt = await handle.waitForReceipt();

      expect(receipt).toEqual(mockReceipt);
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: testHash,
        timeout: 30_000,
      });
    });

    it("should use custom timeout", async () => {
      const mockReceipt = { status: "success" as const };
      mockPublicClient.waitForTransactionReceipt.mockResolvedValueOnce(
        mockReceipt,
      );

      const handle = new TransactionHandle(mockContext, testHash);
      await handle.waitForReceipt({ timeout: 60_000 });

      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: testHash,
        timeout: 60_000,
      });
    });

    it("should memoize receipt results", async () => {
      const mockReceipt = { status: "success" as const };
      mockPublicClient.waitForTransactionReceipt.mockResolvedValueOnce(
        mockReceipt,
      );

      const handle = new TransactionHandle(mockContext, testHash);

      // Call twice
      const receipt1 = await handle.waitForReceipt();
      const receipt2 = await handle.waitForReceipt();

      expect(receipt1).toBe(receipt2);
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(
        1,
      );
    });

    it("should memoize promise to prevent duplicate calls", async () => {
      const mockReceipt = { status: "success" as const };
      mockPublicClient.waitForTransactionReceipt.mockResolvedValueOnce(
        mockReceipt,
      );

      const handle = new TransactionHandle(mockContext, testHash);

      // Call simultaneously before first resolves
      const [receipt1, receipt2] = await Promise.all([
        handle.waitForReceipt(),
        handle.waitForReceipt(),
      ]);

      expect(receipt1).toBe(receipt2);
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(
        1,
      );
    });

    it("should handle receipt failures", async () => {
      const error = new Error("Transaction failed");
      mockPublicClient.waitForTransactionReceipt.mockRejectedValueOnce(error);

      const handle = new TransactionHandle(mockContext, testHash);

      await expect(handle.waitForReceipt()).rejects.toThrow(
        "Transaction failed",
      );
    });
  });

  describe("waitForEvents", () => {
    it("should parse transaction events with operation", async () => {
      const mockEventData = { permissionId: BigInt(123) };
      vi.mocked(parseTransactionResult).mockResolvedValueOnce(mockEventData);

      const operation: TransactionOperation = "submitPermissionGrant";
      const handle = new TransactionHandle(mockContext, testHash, operation);

      const events = await handle.waitForEvents();

      expect(events).toEqual(mockEventData);
      expect(parseTransactionResult).toHaveBeenCalledWith(
        mockContext,
        testHash,
        operation,
      );
    });

    it("should throw error when no operation specified", async () => {
      const handle = new TransactionHandle(mockContext, testHash);

      await expect(handle.waitForEvents()).rejects.toThrow(
        "Cannot parse events: no operation specified",
      );
      expect(parseTransactionResult).not.toHaveBeenCalled();
    });

    it("should memoize event data", async () => {
      const mockEventData = { permissionId: BigInt(123) };
      vi.mocked(parseTransactionResult).mockResolvedValueOnce(mockEventData);

      const operation: TransactionOperation = "submitPermissionGrant";
      const handle = new TransactionHandle(mockContext, testHash, operation);

      // Call twice
      const events1 = await handle.waitForEvents();
      const events2 = await handle.waitForEvents();

      expect(events1).toBe(events2);
      expect(parseTransactionResult).toHaveBeenCalledTimes(1);
    });

    it("should memoize promise to prevent duplicate parsing", async () => {
      const mockEventData = { permissionId: BigInt(123) };
      vi.mocked(parseTransactionResult).mockResolvedValueOnce(mockEventData);

      const operation: TransactionOperation = "submitPermissionGrant";
      const handle = new TransactionHandle(mockContext, testHash, operation);

      // Call simultaneously before first resolves
      const [events1, events2] = await Promise.all([
        handle.waitForEvents(),
        handle.waitForEvents(),
      ]);

      expect(events1).toBe(events2);
      expect(parseTransactionResult).toHaveBeenCalledTimes(1);
    });

    it("should handle parsing failures", async () => {
      const error = new Error("Parse failed");
      vi.mocked(parseTransactionResult).mockRejectedValueOnce(error);

      const operation: TransactionOperation = "submitPermissionGrant";
      const handle = new TransactionHandle(mockContext, testHash, operation);

      await expect(handle.waitForEvents()).rejects.toThrow("Parse failed");
    });
  });

  describe("toString", () => {
    it("should return hash as string", () => {
      const handle = new TransactionHandle(mockContext, testHash);

      expect(handle.toString()).toBe(testHash);
      expect(String(handle)).toBe(testHash);
    });
  });

  describe("toJSON", () => {
    it("should return hash for JSON serialization", () => {
      const handle = new TransactionHandle(mockContext, testHash);

      expect(handle.toJSON()).toBe(testHash);
      expect(JSON.stringify(handle)).toBe(`"${testHash}"`);
    });
  });

  describe("Node.js inspect", () => {
    it("should return formatted string for debugging without operation", () => {
      const handle = new TransactionHandle(mockContext, testHash);

      const inspectSymbol = Symbol.for("nodejs.util.inspect.custom");
      const result = handle[inspectSymbol]();

      expect(result).toBe(
        `TransactionHandle { hash: '${testHash}', operation: 'none' }`,
      );
    });

    it("should return formatted string for debugging with operation", () => {
      const operation: TransactionOperation = "submitPermissionGrant";
      const handle = new TransactionHandle(mockContext, testHash, operation);

      const inspectSymbol = Symbol.for("nodejs.util.inspect.custom");
      const result = handle[inspectSymbol]();

      expect(result).toBe(
        `TransactionHandle { hash: '${testHash}', operation: '${operation}' }`,
      );
    });
  });

  describe("type coercion and compatibility", () => {
    it("should work as a Hash type", () => {
      const handle = new TransactionHandle(mockContext, testHash);

      // Should be usable where Hash is expected
      const hashVariable: string = handle.toString();
      expect(hashVariable).toBe(testHash);
    });

    it("should work in template literals", () => {
      const handle = new TransactionHandle(mockContext, testHash);

      const message = `Transaction submitted: ${handle}`;
      expect(message).toBe(`Transaction submitted: ${testHash}`);
    });
  });

  describe("error scenarios", () => {
    it("should handle context without publicClient", async () => {
      const brokenContext = {
        ...mockContext,
        publicClient: null as any,
      };

      const handle = new TransactionHandle(brokenContext, testHash);

      await expect(handle.waitForReceipt()).rejects.toThrow();
    });

    it("should handle transaction with invalid hash format", async () => {
      const invalidHash = "not-a-hash" as any;

      const handle = new TransactionHandle(mockContext, invalidHash);

      expect(handle.hash).toBe(invalidHash);
      expect(handle.toString()).toBe(invalidHash);
    });
  });
});
