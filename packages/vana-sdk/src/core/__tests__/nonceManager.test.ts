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
});
