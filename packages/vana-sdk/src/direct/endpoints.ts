/**
 * Per-environment service URLs for the Direct Data Controller.
 *
 * @remarks
 * The SDK ships production defaults; pass `env: "dev"` only when testing against
 * Vana's dev stack. This module is the single source of truth for those URLs.
 *
 * @category Direct
 * @module direct/endpoints
 */

import type { DirectEnv, DirectServiceEndpoints } from "./types";

/** Production (mainnet) service URLs. */
export const PRODUCTION_ENDPOINTS: DirectServiceEndpoints = {
  chainId: 1480,
  accessRequestBaseUrl: "https://app.vana.org",
  approvalAppBaseUrl: "https://app.vana.org",
} as const;

/** Dev/testnet (moksha) service URLs. */
export const DEV_ENDPOINTS: DirectServiceEndpoints = {
  chainId: 14800,
  accessRequestBaseUrl: "https://app-dev.vana.org",
  approvalAppBaseUrl: "https://app-dev.vana.org",
} as const;

/**
 * Resolve the default {@link DirectServiceEndpoints} for an environment.
 *
 * @param env - Target environment.
 * @returns The default endpoints for that environment.
 */
export function getDirectEndpoints(env: DirectEnv): DirectServiceEndpoints {
  return env === "dev" ? DEV_ENDPOINTS : PRODUCTION_ENDPOINTS;
}
