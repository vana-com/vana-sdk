import {
  buildWeb3SignedHeader,
  type Web3SignedSignFn,
} from "../auth/web3-signed-builder";
import { DataPointDeletedError } from "../errors";
import { DataFileEnvelopeSchema, type DataFileEnvelope } from "./data-file";
import {
  isDataPointTombstone,
  tombstoneDeletedAt,
} from "./data-point-deletion";
import { readJsonValue } from "../utils/response-body";

export interface BuildPersonalServerDataReadRequestParams {
  personalServerUrl: string;
  scope: string;
  grantId: string;
  signMessage: Web3SignedSignFn;
  audience?: string;
  headers?: HeadersInit;
}

export interface ReadPersonalServerDataParams extends BuildPersonalServerDataReadRequestParams {
  fetch?: typeof fetch;
}

export function personalServerDataReadPath(scope: string): string {
  return `/v1/data/${encodeURIComponent(scope)}`;
}

export async function buildPersonalServerDataReadRequest(
  params: BuildPersonalServerDataReadRequestParams,
): Promise<Request> {
  const path = personalServerDataReadPath(params.scope);
  const baseUrl = params.personalServerUrl.replace(/\/+$/, "");
  const audience = params.audience ?? baseUrl;
  const headers = new Headers(params.headers);

  headers.set(
    "Authorization",
    await buildWeb3SignedHeader({
      aud: audience,
      grantId: params.grantId,
      method: "GET",
      signMessage: params.signMessage,
      uri: path,
    }),
  );

  return new Request(`${baseUrl}${path}`, {
    headers,
    method: "GET",
  });
}

export async function readPersonalServerData(
  params: ReadPersonalServerDataParams,
): Promise<DataFileEnvelope> {
  const fetchFn = params.fetch ?? globalThis.fetch;
  if (fetchFn === undefined) {
    throw new Error("No fetch implementation available");
  }

  const request = await buildPersonalServerDataReadRequest(params);
  const response = await fetchFn(request);

  // 410 = the scope was tombstoned. Typed so callers can branch on it
  // instead of pattern-matching a generic read failure.
  if (response.status === 410) {
    throw new DataPointDeletedError(
      `Personal Server scope '${params.scope}' has been deleted`,
      {
        scope: params.scope,
        deletedAt: tombstoneDeletedAt(await readJsonValue(response)),
      },
    );
  }

  if (!response.ok) {
    throw new Error(
      `Personal Server data read failed: ${response.status} ${response.statusText}`,
    );
  }

  const body: unknown = await response.json();
  // A tombstone must never be returned as data, even if the server answered
  // 200 with the deleted row (deletedAt / tombstone hash pair).
  if (isDataPointTombstone(body)) {
    throw new DataPointDeletedError(
      `Personal Server scope '${params.scope}' has been deleted`,
      { scope: params.scope, deletedAt: tombstoneDeletedAt(body) },
    );
  }

  return DataFileEnvelopeSchema.parse(body);
}
