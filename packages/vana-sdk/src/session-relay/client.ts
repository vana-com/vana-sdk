import { getSessionRelayUrl } from "./endpoints";
import { SessionRelayError } from "./errors";
import { buildSessionRelayWeb3SignedHeader } from "./signing";
import type {
  SessionRelayApproveRequest,
  SessionRelayBuilderClient,
  SessionRelayBuilderClientOptions,
  SessionRelayClaimRequest,
  SessionRelayClaimResponse,
  SessionRelayClient,
  SessionRelayClientOptions,
  SessionRelayDenyRequest,
  SessionRelayFetch,
  SessionRelayInitParams,
  SessionRelayInitResult,
  SessionRelayPollResult,
} from "./types";

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 15 * 60_000;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveFetch(fetchFn?: SessionRelayFetch): SessionRelayFetch {
  const resolved = fetchFn ?? (globalThis.fetch as SessionRelayFetch);
  if (!resolved) {
    throw new SessionRelayError(
      "No fetch implementation available. Pass `fetchFn` to the Session Relay client.",
      { relayErrorCode: "SESSION_RELAY_CONFIG_ERROR" },
    );
  }
  return resolved;
}

function endpoint(options: SessionRelayClientOptions): string {
  return stripTrailingSlash(options.baseUrl ?? getSessionRelayUrl(options.env));
}

async function parseJson(res: Awaited<ReturnType<SessionRelayFetch>>) {
  if (res.status === 204) return undefined;

  if (res.text) {
    const text = await res.text();
    if (text.length === 0) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new SessionRelayError(
        `Session Relay returned a non-JSON response (HTTP ${res.status})`,
        { status: res.status },
      );
    }
  }

  try {
    return await res.json();
  } catch {
    throw new SessionRelayError(
      `Session Relay returned a non-JSON response (HTTP ${res.status})`,
      { status: res.status },
    );
  }
}

function relayErrorFromBody(
  body: unknown,
):
  | { message?: string; code?: number; errorCode?: string; details?: unknown }
  | undefined {
  if (body === null || typeof body !== "object" || !("error" in body)) {
    return undefined;
  }
  const error = (body as { error?: unknown }).error;
  if (error === null || typeof error !== "object") return undefined;
  return error as {
    message?: string;
    code?: number;
    errorCode?: string;
    details?: unknown;
  };
}

async function relayFetch<T>(
  fetchFn: SessionRelayFetch,
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<T> {
  let res: Awaited<ReturnType<SessionRelayFetch>>;
  try {
    res = await fetchFn(url, init);
  } catch (err) {
    throw new SessionRelayError(
      "Network error communicating with Session Relay",
      {
        body: err,
      },
    );
  }

  const body = await parseJson(res);
  if (!res.ok) {
    const relayError = relayErrorFromBody(body);
    throw new SessionRelayError(
      relayError?.message ??
        `Session Relay request failed (HTTP ${res.status})`,
      {
        status: res.status,
        relayCode: relayError?.code,
        relayErrorCode: relayError?.errorCode,
        body,
      },
    );
  }

  return body as T;
}

async function pollSession(
  fetchFn: SessionRelayFetch,
  baseUrl: string,
  sessionId: string,
): Promise<SessionRelayPollResult> {
  return relayFetch<SessionRelayPollResult>(
    fetchFn,
    `${baseUrl}/v1/session/${encodeURIComponent(sessionId)}/poll`,
    { method: "GET" },
  );
}

async function pollUntilComplete(
  fetchFn: SessionRelayFetch,
  baseUrl: string,
  sessionId: string,
  opts?: { intervalMs?: number; timeoutMs?: number },
): Promise<SessionRelayPollResult> {
  const intervalMs = opts?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await pollSession(fetchFn, baseUrl, sessionId);
    if (
      result.status === "approved" ||
      result.status === "denied" ||
      result.status === "expired"
    ) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new SessionRelayError("Polling timed out", {
    relayErrorCode: "SESSION_RELAY_POLL_TIMEOUT",
  });
}

/**
 * Create a Session Relay client for app-side claim/approve/deny calls and
 * unsigned polling.
 *
 * @remarks
 * This is a Vana service integration client, not a protocol-core primitive.
 * It intentionally models the current Session Relay HTTP API while leaving
 * user-facing grant orchestration to the app using it.
 */
export function createSessionRelayClient(
  options: SessionRelayClientOptions = {},
): SessionRelayClient {
  const fetchFn = resolveFetch(options.fetchFn);
  const baseUrl = endpoint(options);

  return {
    claimSession(
      request: SessionRelayClaimRequest,
    ): Promise<SessionRelayClaimResponse> {
      return relayFetch<SessionRelayClaimResponse>(
        fetchFn,
        `${baseUrl}/v1/session/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
    },

    async approveSession(
      sessionId: string,
      request: SessionRelayApproveRequest,
    ): Promise<void> {
      await relayFetch<unknown>(
        fetchFn,
        `${baseUrl}/v1/session/${encodeURIComponent(sessionId)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
    },

    async denySession(
      sessionId: string,
      request: SessionRelayDenyRequest,
    ): Promise<void> {
      await relayFetch<unknown>(
        fetchFn,
        `${baseUrl}/v1/session/${encodeURIComponent(sessionId)}/deny`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
    },

    pollSession(sessionId: string): Promise<SessionRelayPollResult> {
      return pollSession(fetchFn, baseUrl, sessionId);
    },

    pollUntilComplete(
      sessionId: string,
      opts?: { intervalMs?: number; timeoutMs?: number },
    ): Promise<SessionRelayPollResult> {
      return pollUntilComplete(fetchFn, baseUrl, sessionId, opts);
    },
  };
}

/**
 * Create a builder-side Session Relay client for signed session init and
 * unsigned polling.
 */
export function createSessionRelayBuilderClient(
  options: SessionRelayBuilderClientOptions,
): SessionRelayBuilderClient {
  const fetchFn = resolveFetch(options.fetchFn);
  const baseUrl = endpoint(options);

  return {
    async initSession(
      params: SessionRelayInitParams,
    ): Promise<SessionRelayInitResult> {
      const path = "/v1/session/init";
      const body = JSON.stringify({
        granteeAddress: options.granteeAddress,
        scopes: params.scopes,
        ...(params.webhookUrl && { webhookUrl: params.webhookUrl }),
        ...(params.appUserId && { appUserId: params.appUserId }),
      });
      const iat = options.now?.() ?? Math.floor(Date.now() / 1000);
      const authHeader = await buildSessionRelayWeb3SignedHeader({
        signMessage: options.signMessage,
        aud: baseUrl,
        method: "POST",
        uri: path,
        body,
        iat,
        exp: iat + 300,
      });

      return relayFetch<SessionRelayInitResult>(fetchFn, `${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body,
      });
    },

    pollSession(sessionId: string): Promise<SessionRelayPollResult> {
      return pollSession(fetchFn, baseUrl, sessionId);
    },

    pollUntilComplete(
      sessionId: string,
      opts?: { intervalMs?: number; timeoutMs?: number },
    ): Promise<SessionRelayPollResult> {
      return pollUntilComplete(fetchFn, baseUrl, sessionId, opts);
    },
  };
}
