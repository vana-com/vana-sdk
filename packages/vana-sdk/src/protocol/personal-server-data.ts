import {
  buildWeb3SignedHeader,
  type Web3SignedSignFn,
} from "../auth/web3-signed-builder";
import { DataFileEnvelopeSchema, type DataFileEnvelope } from "./data-file";

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

  if (!response.ok) {
    throw new Error(
      `Personal Server data read failed: ${response.status} ${response.statusText}`,
    );
  }

  return DataFileEnvelopeSchema.parse(await response.json());
}
