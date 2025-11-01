import { describe, it, expect, vi, beforeEach } from "vitest";
import { DistributedNonceManager } from "../nonceManager";
import type { Address } from "viem";

describe("DistributedNonceManager", () => {
  let mockStore: any;
  let mockPublicClient: any;
  let manager: DistributedNonceManager;

  beforeEach(() => {
    // Create mock atomic store
    mockStore = {
      incr: vi.fn().mockResolvedValue(1),
      acquireLock: vi.fn().mockResolvedValue("lock-123"),
      releaseLock: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock public client
    mockPublicClient = {
      getTransactionCount: vi.fn().mockResolvedValue(0),
      getChainId: vi.fn().mockResolvedValue(14800),
    };

    manager = new DistributedNonceManager({
      atomicStore: mockStore,
      publicClient: mockPublicClient,
    });
  });

  describe("assignNonce", () => {
    it("should acquire lock, sync with blockchain, and assign nonce", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Mock blockchain has 5 pending transactions
      mockPublicClient.getTransactionCount.mockResolvedValue(5);
      // Mock store returns 3 as last used
      mockStore.get.mockResolvedValue("3");
      // Mock incr returns next nonce
      mockStore.incr.mockResolvedValue(6);

      const nonce = await manager.assignNonce(address, chainId);

      expect(nonce).toBe(6);

      // Verify lock was acquired
      expect(mockStore.acquireLock).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lock`,
        ),
        expect.any(Number),
      );

      // Verify lock was released
      expect(mockStore.releaseLock).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lock`,
        ),
        "lock-123",
      );

      // Verify blockchain sync happened
      expect(mockStore.set).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lastUsed`,
        ),
        "4", // blockchain pending - 1
      );

      // Verify nonce was incremented
      expect(mockStore.incr).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lastUsed`,
        ),
      );
    });

    it("should handle first nonce when no transactions exist", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // No transactions on blockchain
      mockPublicClient.getTransactionCount.mockResolvedValue(0);
      // No last used in store
      mockStore.get.mockResolvedValue(null);
      // First nonce should be 0
      mockStore.incr.mockResolvedValue(0);

      const nonce = await manager.assignNonce(address, chainId);

      expect(nonce).toBe(0);
    });

    it("should retry on lock acquisition failure", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // First attempt fails, second succeeds
      mockStore.acquireLock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("lock-456");

      mockStore.incr.mockResolvedValue(1);

      const nonce = await manager.assignNonce(address, chainId);

      expect(nonce).toBe(1);
      expect(mockStore.acquireLock).toHaveBeenCalledTimes(2);
    });

    it("should return null after max retries", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Always fail to acquire lock
      mockStore.acquireLock.mockResolvedValue(null);

      // Override max retries for faster test
      const quickManager = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 2,
        lockRetryDelay: 10,
      });

      const nonce = await quickManager.assignNonce(address, chainId);

      expect(nonce).toBeNull();
      expect(mockStore.acquireLock).toHaveBeenCalledTimes(2);
    });

    it("should handle errors and release lock", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-789");
      mockPublicClient.getTransactionCount.mockRejectedValue(
        new Error("Network error"),
      );

      await expect(manager.assignNonce(address, chainId)).rejects.toThrow(
        "Network error",
      );

      // Ensure lock was still released
      expect(mockStore.releaseLock).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lock`,
        ),
        "lock-789",
      );
    });
  });

  describe("assignNonce with atomicAssignNonce support", () => {
    it("should use store's atomicAssignNonce when available", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Add atomicAssignNonce support to mock store
      mockStore.atomicAssignNonce = vi.fn().mockResolvedValue(5);

      mockPublicClient.getTransactionCount.mockResolvedValue(5);

      const nonce = await manager.assignNonce(address, chainId);

      expect(nonce).toBe(5);
      expect(mockStore.atomicAssignNonce).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lastUsed`,
        ),
        5,
      );
      // Should not acquire lock when using optimized path
      expect(mockStore.acquireLock).not.toHaveBeenCalled();
    });

    it("should handle errors in atomicAssignNonce path", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.atomicAssignNonce = vi
        .fn()
        .mockRejectedValue(new Error("Store error"));
      mockPublicClient.getTransactionCount.mockResolvedValue(5);

      await expect(manager.assignNonce(address, chainId)).rejects.toThrow(
        "Store error",
      );
    });
  });

  describe("assignNonce with setWithTTL support", () => {
    it("should store assignment metadata when setWithTTL is available", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.setWithTTL = vi.fn().mockResolvedValue(undefined);
      mockPublicClient.getTransactionCount.mockResolvedValue(0);
      mockStore.get.mockResolvedValue(null);
      mockStore.incr.mockResolvedValue(0);

      await manager.assignNonce(address, chainId);

      expect(mockStore.setWithTTL).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:assignment:0`,
        ),
        expect.stringContaining('"nonce":0'),
        3600,
      );
    });
  });

  describe("resetNonce", () => {
    it("should reset nonce to blockchain state", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-reset");
      mockPublicClient.getTransactionCount.mockResolvedValue(10);

      await manager.resetNonce(address, chainId);

      expect(mockStore.set).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lastUsed`,
        ),
        "9", // confirmedCount - 1
      );
      expect(mockStore.releaseLock).toHaveBeenCalled();
    });

    it("should handle zero confirmed count when resetting", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-reset");
      mockPublicClient.getTransactionCount.mockResolvedValue(0);

      await manager.resetNonce(address, chainId);

      expect(mockStore.set).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lastUsed`,
        ),
        "-1",
      );
    });

    it("should throw error if lock acquisition fails", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue(null);

      const quickManager = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 2,
        lockRetryDelay: 10,
      });

      await expect(quickManager.resetNonce(address, chainId)).rejects.toThrow(
        "Failed to acquire lock for nonce reset",
      );
    });

    it("should release lock even if reset fails", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-reset");
      mockPublicClient.getTransactionCount.mockRejectedValue(
        new Error("Network error"),
      );

      await expect(manager.resetNonce(address, chainId)).rejects.toThrow(
        "Network error",
      );

      expect(mockStore.releaseLock).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lock`,
        ),
        "lock-reset",
      );
    });
  });

  describe("burnNonce", () => {
    it("should burn a stuck nonce with elevated gas", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;
      const nonceToBurn = 5;

      const mockWalletClient = {
        account: { address },
        sendTransaction: vi.fn().mockResolvedValue("0xBurnTxHash"),
      };

      mockPublicClient.estimateFeesPerGas = vi.fn().mockResolvedValue({
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 100000000n,
      });

      const txHash = await manager.burnNonce(
        mockWalletClient as any,
        nonceToBurn,
        address,
        chainId,
      );

      expect(txHash).toBe("0xBurnTxHash");
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: nonceToBurn,
          maxFeePerGas: 1500000000n, // 1.5x multiplier
          maxPriorityFeePerGas: 150000000n, // 1.5x multiplier
        }),
      );
    });

    it("should use custom gas multiplier", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;
      const nonceToBurn = 5;

      const mockWalletClient = {
        account: { address },
        sendTransaction: vi.fn().mockResolvedValue("0xBurnTxHash"),
      };

      mockPublicClient.estimateFeesPerGas = vi.fn().mockResolvedValue({
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 100000000n,
      });

      await manager.burnNonce(
        mockWalletClient as any,
        nonceToBurn,
        address,
        chainId,
        2.0, // Custom multiplier
      );

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFeePerGas: 2000000000n, // 2.0x multiplier
          maxPriorityFeePerGas: 200000000n, // 2.0x multiplier
        }),
      );
    });
  });

  describe("getNonceState", () => {
    it("should return current nonce state", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.get.mockResolvedValue("10");
      mockPublicClient.getTransactionCount
        .mockResolvedValueOnce(12) // pending
        .mockResolvedValueOnce(11); // latest

      const state = await manager.getNonceState(address, chainId);

      expect(state).toEqual({
        lastUsed: 10,
        blockchainPending: 11, // pendingCount - 1
        blockchainConfirmed: 10, // latestCount - 1
      });
    });

    it("should handle no stored nonce", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.get.mockResolvedValue(null);
      mockPublicClient.getTransactionCount
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const state = await manager.getNonceState(address, chainId);

      expect(state).toEqual({
        lastUsed: -1,
        blockchainPending: -1,
        blockchainConfirmed: -1,
      });
    });
  });

  describe("Lock acquisition with retries - Complex scenarios", () => {
    it("should apply exponential backoff between retries", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Fail first 3 times, then succeed
      mockStore.acquireLock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("lock-finally");

      mockStore.incr.mockResolvedValue(1);

      const quickManager = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 10,
        lockRetryDelay: 50, // Base delay
      });

      const startTime = Date.now();
      const nonce = await quickManager.assignNonce(address, chainId);
      const elapsed = Date.now() - startTime;

      expect(nonce).toBe(1);
      expect(mockStore.acquireLock).toHaveBeenCalledTimes(4);
      // Verify exponential backoff occurred
      // Delays: 50ms, 75ms (50*1.5), 112.5ms (50*1.5^2) = ~237ms minimum
      expect(elapsed).toBeGreaterThan(200);
    });

    it("should cap exponential backoff at 5 seconds", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Fail many times to trigger max delay cap
      mockStore.acquireLock.mockResolvedValue(null);

      const quickManager = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 3,
        lockRetryDelay: 4000, // High base delay
      });

      const startTime = Date.now();
      const nonce = await quickManager.assignNonce(address, chainId);
      const elapsed = Date.now() - startTime;

      expect(nonce).toBeNull();
      // Should be capped at 5000ms per retry, not growing exponentially beyond that
      expect(elapsed).toBeLessThan(12000); // 2 retries * 5000ms max + buffer
    }, 15000); // Increase timeout to 15 seconds for this test

    it("should handle max retries exceeded and return null", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue(null);

      const quickManager = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 3,
        lockRetryDelay: 10,
      });

      const nonce = await quickManager.assignNonce(address, chainId);

      expect(nonce).toBeNull();
      expect(mockStore.acquireLock).toHaveBeenCalledTimes(3);
      expect(mockStore.releaseLock).not.toHaveBeenCalled();
    });

    it("should handle lock timeout during critical section", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-timeout");
      // Simulate slow blockchain query that exceeds lock TTL
      mockPublicClient.getTransactionCount.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(5);
            }, 200); // Short delay for testing
          }),
      );

      const quickManager = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        lockTTL: 1, // Very short TTL for testing
      });

      // Should complete successfully even with short TTL
      mockStore.incr.mockResolvedValue(6);
      const nonce = await quickManager.assignNonce(address, chainId);

      expect(nonce).toBe(6);
      // Lock should still be released in finally block
      expect(mockStore.releaseLock).toHaveBeenCalled();
    });

    it("should handle concurrent lock attempts from multiple instances", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Simulate multiple instances competing for lock
      const manager1 = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 5,
        lockRetryDelay: 10,
      });

      const manager2 = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 5,
        lockRetryDelay: 10,
      });

      // First instance gets lock immediately
      // Second instance fails first attempt, succeeds second
      let callCount = 0;
      mockStore.acquireLock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve("lock-1");
        if (callCount === 2) return Promise.resolve(null); // Instance 2 first attempt
        if (callCount === 3) return Promise.resolve("lock-2"); // Instance 2 second attempt
        return Promise.resolve(null);
      });

      mockStore.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      // Run both concurrently
      const [nonce1, nonce2] = await Promise.all([
        manager1.assignNonce(address, chainId),
        manager2.assignNonce(address, chainId),
      ]);

      expect(nonce1).toBe(1);
      expect(nonce2).toBe(2);
      expect(mockStore.acquireLock).toHaveBeenCalledTimes(3);
    });
  });

  describe("Nonce synchronization - Complex scenarios", () => {
    it("should sync when blockchain is significantly ahead of stored nonce", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Blockchain has 100 pending transactions
      mockPublicClient.getTransactionCount.mockResolvedValue(100);
      // Store only knows about nonce 10
      mockStore.get.mockResolvedValue("10");
      mockStore.incr.mockResolvedValue(100);

      const nonce = await manager.assignNonce(address, chainId);

      expect(nonce).toBe(100);
      // Should have synced to blockchain state
      expect(mockStore.set).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lastUsed`,
        ),
        "99", // blockchain pending - 1
      );
    });

    it("should not sync when stored nonce is ahead of blockchain", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Blockchain has 5 pending transactions
      mockPublicClient.getTransactionCount.mockResolvedValue(5);
      // Store has higher nonce (transactions pending in mempool)
      mockStore.get.mockResolvedValue("10");
      mockStore.incr.mockResolvedValue(11);

      const nonce = await manager.assignNonce(address, chainId);

      expect(nonce).toBe(11);
      // Should NOT have called set to sync down (only sync up)
      expect(mockStore.set).not.toHaveBeenCalled();
    });

    it("should handle concurrent nonce assignment conflicts", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Simulate race condition: two instances read same nonce
      mockStore.get.mockResolvedValue("5");
      mockPublicClient.getTransactionCount.mockResolvedValue(5);

      // First incr returns 6, second returns 7
      mockStore.incr.mockResolvedValueOnce(6).mockResolvedValueOnce(7);

      const [nonce1, nonce2] = await Promise.all([
        manager.assignNonce(address, chainId),
        manager.assignNonce(address, chainId),
      ]);

      // Both should succeed with different nonces
      expect(nonce1).toBe(6);
      expect(nonce2).toBe(7);
      expect(mockStore.incr).toHaveBeenCalledTimes(2);
    });

    it("should use store-specific optimization when atomicAssignNonce available", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Store provides optimized atomic assignment
      mockStore.atomicAssignNonce = vi.fn().mockResolvedValue(10);
      mockPublicClient.getTransactionCount.mockResolvedValue(8);

      const nonce = await manager.assignNonce(address, chainId);

      expect(nonce).toBe(10);
      // Should use optimized path
      expect(mockStore.atomicAssignNonce).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lastUsed`,
        ),
        8,
      );
      // Should NOT use lock-based path
      expect(mockStore.acquireLock).not.toHaveBeenCalled();
      expect(mockStore.incr).not.toHaveBeenCalled();
    });

    it("should handle atomicAssignNonce syncing blockchain ahead scenario", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Blockchain is ahead, store optimization should handle it
      mockStore.atomicAssignNonce = vi.fn().mockResolvedValue(50);
      mockPublicClient.getTransactionCount.mockResolvedValue(50);

      const nonce = await manager.assignNonce(address, chainId);

      expect(nonce).toBe(50);
      expect(mockStore.atomicAssignNonce).toHaveBeenCalledWith(
        expect.anything(),
        50,
      );
    });
  });

  describe("burnNonce() edge cases", () => {
    it("should handle 'nonce too low' error gracefully", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;
      const nonceToBurn = 5;

      const mockWalletClient = {
        account: { address },
        sendTransaction: vi.fn().mockRejectedValue(new Error("nonce too low")),
      };

      mockPublicClient.estimateFeesPerGas = vi.fn().mockResolvedValue({
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 100000000n,
      });

      await expect(
        manager.burnNonce(
          mockWalletClient as any,
          nonceToBurn,
          address,
          chainId,
        ),
      ).rejects.toThrow("nonce too low");

      // Should have attempted to send transaction
      expect(mockWalletClient.sendTransaction).toHaveBeenCalled();
    });

    it("should handle 'underpriced' transaction error", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;
      const nonceToBurn = 5;

      const mockWalletClient = {
        account: { address },
        sendTransaction: vi
          .fn()
          .mockRejectedValue(new Error("replacement transaction underpriced")),
      };

      mockPublicClient.estimateFeesPerGas = vi.fn().mockResolvedValue({
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 100000000n,
      });

      await expect(
        manager.burnNonce(
          mockWalletClient as any,
          nonceToBurn,
          address,
          chainId,
          1.5, // May need higher multiplier
        ),
      ).rejects.toThrow("underpriced");
    });

    it("should handle 'already known' transaction scenario", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;
      const nonceToBurn = 5;

      const mockWalletClient = {
        account: { address },
        sendTransaction: vi.fn().mockRejectedValue(new Error("already known")),
      };

      mockPublicClient.estimateFeesPerGas = vi.fn().mockResolvedValue({
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 100000000n,
      });

      await expect(
        manager.burnNonce(
          mockWalletClient as any,
          nonceToBurn,
          address,
          chainId,
        ),
      ).rejects.toThrow("already known");
    });

    it("should calculate correct gas prices for Moksha testnet", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800; // Moksha
      const nonceToBurn = 5;

      const mockWalletClient = {
        account: { address },
        sendTransaction: vi.fn().mockResolvedValue("0xBurnTx"),
      };

      mockPublicClient.estimateFeesPerGas = vi.fn().mockResolvedValue({
        maxFeePerGas: 2000000000n,
        maxPriorityFeePerGas: 200000000n,
      });

      await manager.burnNonce(
        mockWalletClient as any,
        nonceToBurn,
        address,
        chainId,
        2.0,
      );

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFeePerGas: 4000000000n, // 2.0x
          maxPriorityFeePerGas: 400000000n, // 2.0x
          chain: expect.objectContaining({
            id: 14800,
            name: "Vana Moksha",
            network: "moksha",
          }),
        }),
      );
    });

    it("should calculate correct gas prices for Mainnet", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 1480; // Mainnet
      const nonceToBurn = 5;

      const mockWalletClient = {
        account: { address },
        sendTransaction: vi.fn().mockResolvedValue("0xBurnTx"),
      };

      mockPublicClient.estimateFeesPerGas = vi.fn().mockResolvedValue({
        maxFeePerGas: 3000000000n,
        maxPriorityFeePerGas: 300000000n,
      });

      await manager.burnNonce(
        mockWalletClient as any,
        nonceToBurn,
        address,
        chainId,
        1.5,
      );

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFeePerGas: 4500000000n, // 1.5x
          maxPriorityFeePerGas: 450000000n, // 1.5x
          chain: expect.objectContaining({
            id: 1480,
            name: "Vana Mainnet",
            network: "mainnet",
          }),
        }),
      );
    });

    it("should handle very high gas multipliers correctly", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;
      const nonceToBurn = 5;

      const mockWalletClient = {
        account: { address },
        sendTransaction: vi.fn().mockResolvedValue("0xBurnTx"),
      };

      mockPublicClient.estimateFeesPerGas = vi.fn().mockResolvedValue({
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 100000000n,
      });

      await manager.burnNonce(
        mockWalletClient as any,
        nonceToBurn,
        address,
        chainId,
        10.0, // Extreme multiplier
      );

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFeePerGas: 10000000000n, // 10x
          maxPriorityFeePerGas: 1000000000n, // 10x
        }),
      );
    });

    it("should properly construct self-transfer transaction", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;
      const nonceToBurn = 7;

      const mockWalletClient = {
        account: { address },
        sendTransaction: vi.fn().mockResolvedValue("0xBurnTx"),
      };

      mockPublicClient.estimateFeesPerGas = vi.fn().mockResolvedValue({
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 100000000n,
      });

      await manager.burnNonce(
        mockWalletClient as any,
        nonceToBurn,
        address,
        chainId,
      );

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          account: { address },
          to: address, // Self-transfer
          value: 0n, // Zero value
          nonce: nonceToBurn,
          gas: 21000n, // Minimal gas
        }),
      );
    });
  });

  describe("resetNonce() failures", () => {
    it("should handle blockchain query failures during reset", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-reset");
      mockPublicClient.getTransactionCount.mockRejectedValue(
        new Error("RPC endpoint unavailable"),
      );

      await expect(manager.resetNonce(address, chainId)).rejects.toThrow(
        "RPC endpoint unavailable",
      );

      // Lock should still be released
      expect(mockStore.releaseLock).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lock`,
        ),
        "lock-reset",
      );
    });

    it("should handle store.set failures during reset", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-reset");
      mockPublicClient.getTransactionCount.mockResolvedValue(10);
      mockStore.set.mockRejectedValue(new Error("Redis connection lost"));

      await expect(manager.resetNonce(address, chainId)).rejects.toThrow(
        "Redis connection lost",
      );

      expect(mockStore.releaseLock).toHaveBeenCalled();
    });

    it("should retry lock acquisition during reset with exponential backoff", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // Fail twice, then succeed
      mockStore.acquireLock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("lock-reset");

      mockPublicClient.getTransactionCount.mockResolvedValue(5);

      const startTime = Date.now();
      await manager.resetNonce(address, chainId);
      const elapsed = Date.now() - startTime;

      expect(mockStore.acquireLock).toHaveBeenCalledTimes(3);
      // Should have applied backoff
      expect(elapsed).toBeGreaterThan(100);
    });
  });

  describe("Distributed coordination - Complex scenarios", () => {
    it("should handle multiple SDK instances competing for same address", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      const instance1 = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 10,
        lockRetryDelay: 10,
      });

      const instance2 = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 10,
        lockRetryDelay: 10,
      });

      const instance3 = new DistributedNonceManager({
        atomicStore: mockStore,
        publicClient: mockPublicClient,
        maxLockRetries: 10,
        lockRetryDelay: 10,
      });

      // Simulate lock contention
      let lockCallCount = 0;
      mockStore.acquireLock.mockImplementation(() => {
        lockCallCount++;
        // Only every 3rd call succeeds
        if (lockCallCount % 3 === 0) {
          return Promise.resolve(`lock-${lockCallCount}`);
        }
        return Promise.resolve(null);
      });

      mockStore.incr
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3);

      const [nonce1, nonce2, nonce3] = await Promise.all([
        instance1.assignNonce(address, chainId),
        instance2.assignNonce(address, chainId),
        instance3.assignNonce(address, chainId),
      ]);

      // All should eventually succeed with unique nonces
      expect(new Set([nonce1, nonce2, nonce3]).size).toBe(3);
      expect(mockStore.acquireLock.mock.calls.length).toBeGreaterThan(3);
    });

    it("should handle race conditions between assignNonce and resetNonce", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      // First call gets lock for assignment
      // Second call gets lock for reset
      mockStore.acquireLock
        .mockResolvedValueOnce("lock-assign")
        .mockResolvedValueOnce("lock-reset");

      mockPublicClient.getTransactionCount.mockResolvedValue(10);
      mockStore.incr.mockResolvedValue(11);

      // Run assignment and reset concurrently
      const [nonce, _] = await Promise.all([
        manager.assignNonce(address, chainId),
        manager.resetNonce(address, chainId),
      ]);

      // Both should complete without deadlock
      expect(nonce).toBe(11);
      expect(mockStore.acquireLock).toHaveBeenCalledTimes(2);
      expect(mockStore.releaseLock).toHaveBeenCalledTimes(2);
    });

    it("should handle store failures during critical section after lock acquired", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-123");
      mockPublicClient.getTransactionCount.mockResolvedValue(5);
      mockStore.get.mockResolvedValue("3");
      // Store fails during critical section
      mockStore.incr.mockRejectedValue(new Error("Store write failed"));

      await expect(manager.assignNonce(address, chainId)).rejects.toThrow(
        "Store write failed",
      );

      // Lock must be released even on failure
      expect(mockStore.releaseLock).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lock`,
        ),
        "lock-123",
      );
    });

    it("should handle lock release failures gracefully", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-123");
      mockPublicClient.getTransactionCount.mockResolvedValue(5);
      mockStore.incr.mockResolvedValue(6);

      // Attempt to get nonce
      const noncePromise = manager.assignNonce(address, chainId);

      // Wait a bit for the incr to complete, then make releaseLock fail
      await new Promise((resolve) => setTimeout(resolve, 50));
      mockStore.releaseLock.mockRejectedValueOnce(
        new Error("Lock release failed"),
      );

      // Should still return nonce successfully despite lock release failure
      const nonce = await noncePromise;
      expect(nonce).toBe(6);

      // Release should have been attempted
      expect(mockStore.releaseLock).toHaveBeenCalled();
    });

    it("should handle store get failures during sync check", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-123");
      mockPublicClient.getTransactionCount.mockResolvedValue(5);
      mockStore.get.mockRejectedValue(new Error("Store read failed"));

      await expect(manager.assignNonce(address, chainId)).rejects.toThrow(
        "Store read failed",
      );

      expect(mockStore.releaseLock).toHaveBeenCalled();
    });

    it("should maintain consistency when blockchain pending count changes during assignment", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chainId = 14800;

      mockStore.acquireLock.mockResolvedValue("lock-123");

      // Blockchain has 5 pending transactions (count=5, so pending nonce would be 4)
      mockPublicClient.getTransactionCount.mockResolvedValue(5);

      // Store has stored nonce 2 (lower than blockchain)
      mockStore.get.mockResolvedValue("2");
      mockStore.incr.mockResolvedValue(5);

      const nonce = await manager.assignNonce(address, chainId);

      expect(nonce).toBe(5);
      // Should have synced to blockchain state (blockchain pending = 5-1 = 4)
      expect(mockStore.set).toHaveBeenCalledWith(
        expect.stringContaining(
          `nonce:${chainId}:${address.toLowerCase()}:lastUsed`,
        ),
        "4", // blockchain pending: 5 - 1 = 4
      );
    });

    it("should handle concurrent operations on different chains correctly", async () => {
      const address = "0x1234567890123456789012345678901234567890" as Address;
      const chain1 = 14800; // Moksha
      const chain2 = 1480; // Mainnet

      mockStore.acquireLock
        .mockResolvedValueOnce("lock-chain1")
        .mockResolvedValueOnce("lock-chain2");

      mockPublicClient.getTransactionCount.mockResolvedValue(0);
      mockStore.incr.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      // Assign nonces on different chains concurrently
      const [nonce1, nonce2] = await Promise.all([
        manager.assignNonce(address, chain1),
        manager.assignNonce(address, chain2),
      ]);

      expect(nonce1).toBe(0);
      expect(nonce2).toBe(0);

      // Should have acquired different locks (different chain IDs in key)
      const lockCalls = mockStore.acquireLock.mock.calls;
      expect(lockCalls[0][0]).toContain(`nonce:${chain1}:`);
      expect(lockCalls[1][0]).toContain(`nonce:${chain2}:`);
    });
  });
});
