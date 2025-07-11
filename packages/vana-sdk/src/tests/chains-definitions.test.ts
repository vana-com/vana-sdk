import { describe, it, expect } from "vitest";
import {
  vanaMainnet,
  moksha,
  getChainConfig,
  getAllChains,
} from "../chains/definitions";

describe("Chain Definitions", () => {
  describe("getChainConfig", () => {
    it("should return vanaMainnet config for chain ID 1480", () => {
      const config = getChainConfig(1480);

      expect(config).toBeDefined();
      expect(config).toBe(vanaMainnet);
      expect(config?.id).toBe(1480);
      expect(config?.name).toBe("Vana");
    });

    it("should return moksha config for chain ID 14800", () => {
      const config = getChainConfig(14800);

      expect(config).toBeDefined();
      expect(config).toBe(moksha);
      expect(config?.id).toBe(14800);
      expect(config?.name).toBe("Moksha Testnet");
    });

    it("should return undefined for unknown chain ID", () => {
      const config = getChainConfig(999);

      expect(config).toBeUndefined();
    });

    it("should return undefined for common but unsupported chain IDs", () => {
      // Ethereum mainnet
      expect(getChainConfig(1)).toBeUndefined();

      // Polygon
      expect(getChainConfig(137)).toBeUndefined();

      // BSC
      expect(getChainConfig(56)).toBeUndefined();

      // Arbitrum
      expect(getChainConfig(42161)).toBeUndefined();
    });

    it("should handle edge case chain IDs", () => {
      expect(getChainConfig(0)).toBeUndefined();
      expect(getChainConfig(-1)).toBeUndefined();
      expect(getChainConfig(Number.MAX_SAFE_INTEGER)).toBeUndefined();
    });
  });

  describe("getAllChains", () => {
    it("should return all available chain configurations", () => {
      const chains = getAllChains();

      expect(chains).toBeDefined();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains).toHaveLength(2);
    });

    it("should include vanaMainnet and moksha", () => {
      const chains = getAllChains();

      expect(chains).toContain(vanaMainnet);
      expect(chains).toContain(moksha);
    });

    it("should return chains with correct properties", () => {
      const chains = getAllChains();

      chains.forEach((chain) => {
        expect(chain).toHaveProperty("id");
        expect(chain).toHaveProperty("name");
        expect(chain).toHaveProperty("nativeCurrency");
        expect(chain).toHaveProperty("rpcUrls");
        expect(chain).toHaveProperty("blockExplorers");
        expect(chain).toHaveProperty("subgraphUrl");

        expect(typeof chain.id).toBe("number");
        expect(typeof chain.name).toBe("string");
        expect(typeof chain.subgraphUrl).toBe("string");
      });
    });

    it("should return chains in expected order", () => {
      const chains = getAllChains();

      expect(chains[0]).toBe(vanaMainnet);
      expect(chains[1]).toBe(moksha);
    });

    it("should return a new array each time (not cached reference)", () => {
      const chains1 = getAllChains();
      const chains2 = getAllChains();

      expect(chains1).toEqual(chains2);
      expect(chains1).not.toBe(chains2); // Different array instances
    });
  });

  describe("Chain configuration validation", () => {
    it("should have valid vanaMainnet configuration", () => {
      expect(vanaMainnet.id).toBe(1480);
      expect(vanaMainnet.name).toBe("Vana");
      expect(vanaMainnet.nativeCurrency.name).toBe("VANA");
      expect(vanaMainnet.nativeCurrency.symbol).toBe("VANA");
      expect(vanaMainnet.nativeCurrency.decimals).toBe(18);
      expect(Array.isArray(vanaMainnet.rpcUrls.default.http)).toBe(true);
      expect(vanaMainnet.rpcUrls.default.http.length).toBeGreaterThan(0);
      expect(vanaMainnet.subgraphUrl).toContain("goldsky.com");
    });

    it("should have valid moksha configuration", () => {
      expect(moksha.id).toBe(14800);
      expect(moksha.name).toBe("Moksha Testnet");
      expect(moksha.nativeCurrency.name).toBe("VANA");
      expect(moksha.nativeCurrency.symbol).toBe("VANA");
      expect(moksha.nativeCurrency.decimals).toBe(18);
      expect(Array.isArray(moksha.rpcUrls.default.http)).toBe(true);
      expect(moksha.rpcUrls.default.http.length).toBeGreaterThan(0);
      expect(moksha.subgraphUrl).toContain("goldsky.com");
    });

    it("should have different chain IDs", () => {
      expect(vanaMainnet.id).not.toBe(moksha.id);
    });

    it("should have valid RPC URLs", () => {
      const chains = getAllChains();

      chains.forEach((chain) => {
        chain.rpcUrls.default.http.forEach((url) => {
          expect(url).toMatch(/^https?:\/\/.+/);
        });
      });
    });

    it("should have valid block explorer URLs", () => {
      const chains = getAllChains();

      chains.forEach((chain) => {
        if (chain.blockExplorers?.default) {
          expect(chain.blockExplorers.default.url).toMatch(/^https?:\/\/.+/);
          expect(typeof chain.blockExplorers.default.name).toBe("string");
        }
      });
    });
  });
});
