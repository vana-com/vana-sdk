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
 *   appPrivateKey: process.env.VANA_APP_PRIVATE_KEY!,
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
  isConnectCapableController,
  missingConnectCapabilities,
  DIRECT_CONNECT_CAPABILITIES,
  type ConnectCapableDirectDataController,
  type DirectConnectCapabilities,
  type DirectDataController,
  type DirectDataControllerConfig,
  type DirectEscrowConfig,
} from "./direct/controller";

// Embedded connect sheet: one handler for config/request/status/data, and
// the read capability the sheet asks for.
export {
  createVanaConnectHandler,
  toNodeHandler,
  connectBindingCookieName,
  CONNECT_BINDING_KEY_PURPOSE,
  createMemoryRateLimit,
  defaultClientIp,
  type MemoryRateLimitOptions,
  type VanaConnectRateLimit,
  type VanaConnectRateLimitDecision,
  type VanaConnectHandler,
  type VanaConnectHandlerOptions,
  type VanaConnectCreateOptions,
  type VanaConnectErrorCode,
  type VanaConnectConfig,
  type NodeRequestLike,
  type NodeResponseLike,
  type ToNodeHandlerOptions,
} from "./direct/connect-handler";
export {
  signRequestReadAuthorization,
  buildRequestReadAuthorizationMessage,
  requestReadPath,
  type SignRequestReadAuthorizationInput,
} from "./direct/request-authorization";
export {
  vanaConnectCsp,
  VANA_ACCOUNT_ORIGINS,
  isRequestId,
  readConnectRequest,
  type ConnectRequest,
  type RequestAuthorization,
  type VanaConnectEnv,
} from "./connect/protocol";
export {
  parseOriginAllowlist,
  resolveVanaAccountOrigin,
  type ResolveVanaAccountOriginInput,
} from "./connect/account-origin";

// Lower-level building blocks (advanced use / custom transports).
export {
  createDefaultAccessRequestClient,
  buildApprovalUrl,
  validateAccessRequestQuestions,
  buildDirectAccessRequestAuthMessage,
  type DefaultAccessRequestClientOptions,
  type FetchLike,
} from "./direct/access-request-client";
// Grant union: extend the owner's live grant instead of replacing it.
export {
  mergeWithLiveGrant,
  liveGrantScopes,
  findLiveGrant,
  unionGrantScopes,
  type GrantUnion,
  type GrantUnionGateway,
  type GrantUnionStatus,
  type MergeWithLiveGrantInput,
  type MergeWithLiveGrantResult,
} from "./direct/grant-union";
export {
  buildPersonalServerDataReadRequest,
  readPersonalServerData,
  parsePersonalServerPaymentRequired,
  dataPathForScope,
  type PersonalServerDataReadRequest,
  type PersonalServerReadResult,
  type PersonalServerFetch,
  type PersonalServerTransportRetryOptions,
  type FetchResponseLike,
} from "./direct/personal-server-read";
// Escrow-backed payment (built on protocol/escrow).
export {
  authorizeEscrowPayment,
  authorizeGrantPayment,
  buildEscrowPaymentHeader,
  buildGrantPaymentHeader,
  paymentResponseMetadataFromHeader,
  toDirectPaymentReceipt,
  toDirectFeeBreakdown,
  createDefaultNonceSource,
  DATA_ACCESS_OP_TYPE,
  GRANT_OP_TYPE,
  type EscrowPaymentConfig,
  type EscrowPaymentHeaderConfig,
  type SignTypedDataFn,
  type PaymentNonceSource,
} from "./direct/escrow-payment";
export {
  getDirectEndpoints,
  PRODUCTION_ENDPOINTS,
  DEV_ENDPOINTS,
} from "./direct/endpoints";
// Grant scope entries: the `[operation:]scope` vocabulary the controller's
// `scopes` are written in, so a backend can build and read them without
// reaching for a platform entry point.
export {
  ScopeSchema,
  parseScope,
  scopeMatchesPattern,
  scopeCoveredByGrant,
  type Scope,
  type ParsedScope,
} from "./protocol/scopes";
export {
  SCOPE_ACTIONS,
  InvalidScopeEntryError,
  parseScopeEntry,
  formatScopeEntry,
  grantPermissions,
  permissionsToScopes,
  tryGrantPermissions,
  hasAction,
  type ScopeAction,
  type ParsedScopeEntry,
  type GrantPermission,
} from "./protocol/scope-actions";

// Errors
export {
  DirectConfigError,
  AccessNotApprovedError,
  ScopeNotApprovedError,
  PersonalServerReadError,
  PaymentRequiredError,
} from "./direct/errors";

// Shared types
export type {
  DirectEnv,
  DirectNetwork,
  DirectAppConfig,
  ForegroundDelivery,
  AppIdentity,
  DirectServiceEndpoints,
  AccessRequest,
  AccessRequestGrantUnion,
  AccessRequestQuestion,
  AccessRequestStatus,
  AccessRequestStatusValue,
  ApprovedDataResult,
  MultiScopeDataResult,
  AccessRequestClient,
  DirectOpTypeValue,
  PersonalServerDataAccessPaymentOperation,
  PersonalServerGrantPaymentOperation,
  PersonalServerPaymentOperation,
  PersonalServerPaymentRequired,
  DirectPaymentReceipt,
  DirectPaymentResponseMetadata,
  DirectFeeBreakdown,
} from "./direct/types";

// Op-type vocabulary constant.
export { DirectOpType } from "./direct/types";
