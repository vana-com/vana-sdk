/**
 * Chain configuration definitions for Vana networks
 *
 * These provide default configurations for known Vana chains.
 * Applications can use these as-is or override specific values.
 */

import type { Chain } from "viem";

export interface VanaChainConfig extends Chain {
  subgraphUrl: string;
}

/**
 * Vana Mainnet configuration
 */
export const vanaMainnet: VanaChainConfig = {
  id: 1480,
  name: "Vana",
  nativeCurrency: {
    name: "VANA",
    symbol: "VANA",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.vana.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Vanascan",
      url: "https://vanascan.io",
    },
  },
  subgraphUrl:
    "https://api.goldsky.com/api/public/project_cm168cz887zva010j39il7a6p/subgraphs/vana/7.0.1/gn",
};

/**
 * Moksha Testnet configuration
 */
export const moksha: VanaChainConfig = {
  id: 14800,
  name: "Moksha Testnet",
  nativeCurrency: {
    name: "VANA",
    symbol: "VANA",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.moksha.vana.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Vanascan - Moksha",
      url: "https://moksha.vanascan.io",
    },
  },
  subgraphUrl:
    "https://api.goldsky.com/api/public/project_cm168cz887zva010j39il7a6p/subgraphs/moksha/7.0.2/gn",
};

/**
 * Get chain configuration by chain ID
 */
export function getChainConfig(chainId: number): VanaChainConfig | undefined {
  switch (chainId) {
    case 1480:
      return vanaMainnet;
    case 14800:
      return moksha;
    default:
      return undefined;
  }
}

/**
 * Get all available chain configurations
 */
export function getAllChains(): VanaChainConfig[] {
  return [vanaMainnet, moksha];
}
