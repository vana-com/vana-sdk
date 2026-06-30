import type { Web3SignedSignFn } from "../auth/web3-signed-builder";

/** Deployment environment for Vana's Session Relay service. */
export type SessionRelayEnvironment = "production" | "dev";

/** Minimal fetch signature accepted by the Session Relay clients. */
export type SessionRelayFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}>;

/** Shared Session Relay client options. */
export interface SessionRelayClientOptions {
  /** Session Relay base URL. Defaults from `env` when omitted. */
  baseUrl?: string;
  /** Vana deployment environment. Defaults to `"production"`. */
  env?: SessionRelayEnvironment;
  /** Fetch implementation. Defaults to `globalThis.fetch`. */
  fetchFn?: SessionRelayFetch;
}

/** Builder-side Session Relay options. */
export interface SessionRelayBuilderClientOptions extends SessionRelayClientOptions {
  /** Builder/app address registered with the Vana builder registry. */
  granteeAddress: `0x${string}`;
  /** EIP-191 signer for Web3Signed Relay requests. */
  signMessage: Web3SignedSignFn;
  /** Clock source used for signed request freshness claims. */
  now?: () => number;
}

/** Parameters for creating a Session Relay session. */
export interface SessionRelayInitParams {
  /** Data scopes requested from the user. */
  scopes: string[];
  /** Public HTTPS callback URL for grant notifications. */
  webhookUrl?: string;
  /** App-owned user id for correlating the approved grant. */
  appUserId?: string;
}

/** Raw Session Relay init result. */
export interface SessionRelayInitResult {
  sessionId: string;
  deepLinkUrl: string;
  expiresAt: string;
}

/** Grant payload returned after a Relay session is approved. */
export interface SessionRelayGrantPayload {
  grantId: string;
  userAddress: string;
  builderAddress: string;
  scopes: string[];
  serverAddress?: string;
  appUserId?: string;
}

/** Session Relay poll result. */
export interface SessionRelayPollResult {
  /**
   * Current session status.
   *
   * @remarks
   * Current Session Relay deployments may report expired sessions as a
   * structured `SESSION_EXPIRED` error instead of a JSON body with
   * `status: "expired"`. The `"expired"` status is accepted for deployments
   * that return expiry as a terminal poll body.
   */
  status: "pending" | "claimed" | "approved" | "denied" | "expired";
  grant?: SessionRelayGrantPayload;
  reason?: string;
}

/** Desktop/app-side claim request. */
export interface SessionRelayClaimRequest {
  sessionId: string;
  secret: string;
}

/** Claimed session data returned to the app that completes user consent. */
export interface SessionRelayClaimResponse {
  sessionId: string;
  granteeAddress: string;
  scopes: string[];
  expiresAt: string;
  webhookUrl?: string;
  appUserId?: string;
}

/** Desktop/app-side approval request. */
export interface SessionRelayApproveRequest {
  secret: string;
  grantId: string;
  userAddress: string;
  serverAddress?: string;
  scopes: string[];
}

/** Desktop/app-side denial request. */
export interface SessionRelayDenyRequest {
  secret: string;
  reason?: string;
}

/** Session Relay methods that do not require builder signing. */
export interface SessionRelayClient {
  claimSession(
    request: SessionRelayClaimRequest,
  ): Promise<SessionRelayClaimResponse>;
  approveSession(
    sessionId: string,
    request: SessionRelayApproveRequest,
  ): Promise<void>;
  denySession(
    sessionId: string,
    request: SessionRelayDenyRequest,
  ): Promise<void>;
  pollSession(sessionId: string): Promise<SessionRelayPollResult>;
  pollUntilComplete(
    sessionId: string,
    opts?: { intervalMs?: number; timeoutMs?: number },
  ): Promise<SessionRelayPollResult>;
}

/** Builder-side Session Relay methods. */
export interface SessionRelayBuilderClient {
  initSession(params: SessionRelayInitParams): Promise<SessionRelayInitResult>;
  pollSession(sessionId: string): Promise<SessionRelayPollResult>;
  pollUntilComplete(
    sessionId: string,
    opts?: { intervalMs?: number; timeoutMs?: number },
  ): Promise<SessionRelayPollResult>;
}
