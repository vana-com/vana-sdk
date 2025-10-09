/**
 * Default service endpoints for Vana networks
 *
 * Centralizes all default service URLs for different Vana networks.
 * These can be overridden during SDK initialization.
 */

export interface ServiceEndpoints {
  /** Subgraph API endpoint for querying on-chain data */
  subgraphUrl: string;
  /** Block explorer URL for viewing transactions and addresses */
  blockExplorerUrl: string;
  /** Personal server URL for computation operations */
  personalServerUrl: string;
  /** RPC URL for blockchain interactions */
  rpcUrl: string;
}

/**
 * Default service endpoints for Vana Mainnet (chain ID: 1480)
 */
export const mainnetServices: ServiceEndpoints = {
  subgraphUrl: "https://vanagraph.io/prod",
  blockExplorerUrl: "https://vanascan.io",
  personalServerUrl: "https://server.vana.com",
  rpcUrl: "https://rpc.vana.org",
} as const;

/**
 * Default service endpoints for Moksha Testnet (chain ID: 14800)
 */
export const mokshaServices: ServiceEndpoints = {
  subgraphUrl: "https://moksha.vanagraph.io/v7",
  blockExplorerUrl: "https://moksha.vanascan.io",
  personalServerUrl: "https://test.server.vana.com",
  rpcUrl: "https://rpc.moksha.vana.org",
} as const;

/**
 * Retrieves the default service endpoints for a given chain ID
 *
 * @param chainId - The numeric chain ID
 * @returns Service endpoints for the chain, or undefined if not supported
 * @example
 * ```typescript
 * const services = getServiceEndpoints(1480);
 * if (services) {
 *   console.log('Personal server:', services.personalServerUrl);
 *   console.log('Subgraph:', services.subgraphUrl);
 * }
 * ```
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

/**
 * Gets the default personal server URL for a given chain ID
 *
 * @param chainId - The numeric chain ID
 * @returns The personal server URL for the chain, or undefined if not supported
 */
export function getDefaultPersonalServerUrl(
  chainId: number,
): string | undefined {
  const services = getServiceEndpoints(chainId);
  return services?.personalServerUrl;
}
