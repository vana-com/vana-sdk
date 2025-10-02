/**
 * @file Tests for the internal PollingManager class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PollingManager } from "../pollingManager";
import { TransactionPendingError } from "../../errors";
import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
} from "../../types/relayer";
import type { OperationStatus } from "../../types/options";
import type { TransactionReceipt } from "viem";

// Test helper: Create a minimal mock receipt for testing
function createMockReceipt(
  overrides?: Partial<TransactionReceipt>,
): TransactionReceipt {
  return {
    blockHash: "0x123" as `0x${string}`,
    blockNumber: 12345n,
    contractAddress: null,
    cumulativeGasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
    from: "0x742d35Cc6634C0532925a3b844Bc9e7595f0fEd4" as `0x${string}`,
    gasUsed: 21000n,
    logs: [],
    logsBloom: "0x00" as `0x${string}`,
    status: "success",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0fEd4" as `0x${string}`,
    transactionHash: "0xabc" as `0x${string}`,
    transactionIndex: 0,
    type: "legacy",
    ...overrides,
  } as TransactionReceipt;
}

describe("PollingManager", () => {
  let pollingManager: PollingManager;
  let mockRelayerCallback: ReturnType<
    typeof vi.fn<
      (request: UnifiedRelayerRequest) => Promise<UnifiedRelayerResponse>
    >
  >;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRelayerCallback =
      vi.fn<
        (request: UnifiedRelayerRequest) => Promise<UnifiedRelayerResponse>
      >();
    pollingManager = new PollingManager(mockRelayerCallback);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("successful polling", () => {
    it("should poll until operation is confirmed", async () => {
      const operationId = "test-op-123";
      const expectedHash = "0xabcdef123456" as `0x${string}`;

      // Setup mock responses: pending -> submitted -> confirmed
      mockRelayerCallback
        .mockResolvedValueOnce({ type: "pending", operationId })
        .mockResolvedValueOnce({ type: "submitted", hash: expectedHash })
        .mockResolvedValueOnce({
          type: "confirmed",
          hash: expectedHash,
          receipt: createMockReceipt({ blockNumber: 12345n }),
        });

      const statusUpdates: OperationStatus[] = [];
      const pollPromise = pollingManager.startPolling(operationId, {
        onStatusUpdate: (status) => statusUpdates.push(status),
        initialInterval: 100,
        timeout: 5000,
      });

      // Advance through polling intervals
      await vi.advanceTimersByTimeAsync(100); // First poll
      await vi.advanceTimersByTimeAsync(150); // Second poll (with backoff)
      await vi.advanceTimersByTimeAsync(225); // Third poll (more backoff)

      const result = await pollPromise;

      expect(result.hash).toBe(expectedHash);
      expect(result.receipt).toBeDefined();

      expect(statusUpdates).toHaveLength(3);
      expect(statusUpdates[0]).toEqual({ type: "pending", operationId });
      expect(statusUpdates[1]).toEqual({
        type: "submitted",
        hash: expectedHash,
      });
      expect(statusUpdates[2].type).toBe("confirmed");
      if (statusUpdates[2].type === "confirmed") {
        expect(statusUpdates[2].hash).toBe(expectedHash);
        expect(statusUpdates[2].receipt).toBeDefined();
      }

      expect(mockRelayerCallback).toHaveBeenCalledTimes(3);
      expect(mockRelayerCallback).toHaveBeenCalledWith({
        type: "status_check",
        operationId,
      });
    });

    it("should handle immediate confirmation", async () => {
      const operationId = "test-op-456";
      const expectedHash = "0xfedcba987654" as `0x${string}`;

      // Immediately return confirmed
      mockRelayerCallback.mockResolvedValueOnce({
        type: "confirmed",
        hash: expectedHash,
        receipt: createMockReceipt({ blockNumber: 67890n }),
      });

      const result = await pollingManager.startPolling(operationId);

      expect(result.hash).toBe(expectedHash);
      expect(result.receipt).toBeDefined();

      expect(mockRelayerCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should throw when operation fails", async () => {
      const operationId = "test-op-fail";
      const errorMessage = "Transaction reverted: insufficient funds";

      mockRelayerCallback
        .mockResolvedValueOnce({ type: "pending", operationId })
        .mockResolvedValueOnce({ type: "error", error: errorMessage });

      const pollPromise = pollingManager.startPolling(operationId, {
        initialInterval: 100,
        timeout: 5000,
      });

      // Handle promise immediately to avoid unhandled rejection
      const errorPromise = expect(pollPromise).rejects.toThrow(errorMessage);

      await vi.advanceTimersByTimeAsync(100); // First poll
      await vi.advanceTimersByTimeAsync(150); // Second poll - error

      await errorPromise;
      expect(mockRelayerCallback).toHaveBeenCalledTimes(2);
    });

    it("should throw TransactionPendingError on timeout", async () => {
      const operationId = "test-op-timeout";

      // Always return pending
      mockRelayerCallback.mockResolvedValue({
        type: "pending",
        operationId,
      });

      const pollPromise = pollingManager.startPolling(operationId, {
        initialInterval: 100,
        timeout: 1000, // Short timeout for testing
      });

      // Handle promise immediately to avoid unhandled rejection
      const errorPromise = pollPromise.catch((e) => e);

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(1100);

      const error = await errorPromise;
      expect(error).toBeInstanceOf(TransactionPendingError);
      expect(error.operationId).toBe(operationId);
      expect(error.message).toContain("timeout");
    });

    it("should retry on network errors", async () => {
      const operationId = "test-op-network";
      const expectedHash = "0x123abc456def" as `0x${string}`;

      // Network error, then success
      mockRelayerCallback
        .mockRejectedValueOnce(new Error("Network error: ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValueOnce({
          type: "confirmed",
          hash: expectedHash,
        });

      const pollPromise = pollingManager.startPolling(operationId, {
        initialInterval: 100,
        timeout: 5000,
      });

      // Advance through polling intervals with network errors
      await vi.advanceTimersByTimeAsync(100); // First poll - network error
      await vi.advanceTimersByTimeAsync(150); // Second poll - fetch failed
      await vi.advanceTimersByTimeAsync(225); // Third poll - success

      const result = await pollPromise;

      expect(result.hash).toBe(expectedHash);
      expect(mockRelayerCallback).toHaveBeenCalledTimes(3);
    });

    it("should fail after too many network errors", async () => {
      const operationId = "test-op-many-errors";

      // Always fail with network error
      mockRelayerCallback.mockRejectedValue(
        new Error("Network error: timeout"),
      );

      const pollPromise = pollingManager.startPolling(operationId, {
        initialInterval: 50,
        timeout: 2000, // Reduced timeout to fit within test timeout
        maxInterval: 100, // Keep intervals small for faster test
      });

      // Handle promise immediately to avoid unhandled rejection
      const errorPromise = pollPromise.catch((e) => e);

      // Advance through multiple retry attempts
      for (let i = 0; i < 7; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      const error = await errorPromise;
      expect(error).toBeInstanceOf(TransactionPendingError);
      expect(error.message).toMatch(/Failed to poll after \d+ attempts/);
    }, 10000); // Increase test timeout for safety
  });

  describe("cancellation", () => {
    it("should cancel polling when AbortSignal is triggered", async () => {
      const operationId = "test-op-cancel";
      const controller = new AbortController();

      // Always return pending
      mockRelayerCallback.mockResolvedValue({
        type: "pending",
        operationId,
      });

      const pollPromise = pollingManager.startPolling(operationId, {
        signal: controller.signal,
        initialInterval: 100,
        timeout: 10000,
      });

      // Start polling
      await vi.advanceTimersByTimeAsync(100);

      // Cancel
      controller.abort();

      await expect(pollPromise).rejects.toThrow("Polling cancelled");

      // Should have made at least one call before cancellation
      expect(mockRelayerCallback).toHaveBeenCalled();
    });

    it("should clean up resources on cancellation", async () => {
      const operationId = "test-op-cleanup";
      const controller = new AbortController();

      mockRelayerCallback.mockResolvedValue({
        type: "pending",
        operationId,
      });

      const pollPromise = pollingManager.startPolling(operationId, {
        signal: controller.signal,
        initialInterval: 100,
      });

      await vi.advanceTimersByTimeAsync(50);
      controller.abort();

      try {
        await pollPromise;
      } catch {
        // Expected to throw
      }

      // Advance time significantly - should not make more calls
      const callCount = mockRelayerCallback.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockRelayerCallback).toHaveBeenCalledTimes(callCount);
    });
  });

  describe("status updates", () => {
    it("should notify on status changes", async () => {
      const operationId = "test-op-status";
      const expectedHash = "0xaaa111bbb222" as `0x${string}`;
      const statusUpdates: OperationStatus[] = [];

      // Setup varied status progression
      mockRelayerCallback
        .mockResolvedValueOnce({ type: "pending", operationId })
        .mockResolvedValueOnce({ type: "pending", operationId }) // Same status - no update
        .mockResolvedValueOnce({
          type: "direct",
          result: { status: "queued", position: 5 },
        })
        .mockResolvedValueOnce({
          type: "direct",
          result: { status: "queued", position: 3 }, // Position changed
        })
        .mockResolvedValueOnce({
          type: "direct",
          result: { status: "processing" },
        })
        .mockResolvedValueOnce({ type: "submitted", hash: expectedHash })
        .mockResolvedValueOnce({ type: "confirmed", hash: expectedHash });

      const pollPromise = pollingManager.startPolling(operationId, {
        onStatusUpdate: (status) => statusUpdates.push(status),
        initialInterval: 50,
        timeout: 10000,
        jitter: 0, // Disable jitter for predictable testing
      });

      // Advance through all polls with exponential backoff
      // 50ms -> 75ms -> 112.5ms -> 168.75ms -> 253.125ms -> 379.6875ms -> confirmed
      await vi.advanceTimersByTimeAsync(50); // First poll
      await vi.advanceTimersByTimeAsync(75); // Second poll (50 * 1.5)
      await vi.advanceTimersByTimeAsync(113); // Third poll
      await vi.advanceTimersByTimeAsync(169); // Fourth poll
      await vi.advanceTimersByTimeAsync(253); // Fifth poll
      await vi.advanceTimersByTimeAsync(380); // Sixth poll
      await vi.advanceTimersByTimeAsync(570); // Seventh poll - confirmed

      await pollPromise;

      // Should have 6 status updates (skipping the duplicate pending)
      expect(statusUpdates).toHaveLength(6);
      expect(statusUpdates[0].type).toBe("pending");
      expect(statusUpdates[1].type).toBe("queued");
      expect(statusUpdates[2].type).toBe("queued");
      expect(statusUpdates[3].type).toBe("processing");
      expect(statusUpdates[4].type).toBe("submitted");
      expect(statusUpdates[5].type).toBe("confirmed");

      // Check queue position updates
      const queuedUpdates = statusUpdates.filter(
        (s) => s.type === "queued",
      ) as Array<{ type: "queued"; position?: number }>;
      expect(queuedUpdates[0].position).toBe(5);
      expect(queuedUpdates[1].position).toBe(3);
    });

    it("should not notify when status hasn't changed", async () => {
      const operationId = "test-op-no-change";
      const expectedHash = "0xccc333ddd444" as `0x${string}`;
      const statusUpdates: OperationStatus[] = [];

      // Return same status multiple times
      mockRelayerCallback
        .mockResolvedValueOnce({ type: "pending", operationId })
        .mockResolvedValueOnce({ type: "pending", operationId })
        .mockResolvedValueOnce({ type: "pending", operationId })
        .mockResolvedValueOnce({ type: "confirmed", hash: expectedHash });

      const pollPromise = pollingManager.startPolling(operationId, {
        onStatusUpdate: (status) => statusUpdates.push(status),
        initialInterval: 50,
      });

      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await pollPromise;

      // Should only have 2 updates: initial pending and final confirmed
      expect(statusUpdates).toHaveLength(2);
      expect(statusUpdates[0].type).toBe("pending");
      expect(statusUpdates[1].type).toBe("confirmed");
    });
  });

  describe("exponential backoff", () => {
    it("should increase polling interval with backoff", async () => {
      const operationId = "test-op-backoff";
      const callTimes: number[] = [];
      let pollCount = 0;

      // Track when each call is made and stop after 5 polls
      mockRelayerCallback.mockImplementation(async () => {
        callTimes.push(Date.now());
        pollCount++;
        if (pollCount >= 5) {
          return {
            type: "confirmed",
            hash: "0xtest" as `0x${string}`,
          } as UnifiedRelayerResponse;
        }
        return { type: "pending", operationId } as UnifiedRelayerResponse;
      });

      const pollPromise = pollingManager.startPolling(operationId, {
        initialInterval: 1000,
        backoffMultiplier: 1.5,
        maxInterval: 5000,
        timeout: 20000,
        jitter: 0, // Disable jitter for predictable testing
      });

      // Advance through several polling cycles
      await vi.advanceTimersByTimeAsync(1000); // First poll at 1s
      await vi.advanceTimersByTimeAsync(1500); // Second poll at 1.5s (1 * 1.5)
      await vi.advanceTimersByTimeAsync(2250); // Third poll at 2.25s (1.5 * 1.5)
      await vi.advanceTimersByTimeAsync(3375); // Fourth poll at 3.375s (2.25 * 1.5)
      await vi.advanceTimersByTimeAsync(5000); // Fifth poll at 5s (capped at max)

      await pollPromise;

      expect(mockRelayerCallback).toHaveBeenCalledTimes(5);

      // Verify intervals are increasing with backoff (accounting for capping at maxInterval)
      const intervals: number[] = [];
      for (let i = 1; i < callTimes.length; i++) {
        intervals.push(callTimes[i] - callTimes[i - 1]);
      }

      expect(intervals[0]).toBeCloseTo(1000, -1);
      expect(intervals[1]).toBeCloseTo(1500, -1);
      expect(intervals[2]).toBeCloseTo(2250, -1);
      expect(intervals[3]).toBeCloseTo(3375, -1);
    });

    it("should apply jitter to prevent thundering herd", async () => {
      const operationId = "test-op-jitter";
      const callTimes: number[] = [];
      let callCount = 0;

      // Track when each call is made and end after 4 polls
      mockRelayerCallback.mockImplementation(async () => {
        callTimes.push(Date.now());
        callCount++;
        if (callCount >= 4) {
          return {
            type: "confirmed",
            hash: "0xjitter" as `0x${string}`,
          } as UnifiedRelayerResponse;
        }
        return { type: "pending", operationId } as UnifiedRelayerResponse;
      });

      // Mock Math.random to get predictable but different values for jitter
      const randomSpy = vi
        .spyOn(Math, "random")
        .mockReturnValueOnce(0.2) // First poll: -60% of jitter range
        .mockReturnValueOnce(0.8) // Second poll: +60% of jitter range
        .mockReturnValueOnce(0.5) // Third poll: no jitter
        .mockReturnValueOnce(0.3); // Fourth poll: -40% of jitter range

      const pollPromise = pollingManager.startPolling(operationId, {
        initialInterval: 1000,
        jitter: 0.2, // 20% jitter (±200ms)
        timeout: 15000,
      });

      // Advance through multiple polls
      // Jitter calculation: (random - 0.5) * 2 * (interval * jitter)
      // Poll 1: 1000ms + (0.2 - 0.5) * 2 * 200 = 1000 - 120 = 880ms
      await vi.advanceTimersByTimeAsync(880);
      // Poll 2: 1500ms + (0.8 - 0.5) * 2 * 300 = 1500 + 180 = 1680ms
      await vi.advanceTimersByTimeAsync(1680);
      // Poll 3: 2250ms + (0.5 - 0.5) * 2 * 450 = 2250ms (no jitter)
      await vi.advanceTimersByTimeAsync(2250);
      // Poll 4: 3375ms + (0.3 - 0.5) * 2 * 675 = 3375 - 270 = 3105ms
      await vi.advanceTimersByTimeAsync(3105);

      await pollPromise;

      // Verify intervals had variation
      const intervals: number[] = [];
      for (let i = 1; i < callTimes.length; i++) {
        intervals.push(callTimes[i] - callTimes[i - 1]);
      }

      // Check that we have different intervals due to jitter
      const uniqueIntervals = new Set(intervals);
      expect(uniqueIntervals.size).toBeGreaterThan(1);
      expect(mockRelayerCallback).toHaveBeenCalledTimes(4);

      // Verify approximate intervals (with some tolerance for timer precision)
      expect(intervals[0]).toBeCloseTo(880, -1);
      expect(intervals[1]).toBeCloseTo(1680, -1);
      expect(intervals[2]).toBeCloseTo(2250, -1);

      randomSpy.mockRestore();
    });
  });
});
