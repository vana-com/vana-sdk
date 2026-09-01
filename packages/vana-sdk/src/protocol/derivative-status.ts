/**
 * Derivative status: the lifecycle of the question behind a derived scope,
 * as the party that READS the answer sees it.
 *
 * @remarks
 * A builder registers a question with {@link registerQuestion} and follows it
 * with {@link waitForQuestion}, both of which need a write session. The app
 * that only consumes the answer holds no write entry at all — a consent flow
 * grants it a bare read on the derived scope — so it cannot open one, and
 * `GET /v1/data/<derivedScope>` answers 404 for all three of "computing right
 * now", "failed but retrying" and "failed for good".
 *
 * `GET /v1/derivatives/status?derivedScope=<scope>` is that reader's view.
 * Authorization is the data read's (a live grant covering the derived scope,
 * or the owner), nothing is served and nothing is charged, and the view is
 * deliberately narrow: lifecycle, a coarse {@link DerivativeErrorCode} and
 * the next retry. The question text, the source scopes, the question id, the
 * registrar and the server's raw error string stay owner-only.
 *
 * Requires `personal-server-ts` with the status route; an older Personal
 * Server answers 404 for the route itself.
 *
 * @category Protocol
 */

import { z } from "zod";
import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import {
  DerivativeQuestionRejectedError,
  DerivativeQuestionTimeoutError,
  WriteRequestError,
  WriteTransportError,
  type PersonalServerWriteError,
} from "../errors";
import {
  DerivativeErrorCodeSchema,
  personalServerErrorFromQuestionResponse,
  QuestionStatusSchema,
  type QuestionStatus,
} from "./derivative-questions";
import {
  resolveWriteSigner,
  type ResolveWriteSignerOptions,
  type WriteSignerSource,
} from "./write-signer";

export {
  DERIVATIVE_ERROR_CODES,
  DerivativeErrorCodeSchema,
  type DerivativeErrorCode,
} from "./derivative-questions";

/** The reader-facing status route. */
export const DERIVATIVE_STATUS_PATH = "/v1/derivatives/status";

/** How long {@link waitForDerivativeStatus} polls before giving up. */
export const DEFAULT_DERIVATIVE_STATUS_TIMEOUT_MS = 120_000;

/**
 * How long {@link waitForDerivativeStatus} waits between polls when the
 * server names no retry time of its own.
 */
export const DEFAULT_DERIVATIVE_STATUS_POLL_INTERVAL_MS = 2_000;

const nullable = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .nullish()
    .transform((value: z.infer<T> | null | undefined) => value ?? null);

/**
 * The status of the derived scope, not of one registration: when several
 * questions write the same scope, the server reports the most optimistic
 * true state, because serving data is registration-agnostic.
 */
export const DerivativeStatusSchema = z.object({
  derivedScope: z.string().min(1),
  status: QuestionStatusSchema,
  /** When the last compute finished, or `null` if none ever has. */
  lastComputedAt: nullable(z.string()),
  /** Local version of the derived record the last compute wrote. */
  derivedVersion: nullable(z.number()),
  derivedCollectedAt: nullable(z.string()),
  /** The failure class; `null` unless `status` is `failed`. */
  errorCode: nullable(DerivativeErrorCodeSchema),
  /**
   * Seconds until the Personal Server's next automatic retry, or `null` when
   * none is pending or running — the terminal signature. Poll on this cadence
   * rather than guessing one.
   */
  retryAfterSeconds: nullable(z.number()),
});

/** @see {@link DerivativeStatusSchema} */
export type DerivativeStatus = z.infer<typeof DerivativeStatusSchema>;

/** What {@link getDerivativeStatus} needs to sign and send one read. */
export interface GetDerivativeStatusParams extends ResolveWriteSignerOptions {
  /** Personal Server origin, e.g. `https://ps.example.com`. */
  personalServerUrl: string;
  /** The derived scope whose question to observe. */
  derivedScope: string;
  /**
   * A grant covering the derived scope, sent as the signed `grantId` claim.
   * Omit only when the signer is the Personal Server's owner, who is
   * authorized without one.
   */
  grantId?: string;
  /** Reader key: a viem `LocalAccount`, `WalletClient`, or `{ signMessage }`. */
  signer: WriteSignerSource;
  /** Web3Signed audience; defaults to `personalServerUrl`. */
  audience?: string;
  /** `fetch` to use; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Extra request headers. */
  headers?: HeadersInit;
}

