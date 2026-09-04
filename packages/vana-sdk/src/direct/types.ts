import type { EscrowAccessRecord } from "../protocol/escrow";
import type { ProtocolNetwork } from "../protocol/networks";

/**
 * Shared types for the Direct Data Controller and the browser connect helper.
 *
 * @remarks
 * These types describe the "two-tab" Data Portability flow documented in the
 * builder guide: a backend controller creates an access request, the browser
 * opens Vana for user approval, and the backend reads the approved data from
 * the user's Personal Server (handling 402 Payment Required).
 *
 * @category Direct
 * @module direct/types
 */

/**
 * Target environment for a {@link DirectDataController}.
 *
 * - `"production"` — Vana mainnet stack (default service URLs).
 * - `"dev"` — Vana internal dev stack. Use only when testing against
 *   Vana's dev infrastructure.
 */
export type DirectEnv = "dev" | "production";

/**
 * Vana network used for chain-aware Direct defaults.
 *
 * - `"mainnet"` — Vana mainnet (`chainId` 1480).
 * - `"moksha"` — Moksha testnet (`chainId` 14800).
 */
export type DirectNetwork = ProtocolNetwork;

/**
 * App identity advertised to users during approval and attributed in Builder
 * League activity reports.
 */
export interface DirectAppConfig {
  /** Stable, human-readable app id (e.g. `"notes-lens"`). */
  id: string;
  /** Display name shown to the user in the Vana approval UI. */
  name: string;
  /** Public homepage URL for the app. */
  homepageUrl: string;
}

/**
 * Resolved app identity: the configured {@link DirectAppConfig} plus the app's
 * derived on-chain address (the address to fund and inspect).
 */
export interface AppIdentity extends DirectAppConfig {
  /** The app's `0x`-prefixed on-chain address (derived from `appPrivateKey`). */
  address: string;
}

/** One-time HTTPS callback used to deliver a foreground mobile Direct read. */
export interface ForegroundDelivery {
  /** Fixed, same-origin consumer callback URL. */
  url: string;
  /** High-entropy bearer capability, generated and retained by the consumer. */
  token: string;
}

/**
 * One derivative question carried on an access request.
 *
 * @remarks
 * A question asks the user's Personal Server to compute an answer scope
 * (`derivedScope`) from source scopes the app never reads. On approval, the
 * Vana app registers the question on the Personal Server as the owner and the
 * grant covers only the derived scope, so the raw sources stay private to the
 * user. The SDK validates each question before the create request is signed
 * (see `validateAccessRequestQuestions`); the access-request service remains
 * authoritative and re-validates server-side.
 */
export interface AccessRequestQuestion {
  /**
   * Concrete scope the computed answer is written to and read from (no
   * wildcards, no operation prefix). It must also appear verbatim in the
   * request `scopes` as a bare read entry, and its first dot-segment must
   * differ from the first dot-segment of every entry in
   * {@link AccessRequestQuestion.sourceScopes}.
   */
  derivedScope: string;
  /**
   * Concrete scopes the answer is computed from: 1 to 16 entries, no
   * duplicates, none equal to {@link AccessRequestQuestion.derivedScope}.
   * These scopes are never granted to the app.
   */
  sourceScopes: string[];
  /**
   * Natural-language question the Personal Server answers from the source
   * scopes. Must be 1 to 4000 characters after trimming.
   */
  question: string;
  /**
   * When the Personal Server recomputes the answer. `"snapshot"` computes
   * once at registration; `"on-change"` also recomputes when a source scope
   * changes. When omitted, the server-side default applies.
   */
  recompute?: "snapshot" | "on-change";
}

/**
 * Resolved service URLs and chain id for a given {@link DirectEnv}.
 *
 * @remarks
 * Centralizes the per-environment base URLs the controller talks to. Each can
 * be overridden via {@link DirectDataControllerConfig.endpoints} when pointing
 * at a non-standard deployment.
 */
export interface DirectServiceEndpoints {
  /** Vana chain id for this environment (1480 mainnet, 14800 moksha). */
  chainId: number;
  /** Base URL of the Vana Account access-request API that issues `dcr_*` ids. */
  accessRequestBaseUrl: string;
  /** Base URL users are sent to for approval (the Vana app). */
  approvalAppBaseUrl: string;
  /** Base URL of the DP RPC escrow gateway used to settle `402 Payment Required`. */
  escrowGatewayUrl: string;
}

