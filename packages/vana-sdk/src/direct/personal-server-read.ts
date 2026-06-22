/**
 * Personal Server data-read request builder and 402/X-PAYMENT read loop.
 *
 * @remarks
 * The builder guide references a `buildPersonalServerDataReadRequest` helper and
 * an X-PAYMENT retry. Neither existed in the SDK, so they are implemented here on
 * top of the existing {@link buildWeb3SignedHeader} primitive. The read targets
 * the Personal Server data path (`/v1/data/{scope}`) used elsewhere in the SDK,
 * authenticates with a Web3Signed header, and — on `402 Payment Required` —
 * signs the parsed challenge via the supplied {@link PaymentSigner} and retries
 * once with the `X-PAYMENT` header.
 *
 * The 402 challenge parsing follows the x402 `accepts` convention; the exact
 * wire shape is **PROVISIONAL**.
 *
 * @category Direct
 * @module direct/personal-server-read
 */

import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import type { Web3SignedSignFn } from "../auth/web3-signed-builder";
import { PaymentRequiredError, PersonalServerReadError } from "./errors";
import type {
  PaymentChallenge,
  PaymentRequirement,
  PaymentSigner,
} from "./types";

/** Minimal `Response`-like shape so the read loop is testable without a DOM. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** Minimal `fetch` signature accepted by {@link readPersonalServerData}. */
export type PersonalServerFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
  },
) => Promise<FetchResponseLike>;

/** A built, ready-to-send Personal Server data read request. */
export interface PersonalServerDataReadRequest {
  /** Absolute URL of the read endpoint. */
  url: string;
  /** HTTP method (always `"GET"`). */
  method: "GET";
  /** Request path used in the Web3Signed `uri` claim (e.g. `/v1/data/{scope}`). */
  path: string;
  /** Headers including the Web3Signed `Authorization` value. */
  headers: Record<string, string>;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Compute the data path for a scope (`/v1/data/{scope}`). */
export function dataPathForScope(scope: string): string {
  return `/v1/data/${encodeURIComponent(scope)}`;
}

/**
 * Build a Web3Signed-authenticated Personal Server data read request.
 *
 * @param params - Personal Server URL, scope, grant id, and an EIP-191 signer.
 * @returns The request URL, method, path, and headers (including `Authorization`).
 */
export async function buildPersonalServerDataReadRequest(params: {
  /** Base URL of the user's Personal Server. */
  personalServerUrl: string;
  /** Scope to read (e.g. `"icloud_notes.notes"`). */
  scope: string;
  /** Grant id authorizing the read. */
  grantId: string;
  /** EIP-191 signer for the Web3Signed header (the builder/app key). */
  signMessage: Web3SignedSignFn;
  /** Optional `X-PAYMENT` header value (set on a payment retry). */
  paymentHeader?: string;
}): Promise<PersonalServerDataReadRequest> {
  const base = stripTrailingSlash(params.personalServerUrl);
  const path = dataPathForScope(params.scope);
  const authorization = await buildWeb3SignedHeader({
    signMessage: params.signMessage,
    aud: base,
    method: "GET",
    uri: path,
    grantId: params.grantId,
  });
  const headers: Record<string, string> = {
    Authorization: authorization,
    Accept: "application/json",
  };
  if (params.paymentHeader) {
    headers["X-PAYMENT"] = params.paymentHeader;
  }
  return { url: `${base}${path}`, method: "GET", path, headers };
}

/** Parse a `402 Payment Required` response body into a {@link PaymentChallenge}. */
export async function parsePaymentChallenge(
  res: FetchResponseLike,
  resource: string,
): Promise<PaymentChallenge> {
  let raw: unknown = undefined;
  try {
    raw = await res.json();
  } catch {
    raw = undefined;
  }
  const body = (raw ?? {}) as { accepts?: unknown; resource?: unknown };
  const accepts: PaymentRequirement[] = Array.isArray(body.accepts)
    ? (body.accepts as PaymentRequirement[])
    : [];
  return {
    resource: typeof body.resource === "string" ? body.resource : resource,
    accepts,
    raw,
  };
}

/**
 * Read approved data from a Personal Server, handling 402 Payment Required.
 *
 * @remarks
 * Sends a Web3Signed-authenticated `GET /v1/data/{scope}`. On `402`, parses the
 * challenge, signs it via `paymentSigner`, and retries once with `X-PAYMENT`. If
 * the server still responds 402 (or there is no signer), throws
 * {@link PaymentRequiredError}.
 *
 * @param params - Connection details, signer, and optional payment signer/fetch.
 * @returns The decoded JSON payload returned by the Personal Server.
 */
export async function readPersonalServerData(params: {
  personalServerUrl: string;
  scope: string;
  grantId: string;
  signMessage: Web3SignedSignFn;
  paymentSigner?: PaymentSigner;
  fetchFn?: PersonalServerFetch;
}): Promise<unknown> {
  const fetchFn =
    params.fetchFn ?? (globalThis.fetch as unknown as PersonalServerFetch);
  if (!fetchFn) {
    throw new PersonalServerReadError(
      "No fetch implementation available for Personal Server read",
    );
  }

  const initial = await buildPersonalServerDataReadRequest({
    personalServerUrl: params.personalServerUrl,
    scope: params.scope,
    grantId: params.grantId,
    signMessage: params.signMessage,
  });

  let res = await fetchFn(initial.url, {
    method: initial.method,
    headers: initial.headers,
  });

  if (res.status === 402) {
    if (!params.paymentSigner) {
      throw new PaymentRequiredError(
        "Personal Server requires payment but no paymentSigner is configured",
        { scope: params.scope },
      );
    }
    const challenge = await parsePaymentChallenge(res, initial.url);
    const paymentHeader =
      await params.paymentSigner.signPaymentChallenge(challenge);

    // Re-sign the request — the X-PAYMENT header rides alongside a fresh
    // Web3Signed Authorization so the read is replay-safe on retry.
    const retry = await buildPersonalServerDataReadRequest({
      personalServerUrl: params.personalServerUrl,
      scope: params.scope,
      grantId: params.grantId,
      signMessage: params.signMessage,
      paymentHeader,
    });
    res = await fetchFn(retry.url, {
      method: retry.method,
      headers: retry.headers,
    });

    if (res.status === 402) {
      throw new PaymentRequiredError(
        "Personal Server still requires payment after X-PAYMENT retry",
        { scope: params.scope },
      );
    }
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new PersonalServerReadError(
      `Personal Server read failed: ${res.status} ${res.statusText}`,
      res.status,
      { scope: params.scope, body: detail.slice(0, 500) },
    );
  }

  return res.json();
}
