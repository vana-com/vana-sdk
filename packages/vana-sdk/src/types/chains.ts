import type { Chain } from "viem";

/**
 * Represents the supported Vana network chain identifiers.
 *
 * @remarks
 * The Vana protocol operates on two primary networks:
 * - `14800`: Moksha testnet for development and testing
 * - `1480`: Vana mainnet for production deployment
 *
 * Use these chain IDs when configuring the SDK or checking network compatibility.
 *
 * @category Blockchain
 * @see {@link https://docs.vana.org/docs/networks | Network Documentation}
 */
export type VanaChainId = 14800 | 1480;

/**
 * Extends viem's Chain type with Vana-specific chain constraints.
 *
 * @remarks
 * Ensures type safety for Vana-specific chains by restricting the chain ID
 * to supported networks. This type provides full viem Chain compatibility
 * while guaranteeing the chain is a valid Vana network.
 *
 * @category Blockchain
 */
export type VanaChain = Chain & {
  id: VanaChainId;
};

/**
 * Maps Vana chain IDs to their complete chain configurations.
 *
 * @remarks
 * Provides type-safe access to chain configurations indexed by chain ID.
 * Use this for dynamic chain selection based on runtime chain ID values.
 *
 * @category Blockchain
 * @example
 * ```typescript
 * const configs: ChainConfig = {
 *   14800: mokshaTestnet,
 *   1480: vanaMainnet
 * };
 * const chain = configs[chainId];
 * ```
 */
export type ChainConfig = {
  [K in VanaChainId]: VanaChain;
};

/**
 * Validates whether a chain ID represents a supported Vana network.
 *
 * @remarks
 * Type guard for runtime validation of chain IDs from external sources.
 * Use when accepting user input or processing network configurations.
 *
 * @param chainId - The chain ID to validate
 * @returns `true` if the chain ID is a supported Vana network, `false` otherwise
 *
 * @example
 * ```typescript
 * const chainId = parseInt(process.env.CHAIN_ID);
 *
 * if (!isVanaChainId(chainId)) {
 *   throw new Error(`Unsupported chain ID: ${chainId}`);
 * }
 *
 * // TypeScript now knows chainId is VanaChainId
 * const config = getChainConfig(chainId);
 * ```
 *
 * @category Blockchain
 */
export function isVanaChainId(chainId: number): chainId is VanaChainId {
  return chainId === 14800 || chainId === 1480;
}

/**
 * Validates whether a Chain object represents a supported Vana network.
 *
 * @remarks
 * Type guard for validating viem Chain objects as Vana chains.
 * Ensures both type safety and runtime validation for chain compatibility.
 *
 * @param chain - The chain object to validate
 * @returns `true` if the chain is a supported Vana network, `false` otherwise
 *
 * @example
 * ```typescript
 * import { mainnet, mokshaTestnet } from 'viem/chains';
 *
 * if (isVanaChain(chain)) {
 *   // TypeScript knows this is a VanaChain
 *   console.log(`Connected to Vana network: ${chain.id}`);
 * } else {
 *   console.error('Please connect to a Vana network');
 * }
 * ```
 *
 * @category Blockchain
 */
export function isVanaChain(chain: Chain): chain is VanaChain {
  return isVanaChainId(chain.id);
}