/** Result of {@link DirectDataController.createAccessRequest}. */
export interface AccessRequest {
  /** Opaque request id (e.g. `"dcr_123"`). */
  requestId: string;
  /** URL the browser opens so the user can approve the requested scopes. */
  approvalUrl: string;
  /** On-chain address of the (registered or reused) app. */
  appAddress: string;
  /** Protocol network echoed by the access-request service. */
  network?: DirectNetwork;
  /** Authoritative ISO-8601 expiry for the access request. */
  expiresAt?: string;
  /**
   * HTTPS continuation URL for a deep Direct request on a mobile browser.
   *
   * @remarks
   * Present only for a server-classified deep Direct DCR while it remains
   * pending, and only when Mobile continuation is enabled. It is an ordinary
   * `https://open[-dev].vana.org/continue#<ticket>` link the mobile UI renders
   * as a primary "Open Vana" tap — iOS Universal Links / Android App Links
   * deliver it to Vana Mobile, and its web fallback recovers an absent app. The
   * SDK never launches it automatically and owns no persistence.
   */
  mobileContinuationUrl?: string;
}

/** Canonical mobile continuation link host per {@link DirectEnv}. */
const MOBILE_CONTINUATION_HOSTS: Record<DirectEnv, string> = {
  production: "open.vana.org",
  dev: "open-dev.vana.org",
};

/** URL-fragment-safe opaque ticket: no separators, query, or scheme chars. */
const MOBILE_CONTINUATION_TICKET = /^[A-Za-z0-9._~-]+$/;

/**
 * @internal Strictly validate a mobile HTTPS continuation URL at the SDK
 * boundary.
 *
 * @remarks
 * Accepts only `https://open[-dev].vana.org/continue#<ticket>` with exactly one
 * well-formed opaque fragment ticket and no user info, port, or query. When
 * `env` is supplied only that environment's host is allowed; otherwise both
 * canonical hosts are accepted for structural (defense-in-depth) validation.
 *
 * @param value - The candidate URL from a create or status response.
 * @param env - Optional environment to pin the allowed host to.
 * @returns The canonical URL string, or `undefined` when it fails validation.
 */
export function normalizeMobileContinuationUrl(
  value: unknown,
  env?: DirectEnv,
): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  const allowedHosts = env
    ? [MOBILE_CONTINUATION_HOSTS[env]]
    : Object.values(MOBILE_CONTINUATION_HOSTS);
  if (!allowedHosts.includes(url.hostname)) return undefined;
  if (url.pathname !== "/continue") return undefined;
  if (url.username !== "" || url.password !== "") return undefined;
  if (url.port !== "") return undefined;
  if (url.search !== "") return undefined;
  const ticket = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  if (!MOBILE_CONTINUATION_TICKET.test(ticket)) return undefined;
  return url.toString();
}

/**
 * Lifecycle status of an access request.
 *
 * @remarks
 * - `"pending"` — created, awaiting user approval.
 * - `"approved"` / `"ready_for_read"` — the grant exists and the Personal
 *   Server is reachable; the data is read-ready (see {@link DirectDataController.readApprovedData}).
 * - `"completed"` — the app has already read the data and acknowledged it, so
 *   the DCR is terminal. A `"completed"` request is **not** read-ready — the
 *   browser Personal Server may no longer be serving it.
 * - `"denied"` / `"expired"` — terminal, no data was delivered.
 */
export type AccessRequestStatusValue =
  | "pending"
  | "approved"
  | "ready_for_read"
  | "completed"
  | "denied"
  | "expired";

/** Delivery path reported once an access request is ready. */
export type AccessRequestDelivery = "enclave" | "personal_server";

/** Result of {@link DirectDataController.getAccessRequestStatus}. */
export interface AccessRequestStatus {
  /** Current lifecycle status of the request. */
  status: AccessRequestStatusValue;
  /**
   * Present once ready. `"enclave"` reads through the Gateway jobs API
   * (`protocol/jobs` client), with no `personalServerUrl`.
   */
  delivery?: AccessRequestDelivery;
  /** Personal Server base URL — present once data is ready to read. */
  personalServerUrl?: string;
  /** Grant id covering the approved scope — present once data is ready to read. */
  grantId?: string;
  /**
   * The first approved scope — present once data is ready to read.
   *
   * @remarks
   * Kept for backwards compatibility. A request can approve many scopes; read
   * {@link AccessRequestStatus.scopes} to see all of them.
   */
  scope?: string;
  /**
   * Fresh HTTPS mobile continuation URL, returned only while the deep Direct
   * DCR is still pending. Its embedded ticket may rotate between polls.
   */
  mobileContinuationUrl?: string;
  /**
   * Every scope the user approved on this request — present once data is ready
   * to read.
   *
   * @remarks
   * A grant is keyed by `(user, app)` and carries a list of scopes, so a single
   * approval can cover several. Against an older Vana Account deployment that
   * only returns `scope`, this falls back to `[scope]`.
   */
  scopes?: string[];
}

