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

export * from "./session-relay/index";
