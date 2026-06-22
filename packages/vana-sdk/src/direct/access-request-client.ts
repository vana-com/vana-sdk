/**
 * Default (provisional) transport for the app-dev access-request service.
 *
 * @remarks
 * **TEMPORARY.** There is no finalized in-SDK protocol for the app-dev service
 * that issues `dcr_*` ids and approval URLs. This default client targets the
 * documented Vana endpoints with a best-effort wire contract so the controller
 * works end-to-end against the dev/prod stacks, but its request/response shape
 * is **PROVISIONAL** and may change without a major version bump. Apps that need
 * a stable contract today should inject their own {@link AccessRequestClient}
 * (see `accessRequestClient` on {@link DirectDataControllerConfig}).
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
  /** Base URL of the access-request service. */
  baseUrl: string;
  /** Base URL the user is sent to for approval. */
  approvalBaseUrl: string;
  /** `fetch` implementation. Defaults to the global `fetch`. */
  fetchFn?: FetchLike;
}

const VALID_STATUSES: readonly AccessRequestStatusValue[] = [
  "pending",
  "approved",
  "denied",
  "expired",
];

function normalizeStatus(value: unknown): AccessRequestStatusValue {
  return VALID_STATUSES.includes(value as AccessRequestStatusValue)
    ? (value as AccessRequestStatusValue)
    : "pending";
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
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
 * Create the default, provisional {@link AccessRequestClient}.
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

  return {
    async createAccessRequest(input): Promise<AccessRequest> {
      const res = await fetchFn(`${base}/api/v1/data-connection-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appAddress: input.appAddress,
          app: input.app,
          source: input.source,
          scopes: input.scopes,
          returnUrl: input.returnUrl,
        }),
      });
      if (!res.ok) {
        throw new Error(
          `Access request service error: ${res.status} ${res.statusText}`,
        );
      }
      const body = (await res.json()) as {
        requestId?: string;
        id?: string;
        approvalUrl?: string;
        appAddress?: string;
      };
      const requestId = body.requestId ?? body.id;
      if (!requestId) {
        throw new Error("Access request service returned no requestId");
      }
      return {
        requestId,
        approvalUrl:
          body.approvalUrl ??
          buildApprovalUrl(options.approvalBaseUrl, requestId),
        appAddress: body.appAddress ?? input.appAddress,
      };
    },

    async getAccessRequestStatus(
      requestId: string,
    ): Promise<AccessRequestStatus> {
      const res = await fetchFn(
        `${base}/api/v1/data-connection-requests/${encodeURIComponent(requestId)}`,
        { method: "GET" },
      );
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
      };
      return {
        status: normalizeStatus(body.status),
        personalServerUrl: body.personalServerUrl,
        grantId: body.grantId,
        scope: body.scope,
      };
    },
  };
}