/** Result of {@link DirectDataController.readApprovedData}. */
export interface ApprovedDataResult<T = unknown> {
  /** The scope the data was read for. */
  scope: string;
  /** The decoded payload returned by the Personal Server. */
  data: T;
  /**
   * Shape-validated but unauthenticated payment metadata echoed by the
   * Personal Server. Use for display/debugging, not accounting proof.
   */
  payment?: DirectPaymentResponseMetadata;
}

/**
 * Result of {@link DirectDataController.readApprovedData} across every approved
 * scope.
 *
 * @remarks
 * Successes and failures are reported side by side rather than as a thrown
 * error, because each scope read settles its own fee: throwing on the third
 * scope would discard data the app has already paid for. Check `errors` before
 * treating the read as complete.
 */
export interface MultiScopeDataResult<T = unknown> {
  /** Scopes that read successfully, keyed by scope. */
  results: Record<string, ApprovedDataResult<T>>;
  /** Scopes that failed, keyed by scope. Empty when every scope read. */
  errors: Record<string, Error>;
}

/**
 * Client for the Vana Account access-request API — the service that turns a
 * registered app + scopes into a `dcr_*` id and approval URL.
 *
 * @remarks
 * The controller uses a default client against the Vana Account endpoints. You
 * can inject your own implementation to point at a custom deployment or to
 * supply a test double.
 */
export interface AccessRequestClient {
  /**
   * Create an access request for the given app + scopes.
   *
   * @param input - App identity, source, scopes, network, and the post-approval return URL.
   * @returns The created {@link AccessRequest}.
   */
  createAccessRequest(input: {
    appAddress: string;
    app: DirectAppConfig;
    source: string;
    scopes: string[];
    returnUrl: string;
    /** Vana protocol network for this request (`"mainnet"` or `"moksha"`). */
    network: DirectNetwork;
    /** Optional foreground mobile delivery callback. */
    foregroundDelivery?: ForegroundDelivery;
    /**
     * Derivative questions to carry on the request (1 to 4). When present,
     * the array is validated client-side and serialized into the signed
     * create body verbatim. See {@link AccessRequestQuestion}.
     */
    questions?: AccessRequestQuestion[];
    /**
     * Optional retry key. The default client generates a fresh key per call
     * when omitted; pass a stable key to retry a create whose response was
     * lost without risking a duplicate DCR.
     */
    idempotencyKey?: string;
  }): Promise<AccessRequest>;

  /**
   * Fetch the current status of a previously created access request.
   *
   * @param requestId - The `dcr_*` id returned by {@link AccessRequestClient.createAccessRequest}.
   * @returns The current {@link AccessRequestStatus}.
   */
  getAccessRequestStatus(requestId: string): Promise<AccessRequestStatus>;

  /**
   * Acknowledge that the app successfully read the approved data.
   *
   * @remarks
   * Direct Vana Web DCRs remain in `ready_for_read` while the browser Personal
   * Server is serving the app. After a successful Personal Server read, the
   * controller calls this hook so Vana Web can mark the request completed and
   * close/redirect the approval tab.
   *
   * Optional so injected clients from older SDK integrations keep compiling;
   * the default HTTP client implements it.
   */
  acknowledgeRead?(requestId: string): Promise<void>;
}

/**
 * Op-type vocabulary used by the DPv2 escrow payment surface.
 *
 * @remarks
 * These are the operations the gateway prices and settles via
 * `POST /v1/escrow/pay` (`opType` field of the `GenericPayment` message). A
 * direct data read settles the {@link DirectOpType.DataAccess} op for the
 * approved grant; the other op types are listed here for completeness and to
 * give builders a typed vocabulary when inspecting fee breakdowns.
 *
 * GenericPayment uses `"grant"` for legacy grant lifecycle payments and
 * `"data_access"` for standalone receipt-bound reads.
 */
