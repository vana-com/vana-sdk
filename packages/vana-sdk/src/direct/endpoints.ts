/**
 * Per-environment service URLs for the Direct Data Controller.
 *
 * @remarks
 * The SDK ships production defaults; pass `env: "dev"` only when testing
 * against Vana's internal dev stack. Use the controller `network` option for
 * chain selection without changing deployment URLs.
 *
 * @category Direct
 * @module direct/endpoints
 */

import type { DirectEnv, DirectNetwork, DirectServiceEndpoints } from "./types";
import { getProtocolNetworkChainId } from "../protocol/networks";

/** Production (mainnet) service URLs. */
export const PRODUCTION_ENDPOINTS: DirectServiceEndpoints = {
  chainId: 1480,
  accessRequestBaseUrl: "https://app.vana.org",
  approvalAppBaseUrl: "https://app.vana.org",
  escrowGatewayUrl: "https://dp-rpc.vana.org",
} as const;

/** Internal dev stack service URLs. */
export const DEV_ENDPOINTS: DirectServiceEndpoints = {
  chainId: 14800,
  accessRequestBaseUrl: "https://app-dev.vana.org",
  approvalAppBaseUrl: "https://app-dev.vana.org",
  escrowGatewayUrl: "https://dp-rpc.moksha.vana.org",
} as const;

/**
 * Resolve the default {@link DirectServiceEndpoints} for an environment.
 *
 * @param env - Target environment.
 * @returns The default endpoints for that environment.
 */
export function getDirectEndpoints(env: DirectEnv): DirectServiceEndpoints {
  if (env === "dev") {
    return DEV_ENDPOINTS;
  }

  return PRODUCTION_ENDPOINTS;
}

/**
 * Resolve the default network for a deployment environment.
 *
 * @param env - Target deployment environment.
 * @returns The network historically paired with that deployment.
 */
export function getDirectDefaultNetwork(env: DirectEnv): DirectNetwork {
  return env === "dev" ? "moksha" : "mainnet";
}

/**
 * Resolve the Vana chain id for a network.
 *
 * @param network - Target Vana network.
 * @returns The network chain id.
 */
export function getDirectNetworkChainId(network: DirectNetwork): number {
  return getProtocolNetworkChainId(network);
}
