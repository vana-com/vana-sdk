/**
 * Provides chain configurations for the Vana network ecosystem.
 *
 * @remarks
 * This module exports all chain definitions and utilities needed to connect
 * to Vana networks. It includes configurations for mainnet and testnet
 * environments with their respective RPC endpoints, contract addresses,
 * and network parameters.
 *
 * Available networks:
 * - **Vana Mainnet** (chainId: 1480) - Production network
 * - **Moksha Testnet** (chainId: 14800) - Test network
 *
 * @example
 * ```typescript
 * import { moksha, vanaMainnet, getChainConfig } from '@opendatalabs/vana-sdk/chains';
 * import { createPublicClient, http } from 'viem';
 *
 * // Connect to moksha testnet
 * const client = createPublicClient({
 *   chain: moksha,
 *   transport: http()
 * });
 *
 * // Get chain config by ID
 * const config = getChainConfig(14800);
 * console.log(config?.name); // "Moksha Testnet"
 * ```
 *
 * @category Chains
 * @module chains
 */

export type { VanaChainConfig } from "./definitions";
export {
  vanaMainnet,
  moksha,
  mokshaTestnet,
  getChainConfig,
  getAllChains,
} from "./definitions";
