/**
 * Default service endpoints for Vana networks
 *
 * Centralizes default service URLs for different Vana networks.
 * These can be overridden during SDK initialization.
 */

export interface ServiceEndpoints {
  /** Block explorer URL for viewing transactions and addresses */
  blockExplorerUrl: string;
  /** RPC URL for blockchain interactions */
  rpcUrl: string;
}

/**
 * Default service endpoints for Vana Mainnet (chain ID: 1480)
 */
export const mainnetServices: ServiceEndpoints = {
  blockExplorerUrl: "https://vanascan.io",
  rpcUrl: "https://rpc.vana.org",
} as const;

/**
 * Default service endpoints for Moksha Testnet (chain ID: 14800)
 */
export const mokshaServices: ServiceEndpoints = {
  blockExplorerUrl: "https://moksha.vanascan.io",
  rpcUrl: "https://rpc.moksha.vana.org",
} as const;

/**
 * Retrieves the default service endpoints for a given chain ID
 *
 * @param chainId - The numeric chain ID
 * @returns Service endpoints for the chain, or undefined if not supported
 */
export function getServiceEndpoints(
  chainId: number,
): ServiceEndpoints | undefined {
  switch (chainId) {
    case 1480:
      return mainnetServices;
    case 14800:
      return mokshaServices;
    default:
      return undefined;
  }
}
