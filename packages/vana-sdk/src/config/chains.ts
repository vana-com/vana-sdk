/**
 * Defines the supported Vana blockchain networks and their configurations.
 *
 * @remarks
 * This module provides the canonical chain definitions for the Vana protocol.
 * Each chain configuration includes RPC endpoints, block explorers, and network
 * metadata required for SDK operations. Use these definitions when configuring
 * wallet clients or checking network compatibility.
 *
 * @category Blockchain
 * @module chains
 */

import type { Abi, Chain } from "viem";
import { defineChain } from "viem";

/**
 * Moksha testnet configuration for development and testing.
 *
 * @remarks
 * The Moksha testnet is Vana's primary test network for application development.
 * It provides a safe environment for testing smart contracts and SDK features
 * before mainnet deployment. Test VANA tokens can be obtained from the faucet.
 *
 * **Network Details:**
 * - Chain ID: 14800
 * - Currency: Test VANA (18 decimals)
 * - RPC: https://rpc.moksha.vana.org
 * - Explorer: https://moksha.vanascan.io
 *
 * @example
 * ```typescript
 * import { createWalletClient, http } from 'viem';
 * import { mokshaTestnet } from '@opendatalabs/vana-sdk';
 *
 * const client = createWalletClient({
 *   chain: mokshaTestnet,
 *   transport: http()
 * });
 * ```
 *
 * @category Blockchain
 */
export const mokshaTestnet = defineChain({
  id: 14800,
  caipNetworkId: "eip155:14800",
  chainNamespace: "eip155",
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
      url: "https://moksha.vanascan.io",
      name: "Vanascan - Moksha",
    },
    blockscout: {
      url: "https://moksha.vanascan.io",
      name: "Vanascan - Moksha",
    },
  },
  contracts: {},
  abis: {},
});

/**
 * Vana mainnet configuration for production deployments.
 *
 * @remarks
 * The Vana mainnet is the production network where real value transactions occur.
 * Use this chain for production applications after thorough testing on Moksha.
 * Requires real VANA tokens for gas fees and transactions.
 *
 * **Network Details:**
 * - Chain ID: 1480
 * - Currency: VANA (18 decimals)
 * - RPC: https://rpc.vana.org
 * - Explorer: https://vanascan.io
 *
 * @example
 * ```typescript
 * import { createWalletClient, http } from 'viem';
 * import { vanaMainnet } from '@opendatalabs/vana-sdk';
 *
 * const client = createWalletClient({
 *   chain: vanaMainnet,
 *   transport: http()
 * });
 * ```
 *
 * @category Blockchain
 */
export const vanaMainnet = defineChain({
  id: 1480,
  caipNetworkId: "eip155:1480",
  chainNamespace: "eip155",
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
      url: "https://vanascan.io",
      name: "Vanascan",
    },
    blockscout: {
      url: "https://vanascan.io",
      name: "Vanascan",
    },
  },
  contracts: {},
  abis: {},
});

/**
 * Maps chain IDs to their complete configurations with optional ABIs.
 *
 * @remarks
 * Extends viem's Chain type to include optional contract ABIs for each network.
 * This allows dynamic chain selection based on runtime configuration.
 *
 * @category Blockchain
 */
export interface Chains {
  [key: number]: Chain & { abis?: Record<string, Abi> };
}

/**
 * Registry of all supported Vana chains indexed by chain ID.
 *
 * @remarks
 * Provides runtime access to chain configurations for dynamic network selection.
 * Use this when you need to select chains based on user input or environment variables.
 *
 * @example
 * ```typescript
 * const chainId = parseInt(process.env.CHAIN_ID || '14800');
 * const chain = chains[chainId];
 *
 * if (!chain) {
 *   throw new Error(`Unsupported chain ID: ${chainId}`);
 * }
 *
 * const client = createPublicClient({
 *   chain,
 *   transport: http()
 * });
 * ```
 *
 * @category Blockchain
 */
export const chains: Chains = {
  [mokshaTestnet.id]: mokshaTestnet,
  [vanaMainnet.id]: vanaMainnet,
};
