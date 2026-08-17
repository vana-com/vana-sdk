/**
 * Default client for the Vana Account access-request API.
 *
 * @remarks
 * Calls the Vana Account endpoints that issue `dcr_*` ids and approval URLs and
 * report request status. Inject a custom {@link AccessRequestClient} on the
 * controller to point at a different deployment; pass `fetchFn` to supply a test
 * double for the HTTP layer.
 *
 * @category Direct
 * @module direct/access-request-client
 */

import type {
  AccessRequest,
  AccessRequestClient,
  AccessRequestStatus,
  AccessRequestStatusValue,
} from "./types";
import type { Web3SignedSignFn } from "../auth/web3-signed-builder";

/** Minimal `fetch` signature so the client is testable without a global fetch. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/** Options for {@link createDefaultAccessRequestClient}. */
export interface DefaultAccessRequestClientOptions {
  /** Base URL of the Vana Account access-request API. */
  baseUrl: string;
  /** Base URL the user is sent to for approval. */
  approvalBaseUrl: string;
  /** `fetch` implementation. Defaults to the global `fetch`. */
  fetchFn?: FetchLike;
  /** App identity address used for direct access-request authentication. */
  appAddress?: string;
  /** EIP-191 signer for direct access-request authentication. */
  signMessage?: Web3SignedSignFn;
  /** Clock source used for signed request timestamps. */
  now?: () => number;
  /** Create a signed DCR idempotency key. Injectable for deterministic tests. */
  createIdempotencyKey?: () => string;
}

const VALID_STATUSES: readonly AccessRequestStatusValue[] = [
  "pending",
  "approved",
  "ready_for_read",
  "completed",
  "denied",
  "expired",
];

function normalizeStatus(value: unknown): AccessRequestStatusValue {
  return VALID_STATUSES.includes(value as AccessRequestStatusValue)
    ? (value as AccessRequestStatusValue)
    : "pending";
}

function normalizeNetwork(value: unknown): AccessRequest["network"] {
  return value === "mainnet" || value === "moksha" ? value : undefined;
}

function normalizeExpiresAt(value: unknown): string | undefined {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : undefined;
}

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function defaultCreateIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error(
      "Secure randomUUID is unavailable. Pass createIdempotencyKey to createDefaultAccessRequestClient.",
    );
  }
  return globalThis.crypto.randomUUID();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const DIRECT_ACCESS_REQUEST_MESSAGE_PREFIX = "Vana Direct Access Request v1";

interface DirectAccessRequestAuthInput {
  body: string;
  method: string;
  path: string;
  timestamp: string;
}

export function buildDirectAccessRequestAuthMessage(
  input: DirectAccessRequestAuthInput,
): string {
  return [
    DIRECT_ACCESS_REQUEST_MESSAGE_PREFIX,
    `method:${input.method.toUpperCase()}`,
    `path:${input.path}`,
    `timestamp:${input.timestamp}`,
    `body:${input.body}`,
  ].join("\n");
}

async function buildDirectAccessRequestHeaders(
  options: DefaultAccessRequestClientOptions,
  input: Omit<DirectAccessRequestAuthInput, "timestamp">,
): Promise<Record<string, string>> {
  if (!options.appAddress && !options.signMessage) {
    return {};
  }
  if (!options.appAddress || !options.signMessage) {
    throw new Error(
      "Direct access-request authentication requires both `appAddress` and `signMessage`.",
    );
  }

  const timestamp = String(options.now?.() ?? Date.now());
  const signature = await options.signMessage(
    buildDirectAccessRequestAuthMessage({ ...input, timestamp }),
  );

  return {
    "X-Vana-App-Address": options.appAddress,
    "X-Vana-App-Signature": signature,
    "X-Vana-App-Timestamp": timestamp,
  };
}

/**
 * Build an approval URL for a request id, matching the documented format
 * (`{app}/data-connection-requests/{requestId}?mode=page`).
 *
 * @param approvalBaseUrl - Base URL of the Vana approval app.
 * @param requestId - The `dcr_*` request id.
 * @returns The full approval URL.
 */
export function buildApprovalUrl(
  approvalBaseUrl: string,
  requestId: string,
): string {
  return `${stripTrailingSlash(approvalBaseUrl)}/data-connection-requests/${encodeURIComponent(
    requestId,
  )}?mode=page`;
}