/** What {@link waitForDerivativeStatus} polls with. */
export interface WaitForDerivativeStatusParams extends GetDerivativeStatusParams {
  /** Give up after this long (default 120s). */
  timeoutMs?: number;
  /**
   * Wait between polls when the server names no retry time (default 2s).
   * A `retryAfterSeconds` from the server always wins over this: there is
   * nothing to see before the retry the server has already scheduled.
   */
  pollIntervalMs?: number;
  /** Abort the wait. */
  signal?: AbortSignal;
}

/**
 * The request target for a status read: the query carries the derived scope,
 * the signed `uri` does not.
 *
 * @remarks
 * Like every Web3Signed read (data, lineage), the Personal Server verifies
 * the signature over the PATH; per-scope authorization is enforced live
 * against the caller's grant on each request, so the query needs no
 * signature to be safe. Only the write path signs path AND query, where a
 * parameter decides what is written.
 */
export function derivativeStatusTarget(derivedScope: string): string {
  return `${DERIVATIVE_STATUS_PATH}?derivedScope=${encodeURIComponent(derivedScope)}`;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveFetch(fetchFn: typeof fetch | undefined): typeof fetch {
  const resolved = fetchFn ?? globalThis.fetch;
  if (resolved === undefined) {
    throw new WriteRequestError("No fetch implementation available");
  }
  return resolved;
}

function requireDerivedScope(derivedScope: string): string {
  if (typeof derivedScope !== "string" || derivedScope.length === 0) {
    // The server answers 400 DERIVATIVE_DERIVED_SCOPE_REQUIRED; refuse before
    // signing rather than spend a signature on a request that cannot pass.
    throw new WriteRequestError("derivedScope is required");
  }
  return derivedScope;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  return reason instanceof Error
    ? reason
    : new WriteRequestError("Derivative status wait was aborted");
}

/**
 * Is this a state the reader can act on?
 *
 * @remarks
 * `ready` means the derived scope has an answer to read. A `failed` status
 * is settled only when no retry is pending: with `retryAfterSeconds` set the
 * Personal Server will compute again on its own, so the answer may still
 * arrive. `pending` and `stale` are always in flight.
 */
export function isDerivativeStatusSettled(status: DerivativeStatus): boolean {
  if (status.status === "ready") return true;
  return status.status === "failed" && status.retryAfterSeconds === null;
}

/**
 * Read the lifecycle of the question behind a derived scope.
 *
 * @remarks
 * Sends `GET /v1/derivatives/status?derivedScope=<scope>` with a Web3Signed
 * `Authorization` header carrying `grantId`, the same authentication a data
 * read uses. Nothing is charged: the route authorizes, it does not serve
 * data, so a priced grant raises no 402 here.
 *
 * @returns The status of the derived scope. When several registrations write
 *   it, the most optimistic true state answers — `ready`, then `stale`, then
 *   `pending`, then `failed` — because a duplicate that never wrote anything
 *   must not report away an answer the scope has.
 * @throws {DerivativeQuestionNotFoundError} 404: the caller may read the
 *   scope but no question stands behind it (and, on an older Personal
 *   Server, the route itself is unknown).
 * @throws {WriteForbiddenError} 403: the grant does not cover the derived
 *   scope. The check runs before any store lookup, so a caller cannot probe
 *   which scopes have questions.
 * @throws {DerivativeQuestionRejectedError} On any other non-2xx answer or
 *   an unparseable body.
 * @throws {WriteTransportError} When `fetch` itself failed.
 * @throws {WriteRequestError} On a missing `derivedScope` or no `fetch`.
 *
 * @example
 * ```typescript
 * const status = await getDerivativeStatus({
 *   personalServerUrl: "https://ps.example.com",
 *   derivedScope: "coach.weekly",
 *   grantId,
 *   signer,
 * });
 * if (status.status === "ready") {
 *   const record = await readPersonalServerData({ ... });
 * } else if (status.retryAfterSeconds !== null) {
 *   // Computing or retrying: come back then.
 * }
 * ```
 */
export async function getDerivativeStatus(
  params: GetDerivativeStatusParams,
): Promise<DerivativeStatus> {
  const derivedScope = requireDerivedScope(params.derivedScope);
  const fetchFn = resolveFetch(params.fetch);
  const baseUrl = normalizeBaseUrl(params.personalServerUrl);
  const signer = resolveWriteSigner(params.signer, { account: params.account });
  const headers = new Headers(params.headers);
  headers.set(
    "Authorization",
    await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: params.audience ?? baseUrl,
      method: "GET",
      uri: DERIVATIVE_STATUS_PATH,
      grantId: params.grantId,
    }),
  );

  let response: Response;
  try {
    response = await fetchFn(
      `${baseUrl}${derivativeStatusTarget(derivedScope)}`,
      {
        method: "GET",
        headers,
      },
    );
  } catch (err) {
    throw new WriteTransportError(
      `Derivative status read failed: ${err instanceof Error ? err.message : String(err)}`,
      1,
      err,
    );
  }
  if (!response.ok) {
    throw (await personalServerErrorFromQuestionResponse(
      response,
    )) as PersonalServerWriteError;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new DerivativeQuestionRejectedError(
      "Derivative status response is not JSON",
      response.status,
      null,
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }
  const parsed = DerivativeStatusSchema.safeParse(body);
  if (!parsed.success) {
    throw new DerivativeQuestionRejectedError(
      "Derivative status response is not a status view",
      response.status,
      null,
      { issues: parsed.error.issues },
    );
  }
  return parsed.data;
}

