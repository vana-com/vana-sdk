/**
 * Session Relay service integration for Vana app flows.
 *
 * @remarks
 * Session Relay coordinates the handoff between a builder app and the Vana app
 * that completes user consent. This entry point is intentionally separate from
 * `protocol/*`: it is a Vana-operated service integration, like Account or
 * Storage integrations, not a canonical on-chain protocol primitive.
 *
 * @example
 * ```typescript
 * import { createSessionRelayBuilderClient } from "@opendatalabs/vana-sdk/session-relay";
 *
 * const relay = createSessionRelayBuilderClient({
 *   granteeAddress: appAddress,
 *   signMessage,
 * });
 * ```
 *
 * @category Integrations
 * @module session-relay
 */

export {
  SESSION_RELAY_DEV_URL,
  SESSION_RELAY_PRODUCTION_URL,
  getSessionRelayUrl,
} from "./session-relay/endpoints";
export {
  SessionRelayError,
  type SessionRelayErrorDetails,
} from "./session-relay/errors";
export {
  computeSessionRelayBodyHash,
  buildSessionRelayWeb3SignedHeader,
} from "./session-relay/signing";
export {
  createSessionRelayClient,
  createSessionRelayBuilderClient,
} from "./session-relay/client";
export type {
  SessionRelayEnvironment,
  SessionRelayFetch,
  SessionRelayClientOptions,
  SessionRelayBuilderClientOptions,
  SessionRelayInitParams,
  SessionRelayInitResult,
  SessionRelayGrantPayload,
  SessionRelayPollResult,
  SessionRelayClaimRequest,
  SessionRelayClaimResponse,
  SessionRelayApproveRequest,
  SessionRelayDenyRequest,
  SessionRelayClient,
  SessionRelayBuilderClient,
} from "./session-relay/types";
