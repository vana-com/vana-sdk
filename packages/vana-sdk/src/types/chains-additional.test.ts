import { describe, it, expect } from "vitest";
import { isVanaChain } from "./chains";
import type { Chain } from "viem";

describe("chains - additional functions", () => {
  describe("isVanaChain", () => {
    it("should return true for Moksha testnet chain", () => {
      const mokshaChain: Chain = {
        id: 14800,
        name: "Moksha Testnet",
        rpcUrls: {
          default: {
            http: ["https://rpc.moksha.vana.org"],
          },
        },
        nativeCurrency: {
          name: "VANA",
          symbol: "VANA",
          decimals: 18,
        },
      };

      expect(isVanaChain(mokshaChain)).toBe(true);
    });

    it("should return true for Vana mainnet chain", () => {
      const vanaMainnet: Chain = {
        id: 1480,
        name: "Vana Mainnet",
        rpcUrls: {
          default: {
            http: ["https://rpc.vana.org"],
          },
        },
        nativeCurrency: {
          name: "VANA",
          symbol: "VANA",
          decimals: 18,
        },
      };

      expect(isVanaChain(vanaMainnet)).toBe(true);
    });

    it("should return false for non-Vana chain", () => {
      const ethereumChain: Chain = {
        id: 1,
        name: "Ethereum Mainnet",
        rpcUrls: {
          default: {
            http: ["https://eth.llamarpc.com"],
          },
        },
        nativeCurrency: {
          name: "Ether",
          symbol: "ETH",
          decimals: 18,
        },
      };

      expect(isVanaChain(ethereumChain)).toBe(false);
    });

    it("should return false for chain without id", () => {
      const chainWithoutId = {
        name: "Test Chain",
        rpcUrls: {
          default: {
            http: ["https://test.com"],
          },
        },
      } as Partial<Chain>;

      expect(isVanaChain(chainWithoutId as Chain)).toBe(false);
    });
  });
});
