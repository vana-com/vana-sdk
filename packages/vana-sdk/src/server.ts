/**
 * Server entry point for the Vana SDK direct Data Portability flow.
 *
 * @remarks
 * Exposes {@link createDirectDataController} and its supporting types/errors.
 * This is a Node/server entry point — it owns the app private key and must never
 * be imported into browser code.
 *
 * @example
 * ```typescript
 * import { createDirectDataController } from "@opendatalabs/vana-sdk/server";
 *
 * export const vana = createDirectDataController({
 *   env: process.env.VANA_ENV === "dev" ? "dev" : "production",
 *   builderPrivateKey: process.env.VANA_BUILDER_PRIVATE_KEY!,
 *   app: { id: "notes-lens", name: "Notes Lens", homepageUrl: process.env.VANA_APP_URL! },
 *   source: "icloud_notes",
 *   scopes: ["icloud_notes.notes"],
 * });
 * ```
 *
 * @category Direct
 * @module server
 */

export {
  createDirectDataController,
  type DirectDataController,
  type DirectDataControllerConfig,
} from "./direct/controller";

// Lower-level building blocks (advanced use / custom transports).
export {
  createDefaultAccessRequestClient,
  buildApprovalUrl,
  type DefaultAccessRequestClientOptions,
  type FetchLike,
} from "./direct/access-request-client";
export { createDefaultPaymentSigner } from "./direct/payment-signer";
export {
  buildPersonalServerDataReadRequest,
  readPersonalServerData,
  parsePaymentChallenge,
  dataPathForScope,
  type PersonalServerDataReadRequest,
  type PersonalServerFetch,
  type FetchResponseLike,
} from "./direct/personal-server-read";
export {
  getDirectEndpoints,
  PRODUCTION_ENDPOINTS,
  DEV_ENDPOINTS,
} from "./direct/endpoints";

// Errors
export {
  DirectConfigError,
  AccessNotApprovedError,
  PersonalServerReadError,
  PaymentRequiredError,
} from "./direct/errors";

// Shared types
export type {
  DirectEnv,
  DirectAppConfig,
  DirectServiceEndpoints,
  AccessRequest,
  AccessRequestStatus,
  AccessRequestStatusValue,
  ApprovedDataResult,
  AccessRequestClient,
  PaymentSigner,
  PaymentChallenge,
  PaymentRequirement,
} from "./direct/types";
