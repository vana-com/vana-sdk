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
 * - `"dev"` — Vana internal dev/testnet stack. Use only when testing against
 *   Vana's dev infrastructure.
 */
export type DirectEnv = "dev" | "production";

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
 * Resolved service URLs for a given {@link DirectEnv}.
 *
 * @remarks
 * Centralizes the per-environment base URLs the controller talks to. Each can
 * be overridden via {@link DirectDataControllerConfig.endpoints} when pointing
 * at a non-standard deployment.
 */
export interface DirectServiceEndpoints {
  /** Base URL of the access-request (app-dev) service that issues `dcr_*` ids. */
  accessRequestBaseUrl: string;
  /** Base URL users are sent to for approval (the Vana app). */
  approvalAppBaseUrl: string;
  /** Base URL of the Data Portability gateway used for grant/server lookups. */
  gatewayBaseUrl: string;
  /** Builder activity report base URL (informational; not called at runtime). */
  builderReportBaseUrl: string;
}

/** Result of {@link DirectDataController.createAccessRequest}. */
export interface AccessRequest {
  /** Opaque request id (e.g. `"dcr_123"`). */
  requestId: string;
  /** URL the browser opens so the user can approve the requested scopes. */
  approvalUrl: string;
  /** On-chain address of the (registered or reused) app/builder. */
  appAddress: string;
}

/** Lifecycle status of an access request. */
export type AccessRequestStatusValue =
  | "pending"
  | "approved"
  | "denied"
  | "expired";

/** Result of {@link DirectDataController.getAccessRequestStatus}. */
export interface AccessRequestStatus {
  /** Current lifecycle status of the request. */
  status: AccessRequestStatusValue;
  /** Personal Server base URL — present once `status === "approved"`. */
  personalServerUrl?: string;
  /** Grant id covering the approved scope — present once approved. */
  grantId?: string;
  /** The approved scope — present once approved. */
  scope?: string;
}

/** Result of {@link DirectDataController.readApprovedData}. */
export interface ApprovedDataResult<T = unknown> {
  /** The scope the data was read for. */
  scope: string;
  /** The decoded payload returned by the Personal Server. */
  data: T;
}

/**
 * Injectable transport for the access-request (app-dev) service.
 *
 * @remarks
 * **TEMPORARY SEAM.** The app-dev access-request service that turns a registered
 * builder into a `dcr_*` id + approval URL does not yet have a stable, in-SDK
 * protocol implementation. Until it does, the controller accepts an injected
 * client so apps can wire their own transport (or a test double) without losing
 * the copy-paste controller shape. The default implementation targets the
 * documented Vana URLs but its wire contract is **PROVISIONAL** and may change.
 */
export interface AccessRequestClient {
  /**
   * Create an access request for the given app + scopes.
   *
   * @param input - App identity, source, scopes, and the post-approval return URL.
   * @returns The created {@link AccessRequest}.
   */
  createAccessRequest(input: {
    appAddress: string;
    app: DirectAppConfig;
    source: string;
    scopes: string[];
    returnUrl: string;
  }): Promise<AccessRequest>;

  /**
   * Fetch the current status of a previously created access request.
   *
   * @param requestId - The `dcr_*` id returned by {@link AccessRequestClient.createAccessRequest}.
   * @returns The current {@link AccessRequestStatus}.
   */
  getAccessRequestStatus(requestId: string): Promise<AccessRequestStatus>;
}

/**
 * Injectable signer for x402-style payment challenges.
 *
 * @remarks
 * **PROVISIONAL.** When a Personal Server responds `402 Payment Required`, the
 * controller hands the parsed challenge to this signer and retries the read with
 * the returned value as the `X-PAYMENT` header. The default signer is derived
 * from `builderPrivateKey`; the exact challenge/voucher format is not yet fixed
 * by an in-repo protocol and may change.
 */
export interface PaymentSigner {
  /**
   * Produce an `X-PAYMENT` header value for a 402 challenge.
   *
   * @param challenge - The parsed 402 payment-required challenge.
   * @returns The `X-PAYMENT` header value to retry the request with.
   */
  signPaymentChallenge(challenge: PaymentChallenge): Promise<string>;
}

/**
 * Parsed `402 Payment Required` challenge.
 *
 * @remarks
 * Modeled on the x402 `accepts` shape. The controller passes the parsed body
 * through verbatim under {@link PaymentChallenge.raw} so a custom
 * {@link PaymentSigner} can read fields the SDK does not yet model.
 */
export interface PaymentChallenge {
  /** Resource being paid for (typically the request URL). */
  resource: string;
  /** Candidate payment requirements offered by the server (x402 `accepts`). */
  accepts: PaymentRequirement[];
  /** The full, unmodified 402 response body. */
  raw: unknown;
}

/** A single x402-style payment requirement option. */
export interface PaymentRequirement {
  /** Payment scheme identifier (e.g. `"exact"`). */
  scheme: string;
  /** Network/chain the payment settles on. */
  network: string;
  /** Amount required, in the smallest unit (string to preserve precision). */
  maxAmountRequired: string;
  /** Address that receives the payment. */
  payTo: string;
  /** Asset/token contract address. */
  asset: string;
  /** Opaque, scheme-specific extra fields. */
  extra?: Record<string, unknown>;
}
