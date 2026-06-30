import type { SessionRelayEnvironment } from "./types";

/** Production Session Relay URL. */
export const SESSION_RELAY_PRODUCTION_URL = "https://session-relay.vana.org";

/** Internal dev Session Relay URL. */
export const SESSION_RELAY_DEV_URL = "https://dev.session-relay.vana.org";

/** Resolve the default Session Relay URL for a deployment environment. */
export function getSessionRelayUrl(
  env: SessionRelayEnvironment = "production",
): string {
  return env === "dev" ? SESSION_RELAY_DEV_URL : SESSION_RELAY_PRODUCTION_URL;
}
