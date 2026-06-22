/**
 * Per-environment service URLs for the Direct Data Controller.
 *
 * @remarks
 * The builder guide says "The SDK should provide production defaults. Use
 * explicit dev/testnet configuration only when testing against Vana's dev
 * stack." This module is that single source of truth. URLs are derived from the
 * documented Vana endpoints; the access-request and gateway base URLs are
 * **PROVISIONAL** until the app-dev service contract is finalized.
 *
 * @category Direct
 * @module direct/endpoints
 */

import type { DirectEnv, DirectServiceEndpoints } from "./types";

/** Production (mainnet) service URLs. */
export const PRODUCTION_ENDPOINTS: DirectServiceEndpoints = {
  accessRequestBaseUrl: "https://app.vana.org",
  approvalAppBaseUrl: "https://app.vana.org",
  gatewayBaseUrl: "https://gateway.vana.org",
  builderReportBaseUrl: "https://builders.vana.org",
} as const;

/** Dev/testnet service URLs. */
export const DEV_ENDPOINTS: DirectServiceEndpoints = {
  accessRequestBaseUrl: "https://app.dev.vana.org",
  approvalAppBaseUrl: "https://app.dev.vana.org",
  gatewayBaseUrl: "https://gateway.dev.vana.org",
  builderReportBaseUrl: "https://builders-dev.vana.org",
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
