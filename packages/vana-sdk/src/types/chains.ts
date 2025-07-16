import type { Chain } from "viem";

/**
 * Supported Vana chain IDs
 */
export type VanaChainId = 14800 | 1480;

/**
 * Supported Vana chains
 */
export type VanaChain = Chain & {
  id: VanaChainId;
};

/**
 * Chain configuration mapping
 */
export type ChainConfig = {
  [K in VanaChainId]: VanaChain;
};

/**
 * Type guard to check if a chain ID is supported
 * @param chainId - The chain ID to validate
 * @returns True if the chain ID is a supported Vana chain ID
 */
export function isVanaChainId(chainId: number): chainId is VanaChainId {
  return chainId === 14800 || chainId === 1480;
}

/**
 * Type guard to check if a chain is a Vana chain
 * @param chain - The chain object to validate
 * @returns True if the chain is a supported Vana chain
 */
export function isVanaChain(chain: Chain): chain is VanaChain {
  return isVanaChainId(chain.id);
}
