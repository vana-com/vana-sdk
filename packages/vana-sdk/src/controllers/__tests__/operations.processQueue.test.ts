import { describe, it, expect, beforeEach, vi } from "vitest";
import { OperationsController } from "../operations";
import type {
  IOperationStore,
  StoredOperation,
} from "../../types/operationStore";
import type { IAtomicStore } from "../../types/atomicStore";
import type { WalletClient, PublicClient } from "viem";
import { DistributedNonceManager } from "../../core/nonceManager";

vi.mock("../../core/nonceManager");

describe("OperationsController - processQueue", () => {
  let controller: OperationsController;
  let mockOperationStore: IOperationStore;
  let mockAtomicStore: IAtomicStore;
  let mockWalletClient: WalletClient;
  let mockPublicClient: PublicClient;
  let mockNonceManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock stores
    mockOperationStore = {
      storeOperation: vi.fn(),
      getQueuedOperations: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn(),
    };

    mockAtomicStore = {
      incr: vi.fn().mockResolvedValue(1),
      acquireLock: vi.fn().mockResolvedValue("lock-123"),
      releaseLock: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    };

    // Mock clients
    mockWalletClient = {
      getChainId: vi.fn().mockResolvedValue(14800),
      getAddresses: vi.fn().mockResolvedValue(["0x123"]),
      sendTransaction: vi.fn().mockResolvedValue("0xhash123"),
      account: { address: "0x123" },
      chain: { id: 14800 },
    } as any;

    mockPublicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        transactionHash: "0xhash123",
      }),
    } as any;

    // Mock nonce manager
    mockNonceManager = {
      assignNonce: vi.fn().mockResolvedValue(42),
    };
    vi.mocked(DistributedNonceManager).mockImplementation(
      () => mockNonceManager,
    );

    // Create controller
    const context = {
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    } as any;
    controller = new OperationsController(context);
  });

  describe("successful processing", () => {
    it("should process queued operations successfully", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({
          to: "0x456",
          data: "0xabc",
          value: "__BIGINT__0",
        }),
        retryCount: 0,
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);

      const results = await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
      });

      expect(results.processed).toBe(1);
      expect(results.succeeded).toBe(1);
      expect(results.failed).toBe(0);
      expect(results.errors).toHaveLength(0);

      // Verify operation was marked as processing
      expect(mockOperationStore.updateStatus).toHaveBeenCalledWith(
        "op-1",
        "processing",
      );

      // Verify nonce was assigned
      expect(mockNonceManager.assignNonce).toHaveBeenCalledWith("0x123", 14800);

      // Verify transaction was sent with correct nonce
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: 42,
          to: "0x456",
          data: "0xabc",
          value: 0n,
        }),
      );

      // Verify status was updated to completed
      expect(mockOperationStore.updateStatus).toHaveBeenCalledWith(
        "op-1",
        "completed",
        expect.objectContaining({
          receipt: expect.any(Object),
          completedAt: expect.any(Number),
        }),
      );
    });

    it("should handle BigInt deserialization", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({
          to: "0x456",
          value: "__BIGINT__1000000000000000000",
          maxFeePerGas: "__BIGINT__20000000000",
          maxPriorityFeePerGas: "__BIGINT__1000000000",
        }),
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);

      await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
      });

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 1000000000000000000n,
          maxFeePerGas: 20000000000n,
          maxPriorityFeePerGas: 1000000000n,
        }),
      );
    });

    it("should apply gas escalation on retry", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({
          to: "0x456",
          maxFeePerGas: "__BIGINT__20000000000",
          maxPriorityFeePerGas: "__BIGINT__1000000000",
        }),
        retryCount: 2,
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);

      await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        gasEscalationFactor: 1.2,
      });

      // Should apply 1.2^2 = 1.44x multiplier
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFeePerGas: 28800000000n, // 20000000000 * 1.44
          maxPriorityFeePerGas: 1440000000n, // 1000000000 * 1.44
        }),
      );
    });

    it("should cap gas multiplier at maximum", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({
          to: "0x456",
          gasPrice: "__BIGINT__10000000000",
        }),
        retryCount: 10, // High retry count
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);

      await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        gasEscalationFactor: 1.5,
        maxGasMultiplier: 2,
      });

      // Should cap at 2x despite high retry count
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          gasPrice: 20000000000n, // 10000000000 * 2 (capped)
        }),
      );
    });

    it("should call completion callback", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({ to: "0x456" }),
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);

      const onComplete = vi.fn();

      await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        onOperationComplete: onComplete,
      });

      expect(onComplete).toHaveBeenCalledWith("op-1", true);
    });
  });

  describe("error handling", () => {
    it("should handle nonce lock failure", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({ to: "0x456" }),
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);
      mockNonceManager.assignNonce.mockResolvedValue(null);

      const results = await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
      });

      expect(results.failed).toBe(1);
      expect(results.errors[0].error).toContain("Failed to acquire nonce");
    });

    it("should handle transaction failure and retry", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({ to: "0x456" }),
        retryCount: 1,
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);
      vi.mocked(mockWalletClient.sendTransaction).mockRejectedValue(
        new Error("insufficient funds"),
      );

      const results = await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        maxRetries: 3,
      });

      expect(results.failed).toBe(1);

      // Should return to queue for retry
      expect(mockOperationStore.updateStatus).toHaveBeenCalledWith(
        "op-1",
        "queued",
        expect.objectContaining({
          retryCount: 2,
          lastError: "insufficient funds",
          lastAttemptAt: expect.any(Number),
        }),
      );
    });

    it("should mark as failed after max retries", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({ to: "0x456" }),
        retryCount: 2,
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);
      vi.mocked(mockWalletClient.sendTransaction).mockRejectedValue(
        new Error("gas too low"),
      );

      await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        maxRetries: 3,
      });

      // Should mark as failed (3rd retry = max)
      expect(mockOperationStore.updateStatus).toHaveBeenCalledWith(
        "op-1",
        "failed",
        expect.objectContaining({
          error: "gas too low",
          failedAt: expect.any(Number),
        }),
      );
    });

    it("should handle transaction revert", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({ to: "0x456" }),
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockResolvedValue({
        status: "reverted",
        transactionHash: "0xhash123",
      } as any);

      const results = await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
      });

      expect(results.failed).toBe(1);
      expect(results.errors[0].error).toContain("Transaction reverted");
    });

    it("should call error callback", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: JSON.stringify({ to: "0x456" }),
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);
      vi.mocked(mockWalletClient.sendTransaction).mockRejectedValue(
        new Error("network error"),
      );

      const onError = vi.fn();

      await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        maxRetries: 1,
        onError,
      });

      expect(onError).toHaveBeenCalledWith(
        "op-1",
        expect.objectContaining({ message: "network error" }),
      );
    });

    it("should handle invalid JSON in operation data", async () => {
      const operation: StoredOperation = {
        id: "op-1",
        status: "queued",
        data: "invalid json",
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);

      const results = await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
      });

      expect(results.failed).toBe(1);
      expect(results.errors[0].error).toContain("Unexpected token");
    });
  });

  describe("batch processing", () => {
    it("should process multiple operations", async () => {
      const operations: StoredOperation[] = [
        { id: "op-1", status: "queued", data: JSON.stringify({ to: "0x456" }) },
        { id: "op-2", status: "queued", data: JSON.stringify({ to: "0x789" }) },
        { id: "op-3", status: "queued", data: JSON.stringify({ to: "0xabc" }) },
      ];

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue(
        operations,
      );
      mockNonceManager.assignNonce
        .mockResolvedValueOnce(42)
        .mockResolvedValueOnce(43)
        .mockResolvedValueOnce(44);

      const results = await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        maxOperations: 10,
      });

      expect(results.processed).toBe(3);
      expect(results.succeeded).toBe(3);
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledTimes(3);
    });

    it("should respect maxOperations limit", async () => {
      const operations: StoredOperation[] = [
        { id: "op-1", status: "queued", data: JSON.stringify({ to: "0x456" }) },
        { id: "op-2", status: "queued", data: JSON.stringify({ to: "0x789" }) },
        { id: "op-3", status: "queued", data: JSON.stringify({ to: "0xabc" }) },
      ];

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue(
        operations,
      );

      await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        maxOperations: 2,
      });

      expect(mockOperationStore.getQueuedOperations).toHaveBeenCalledWith({
        limit: 2,
      });
    });

    it("should continue processing after individual failures", async () => {
      const operations: StoredOperation[] = [
        { id: "op-1", status: "queued", data: JSON.stringify({ to: "0x456" }) },
        { id: "op-2", status: "queued", data: JSON.stringify({ to: "0x789" }) },
        { id: "op-3", status: "queued", data: JSON.stringify({ to: "0xabc" }) },
      ];

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue(
        operations,
      );
      mockNonceManager.assignNonce
        .mockResolvedValueOnce(42)
        .mockResolvedValueOnce(null) // Fail on second
        .mockResolvedValueOnce(44);

      const results = await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
      });

      expect(results.processed).toBe(3);
      expect(results.succeeded).toBe(2);
      expect(results.failed).toBe(1);
    });
  });
});