/**
 * Create the default {@link AccessRequestClient} for the Vana Account
 * access-request API.
 *
 * @param options - Base URLs and an optional `fetch` implementation.
 * @returns An {@link AccessRequestClient} backed by HTTP calls.
 */
export function createDefaultAccessRequestClient(
  options: DefaultAccessRequestClientOptions,
): AccessRequestClient {
  const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchLike);
  if (!fetchFn) {
    throw new Error(
      "No fetch implementation available. Pass `fetchFn` to createDefaultAccessRequestClient.",
    );
  }
  const base = stripTrailingSlash(options.baseUrl);
  const createKeysByInput = new Map<string, string>();

  return {
    async createAccessRequest(input): Promise<AccessRequest> {
      const path = "/api/data-connection-requests";
      const retryIdentity = JSON.stringify(input);
      const idempotencyKey =
        input.idempotencyKey ??
        createKeysByInput.get(retryIdentity) ??
        (options.createIdempotencyKey ?? defaultCreateIdempotencyKey)();
      const body = JSON.stringify({
        appAddress: input.appAddress,
        app: input.app,
        source: input.source,
        scopes: input.scopes,
        returnUrl: input.returnUrl,
        network: input.network,
        idempotencyKey,
      });
      // Retain the key until a complete success response is parsed. This covers
      // concurrent calls, transport failures, and responses lost after create.
      createKeysByInput.set(retryIdentity, idempotencyKey);
      const res = await fetchFn(`${base}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await buildDirectAccessRequestHeaders(options, {
            body,
            method: "POST",
            path,
          })),
        },
        body,
      });
      if (!res.ok) {
        throw new Error(
          `Access request service error: ${res.status} ${res.statusText}`,
        );
      }
      const responseBody = (await res.json()) as {
        requestId?: string;
        id?: string;
        approvalUrl?: string;
        appAddress?: string;
        network?: unknown;
        expiresAt?: unknown;
        installedAppUrl?: unknown;
        installedAppExpiresAt?: unknown;
      };
      const requestId = responseBody.requestId ?? responseBody.id;
      if (!requestId) {
        throw new Error("Access request service returned no requestId");
      }
      createKeysByInput.delete(retryIdentity);
      return {
        requestId,
        approvalUrl:
          responseBody.approvalUrl ??
          buildApprovalUrl(options.approvalBaseUrl, requestId),
        appAddress: responseBody.appAddress ?? input.appAddress,
        network: normalizeNetwork(responseBody.network),
        expiresAt: normalizeExpiresAt(responseBody.expiresAt),
        installedAppUrl: normalizeUrl(responseBody.installedAppUrl),
        installedAppExpiresAt: normalizeExpiresAt(
          responseBody.installedAppExpiresAt,
        ),
      };
    },

    async getAccessRequestStatus(
      requestId: string,
    ): Promise<AccessRequestStatus> {
      const path = `/api/data-connection-requests/${encodeURIComponent(requestId)}`;
      const res = await fetchFn(`${base}${path}`, {
        method: "GET",
        headers: await buildDirectAccessRequestHeaders(options, {
          body: "",
          method: "GET",
          path,
        }),
      });
      if (!res.ok) {
        throw new Error(
          `Access request service error: ${res.status} ${res.statusText}`,
        );
      }
      const body = (await res.json()) as {
        status?: string;
        personalServerUrl?: string;
        grantId?: string;
        scope?: string;
        installedAppUrl?: unknown;
        installedAppExpiresAt?: unknown;
      };
      return {
        status: normalizeStatus(body.status),
        personalServerUrl: body.personalServerUrl,
        grantId: body.grantId,
        scope: body.scope,
        installedAppUrl: normalizeUrl(body.installedAppUrl),
        installedAppExpiresAt: normalizeExpiresAt(body.installedAppExpiresAt),
      };
    },

    async acknowledgeRead(requestId: string): Promise<void> {
      const path = `/api/data-connection-requests/${encodeURIComponent(requestId)}/consumer-ack`;
      const res = await fetchFn(`${base}${path}`, {
        method: "POST",
        headers: await buildDirectAccessRequestHeaders(options, {
          body: "",
          method: "POST",
          path,
        }),
      });
      if (!res.ok) {
        throw new Error(
          `Access request ack service error: ${res.status} ${res.statusText}`,
        );
      }
    },
  };
}
