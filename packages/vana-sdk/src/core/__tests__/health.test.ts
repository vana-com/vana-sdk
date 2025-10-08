import { describe, it, expect, beforeEach, vi } from "vitest";
import { SystemHealthChecker } from "../health";
import type { IAtomicStore } from "../../types/atomicStore";
import type { IOperationStore } from "../../types/operationStore";
import type { PublicClient } from "viem";

describe("SystemHealthChecker", () => {
  let mockAtomicStore: IAtomicStore;
  let mockOperationStore: IOperationStore;
  let mockPublicClient: PublicClient;
  let healthChecker: SystemHealthChecker;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAtomicStore = {
      incr: vi.fn().mockResolvedValue(1),
      acquireLock: vi.fn().mockResolvedValue("lock-123"),
      releaseLock: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue("test"),
      set: vi.fn().mockResolvedValue(undefined),
      setWithTTL: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockOperationStore = {
      storeOperation: vi.fn().mockResolvedValue(undefined),
      getQueuedOperations: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      getProcessingOperations: vi.fn().mockResolvedValue([]),
      getFailedOperations: vi.fn().mockResolvedValue([]),
    };

    mockPublicClient = {
      getBlockNumber: vi.fn().mockResolvedValue(1000n),
      getTransactionCount: vi.fn().mockResolvedValue(10n),
    } as any;

    healthChecker = new SystemHealthChecker({
      atomicStore: mockAtomicStore,
      operationStore: mockOperationStore,
      publicClient: mockPublicClient,
      chainId: 14800,
    });
  });

  describe("check", () => {
    it("should return healthy status when all checks pass", async () => {
      const health = await healthChecker.check();

      expect(health.status).toBe("healthy");
      expect(health.timestamp).toBeDefined();
      expect(health.checks.atomicStore.status).toBe("healthy");
      expect(health.checks.operationStore.status).toBe("healthy");
      expect(health.checks.blockchain.status).toBe("healthy");
      expect(health.errors).toBeUndefined();
    });

    it("should return degraded status for high latency", async () => {
      // Simulate high latency
      vi.mocked(mockAtomicStore.set).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1100)),
      );

      const health = await healthChecker.check();

      expect(health.status).toBe("degraded");
      expect(health.checks.atomicStore.status).toBe("degraded");
      expect(health.checks.atomicStore.message).toContain("High latency");
      expect(health.errors).toHaveLength(1);
    });

    it("should return unhealthy for atomic store failure", async () => {
      vi.mocked(mockAtomicStore.set).mockRejectedValue(
        new Error("Connection failed"),
      );

      const health = await healthChecker.check();

      expect(health.status).toBe("unhealthy");
      expect(health.checks.atomicStore.status).toBe("unhealthy");
      expect(health.checks.atomicStore.message).toBe("Connection failed");
    });

    it("should check nonces for configured addresses", async () => {
      const checker = new SystemHealthChecker({
        atomicStore: mockAtomicStore,
        operationStore: mockOperationStore,
        publicClient: mockPublicClient,
        chainId: 14800,
        addresses: ["0x123", "0x456"],
      });

      vi.mocked(mockAtomicStore.get).mockResolvedValue("5");
      vi.mocked(mockPublicClient.getTransactionCount)
        .mockResolvedValueOnce(6n as any) // pending
        .mockResolvedValueOnce(5n as any) // confirmed
        .mockResolvedValueOnce(6n as any) // pending for 2nd address
        .mockResolvedValueOnce(5n as any); // confirmed for 2nd address

      const health = await checker.check();

      expect(health.checks.nonces).toHaveLength(2);
      expect(health.checks.nonces![0].status).toBe("healthy");
      expect(health.checks.nonces![0].address).toBe("0x123");
    });

    it("should detect stuck nonces", async () => {
      const checker = new SystemHealthChecker({
        atomicStore: mockAtomicStore,
        operationStore: mockOperationStore,
        publicClient: mockPublicClient,
        chainId: 14800,
        addresses: ["0x123"],
      });

      vi.mocked(mockAtomicStore.get).mockResolvedValue("10");
      vi.mocked(mockPublicClient.getTransactionCount)
        .mockResolvedValueOnce(16n as any) // pending (gap > 5)
        .mockResolvedValueOnce(10n as any); // confirmed

      const health = await checker.check();

      expect(health.checks.nonces?.[0].status).toBe("stuck");
      expect(health.checks.nonces?.[0].gap).toBe(6);
    });

    it("should detect desynced nonces", async () => {
      const checker = new SystemHealthChecker({
        atomicStore: mockAtomicStore,
        operationStore: mockOperationStore,
        publicClient: mockPublicClient,
        chainId: 14800,
        addresses: ["0x123"],
      });

      vi.mocked(mockAtomicStore.get).mockResolvedValue("5");
      vi.mocked(mockPublicClient.getTransactionCount)
        .mockResolvedValueOnce(10n as any) // pending
        .mockResolvedValueOnce(10n as any); // confirmed

      const health = await checker.check();

      expect(health.checks.nonces?.[0].status).toBe("desynced");
    });

    it("should check queue health", async () => {
      const now = Date.now();
      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        { id: "1", status: "queued", data: "{}", createdAt: now - 400000 }, // 400s old (stale)
        { id: "2", status: "queued", data: "{}" },
      ]);
      vi.mocked(mockOperationStore.getProcessingOperations!).mockResolvedValue([
        { id: "3", status: "processing", data: "{}" },
      ]);
      vi.mocked(mockOperationStore.getFailedOperations!).mockResolvedValue([
        { id: "4", status: "failed", data: "{}" },
        { id: "5", status: "failed", data: "{}" },
      ]);

      const health = await healthChecker.check();

      expect(health.checks.queue).toBeDefined();
      expect(health.checks.queue!.pendingCount).toBe(2);
      expect(health.checks.queue!.processingCount).toBe(1);
      expect(health.checks.queue!.failedCount).toBe(2);
      expect(health.checks.queue!.isStale).toBe(true);
      expect(health.errors).toContain(
        "Queue is stale (oldest pending: 400s ago)",
      );
    });

    it("should handle operation store errors gracefully", async () => {
      vi.mocked(mockOperationStore.getQueuedOperations).mockRejectedValue(
        new Error("Database error"),
      );

      const health = await healthChecker.check();

      expect(health.checks.operationStore.status).toBe("unhealthy");
      expect(health.checks.queue).toBeUndefined();
    });

    it("should handle blockchain RPC errors", async () => {
      vi.mocked(mockPublicClient.getBlockNumber).mockRejectedValue(
        new Error("RPC timeout"),
      );

      const health = await healthChecker.check();

      expect(health.checks.blockchain.status).toBe("unhealthy");
      expect(health.checks.blockchain.message).toBe("RPC timeout");
    });

    it("should detect invalid block number", async () => {
      vi.mocked(mockPublicClient.getBlockNumber).mockResolvedValue(0n);

      const health = await healthChecker.check();

      expect(health.checks.blockchain.status).toBe("unhealthy");
      expect(health.checks.blockchain.message).toBe("Invalid block number");
    });

    it("should handle high blockchain latency", async () => {
      vi.mocked(mockPublicClient.getBlockNumber).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              resolve(1000n);
            }, 5100),
          ),
      );

      const health = await healthChecker.check();

      expect(health.checks.blockchain.status).toBe("degraded");
      expect(health.checks.blockchain.message).toContain("High latency");
    }, 10000); // Increase timeout for this test

    it("should clean up test keys from atomic store", async () => {
      await healthChecker.check();

      expect(mockAtomicStore.delete).toHaveBeenCalledWith(
        expect.stringContaining("health:check:"),
      );
    });

    it("should handle missing delete method gracefully", async () => {
      delete (mockAtomicStore as any).delete;

      const health = await healthChecker.check();

      expect(health.status).toBe("healthy");
      expect(health.checks.atomicStore.status).toBe("healthy");
    });
  });

  describe("getSimpleHealth", () => {
    it("should return simplified health status", async () => {
      const simple = await healthChecker.getSimpleHealth();

      expect(simple.healthy).toBe(true);
      expect(simple.status).toBe("healthy");
      expect(simple.timestamp).toBeDefined();
      expect(simple.errors).toBeUndefined();
    });

    it("should include errors when unhealthy", async () => {
      vi.mocked(mockAtomicStore.set).mockRejectedValue(new Error("Failed"));

      const simple = await healthChecker.getSimpleHealth();

      expect(simple.healthy).toBe(false);
      expect(simple.status).toBe("unhealthy");
      expect(simple.errors).toBeDefined();
      expect(simple.errors).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("should handle zero transaction count", async () => {
      const checker = new SystemHealthChecker({
        atomicStore: mockAtomicStore,
        operationStore: mockOperationStore,
        publicClient: mockPublicClient,
        chainId: 14800,
        addresses: ["0x123"],
      });

      vi.mocked(mockAtomicStore.get).mockResolvedValue(null);
      vi.mocked(mockPublicClient.getTransactionCount)
        .mockResolvedValueOnce(0n as any) // pending
        .mockResolvedValueOnce(0n as any); // confirmed

      const health = await checker.check();

      expect(health.checks.nonces?.[0].blockchainPending).toBe(-1);
      expect(health.checks.nonces?.[0].blockchainConfirmed).toBe(-1);
    });

    it("should handle nonce check errors", async () => {
      const checker = new SystemHealthChecker({
        atomicStore: mockAtomicStore,
        operationStore: mockOperationStore,
        publicClient: mockPublicClient,
        chainId: 14800,
        addresses: ["0x123"],
      });

      vi.mocked(mockAtomicStore.get).mockRejectedValue(
        new Error("Redis error"),
      );

      const health = await checker.check();

      expect(health.checks.nonces?.[0].status).toBe("desynced");
      expect(health.checks.nonces?.[0].lastUsed).toBe(-1);
    });

    it("should handle missing optional operation store methods", async () => {
      delete (mockOperationStore as any).getProcessingOperations;
      delete (mockOperationStore as any).getFailedOperations;

      const health = await healthChecker.check();

      expect(health.checks.queue?.processingCount).toBe(0);
      expect(health.checks.queue?.failedCount).toBe(0);
    });

    it("should respect custom stale threshold", async () => {
      const checker = new SystemHealthChecker({
        atomicStore: mockAtomicStore,
        operationStore: mockOperationStore,
        publicClient: mockPublicClient,
        chainId: 14800,
        staleThresholdSeconds: 60, // 1 minute
      });

      const now = Date.now();
      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        { id: "1", status: "queued", data: "{}", createdAt: now - 70000 }, // 70s old
      ]);

      const health = await checker.check();

      expect(health.checks.queue?.isStale).toBe(true);
      expect(health.checks.queue?.oldestPending).toBe(70);
    });
  });
});
