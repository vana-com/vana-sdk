/**
 * Comprehensive tests for OperationsController
 *
 * @remarks
 * Tests all public methods: getStatus, waitForConfirmation, cancel, burnStuckNonce
 * and the private method mapResponseToStatus.
 * Also covers edge cases for error handling, timeouts, and gas escalation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { OperationsController } from "../operations";
import type { ControllerContext } from "../permissions";
import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
} from "../../types/relayer";
import type { WalletClient, PublicClient, TransactionReceipt } from "viem";
import type { IOperationStore } from "../../types/operationStore";
import type { IAtomicStore } from "../../types/atomicStore";
import { TransactionPendingError } from "../../errors";
import { PollingManager } from "../../core/pollingManager";

// Mock the PollingManager
vi.mock("../../core/pollingManager");

describe("OperationsController", () => {
  let controller: OperationsController;
  let mockContext: ControllerContext;
  let mockRelayer: ReturnType<typeof vi.fn>;
  let mockPublicClient: PublicClient;
  let mockWalletClient: WalletClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock relayer function
    mockRelayer = vi.fn();

    // Mock public client
    mockPublicClient = {
      getChainId: vi.fn().mockResolvedValue(14800),
      getGasPrice: vi.fn().mockResolvedValue(20000000000n),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        transactionHash: "0xhash123",
        blockNumber: 1000n,
        gasUsed: 21000n,
      } as unknown as TransactionReceipt),
    } as unknown as PublicClient;

    // Mock wallet client
    mockWalletClient = {
      getChainId: vi.fn().mockResolvedValue(14800),
      getAddresses: vi.fn().mockResolvedValue(["0xRelayerAddress"]),
      sendTransaction: vi.fn().mockResolvedValue("0xtxhash"),
      account: { address: "0xRelayerAddress" },
      chain: { id: 14800 },
    } as unknown as WalletClient;

    // Create mock context
    mockContext = {
      relayer: mockRelayer,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    } as unknown as ControllerContext;

    controller = new OperationsController(mockContext);
  });

  describe("getStatus", () => {
    it("should throw error when relayer not configured", async () => {
      const controllerWithoutRelayer = new OperationsController({
        ...mockContext,
        relayer: undefined,
      } as unknown as ControllerContext);

      await expect(
        controllerWithoutRelayer.getStatus("op-123"),
      ).rejects.toThrow("Relayer not configured");
    });

    it("should return pending status", async () => {
      const response: UnifiedRelayerResponse = {
        type: "pending",
        operationId: "op-123",
      };

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      expect(status).toEqual({
        type: "pending",
        operationId: "op-123",
      });

      expect(mockRelayer).toHaveBeenCalledWith({
        type: "status_check",
        operationId: "op-123",
      });
    });

    it("should return submitted status", async () => {
      const response: UnifiedRelayerResponse = {
        type: "submitted",
        hash: "0xhash123",
      };

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      expect(status).toEqual({
        type: "submitted",
        hash: "0xhash123",
      });
    });

    it("should return confirmed status with receipt", async () => {
      const receipt = {
        status: "success",
        transactionHash: "0xhash123",
        blockNumber: 1000n,
      } as unknown as TransactionReceipt;

      const response: UnifiedRelayerResponse = {
        type: "confirmed",
        hash: "0xhash123",
        receipt,
      };

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      expect(status).toEqual({
        type: "confirmed",
        hash: "0xhash123",
        receipt,
      });
    });

    it("should return failed status from error response", async () => {
      const response: UnifiedRelayerResponse = {
        type: "error",
        error: "Transaction failed: insufficient funds",
      };

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      expect(status).toEqual({
        type: "failed",
        error: "Transaction failed: insufficient funds",
        operationId: "op-123",
      });
    });

    it("should handle error response with missing error message", async () => {
      const response: UnifiedRelayerResponse = {
        type: "error",
        error: undefined as unknown as string,
      };

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      expect(status).toEqual({
        type: "failed",
        error: "Unknown error",
        operationId: "op-123",
      });
    });

    it("should map signed response to submitted status", async () => {
      const response: UnifiedRelayerResponse = {
        type: "signed",
        hash: "0xhash123",
      };

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      expect(status).toEqual({
        type: "submitted",
        hash: "0xhash123",
      });
    });

    it("should map direct response to confirmed status", async () => {
      const response: UnifiedRelayerResponse = {
        type: "direct",
        result: { success: true },
      };

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      expect(status).toEqual({
        type: "confirmed",
        hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        receipt: undefined,
      });
    });

    it("should handle network errors gracefully", async () => {
      mockRelayer.mockRejectedValue(new Error("Network failure"));

      await expect(controller.getStatus("op-123")).rejects.toThrow(
        "Network failure",
      );
    });
  });

  describe("waitForConfirmation", () => {
    it("should throw error when relayer not configured", async () => {
      const controllerWithoutRelayer = new OperationsController({
        ...mockContext,
        relayer: undefined,
      } as unknown as ControllerContext);

      await expect(
        controllerWithoutRelayer.waitForConfirmation("op-123"),
      ).rejects.toThrow("Relayer not configured");
    });

    it("should return immediately if already confirmed", async () => {
      const receipt = {
        status: "success",
        transactionHash: "0xhash123",
      } as unknown as TransactionReceipt;

      mockRelayer.mockResolvedValue({
        type: "confirmed",
        hash: "0xhash123",
        receipt,
      });

      const result = await controller.waitForConfirmation("op-123");

      expect(result).toEqual({
        hash: "0xhash123",
        receipt,
      });

      // Should not start polling
      expect(PollingManager).not.toHaveBeenCalled();
    });

    it("should throw error if operation is failed", async () => {
      mockRelayer.mockResolvedValue({
        type: "error",
        error: "Transaction reverted",
      });

      await expect(controller.waitForConfirmation("op-123")).rejects.toThrow(
        "Transaction reverted",
      );

      // Should not start polling
      expect(PollingManager).not.toHaveBeenCalled();
    });

    it("should start polling if operation is pending", async () => {
      mockRelayer.mockResolvedValue({
        type: "pending",
        operationId: "op-123",
      });

      const mockPollingManager = {
        startPolling: vi.fn().mockResolvedValue({
          hash: "0xhash123",
          receipt: { status: "success" } as unknown as TransactionReceipt,
        }),
      };

      vi.mocked(PollingManager).mockImplementation(
        () => mockPollingManager as unknown as PollingManager,
      );

      const result = await controller.waitForConfirmation("op-123");

      expect(result).toEqual({
        hash: "0xhash123",
        receipt: { status: "success" },
      });

      expect(PollingManager).toHaveBeenCalledWith(mockRelayer);
      expect(mockPollingManager.startPolling).toHaveBeenCalledWith("op-123", {
        signal: undefined,
        onStatusUpdate: undefined,
        timeout: undefined,
        initialInterval: undefined,
        maxInterval: undefined,
      });
    });

    it("should pass through polling options", async () => {
      mockRelayer.mockResolvedValue({
        type: "pending",
        operationId: "op-123",
      });

      const mockPollingManager = {
        startPolling: vi.fn().mockResolvedValue({
          hash: "0xhash123",
        }),
      };

      vi.mocked(PollingManager).mockImplementation(
        () => mockPollingManager as unknown as PollingManager,
      );

      const onStatusUpdate = vi.fn();
      const signal = new AbortController().signal;

      await controller.waitForConfirmation("op-123", {
        signal,
        onStatusUpdate,
        timeout: 60000,
        initialInterval: 2000,
        maxInterval: 15000,
      });

      expect(mockPollingManager.startPolling).toHaveBeenCalledWith("op-123", {
        signal,
        onStatusUpdate,
        timeout: 60000,
        initialInterval: 2000,
        maxInterval: 15000,
      });
    });

    it("should handle polling timeout errors", async () => {
      mockRelayer.mockResolvedValue({
        type: "pending",
        operationId: "op-123",
      });

      const mockPollingManager = {
        startPolling: vi
          .fn()
          .mockRejectedValue(
            new TransactionPendingError("op-123", "Polling timed out"),
          ),
      };

      vi.mocked(PollingManager).mockImplementation(
        () => mockPollingManager as unknown as PollingManager,
      );

      await expect(controller.waitForConfirmation("op-123")).rejects.toThrow(
        TransactionPendingError,
      );
    });

    it("should handle cancellation via AbortSignal", async () => {
      mockRelayer.mockResolvedValue({
        type: "pending",
        operationId: "op-123",
      });

      const abortController = new AbortController();
      const mockPollingManager = {
        startPolling: vi.fn().mockImplementation(() => {
          abortController.abort();
          return Promise.reject(new Error("Operation cancelled"));
        }),
      };

      vi.mocked(PollingManager).mockImplementation(
        () => mockPollingManager as unknown as PollingManager,
      );

      await expect(
        controller.waitForConfirmation("op-123", {
          signal: abortController.signal,
        }),
      ).rejects.toThrow("Operation cancelled");
    });
  });

  describe("cancel", () => {
    it("should throw error when relayer not configured", async () => {
      const controllerWithoutRelayer = new OperationsController({
        ...mockContext,
        relayer: undefined,
      } as unknown as ControllerContext);

      await expect(controllerWithoutRelayer.cancel("op-123")).rejects.toThrow(
        "Relayer not configured",
      );
    });

    it("should throw not implemented error", async () => {
      await expect(controller.cancel("op-123")).rejects.toThrow(
        "Operation cancellation is not yet implemented",
      );

      // Should not call relayer
      expect(mockRelayer).not.toHaveBeenCalled();
    });
  });

  describe("burnStuckNonce", () => {
    let mockAtomicStore: IAtomicStore;

    beforeEach(() => {
      mockAtomicStore = {
        get: vi.fn(),
        set: vi.fn(),
        incr: vi.fn(),
        acquireLock: vi.fn(),
        releaseLock: vi.fn(),
      };
    });

    it("should burn stuck nonce with premium gas", async () => {
      vi.mocked(mockPublicClient.getGasPrice).mockResolvedValue(20000000000n);
      vi.mocked(mockWalletClient.sendTransaction).mockResolvedValue("0xburntx");
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockResolvedValue({
        status: "success",
        transactionHash: "0xburntx",
      } as unknown as TransactionReceipt);

      const hash = await controller.burnStuckNonce({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        atomicStore: mockAtomicStore,
        address: "0xRelayerAddress",
        stuckNonce: 42,
      });

      expect(hash).toBe("0xburntx");

      // Should get gas price
      expect(mockPublicClient.getGasPrice).toHaveBeenCalled();

      // Should send transaction with 50% premium gas
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith({
        account: mockWalletClient.account,
        chain: mockWalletClient.chain,
        to: "0xRelayerAddress",
        value: expect.any(BigInt), // 0.00001 ETH
        nonce: 42,
        gasPrice: 30000000000n, // 20000000000 * 1.5
        gas: 21000n,
      });

      // Should wait for confirmation
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: "0xburntx",
        timeout: 120000,
      });
    });

    it("should update stored nonce after successful burn", async () => {
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockResolvedValue({
        status: "success",
        transactionHash: "0xburntx",
      } as unknown as TransactionReceipt);

      vi.mocked(mockAtomicStore.get).mockResolvedValue("40");

      await controller.burnStuckNonce({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        atomicStore: mockAtomicStore,
        address: "0xRelayerAddress",
        stuckNonce: 42,
      });

      // Should update stored nonce since 42 > 40
      expect(mockAtomicStore.set).toHaveBeenCalledWith(
        "nonce:14800:0xRelayerAddress:lastUsed",
        "42",
      );
    });

    it("should not update stored nonce if lower than current", async () => {
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockResolvedValue({
        status: "success",
        transactionHash: "0xburntx",
      } as unknown as TransactionReceipt);

      vi.mocked(mockAtomicStore.get).mockResolvedValue("50");

      await controller.burnStuckNonce({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        atomicStore: mockAtomicStore,
        address: "0xRelayerAddress",
        stuckNonce: 42,
      });

      // Should not update since 42 < 50
      expect(mockAtomicStore.set).not.toHaveBeenCalled();
    });

    it("should update stored nonce when no previous nonce exists", async () => {
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockResolvedValue({
        status: "success",
        transactionHash: "0xburntx",
      } as unknown as TransactionReceipt);

      vi.mocked(mockAtomicStore.get).mockResolvedValue(null);

      await controller.burnStuckNonce({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        atomicStore: mockAtomicStore,
        address: "0xRelayerAddress",
        stuckNonce: 42,
      });

      // Should update since no previous value exists
      expect(mockAtomicStore.set).toHaveBeenCalledWith(
        "nonce:14800:0xRelayerAddress:lastUsed",
        "42",
      );
    });

    it("should throw error if burn transaction fails", async () => {
      vi.mocked(mockWalletClient.sendTransaction).mockResolvedValue("0xburntx");
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockResolvedValue({
        status: "reverted",
        transactionHash: "0xburntx",
      } as unknown as TransactionReceipt);

      await expect(
        controller.burnStuckNonce({
          walletClient: mockWalletClient,
          publicClient: mockPublicClient,
          atomicStore: mockAtomicStore,
          address: "0xRelayerAddress",
          stuckNonce: 42,
        }),
      ).rejects.toThrow("Nonce burn transaction failed: 0xburntx");

      // Should not update stored nonce
      expect(mockAtomicStore.set).not.toHaveBeenCalled();
    });

    it("should handle transaction submission errors", async () => {
      vi.mocked(mockWalletClient.sendTransaction).mockRejectedValue(
        new Error("insufficient funds"),
      );

      await expect(
        controller.burnStuckNonce({
          walletClient: mockWalletClient,
          publicClient: mockPublicClient,
          atomicStore: mockAtomicStore,
          address: "0xRelayerAddress",
          stuckNonce: 42,
        }),
      ).rejects.toThrow("insufficient funds");
    });

    it("should handle timeout waiting for confirmation", async () => {
      vi.mocked(mockPublicClient.waitForTransactionReceipt).mockRejectedValue(
        new Error("timeout"),
      );

      await expect(
        controller.burnStuckNonce({
          walletClient: mockWalletClient,
          publicClient: mockPublicClient,
          atomicStore: mockAtomicStore,
          address: "0xRelayerAddress",
          stuckNonce: 42,
        }),
      ).rejects.toThrow("timeout");
    });
  });

  describe("processQueue", () => {
    let mockOperationStore: IOperationStore;
    let mockAtomicStore: IAtomicStore;

    beforeEach(() => {
      mockOperationStore = {
        storeOperation: vi.fn(),
        getQueuedOperations: vi.fn().mockResolvedValue([]),
        updateStatus: vi.fn(),
      };

      mockAtomicStore = {
        get: vi.fn(),
        set: vi.fn(),
        incr: vi.fn(),
        acquireLock: vi.fn(),
        releaseLock: vi.fn(),
      };
    });

    it("should return empty results when queue is empty", async () => {
      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([]);

      const results = await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
      });

      expect(results).toEqual({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      });
    });

    it("should respect maxOperations parameter", async () => {
      await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        maxOperations: 5,
      });

      expect(mockOperationStore.getQueuedOperations).toHaveBeenCalledWith({
        limit: 5,
      });
    });

    it("should use default maxOperations of 10", async () => {
      await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: mockAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
      });

      expect(mockOperationStore.getQueuedOperations).toHaveBeenCalledWith({
        limit: 10,
      });
    });

    it("should handle operations without atomicStore (uses InMemoryNonceManager)", async () => {
      const operation = {
        id: "op-1",
        status: "queued" as const,
        data: JSON.stringify({ to: "0x456", data: "0xabc" }),
      };

      vi.mocked(mockOperationStore.getQueuedOperations).mockResolvedValue([
        operation,
      ]);

      // Create a controller without atomicStore to trigger InMemoryNonceManager
      const results = await controller.processQueue({
        operationStore: mockOperationStore,
        atomicStore: undefined as unknown as IAtomicStore,
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
      });

      // Should still process operations
      expect(results.processed).toBeGreaterThan(0);
    });
  });

  describe("mapResponseToStatus (via getStatus)", () => {
    it("should handle unknown response type as pending", async () => {
      // Force an unknown response type
      const response = {
        type: "unknown_type",
        someData: "value",
      } as unknown as UnifiedRelayerResponse;

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      expect(status).toEqual({
        type: "pending",
        operationId: "op-123",
      });
    });

    it("should preserve context in signed response", async () => {
      const response: UnifiedRelayerResponse = {
        type: "signed",
        hash: "0xhash123",
        context: {
          contract: "DataRegistry",
          fn: "addFile",
          from: "0xUserAddress",
        },
      };

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      // Context is not mapped to status, but response is converted to submitted
      expect(status.type).toBe("submitted");
      expect(status).toHaveProperty("hash", "0xhash123");
    });

    it("should handle confirmed response without receipt", async () => {
      const response: UnifiedRelayerResponse = {
        type: "confirmed",
        hash: "0xhash123",
      };

      mockRelayer.mockResolvedValue(response);

      const status = await controller.getStatus("op-123");

      expect(status).toEqual({
        type: "confirmed",
        hash: "0xhash123",
        receipt: undefined,
      });
    });
  });

  describe("edge cases", () => {
    it("should handle concurrent getStatus calls", async () => {
      mockRelayer.mockImplementation(async (request: UnifiedRelayerRequest) => {
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          type: "pending",
          operationId:
            request.type === "status_check" ? request.operationId : "unknown",
        };
      });

      const results = await Promise.all([
        controller.getStatus("op-1"),
        controller.getStatus("op-2"),
        controller.getStatus("op-3"),
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].type).toBe("pending");
      expect(results[1].type).toBe("pending");
      expect(results[2].type).toBe("pending");
      if (results[0].type === "pending")
        expect(results[0].operationId).toBe("op-1");
      if (results[1].type === "pending")
        expect(results[1].operationId).toBe("op-2");
      if (results[2].type === "pending")
        expect(results[2].operationId).toBe("op-3");
    });

    it("should handle malformed relayer response", async () => {
      mockRelayer.mockResolvedValue(null);

      await expect(controller.getStatus("op-123")).rejects.toThrow();
    });

    it("should handle empty operation ID", async () => {
      mockRelayer.mockResolvedValue({
        type: "pending",
        operationId: "",
      });

      const status = await controller.getStatus("");

      expect(status.type).toBe("pending");
    });
  });
});
