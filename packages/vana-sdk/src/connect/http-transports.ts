/**
 * Browser transports for the routes `createVanaConnectHandler` serves.
 *
 * @remarks
 * `createVanaConnectTransports({ endpoint: "/api/vana" })` returns the
 * `createRequest` / `getStatus` / `readResult` / `authorizeRequest`
 * transports `createDirectConnectFlow` takes, plus `getConfig` for the sheet.
 * Any backend that implements the same wire contract works, in any language.
 *
 * @category Connect
 * @module connect/http-transports
 */

import type { RequestAuthorization } from "./protocol";
import type {
  AccessRequest,
  AccessRequestStatus,
  ApprovedDataResult,
} from "../direct/types";

/** Response body of `GET {endpoint}/config`. */
export interface VanaConnectConfig {
  /** Protocol version of the sheet the backend's SDK speaks. */
  protocolVersion: number;
  /** `"production"` or `"dev"`. */
  env: string;
  /** Registered embed client id, or `null` when the sheet is not set up. */
  clientId: string | null;
  /** Label on the sheet chrome. */
  appName: string;
  /** Vana Account origin that serves the sheet. */
  accountOrigin: string;
}

/** Response body of `POST {endpoint}/request`. */
export interface VanaConnectRequestResponse {
  request: AccessRequest;
  /** The sheet's read capability for `request`; `null` if it cannot be signed. */
  embed: { id: string; authorization: RequestAuthorization } | null;
}

/** Thrown when a connect route answers with a non-2xx status. */
export class VanaConnectHttpError extends Error {
  constructor(
    message: string,
    /** HTTP status. */
    public readonly status: number,
    /** `error.code` from the body, when present. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "VanaConnectHttpError";
  }
}

/** Options for {@link createVanaConnectTransports}. */
export interface VanaConnectTransportOptions {
  /** Base path of the handler's routes. Defaults to `"/api/vana"`. */
  endpoint?: string;
  /** `fetch`. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /**
   * How long the signature returned with a fresh request is reused for the
   * sheet's first ask, in ms. Defaults to 60000. Later asks always re-sign.
   */
  reuseFreshAuthorizationMs?: number;
  /** Clock in ms. Defaults to `Date.now`. */
  now?: () => number;
}

/** The transports {@link createVanaConnectTransports} returns. */
export interface VanaConnectTransports<T = unknown> {
  createRequest(): Promise<AccessRequest>;
  getStatus(requestId: string): Promise<AccessRequestStatus>;
  readResult(requestId: string): Promise<ApprovedDataResult<T>>;
  authorizeRequest(requestId: string): Promise<RequestAuthorization>;
  getConfig(): Promise<VanaConnectConfig>;
}

/**
 * Create browser transports for a `createVanaConnectHandler` backend.
 *
 * @param options - Base path and `fetch`.
 * @returns Transports for `createDirectConnectFlow` / `useVanaConnect`.
 */
export function createVanaConnectTransports<T = unknown>(
  options: VanaConnectTransportOptions = {},
): VanaConnectTransports<T> {
  const base = (options.endpoint ?? "/api/vana").replace(/\/+$/, "");
  const now = options.now ?? Date.now;
  const reuseMs = options.reuseFreshAuthorizationMs ?? 60_000;
  let fresh: {
    id: string;
    authorization: RequestAuthorization;
    at: number;
  } | null = null;
  let config: Promise<VanaConnectConfig> | null = null;

  async function call<R>(path: string, init?: RequestInit): Promise<R> {
    const fetchFn = options.fetch ?? globalThis.fetch;
    const response = await fetchFn(`${base}/${path}`, {
      credentials: "same-origin",
      ...init,
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: unknown; message?: unknown };
    } | null;
    if (!response.ok) {
      const code =
        typeof body?.error?.code === "string" ? body.error.code : undefined;
      const message =
        typeof body?.error?.message === "string"
          ? body.error.message
          : `Vana connect route ${path} failed: ${response.status}`;
      throw new VanaConnectHttpError(message, response.status, code);
    }
    return body as R;
  }

  function postRequest(body: object): Promise<VanaConnectRequestResponse> {
    return call<VanaConnectRequestResponse>("request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  return {
    async createRequest() {
      const { request, embed } = await postRequest({});
      fresh = embed ? { ...embed, at: now() } : null;
      return request;
    },
    getStatus(requestId) {
      return call(`status?requestId=${encodeURIComponent(requestId)}`);
    },
    readResult(requestId) {
      return call(`data?requestId=${encodeURIComponent(requestId)}`);
    },
    async authorizeRequest(requestId) {
      const cached = fresh;
      fresh = null;
      if (cached && cached.id === requestId && now() - cached.at < reuseMs) {
        return cached.authorization;
      }
      const { embed } = await postRequest({ requestId });
      if (!embed) {
        throw new VanaConnectHttpError("The request could not be signed", 500);
      }
      return embed.authorization;
    },
    getConfig() {
      config ??= call<VanaConnectConfig>("config").catch((error: unknown) => {
        config = null;
        throw error;
      });
      return config;
    },
  };
}
