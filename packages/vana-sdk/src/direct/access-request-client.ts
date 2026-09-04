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
  AccessRequestDelivery,
  AccessRequestQuestion,
  AccessRequestStatus,
  AccessRequestStatusValue,
  DirectEnv,
} from "./types";
import { normalizeMobileContinuationUrl } from "./types";
import type { Web3SignedSignFn } from "../auth/web3-signed-builder";
import { parseScope, type ParsedScope } from "../protocol/scopes";
import { DirectConfigError } from "./errors";

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
  /**
   * Target environment. Pins the allowed mobile continuation link host
   * (`open.vana.org` for production, `open-dev.vana.org` for dev). When omitted,
   * both canonical hosts pass the structural continuation-URL check.
   */
  env?: DirectEnv;
  /** `fetch` implementation. Defaults to the global `fetch`. */
  fetchFn?: FetchLike;
  /** App identity address used for direct access-request authentication. */
  appAddress?: string;
  /** EIP-191 signer for direct access-request authentication. */
  signMessage?: Web3SignedSignFn;
  /** Clock source used for signed request timestamps. */
  now?: () => number;
  /**
   * Create the signed DCR idempotency key used when a create call omits one.
   * Called once per create. Injectable for deterministic tests.
   */
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

function normalizeDelivery(value: unknown): AccessRequestDelivery | undefined {
  return value === "enclave" || value === "personal_server" ? value : undefined;
}

function normalizeNetwork(value: unknown): AccessRequest["network"] {
  return value === "mainnet" || value === "moksha" ? value : undefined;
}

