/**
 * Personal Server data-read request builder and the 402 -> escrow-pay -> retry loop.
 *
 * @remarks
 * The read targets the Personal Server data path (`/v1/data/{scope}`),
 * authenticates with a Web3Signed header (built on {@link buildWeb3SignedHeader}),
 * and — on `402 Payment Required` — settles the grant's data-access fee through
 * the DPv2 escrow gateway and retries once.
 *
 * The 402 body is parsed into a {@link PersonalServerPaymentRequired} (grant id,
 * asset, and amount owed), which drives the escrow settlement.
 *
 * @category Direct
 * @module direct/personal-server-read
 */

import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import type { Web3SignedSignFn } from "../auth/web3-signed-builder";
import {
  NATIVE_ASSET_ADDRESS,
  type EscrowAccessRecord,
} from "../protocol/escrow";
import {
  authorizeGrantPayment,
  GRANT_OP_TYPE,
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(
  record: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = record?.[field];
  return typeof value === "string" ? value : undefined;
}

function parseAccessRecord(value: unknown): EscrowAccessRecord | undefined {
  const record = asRecord(value);
  const dataPointId = stringField(record, "dataPointId");
  const version = stringField(record, "version");
  const accessor = stringField(record, "accessor");
  const recordId = stringField(record, "recordId");
  const signature = stringField(record, "signature");

  if (!dataPointId || !version || !accessor || !recordId || !signature) {
    return undefined;
  }

  return {
    dataPointId: dataPointId as `0x${string}`,
    version,
    accessor: accessor as `0x${string}`,
    recordId: recordId as `0x${string}`,
    signature: signature as `0x${string}`,
  };
}

function isBytes32Hex(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function assertChallengeMatchesGrant(params: {
  challengeGrantId?: string;
  challengeOpId?: string;
  challengeOpType?: string;
  grantId: string;
}): void {
  const { challengeGrantId, challengeOpId, challengeOpType, grantId } = params;

  if (challengeOpType && challengeOpType !== GRANT_OP_TYPE) {
    throw new PersonalServerReadError(
      "Personal Server payment challenge used an unsupported escrow op type",
      402,
      { opType: challengeOpType },
    );
  }

  const challengedGrantId = challengeOpId ?? challengeGrantId;
  if (!challengedGrantId) return;

  if (!isBytes32Hex(challengedGrantId)) {
    throw new PersonalServerReadError(
      "Personal Server payment challenge used an invalid escrow op id",
      402,
      { opId: challengedGrantId },
    );
  }

  if (challengedGrantId.toLowerCase() !== grantId.toLowerCase()) {
    throw new PersonalServerReadError(
      "Personal Server payment challenge did not match the requested grant",
      402,
      { opId: challengedGrantId, grantId },
    );
  }
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
 * Accepts a few field spellings and falls back to the read's own grantId and the
 * native asset when a field is absent.
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
  const body = asRecord(raw) ?? {};
  const accept =
    Array.isArray(body.accepts) && body.accepts.length > 0
      ? asRecord(body.accepts[0])
      : undefined;
  const message = asRecord(accept?.message);
  const challengeGrantId = stringField(body, "grantId");
  const challengeOpId =
    stringField(message, "opId") ?? stringField(body, "opId");
  const challengeOpType =
    stringField(message, "opType") ?? stringField(body, "opType");

  assertChallengeMatchesGrant({
    challengeGrantId,
    challengeOpId,
    challengeOpType,
    grantId,
  });

  const amountValue =
    stringField(message, "amount") ??
    stringField(body, "amount") ??
    stringField(body, "maxAmountRequired") ??
    "0";
  return {
    grantId,
    paymentNonce:
      stringField(message, "paymentNonce") ?? stringField(body, "paymentNonce"),
    accessRecord: parseAccessRecord(accept?.accessRecord ?? body.accessRecord),
    asset:
      stringField(message, "asset") ??
      stringField(body, "asset") ??
      NATIVE_ASSET_ADDRESS,
    amount: amountValue,
    raw,
  };
}

function hasPositiveAmount(amount: string): boolean {
  if (!/^\d+$/.test(amount)) return false;
  return BigInt(amount) > 0n;
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

    if (!hasPositiveAmount(required.amount)) {
      throw new PaymentRequiredError(
        "Personal Server payment challenge did not include a positive amount",
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

    // Re-sign and retry after the escrow gateway accepts the payment.
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