export const DirectOpType = {
  GrantRegistration: "grant_registration",
  DataAccess: "data_access",
  DataRegistration: "data_registration",
  ServerRegistration: "server_registration",
  BuilderRegistration: "builder_registration",
} as const;

/** A direct-flow op type (see {@link DirectOpType}). */
export type DirectOpTypeValue =
  (typeof DirectOpType)[keyof typeof DirectOpType];

/**
 * What a Personal Server `402 Payment Required` tells the controller is owed for
 * a data read.
 *
 * @remarks
 * The PS read 402 body identifies the challenged operation and amount/asset.
 * The controller settles it via the DPv2 escrow gateway (`/v1/escrow/pay`). The
 * full unmodified body is preserved under
 * {@link PersonalServerPaymentRequired.raw}.
 */
export interface PersonalServerPaymentRequired {
  /** Grant id authorizing the Personal Server read. */
  grantId: string;
  /** X402 network advertised by the Personal Server challenge. */
  network?: string;
  /** Payment nonce requested by the 402 challenge. */
  paymentNonce?: string;
  /** Data-access receipt carrying a signature for the gateway to verify. */
  accessRecord?: EscrowAccessRecord;
  /** Asset address owed (zero address = native VANA). */
  asset: string;
  /** Amount owed, as a decimal base-unit string (preserves uint256 precision). */
  amount: string;
  /** The full, unmodified 402 response body. */
  raw: unknown;
}

/** A validated legacy grant payment challenge. */
export interface PersonalServerGrantPaymentOperation extends PersonalServerPaymentRequired {
  /** Escrow operation discriminator. */
  opType: "grant";
  /** Grant id settled by the escrow payment. */
  opId: string;
}

/** A validated receipt-bound data-access payment challenge. */
export interface PersonalServerDataAccessPaymentOperation extends PersonalServerPaymentRequired {
  /** Escrow operation discriminator. */
  opType: "data_access";
  /** Access-record id settled by the escrow payment. */
  opId: string;
  /** Complete receipt whose signature is verified later by the gateway. */
  accessRecord: EscrowAccessRecord;
  /** Positive uint256 nonce supplied by the Personal Server challenge. */
  paymentNonce: string;
}

/**
 * A Personal Server payment challenge whose escrow operation has been
 * validated.
 *
 * @remarks
 * Validation here is structural and binds operation ids to their receipt. It
 * does not cryptographically verify the receipt signature; the Personal
 * Server and Data Gateway perform that verification.
 */
export type PersonalServerPaymentOperation =
  | PersonalServerGrantPaymentOperation
  | PersonalServerDataAccessPaymentOperation;

/** Shape-validated payment response returned directly by the escrow gateway. */
export interface DirectPaymentReceipt {
  /** Op type settled (the gateway `opType`, e.g. `"grant"`). */
  opType: string;
  /** Op id settled (a grant id or access-record id). */
  opId: string;
  /** Asset paid in (zero address = native VANA). */
  asset: string;
  /** Total amount paid, as a decimal base-unit string. */
  amount: string;
  /** Payment nonce used for this settlement. */
  paymentNonce: string;
  /** Fee breakdown reported by the gateway (registration vs data-access fee). */
  breakdown: DirectFeeBreakdown;
  /** ISO timestamp the gateway recorded the payment. */
  paidAt: string;
}

/**
 * Untrusted payment response metadata echoed by a Personal Server.
 *
 * @remarks
 * The SDK validates every field before exposing this shape, but the response
 * header is not signed by the gateway. Use it for display and debugging only,
 * never as accounting proof that a payment occurred.
 */
export type DirectPaymentResponseMetadata = DirectPaymentReceipt;

/**
 * Per-op fee breakdown reported by the gateway.
 *
 * @remarks
 * Mirrors the escrow {@link PaymentBreakdown}: a one-time registration fee plus
 * the per-read data-access fee, and whether this settlement covered the
 * registration fee.
 */
export interface DirectFeeBreakdown {
  /** One-time registration fee for the op, as a decimal base-unit string. */
  registrationFee: string;
  /** Per-read data-access fee, as a decimal base-unit string. */
  dataAccessFee: string;
  /** True when this settlement paid the registration fee. */
  registrationPaid: boolean;
}
