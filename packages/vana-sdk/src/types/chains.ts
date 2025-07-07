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
 */
export function isVanaChainId(chainId: number): chainId is VanaChainId {
  return chainId === 14800 || chainId === 1480;
}

/**
 * Type guard to check if a chain is a Vana chain
 */
export function isVanaChain(chain: Chain): chain is VanaChain {
  return isVanaChainId(chain.id);
}
