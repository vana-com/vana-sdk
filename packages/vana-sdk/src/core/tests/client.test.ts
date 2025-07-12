import { describe, it, expect, beforeEach } from "vitest";
import { createClient, createWalletClient, defaultFromBlock } from "../client";
import { chains, mokshaTestnet } from "../../config/chains";
import { privateKeyToAccount } from "viem/accounts";

describe("client", () => {
  beforeEach(async () => {
    // Reset client cache between tests - accessing module-level cache
    const clientModule = await import("../client");
    (clientModule as unknown as { _client?: unknown })._client = undefined;
  });

  describe("defaultFromBlock", () => {
    it("should export the correct default block number", () => {
      expect(defaultFromBlock).toBe(BigInt(292220));
    });
  });

  describe("createClient", () => {
    it("should create a client with default chain (moksha testnet)", () => {
      const client = createClient();
      expect(client.chain.id).toBe(mokshaTestnet.id);
      expect(client.chain.name).toBe(mokshaTestnet.name);
    });

    it("should create a client with specified chain ID", () => {
      const client = createClient(1480);
      expect(client.chain.id).toBe(1480);
    });

    it("should cache the client and reuse it for same chain", () => {
      const client1 = createClient(mokshaTestnet.id);
      const client2 = createClient(mokshaTestnet.id);
      expect(client1).toBe(client2);
    });

    it("should create a new client when chain changes", () => {
      const client1 = createClient(mokshaTestnet.id);
      const client2 = createClient(1480);
      expect(client1).not.toBe(client2);
      expect(client1.chain?.id).toBe(mokshaTestnet.id);
      expect(client2.chain?.id).toBe(1480);
    });

    it("should throw error for non-existent chain", () => {
      const invalidChainId = 999999 as keyof typeof chains;
      expect(() => createClient(invalidChainId)).toThrow(
        "Chain 999999 not found",
      );
    });

    it("should handle undefined chain gracefully", () => {
      // Test with a chain ID that doesn't exist in the chains object
      const nonExistentChainId = 123456 as keyof typeof chains;
      expect(() => createClient(nonExistentChainId)).toThrow(
        "Chain 123456 not found",
      );
    });
  });

  describe("createWalletClient", () => {
    const testPrivateKey =
      "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const testAccount = privateKeyToAccount(testPrivateKey);

    it("should create a wallet client with default chain (moksha testnet)", () => {
      const client = createWalletClient();
      expect(client.chain?.id).toBe(mokshaTestnet.id);
      expect(client.chain?.name).toBe(mokshaTestnet.name);
    });

    it("should create a wallet client with specified chain ID", () => {
      const client = createWalletClient(1480);
      expect(client.chain?.id).toBe(1480);
    });

    it("should create a wallet client with account", () => {
      const client = createWalletClient(mokshaTestnet.id, testAccount);
      expect(client.chain?.id).toBe(mokshaTestnet.id);
      expect(client.account).toBe(testAccount);
    });

    it("should create a wallet client without account", () => {
      const client = createWalletClient(mokshaTestnet.id);
      expect(client.chain?.id).toBe(mokshaTestnet.id);
      expect(client.account).toBeUndefined();
    });

    it("should throw error for non-existent chain", () => {
      const invalidChainId = 999999 as keyof typeof chains;
      expect(() => createWalletClient(invalidChainId)).toThrow(
        "Chain 999999 not found",
      );
    });

    it("should handle chain lookup correctly for all valid chains", () => {
      // Test with moksha testnet
      const client1 = createWalletClient(mokshaTestnet.id);
      expect(client1.chain?.id).toBe(mokshaTestnet.id);

      // Test with vana mainnet (chain ID 1480)
      const client2 = createWalletClient(1480);
      expect(client2.chain?.id).toBe(1480);
    });
  });

  describe("client caching behavior", () => {
    it("should update cache when switching chains", () => {
      // First call creates cache
      const client1 = createClient(mokshaTestnet.id);
      expect(client1.chain?.id).toBe(mokshaTestnet.id);

      // Switch to different chain updates cache
      const client2 = createClient(1480);
      expect(client2.chain?.id).toBe(1480);
      expect(client1).not.toBe(client2);

      // Same chain reuses cache
      const client3 = createClient(1480);
      expect(client2).toBe(client3);
    });

    it("should handle initial cache state correctly", () => {
      // Ensure cache is empty
      (global as unknown as { _client?: unknown })._client = undefined;

      const client = createClient();
      expect(client.chain?.id).toBe(mokshaTestnet.id);
    });
  });
});
