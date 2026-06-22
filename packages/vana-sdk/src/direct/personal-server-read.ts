/**
 * Personal Server data-read request builder and the 402 -> escrow-pay -> retry loop.
 *
 * @remarks
 * The read targets the Personal Server data path (`/v1/data/{scope}`),
 * authenticates with a Web3Signed header (built on {@link buildWeb3SignedHeader}),
 * and — on `402 Payment Required` — settles the grant's data-access fee through
 * the DPv2 escrow gateway and retries once.
 *
 * The 402 body is parsed into a {@link PersonalServerPaymentRequired}. That body
 * contract (how the PS expresses *what* is owed) is **PROVISIONAL**; the escrow
 * settlement it drives is the real `protocol/escrow` surface.
 *
 * @category Direct
 * @module direct/personal-server-read
 */

import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import type { Web3SignedSignFn } from "../auth/web3-signed-builder";
import { NATIVE_ASSET_ADDRESS } from "../protocol/escrow";
import {
  authorizeGrantPayment,
  type EscrowPaymentConfig,
} from "./escrow-payment";
import { PaymentRequiredError, PersonalServerReadError } from "./errors";
import type {
  DirectPaymentReceipt,
  PersonalServerPaymentRequired,
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

/** Outcome of {@link readPersonalServerData}: the payload plus optional receipt. */
export interface PersonalServerReadResult {
  /** The decoded JSON payload returned by the Personal Server. */
  data: unknown;
  /** Present only when this read required (and settled) a payment. */
  payment?: DirectPaymentReceipt;
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
  /** EIP-191 signer for the Web3Signed header (the app key). */
  signMessage: Web3SignedSignFn;
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
  return { url: `${base}${path}`, method: "GET", path, headers };
}

/**
 * Parse a `402 Payment Required` body into a {@link PersonalServerPaymentRequired}.
 *
 * @remarks
 * Accepts a few likely field spellings and falls back to the read's own grantId
 * and the native asset. The on-wire contract is **PROVISIONAL**.
 *
 * @param res - The 402 response.
 * @param grantId - The grant id of the read (default `opId`).
 * @returns The parsed payment requirement.
 */
export async function parsePersonalServerPaymentRequired(
  res: FetchResponseLike,
  grantId: string,
): Promise<PersonalServerPaymentRequired> {
  let raw: unknown = undefined;
  try {
    raw = await res.json();
  } catch {
    raw = undefined;
  }
  const body = (raw ?? {}) as {
    grantId?: unknown;
    opId?: unknown;
    asset?: unknown;
    amount?: unknown;
    maxAmountRequired?: unknown;
  };
  const resolvedGrantId =
    typeof body.grantId === "string"
      ? body.grantId
      : typeof body.opId === "string"
        ? body.opId
        : grantId;
  const amountValue =
    typeof body.amount === "string"
      ? body.amount
      : typeof body.maxAmountRequired === "string"
        ? body.maxAmountRequired
        : "0";
  return {
    grantId: resolvedGrantId,
    asset: typeof body.asset === "string" ? body.asset : NATIVE_ASSET_ADDRESS,
    amount: amountValue,
    raw,
  };
}

/**
 * Read approved data from a Personal Server, settling a 402 via escrow.
 *
 * @remarks
 * Sends a Web3Signed-authenticated `GET /v1/data/{scope}`. On `402`, parses what
 * is owed, authorizes an escrow payment for the grant via `escrow`, and retries
 * once. If escrow is not configured, throws {@link PaymentRequiredError} carrying
 * the parsed requirement so callers can debug amount/asset.
 *
 * @param params - Connection details, app signer, optional escrow config and fetch.
 * @returns `{ data, payment? }`.
 */
export async function readPersonalServerData(params: {
  personalServerUrl: string;
  scope: string;
  grantId: string;
  payerAddress: `0x${string}`;
  signMessage: Web3SignedSignFn;
  escrow?: EscrowPaymentConfig;
  fetchFn?: PersonalServerFetch;
}): Promise<PersonalServerReadResult> {
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

  let payment: DirectPaymentReceipt | undefined;

  if (res.status === 402) {
    const required = await parsePersonalServerPaymentRequired(
      res,
      params.grantId,
    );
    if (!params.escrow) {
      throw new PaymentRequiredError(
        "Personal Server requires payment but no escrow config is set",
        {
          scope: params.scope,
          grantId: required.grantId,
          asset: required.asset,
          amount: required.amount,
        },
      );
    }

    payment = await authorizeGrantPayment({
      payerAddress: params.payerAddress,
      required,
      config: params.escrow,
    });

    // Re-sign and retry — the settled payment unlocks the read.
    const retry = await buildPersonalServerDataReadRequest({
      personalServerUrl: params.personalServerUrl,
      scope: params.scope,
      grantId: params.grantId,
      signMessage: params.signMessage,
    });
    res = await fetchFn(retry.url, {
      method: retry.method,
      headers: retry.headers,
    });

    if (res.status === 402) {
      throw new PaymentRequiredError(
        "Personal Server still requires payment after escrow settlement",
        {
          scope: params.scope,
          grantId: required.grantId,
          asset: required.asset,
          amount: required.amount,
          payment,
        },
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

  return { data: await res.json(), payment };
}
