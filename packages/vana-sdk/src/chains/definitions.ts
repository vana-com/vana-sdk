/**
 * Chain configuration definitions for Vana networks
 *
 * These provide default configurations for known Vana chains.
 * Applications can use these as-is or override specific values.
 */

import type { Chain } from "viem";
import { mainnetServices, mokshaServices } from "../config/default-services";

export interface VanaChainConfig extends Chain {
  /** URL for the subgraph API endpoint used to query on-chain data */
  subgraphUrl: string;
  /** URL for the personal server used for computation operations */
  personalServerUrl: string;
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
      http: [mainnetServices.rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Vanascan",
      url: mainnetServices.blockExplorerUrl,
    },
  },
  subgraphUrl: mainnetServices.subgraphUrl,
  personalServerUrl: mainnetServices.personalServerUrl,
} as const;

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
      http: [mokshaServices.rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Vanascan - Moksha",
      url: mokshaServices.blockExplorerUrl,
    },
  },
  // Ensure EVM compatibility for proper transaction handling
  fees: {
    baseFeeMultiplier: 1.2,
  },
  subgraphUrl: mokshaServices.subgraphUrl,
  personalServerUrl: mokshaServices.personalServerUrl,
} as const;

/**
 * Retrieves the chain configuration for a given chain ID.
 *
 * @param chainId - The numeric chain ID to look up
 * @returns The chain configuration if found, undefined otherwise
 * @example
 * ```typescript
 * const config = getChainConfig(1480);
 * if (config) {
 *   console.log('Chain name:', config.name);
 *   console.log('Subgraph URL:', config.subgraphUrl);
 * }
 * ```
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

// Backwards compatibility alias
export const mokshaTestnet = moksha;

/**
 * Retrieves all available Vana chain configurations.
 *
 * @returns Array of all supported Vana chain configurations
 * @example
 * ```typescript
 * const chains = getAllChains();
 * console.log('Supported chains:');
 * chains.forEach(chain => {
 *   console.log(`- ${chain.name} (ID: ${chain.id})`);
 * });
 * ```
 */
export function getAllChains(): VanaChainConfig[] {
  return [vanaMainnet, moksha];
}