function normalizeExpiresAt(value: unknown): string | undefined {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : undefined;
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

/** The `recompute` values the question contract defines today. */
const RECOMPUTE_VALUES: readonly string[] = ["snapshot", "on-change"];

function parseConcreteScope(field: string, value: unknown): ParsedScope {
  if (typeof value !== "string") {
    throw new DirectConfigError(`${field} must be a string`, { field });
  }
  try {
    return parseScope(value);
  } catch {
    throw new DirectConfigError(
      `${field} "${value}" is not a concrete scope. Use {source}.{category}[.{subcategory}] with no wildcard and no operation prefix.`,
      { field, value },
    );
  }
}

/**
 * Validate the derivative questions on a create input against the request
 * scope entries.
 *
 * @remarks
 * Client-side mirror of the access-request service rules so builders fail
 * fast, before the create request is signed and sent; the service remains
 * authoritative. Rules: 1 to 4 questions; every `derivedScope` and every
 * `sourceScope` is a concrete scope (wildcards rejected); 1 to 16 source
 * scopes per question with no duplicates and none equal to the derived scope;
 * the first dot-segment of the derived scope differs from the first
 * dot-segment of every source scope; the derived scope appears verbatim in
 * `scopes` as a bare read entry; no two questions share a derived scope; the
 * question text is 1 to 4000 characters after trimming; `recompute`, when
 * present, is `"snapshot"` or `"on-change"`.
 *
 * @param questions - The `questions` array from the create input.
 * @param scopes - The request's grant scope entries, verbatim.
 * @throws {DirectConfigError} - When any rule is violated. The message names
 * the offending question index and field.
 */
export function validateAccessRequestQuestions(
  questions: readonly AccessRequestQuestion[],
  scopes: readonly string[],
): void {
  if (questions.length === 0 || questions.length > 4) {
    throw new DirectConfigError(
      `questions must contain 1 to 4 entries when present, got ${questions.length}. Omit the field to send no questions.`,
      { count: questions.length },
    );
  }
  const seenDerived = new Set<string>();
  questions.forEach((question, index) => {
    const label = `questions[${index}]`;
    const derived = parseConcreteScope(
      `${label}.derivedScope`,
      question.derivedScope,
    );
    if (seenDerived.has(question.derivedScope)) {
      throw new DirectConfigError(
        `${label}.derivedScope "${question.derivedScope}" is already used by an earlier question. Each question must target its own derived scope.`,
        { derivedScope: question.derivedScope },
      );
    }
    seenDerived.add(question.derivedScope);
    // The bare entry (no operation prefix) is what makes the answer readable
    // by the app: `write:coach.weekly` alone would not grant the read back.
    if (!scopes.includes(question.derivedScope)) {
      throw new DirectConfigError(
        `${label}.derivedScope "${question.derivedScope}" must also appear in scopes as a bare read entry, so the app can read the answer it asked for.`,
        { derivedScope: question.derivedScope, scopes: [...scopes] },
      );
    }
    if (
      question.sourceScopes.length === 0 ||
      question.sourceScopes.length > 16
    ) {
      throw new DirectConfigError(
        `${label}.sourceScopes must contain 1 to 16 entries, got ${question.sourceScopes.length}.`,
        { count: question.sourceScopes.length },
      );
    }
    const seenSources = new Set<string>();
    for (const sourceScope of question.sourceScopes) {
      const source = parseConcreteScope(`${label}.sourceScopes`, sourceScope);
      if (seenSources.has(sourceScope)) {
        throw new DirectConfigError(
          `${label}.sourceScopes contains "${sourceScope}" more than once. Deduplicate the source scopes.`,
          { sourceScope },
        );
      }
      seenSources.add(sourceScope);
      if (sourceScope === question.derivedScope) {
        throw new DirectConfigError(
          `${label}.sourceScopes must not contain the derived scope "${question.derivedScope}".`,
          { sourceScope },
        );
      }
      if (source.source === derived.source) {
        throw new DirectConfigError(
          `${label}.derivedScope "${question.derivedScope}" must not share its first dot-segment "${derived.source}" with source scope "${sourceScope}". Name the derived scope under the app's own namespace.`,
          { derivedScope: question.derivedScope, sourceScope },
        );
      }
    }
    if (typeof question.question !== "string") {
      throw new DirectConfigError(`${label}.question must be a string`, {
        field: `${label}.question`,
      });
    }
    const trimmedLength = question.question.trim().length;
    if (trimmedLength === 0 || trimmedLength > 4000) {
      throw new DirectConfigError(
        `${label}.question must be 1 to 4000 characters after trimming, got ${trimmedLength}.`,
        { length: trimmedLength },
      );
    }
    if (
      question.recompute !== undefined &&
      !RECOMPUTE_VALUES.includes(question.recompute)
    ) {
      throw new DirectConfigError(
        `${label}.recompute must be "snapshot" or "on-change" when present, got "${String(question.recompute)}".`,
        { recompute: question.recompute },
      );
    }
  });
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

  return {
    async createAccessRequest(input): Promise<AccessRequest> {
      if (input.questions !== undefined) {
        validateAccessRequestQuestions(input.questions, input.scopes);
      }
      const path = "/api/data-connection-requests";
      // Every call is an independent logical create, so it gets its own key.
      // The client cannot tell two look-alike creates apart — one shared backend
      // controller serves many users with the same app, scopes, and returnUrl —
      // so deriving a key from the input would let the service deduplicate two
      // users onto a single DCR. Retrying an uncertain create is the caller's
      // decision: pass the same `idempotencyKey` back in.
      const idempotencyKey =
        input.idempotencyKey ??
        (options.createIdempotencyKey ?? defaultCreateIdempotencyKey)();
      const body = JSON.stringify({
        appAddress: input.appAddress,
        app: input.app,
        source: input.source,
        scopes: input.scopes,
        returnUrl: input.returnUrl,
        network: input.network,
        ...(input.foregroundDelivery !== undefined
          ? { foregroundDelivery: input.foregroundDelivery }
          : {}),
        ...(input.questions !== undefined
          ? { questions: input.questions }
          : {}),
        idempotencyKey,
      });
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
        mobileContinuationUrl?: unknown;
      };
      const requestId = responseBody.requestId ?? responseBody.id;
      if (!requestId) {
        throw new Error("Access request service returned no requestId");
      }
      return {
        requestId,
        approvalUrl:
          responseBody.approvalUrl ??
          buildApprovalUrl(options.approvalBaseUrl, requestId),
        appAddress: responseBody.appAddress ?? input.appAddress,
        network: normalizeNetwork(responseBody.network),
        expiresAt: normalizeExpiresAt(responseBody.expiresAt),
        mobileContinuationUrl: normalizeMobileContinuationUrl(
          responseBody.mobileContinuationUrl,
          options.env,
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
        delivery?: unknown;
        personalServerUrl?: string;
        grantId?: string;
        scope?: string;
        mobileContinuationUrl?: unknown;
        scopes?: string[];
      };
      // `scopes` is the full approved set; `scope` is the first of them, kept
      // for callers (and deployments) that predate the array.
      const scopes =
        body.scopes && body.scopes.length > 0
          ? body.scopes
          : body.scope
            ? [body.scope]
            : undefined;
      return {
        status: normalizeStatus(body.status),
        delivery: normalizeDelivery(body.delivery),
        personalServerUrl: body.personalServerUrl,
        grantId: body.grantId,
        scope: body.scope ?? scopes?.[0],
        scopes,
        mobileContinuationUrl: normalizeMobileContinuationUrl(
          body.mobileContinuationUrl,
          options.env,
        ),
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
