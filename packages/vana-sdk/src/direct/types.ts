import type { EscrowAccessRecord } from "../protocol/escrow";

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
export type DirectNetwork = "mainnet" | "moksha";

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
}

/** Result of {@link DirectDataController.createAccessRequest}. */
export interface AccessRequest {
  /** Opaque request id (e.g. `"dcr_123"`). */
  requestId: string;
  /** URL the browser opens so the user can approve the requested scopes. */
  approvalUrl: string;
  /** On-chain address of the (registered or reused) app. */
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
  /**
   * Payment receipt — present only when this read required (and settled) a
   * payment. Lets builders inspect the amount, asset, and fee breakdown without
   * digging into the underlying 402/escrow exchange. Reads served from a paid-up
   * grant omit this field.
   */
  payment?: DirectPaymentReceipt;
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
 * Op-type vocabulary used by the DPv2 escrow payment surface.
 *
 * @remarks
 * These are the operations the gateway prices and settles via
 * `POST /v1/escrow/pay` (`opType` field of the `GenericPayment` message). A
 * direct data read settles the {@link DirectOpType.DataAccess} op for the
 * approved grant; the other op types are listed here for completeness and to
 * give builders a typed vocabulary when inspecting fee breakdowns.
 *
 * Note: the escrow `GenericPayment` `opType` is currently `"grant"` on the wire
 * for grant lifecycle payments; this enum names the higher-level fee categories
 * the gateway reports in a {@link PaymentBreakdown}.
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
 * The PS read 402 body identifies the grant to settle and the amount/asset. The
 * controller settles it via the DPv2 escrow gateway (`/v1/escrow/pay`). The full
 * unmodified body is preserved under {@link PersonalServerPaymentRequired.raw}.
 */
export interface PersonalServerPaymentRequired {
  /** Grant id to settle (the escrow `opId`). Defaults to the read's grantId. */
  grantId: string;
  /** Payment nonce requested by the 402 challenge. */
  paymentNonce?: string;
  /** Server-signed data access receipt requested by the 402 challenge. */
  accessRecord?: EscrowAccessRecord;
  /** Asset address owed (zero address = native VANA). */
  asset: string;
  /** Amount owed, as a decimal base-unit string (preserves uint256 precision). */
  amount: string;
  /** The full, unmodified 402 response body. */
  raw: unknown;
}

/**
 * Structured payment metadata attached to a successful paid read.
 *
 * @remarks
 * Derived from the gateway's {@link EscrowPayResult}. Lets builders debug the
 * amount, asset, and per-op fee breakdown without re-deriving anything from the
 * raw 402/payment exchange.
 */
export interface DirectPaymentReceipt {
  /** Op type settled (the gateway `opType`, e.g. `"grant"`). */
  opType: string;
  /** Op id settled (the grant id). */
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
