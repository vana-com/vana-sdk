import { type Chain } from "viem";
import { mokshaTestnet, vanaMainnet } from "vana-sdk";

/**
 * Get the chain configuration for a given chain ID
 */
function getChain(chainId: number): Chain {
  switch (chainId) {
    case mokshaTestnet.id:
      return mokshaTestnet;
    case vanaMainnet.id:
      return vanaMainnet;
    default:
      // Fallback to Moksha testnet
      return mokshaTestnet;
  }
}

/**
 * Get the block explorer URL for a given chain ID
 * Uses viem's standard blockExplorers configuration
 */
export function getExplorerUrl(chainId: number): string {
  const chain = getChain(chainId);
  return chain.blockExplorers?.default?.url || "https://vanascan.io";
}

/**
 * Get the transaction URL for a given transaction hash
 * Following standard blockscout/etherscan URL format
 */
export function getTxUrl(chainId: number, txHash: string): string {
  const chain = getChain(chainId);
  const baseUrl = chain.blockExplorers?.default?.url || "https://vanascan.io";
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get the block URL for a given block number
 * Following standard blockscout/etherscan URL format
 */
export function getBlockUrl(
  chainId: number,
  blockNumber: string | number | bigint,
): string {
  const chain = getChain(chainId);
  const baseUrl = chain.blockExplorers?.default?.url || "https://vanascan.io";
  const blockNum =
    typeof blockNumber === "bigint"
      ? blockNumber.toString()
      : blockNumber.toString();
  return `${baseUrl}/block/${blockNum}`;
}

/**
 * Get the address URL for a given address
 * Following standard blockscout/etherscan URL format
 */
export function getAddressUrl(chainId: number, address: string): string {
  const chain = getChain(chainId);
  const baseUrl = chain.blockExplorers?.default?.url || "https://vanascan.io";
  return `${baseUrl}/address/${address}`;
}

/**
 * Get the contract URL with specific tab and hash
 * Following blockscout URL format for contract interaction
 */
export function getContractUrl(
  chainId: number,
  address: string,
  options?: {
    tab?: string;
    sourceAddress?: string;
    hash?: string;
  },
): string {
  const chain = getChain(chainId);
  const baseUrl = chain.blockExplorers?.default?.url || "https://vanascan.io";
  let url = `${baseUrl}/address/${address}`;

  const params = new URLSearchParams();
  if (options?.tab) params.set("tab", options.tab);
  if (options?.sourceAddress)
    params.set("source_address", options.sourceAddress);

  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  if (options?.hash) {
    url += `#${options.hash}`;
  }

  return url;
}
