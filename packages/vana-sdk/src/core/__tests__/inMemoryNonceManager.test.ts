import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryNonceManager } from "../inMemoryNonceManager";
import type { PublicClient, Address } from "viem";

describe("InMemoryNonceManager", () => {
  let manager: InMemoryNonceManager;
  let mockPublicClient: PublicClient;
  const testAddress: Address = "0x1234567890123456789012345678901234567890";
  const testChainId = 14800;

  beforeEach(() => {
    mockPublicClient = {
      getTransactionCount: vi.fn(),
      getGasPrice: vi.fn(),
      estimateFeesPerGas: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    } as any;

    manager = new InMemoryNonceManager(mockPublicClient);
  });

  describe("assignNonce", () => {
    it("should return pending count when no previous nonce exists", async () => {
      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(5);

      const nonce = await manager.assignNonce(testAddress, testChainId);

      expect(nonce).toBe(5);
      expect(mockPublicClient.getTransactionCount).toHaveBeenCalledWith({
        address: testAddress,
        blockTag: "pending",
      });
    });

    it("should increment from last used nonce when higher than pending", async () => {
      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(5);

      // First assignment
      const nonce1 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce1).toBe(5);

      // Second assignment - should increment even if pending hasn't changed
      const nonce2 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce2).toBe(6);

      // Third assignment
      const nonce3 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce3).toBe(7);
    });

    it("should use pending count when blockchain is ahead", async () => {
      // First, assign some nonces
      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(5);
      const nonce1 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce1).toBe(5);

      // Now simulate blockchain being ahead (transactions submitted outside)
      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(10);
      const nonce2 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce2).toBe(10);
    });

    it("should handle different addresses independently", async () => {
      const address2: Address = "0x2222222222222222222222222222222222222222";

      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(3);
      const nonce1 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce1).toBe(3);

      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(7);
      const nonce2 = await manager.assignNonce(address2, testChainId);
      expect(nonce2).toBe(7);

      // First address should maintain its own counter
      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(3);
      const nonce3 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce3).toBe(4);
    });

    it("should handle different chains independently", async () => {
      const chainId2 = 1480;

      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(5);
      const nonce1 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce1).toBe(5);

      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(10);
      const nonce2 = await manager.assignNonce(testAddress, chainId2);
      expect(nonce2).toBe(10);

      // First chain should maintain its own counter
      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(5);
      const nonce3 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce3).toBe(6);
    });

    it("should handle zero pending count correctly", async () => {
      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(0);

      const nonce = await manager.assignNonce(testAddress, testChainId);
      expect(nonce).toBe(0);
    });
  });

  describe("resetNonce", () => {
    it("should clear the stored nonce for an address", async () => {
      // First assign a nonce
      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(5);
      const nonce1 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce1).toBe(5);

      // Increment it
      const nonce2 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce2).toBe(6);

      // Reset
      await manager.resetNonce(testAddress, testChainId);

      // Next assignment should use blockchain pending count
      vi.mocked(mockPublicClient.getTransactionCount).mockResolvedValue(3);
      const nonce3 = await manager.assignNonce(testAddress, testChainId);
      expect(nonce3).toBe(3);
    });
  });

  describe("burnNonce", () => {
    it("should send a self-transfer transaction with elevated gas", async () => {
      const mockWalletClient = {
        account: { address: testAddress },
        sendTransaction: vi.fn().mockResolvedValue("0xhash123"),
      } as any;

      vi.mocked(mockPublicClient.estimateFeesPerGas).mockResolvedValue({
        maxFeePerGas: 1000n,
        maxPriorityFeePerGas: 100n,
      });

      const hash = await manager.burnNonce(
        mockWalletClient,
        42,
        testAddress,
        testChainId,
        1.5,
      );

      expect(hash).toBe("0xhash123");
      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith({
        account: mockWalletClient.account,
        to: testAddress,
        value: 0n,
        nonce: 42,
        gas: 21000n,
        maxFeePerGas: 1500n, // 1000 * 1.5
        maxPriorityFeePerGas: 150n, // 100 * 1.5
        chain: expect.objectContaining({
          id: testChainId,
        }),
      });
    });

    it("should propagate errors from transaction send", async () => {
      const mockWalletClient = {
        account: { address: testAddress },
        sendTransaction: vi
          .fn()
          .mockRejectedValue(new Error("Transaction failed")),
      } as any;

      vi.mocked(mockPublicClient.estimateFeesPerGas).mockResolvedValue({
        maxFeePerGas: 1000n,
        maxPriorityFeePerGas: 100n,
      });

      await expect(
        manager.burnNonce(mockWalletClient, 42, testAddress, testChainId),
      ).rejects.toThrow("Transaction failed");
    });
  });
});