/**
 * Poll {@link getDerivativeStatus} until the derived scope has an answer or
 * has stopped trying to get one.
 *
 * @remarks
 * Returns as soon as {@link isDerivativeStatusSettled} holds: `ready`, or
 * `failed` with no retry pending. A failure the server will retry is not a
 * result, so the wait continues through it — on the server's own cadence,
 * because `retryAfterSeconds` is when the next compute actually happens and
 * polling faster only spends requests. A failed status is returned, not
 * thrown: the reader branches on `errorCode`.
 *
 * @returns The settled status.
 * @throws {DerivativeQuestionTimeoutError} When the budget ran out first.
 *   The question keeps computing on the server; call again.
 *
 * @example
 * ```typescript
 * const status = await waitForDerivativeStatus({
 *   personalServerUrl,
 *   derivedScope: "coach.weekly",
 *   grantId,
 *   signer,
 *   timeoutMs: 60_000,
 * });
 * if (status.status !== "ready") console.log(status.errorCode);
 * ```
 */
export async function waitForDerivativeStatus(
  params: WaitForDerivativeStatusParams,
): Promise<DerivativeStatus> {
  const timeoutMs = Math.max(
    0,
    params.timeoutMs ?? DEFAULT_DERIVATIVE_STATUS_TIMEOUT_MS,
  );
  const pollIntervalMs = Math.max(
    0,
    params.pollIntervalMs ?? DEFAULT_DERIVATIVE_STATUS_POLL_INTERVAL_MS,
  );
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (params.signal?.aborted) throw abortError(params.signal);
    const latest = await getDerivativeStatus(params);
    if (isDerivativeStatusSettled(latest)) return latest;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new DerivativeQuestionTimeoutError(
        `Derived scope ${latest.derivedScope} was still ${latest.status} after ${timeoutMs}ms`,
        {
          derivedScope: latest.derivedScope,
          status: latest.status,
          errorCode: latest.errorCode,
          retryAfterSeconds: latest.retryAfterSeconds,
          timeoutMs,
        },
      );
    }
    // The server's scheduled retry wins: nothing changes before it fires.
    const waitMs =
      latest.retryAfterSeconds === null
        ? pollIntervalMs
        : Math.max(pollIntervalMs, latest.retryAfterSeconds * 1000);
    await sleep(Math.min(waitMs, remaining), params.signal);
  }
}

/** Statuses that mean a compute is in flight. @see {@link QuestionStatus} */
export type PendingDerivativeStatus = Extract<
  QuestionStatus,
  "pending" | "stale"
>;
