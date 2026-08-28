/**
 * Builder-side client for the Personal Server derivative question API.
 *
 * @remarks
 * A question is a standing prompt over the owner's source scopes. The
 * Personal Server answers it locally (the raw sources never leave the
 * machine except through its inference call) and writes the answer into the
 * derived scope as an ordinary derivative record, with lineage pointing at
 * the sources. The builder then reads the derived scope with its normal read
 * grant. Every source change re-runs the question, so a builder registers it
 * once and keeps reading a scope that stays up to date.
 *
 * One grant carries the whole pipeline, and it needs all three of:
 *
 * - a bare read entry for every source scope (the answer exposes them, so
 *   the server refuses the registration otherwise:
 *   `DERIVATIVE_SOURCE_NOT_GRANTED`),
 * - a bare read entry for the derived scope (to read the answer back),
 * - `write:<derivedScope>` (the credential the question routes authorize
 *   against).
 *
 * Authentication is the Write API's, with no new credential: the write
 * session bearer from {@link openWriteSession} plus a fresh, single-use
 * `X-Vana-Write-Signature` Web3Signed proof over every request, carrying the
 * grant id as a signed claim. These helpers own that: they open one session
 * per `{ signer, Personal Server, grant }`, reuse it across calls, sign a new
 * proof per request, and re-open the session once when a call comes back 401
 * (the Personal Server keeps sessions in memory and forgets them when it
 * restarts).
 *
 * @category Protocol
 */

import { z } from "zod";
import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import {
  DerivativeComputeUnavailableError,
  DerivativeCycleError,
  DerivativeQuestionFailedError,
  DerivativeQuestionInvalidError,
  DerivativeQuestionNotFoundError,
  DerivativeQuestionRejectedError,
  DerivativeQuestionTimeoutError,
  DerivativeSourceNotGrantedError,
  WriteConflictError,
  WriteForbiddenError,
  WriteRequestError,
  WriteUnauthorizedError,
  type PersonalServerWriteError,
} from "../errors";
import { assertDerivedScopeNaming } from "./lineage";
import { readPersonalServerErrorBody } from "./personal-server-error-body";
import {
  readPersonalServerData,
  type ReadPersonalServerDataParams,
} from "./personal-server-data";
import type { DataFileEnvelope } from "./data-file";
import {
  openWriteSession,
  WRITE_SIGNATURE_HEADER,
  type WriteSession,
} from "./personal-server-write";
import {
  errorMessage,
  normalizeBaseUrl,
  proofKeyFor,
  resolveFetch,
  sendWithFreshProof,
  sleep,
  type WriteTransportRetryOptions,
} from "./write-request";
import {
  resolveWriteSigner,
  type ResolveWriteSignerOptions,
  type WriteSignerSource,
} from "./write-signer";

/** Path the question routes are mounted at. */
export const DERIVATIVE_QUESTIONS_PATH = "/v1/derivatives/questions";
/** The most source scopes one question may read. */
export const MAX_QUESTION_SOURCE_SCOPES = 16;
/** The longest question text the Personal Server accepts. */
export const MAX_QUESTION_CHARS = 8_000;
/** The longest model id the Personal Server accepts. */
export const MAX_QUESTION_MODEL_CHARS = 128;
/** Model ids as providers spell them (`z-ai/glm-5.2`, `gpt-4o-mini`, ...). */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
/** How long {@link waitForQuestion} polls before giving up. */
export const DEFAULT_QUESTION_TIMEOUT_MS = 120_000;
/** How long {@link waitForQuestion} waits between polls. */
export const DEFAULT_QUESTION_POLL_INTERVAL_MS = 2_000;
/** Re-open a session this long before its token expires. */
const SESSION_REFRESH_SKEW_MS = 30_000;

/** Every state a question can be in. */
export const QUESTION_STATUSES = [
  "pending",
  "ready",
  "failed",
  "stale",
] as const;

/**
 * `pending` (never computed) -> `ready` | `failed`; a source change or an
 * explicit recompute puts a computed question back to `stale`, which
 * settles as `ready` or `failed` again.
 */
export const QuestionStatusSchema = z.enum(QUESTION_STATUSES);

/** @see {@link QuestionStatusSchema} */
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;

/** Who registered the question: the owner, or a builder under a grant. */
export const QuestionRegisteredBySchema = z.union([
  z.object({ kind: z.literal("owner") }),
  z.object({
    kind: z.literal("builder"),
    builder: z.string(),
    grantId: z.string(),
  }),
]);

/** @see {@link QuestionRegisteredBySchema} */
export type QuestionRegisteredBy = z.infer<typeof QuestionRegisteredBySchema>;

// The server always sends these; `nullish` keeps a Personal Server that
// omits one readable rather than failing the whole call on a missing field.
const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

/**
 * A question registration as the Personal Server reports it (the answer of
 * register, get and list).
 */
export const DerivativeQuestionSchema = z.object({
  questionId: z.string().min(1),
  derivedScope: z.string().min(1),
  sourceScopes: z.array(z.string()),
  question: z.string(),
  /** The model override, or `null` for the server's default. */
  model: nullableString,
  registeredBy: QuestionRegisteredBySchema,
  status: QuestionStatusSchema,
  /** A short reason, set only while `status` is `failed`. */
  error: nullableString,
  createdAt: z.string(),
  updatedAt: nullableString,
  /** When the last compute finished, or `null` while `pending`. */
  lastComputedAt: nullableString,
  /** Local version of the derived record the last compute wrote. */
  derivedVersion: z
    .number()
    .nullish()
    .transform((value) => value ?? null),
  derivedCollectedAt: nullableString,
});

/** @see {@link DerivativeQuestionSchema} */
export type DerivativeQuestion = z.infer<typeof DerivativeQuestionSchema>;

const QuestionListSchema = z.object({
  questions: z.array(DerivativeQuestionSchema),
});

/** The 202 answer of a recompute request. */
export const QuestionRecomputeResultSchema = z.object({
  questionId: z.string().min(1),
  derivedScope: z.string().min(1),
  /** `pending` when the question was never computed, else `stale`. */
  status: QuestionStatusSchema,
});

/** @see {@link QuestionRecomputeResultSchema} */
export type QuestionRecomputeResult = z.infer<
  typeof QuestionRecomputeResultSchema
>;

/** The answer of a delete request. */
export const QuestionDeleteResultSchema = z.object({
  questionId: z.string().min(1),
  deleted: z.literal(true),
});

/** @see {@link QuestionDeleteResultSchema} */
export type QuestionDeleteResult = z.infer<typeof QuestionDeleteResultSchema>;

/**
 * Connection, credential and transport shared by every question call.
 *
 * @remarks
 * The write session is opened on demand and reused for every later call
 * made with the same `signer` object, Personal Server, audience, grant and
 * `fetch`; a 401 re-opens it once and replays the call.
 */
export interface DerivativeQuestionAuthParams extends ResolveWriteSignerOptions {
  /** Personal Server origin, e.g. `https://ps.example.com`. */
  personalServerUrl: string;
  /** Builder key: a viem `LocalAccount`, `WalletClient`, or `{ signMessage }`. */
  signer: WriteSignerSource;
  /**
   * The grant the call runs under. It must carry `write:<derivedScope>`, a
   * bare read entry for the derived scope, and a bare read entry for every
   * source scope.
   */
  grantId: string;
  /** Web3Signed audience; defaults to `personalServerUrl`. */
  audience?: string;
  /** `fetch` to use; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Extra request headers. */
  headers?: HeadersInit;
  retry?: WriteTransportRetryOptions;
  /** Aborts the request (and, for {@link waitForQuestion}, the polling). */
  signal?: AbortSignal;
}

export interface RegisterQuestionParams extends DerivativeQuestionAuthParams {
  /**
   * The scope the answer is written into. Must not share its first
   * dot-segment with any source scope, so put derivatives in the app's own
   * namespace.
   */
  derivedScope: string;
  /**
   * The scopes the question reads: 1 to
   * {@link MAX_QUESTION_SOURCE_SCOPES} distinct scopes, none of them the
   * derived scope. They do not have to hold data yet: the question computes
   * once they do.
   */
  sourceScopes: readonly string[];
  /** The prompt, 1 to {@link MAX_QUESTION_CHARS} characters. */
  question: string;
  /** Model id override; omitted = the Personal Server's default model. */
  model?: string;
}

export interface GetQuestionParams extends DerivativeQuestionAuthParams {
  questionId: string;
}

export interface ListQuestionsParams extends DerivativeQuestionAuthParams {
  /**
   * The derived scope to list. A builder must name one (it may only see its
   * own questions on a scope it may write); the unfiltered list is the
   * owner's.
   */
  derivedScope: string;
}

export interface RecomputeQuestionParams extends DerivativeQuestionAuthParams {
  questionId: string;
}

export interface DeleteQuestionParams extends DerivativeQuestionAuthParams {
  questionId: string;
}

export interface WaitForQuestionParams extends DerivativeQuestionAuthParams {
  questionId: string;
  /** Give up after this long (default {@link DEFAULT_QUESTION_TIMEOUT_MS}). */
  timeoutMs?: number;
  /** Wait between polls (default {@link DEFAULT_QUESTION_POLL_INTERVAL_MS}). */
  pollIntervalMs?: number;
}

export interface AskPersonalServerParams extends RegisterQuestionParams {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/** {@link askPersonalServer}'s answer. */
export interface AskPersonalServerResult {
  /** The settled registration (`status` is `ready`). */
  registration: DerivativeQuestion;
  /** The derived record the Personal Server wrote and the builder just read. */
  record: DataFileEnvelope;
}

/**
 * Open write sessions, keyed by the signer object so a session is never
 * shared between builder keys and nothing is retained once the caller drops
 * its signer.
 */
const sessionsBySigner = new WeakMap<object, Map<string, WriteSession>>();

function sessionCacheKey(
  personalServerUrl: string,
  audience: string,
  grantId: string,
  fetchFn: typeof fetch,
): string {
  // The token is only valid on the server that minted it, and `fetch` is
  // what decides which server that is (a test double, a proxy, the global).
  return (
    JSON.stringify([personalServerUrl, audience, grantId]) + fetchIdOf(fetchFn)
  );
}

const fetchIds = new WeakMap<object, number>();
let nextFetchId = 0;

function fetchIdOf(fetchFn: typeof fetch): string {
  let id = fetchIds.get(fetchFn);
  if (id === undefined) {
    id = ++nextFetchId;
    fetchIds.set(fetchFn, id);
  }
  return `#${id}`;
}

interface ResolvedQuestionRequest {
  baseUrl: string;
  audience: string;
  fetchFn: typeof fetch;
  cacheKey: string;
  signerKey: object;
}

function resolveRequest(
  params: DerivativeQuestionAuthParams,
): ResolvedQuestionRequest {
  if (
    typeof params.personalServerUrl !== "string" ||
    params.personalServerUrl.length === 0
  ) {
    throw new WriteRequestError("personalServerUrl is required");
  }
  // Checked before anything is signed or sent: without a grant the Personal
  // Server has nothing to authorize the call against.
  if (typeof params.grantId !== "string" || params.grantId.length === 0) {
    throw new WriteRequestError(
      "grantId is required; a question call runs under the grant carrying write:<derivedScope>",
    );
  }
  if (params.signer === null || typeof params.signer !== "object") {
    throw new WriteRequestError(
      "signer must be a viem LocalAccount, a viem WalletClient, or a { signMessage } object",
    );
  }
  const fetchFn = resolveFetch(params.fetch);
  const baseUrl = normalizeBaseUrl(params.personalServerUrl);
  const audience = params.audience ?? baseUrl;
  return {
    baseUrl,
    audience,
    fetchFn,
    cacheKey: sessionCacheKey(baseUrl, audience, params.grantId, fetchFn),
    signerKey: params.signer,
  };
}

/**
 * The session to use: the cached one while it is comfortably live, else a
 * fresh handshake. `force` drops the cached one first (the 401 path).
 */
async function resolveSession(
  params: DerivativeQuestionAuthParams,
  resolved: ResolvedQuestionRequest,
  force: boolean,
): Promise<WriteSession> {
  let cache = sessionsBySigner.get(resolved.signerKey);
  if (cache === undefined) {
    cache = new Map();
    sessionsBySigner.set(resolved.signerKey, cache);
  }
  const cached = cache.get(resolved.cacheKey);
  if (
    !force &&
    cached !== undefined &&
    cached.expiresAt > Date.now() + SESSION_REFRESH_SKEW_MS
  ) {
    return cached;
  }
  if (force) cache.delete(resolved.cacheKey);
  const session = await openWriteSession({
    personalServerUrl: resolved.baseUrl,
    signer: params.signer,
    grantId: params.grantId,
    account: params.account,
    audience: resolved.audience,
    fetch: resolved.fetchFn,
    headers: params.headers,
    retry: params.retry,
  });
  cache.set(resolved.cacheKey, session);
  return session;
}

/** Map a non-2xx question answer onto the SDK's typed errors. */
async function questionErrorFromResponse(
  response: Response,
): Promise<PersonalServerWriteError> {
  const { errorCode, message, details } =
    await readPersonalServerErrorBody(response);
  const text =
    message ??
    `Derivative question request failed: ${response.status} ${response.statusText}`;
  switch (errorCode) {
    case "DERIVATIVE_SOURCE_NOT_GRANTED":
      return new DerivativeSourceNotGrantedError(text, errorCode, details);
    case "DERIVATIVE_CYCLE":
      return new DerivativeCycleError(text, errorCode, details);
    case "DERIVATIVE_COMPUTE_UNAVAILABLE":
      return new DerivativeComputeUnavailableError(text, errorCode, details);
    case "DERIVATIVE_QUESTION_INVALID":
    case "LINEAGE_SCOPE_UNDER_SOURCE_PREFIX":
      return new DerivativeQuestionInvalidError(
        text,
        response.status,
        errorCode,
        details,
      );
    case "DERIVATIVE_QUESTION_NOT_FOUND":
      return new DerivativeQuestionNotFoundError(text, errorCode, details);
    default:
      break;
  }
  switch (response.status) {
    case 401:
      return new WriteUnauthorizedError(text, errorCode, details);
    case 403:
      return new WriteForbiddenError(text, errorCode, details);
    case 404:
      return new DerivativeQuestionNotFoundError(text, errorCode, details);
    case 409:
      return new WriteConflictError(text, errorCode, details);
    default:
      return new DerivativeQuestionRejectedError(
        text,
        response.status,
        errorCode,
        details,
      );
  }
}

interface QuestionRequestSpec {
  method: "GET" | "POST" | "DELETE";
  /** Path without the query string: the proof only covers this. */
  path: string;
  /** Query string including the leading `?`, or `""`. */
  query?: string;
  /** JSON body; sent (and signed) as compact JSON. */
  body?: Record<string, unknown>;
  label: string;
}

async function sendOnce(
  params: DerivativeQuestionAuthParams,
  resolved: ResolvedQuestionRequest,
  session: WriteSession,
  spec: QuestionRequestSpec,
  bodyBytes: Uint8Array | undefined,
): Promise<Response> {
  return sendWithFreshProof(
    spec.label,
    resolved.fetchFn,
    params.retry,
    proofKeyFor({
      aud: session.audience,
      method: spec.method,
      uri: spec.path,
      grantId: session.grantId,
      signedBytes: bodyBytes,
    }),
    async (iat) => {
      const headers = new Headers(params.headers);
      headers.set("Accept", "application/json");
      headers.set("Authorization", `Bearer ${session.accessToken}`);
      if (bodyBytes !== undefined) {
        headers.set("Content-Type", "application/json");
      }
      headers.set(
        WRITE_SIGNATURE_HEADER,
        await buildWeb3SignedHeader({
          signMessage: session.signer.signMessage,
          aud: session.audience,
          // The Personal Server verifies the proof against the request's
          // path only, so the signed `uri` must not carry the query string.
          uri: spec.path,
          method: spec.method,
          body: bodyBytes,
          grantId: session.grantId,
          iat,
        }),
      );
      return {
        url: `${resolved.baseUrl}${spec.path}${spec.query ?? ""}`,
        init: {
          method: spec.method,
          headers,
          ...(bodyBytes === undefined
            ? {}
            : { body: bodyBytes as unknown as BodyInit }),
          ...(params.signal ? { signal: params.signal } : {}),
        },
      };
    },
  );
}

/**
 * Run one question call under a reused write session: fresh proof, and one
 * re-handshake when the Personal Server no longer knows the session.
 */
async function sendQuestionRequest<T>(
  params: DerivativeQuestionAuthParams,
  spec: QuestionRequestSpec,
  schema: z.ZodType<T>,
): Promise<T> {
  const resolved = resolveRequest(params);
  // Compact JSON is the contract: the server re-serializes what it parsed
  // and refuses anything else with WRITE_BODY_NOT_CANONICAL.
  const bodyBytes =
    spec.body === undefined
      ? undefined
      : new TextEncoder().encode(JSON.stringify(spec.body));

  let session = await resolveSession(params, resolved, false);
  let response = await sendOnce(params, resolved, session, spec, bodyBytes);
  if (response.status === 401) {
    // The Personal Server keeps write sessions in memory: a restart (or an
    // expiry the client did not see) invalidates the bearer, not the grant.
    // Open a new session once and replay the call with a fresh proof.
    session = await resolveSession(params, resolved, true);
    response = await sendOnce(params, resolved, session, spec, bodyBytes);
  }

  if (!response.ok) {
    throw await questionErrorFromResponse(response);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new DerivativeQuestionRejectedError(
      `${spec.label} response is not JSON`,
      response.status,
      null,
      { cause: errorMessage(err) },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new DerivativeQuestionRejectedError(
      `${spec.label} response is not a derivative question answer`,
      response.status,
      null,
      { issues: parsed.error.issues },
    );
  }
  return parsed.data;
}

function assertQuestionId(questionId: string): string {
  if (typeof questionId !== "string" || questionId.length === 0) {
    throw new WriteRequestError("questionId is required");
  }
  return `${DERIVATIVE_QUESTIONS_PATH}/${encodeURIComponent(questionId)}`;
}

/**
 * Validate a registration the way the Personal Server does, so a builder
 * gets a typed error before a proof is signed rather than a 400 after.
 */
function registrationBody(params: RegisterQuestionParams): {
  derivedScope: string;
  sourceScopes: string[];
  question: string;
  model?: string;
} {
  const { derivedScope, question } = params;
  if (typeof derivedScope !== "string" || derivedScope.length === 0) {
    throw new WriteRequestError("derivedScope is required");
  }
  if (!Array.isArray(params.sourceScopes) || params.sourceScopes.length === 0) {
    throw new WriteRequestError(
      "sourceScopes must be a non-empty array of scopes",
    );
  }
  if (params.sourceScopes.length > MAX_QUESTION_SOURCE_SCOPES) {
    throw new WriteRequestError(
      `sourceScopes lists ${params.sourceScopes.length} scopes; the maximum is ${MAX_QUESTION_SOURCE_SCOPES}`,
      { max: MAX_QUESTION_SOURCE_SCOPES, count: params.sourceScopes.length },
    );
  }
  const sourceScopes: string[] = [];
  for (const scope of params.sourceScopes) {
    if (typeof scope !== "string" || scope.length === 0) {
      throw new WriteRequestError("sourceScopes entries must be scope strings");
    }
    if (sourceScopes.includes(scope)) {
      throw new WriteRequestError("sourceScopes must not repeat a scope", {
        duplicate: scope,
      });
    }
    if (scope === derivedScope) {
      throw new WriteRequestError(
        "derivedScope cannot be one of its own sources",
        { scope },
      );
    }
    sourceScopes.push(scope);
  }
  if (typeof question !== "string" || question.trim() === "") {
    throw new WriteRequestError("question must be a non-empty string");
  }
  if (question.length > MAX_QUESTION_CHARS) {
    throw new WriteRequestError(
      `question is ${question.length} characters; the maximum is ${MAX_QUESTION_CHARS}`,
      { max: MAX_QUESTION_CHARS, length: question.length },
    );
  }
  if (params.model !== undefined) {
    if (
      typeof params.model !== "string" ||
      params.model.length > MAX_QUESTION_MODEL_CHARS ||
      !MODEL_ID_PATTERN.test(params.model)
    ) {
      throw new WriteRequestError("model must be a provider model id", {
        model: params.model,
      });
    }
  }
  // The lineage naming rule, applied before signing: the server would refuse
  // the registration with LINEAGE_SCOPE_UNDER_SOURCE_PREFIX.
  assertDerivedScopeNaming(derivedScope, sourceScopes);
  return {
    derivedScope,
    sourceScopes,
    question,
    ...(params.model === undefined ? {} : { model: params.model }),
  };
}

/**
 * Register a standing question over the owner's source scopes.
 *
 * @remarks
 * Sends `POST /v1/derivatives/questions`. The registration comes back
 * `pending` and the first compute is scheduled immediately; poll it with
 * {@link waitForQuestion}, then read `derivedScope`.
 *
 * @example
 * ```typescript
 * const registered = await registerQuestion({
 *   personalServerUrl: "https://ps.example.com",
 *   signer,
 *   grantId,
 *   derivedScope: "coach.weekly",
 *   sourceScopes: ["oura.sleep", "chatgpt.conversations"],
 *   question: "How did my sleep relate to my mood this week?",
 * });
 * ```
 * @returns The registration, `status: "pending"`.
 * @throws {WriteRequestError} Before sending: a missing grant, a bad scope
 *   list, an over-long question, a derived scope under a source's namespace.
 * @throws {DerivativeSourceNotGrantedError} 403: a source scope is not
 *   read-granted to the builder (`details.scopes`).
 * @throws {DerivativeCycleError} 409: the question would make the derived
 *   scope a transitive source of itself.
 * @throws {DerivativeQuestionInvalidError} 400 from the server.
 * @throws {DerivativeComputeUnavailableError} 503: no compute layer.
 * @throws {WriteForbiddenError} 403: the grant does not authorize writing
 *   the derived scope.
 */
export async function registerQuestion(
  params: RegisterQuestionParams,
): Promise<DerivativeQuestion> {
  const body = registrationBody(params);
  return sendQuestionRequest(
    params,
    {
      method: "POST",
      path: DERIVATIVE_QUESTIONS_PATH,
      body,
      label: "Register derivative question",
    },
    DerivativeQuestionSchema,
  );
}

/**
 * Read one question's current state.
 *
 * @remarks
 * Sends `GET /v1/derivatives/questions/:id`. A builder only sees questions
 * it registered itself; anything else is a 404.
 *
 * @returns The registration, including `status`, `lastComputedAt`,
 *   `derivedVersion` and (when it failed) `error`.
 * @throws {DerivativeQuestionNotFoundError} 404: unknown id, or not this
 *   builder's question.
 */
export async function getQuestion(
  params: GetQuestionParams,
): Promise<DerivativeQuestion> {
  const path = assertQuestionId(params.questionId);
  return sendQuestionRequest(
    params,
    { method: "GET", path, label: "Read derivative question" },
    DerivativeQuestionSchema,
  );
}

/**
 * List the questions this builder registered on a derived scope.
 *
 * @remarks
 * Sends `GET /v1/derivatives/questions?derivedScope=...`. The scope is
 * required for a builder: it is what the call is authorized against. Note
 * that the query string is outside the signed proof, which covers the path.
 *
 * @returns The registrations, newest state included.
 */
export async function listQuestions(
  params: ListQuestionsParams,
): Promise<DerivativeQuestion[]> {
  if (
    typeof params.derivedScope !== "string" ||
    params.derivedScope.length === 0
  ) {
    throw new WriteRequestError(
      "derivedScope is required; a builder may only list its own questions on a scope it may write",
    );
  }
  const { questions } = await sendQuestionRequest(
    params,
    {
      method: "GET",
      path: DERIVATIVE_QUESTIONS_PATH,
      query: `?derivedScope=${encodeURIComponent(params.derivedScope)}`,
      label: "List derivative questions",
    },
    QuestionListSchema,
  );
  return questions;
}

/**
 * Ask the Personal Server to recompute a question now.
 *
 * @remarks
 * Sends `POST /v1/derivatives/questions/:id/recompute`, which answers 202
 * and schedules the compute immediately instead of after the usual quiet
 * period. Use it to retry a `failed` question; a source change recomputes on
 * its own.
 *
 * @returns `{ questionId, derivedScope, status }` with the status the
 *   question was put into (`pending` when it had never computed, else
 *   `stale`).
 */
export async function recomputeQuestion(
  params: RecomputeQuestionParams,
): Promise<QuestionRecomputeResult> {
  const path = `${assertQuestionId(params.questionId)}/recompute`;
  return sendQuestionRequest(
    params,
    { method: "POST", path, label: "Recompute derivative question" },
    QuestionRecomputeResultSchema,
  );
}

/**
 * Delete a question registration.
 *
 * @remarks
 * Sends `DELETE /v1/derivatives/questions/:id`. The question stops
 * recomputing; the derived records it already wrote are left alone (delete
 * those through the data-point deletion path).
 *
 * @returns `{ questionId, deleted: true }`.
 */
export async function deleteQuestion(
  params: DeleteQuestionParams,
): Promise<QuestionDeleteResult> {
  const path = assertQuestionId(params.questionId);
  return sendQuestionRequest(
    params,
    { method: "DELETE", path, label: "Delete derivative question" },
    QuestionDeleteResultSchema,
  );
}

/** `true` once the question has settled: nothing more to wait for. */
function isSettled(status: QuestionStatus): boolean {
  return status === "ready" || status === "failed";
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Poll a question until it settles.
 *
 * @remarks
 * Calls {@link getQuestion} every `pollIntervalMs` until `status` is `ready`
 * or `failed` and returns that state; a `failed` question is returned, not
 * thrown, so the caller can read `error` and decide whether to
 * {@link recomputeQuestion}. All polls share the one write session and each
 * signs its own proof.
 *
 * @example
 * ```typescript
 * const settled = await waitForQuestion({
 *   personalServerUrl,
 *   signer,
 *   grantId,
 *   questionId: registered.questionId,
 *   timeoutMs: 60_000,
 * });
 * if (settled.status === "ready") {
 *   // read derivedScope
 * }
 * ```
 * @returns The settled registration (`ready` or `failed`).
 * @throws {DerivativeQuestionTimeoutError} The question had not settled
 *   within `timeoutMs`; it keeps computing on the server.
 * @throws Whatever {@link getQuestion} throws, and the `signal`'s abort
 *   reason when the caller aborts.
 */
export async function waitForQuestion(
  params: WaitForQuestionParams,
): Promise<DerivativeQuestion> {
  const timeoutMs = Math.max(
    0,
    params.timeoutMs ?? DEFAULT_QUESTION_TIMEOUT_MS,
  );
  const pollIntervalMs = Math.max(
    0,
    params.pollIntervalMs ?? DEFAULT_QUESTION_POLL_INTERVAL_MS,
  );
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (params.signal?.aborted) throw abortError(params.signal);
    const latest = await getQuestion(params);
    if (isSettled(latest.status)) return latest;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new DerivativeQuestionTimeoutError(
        `Derivative question ${latest.questionId} was still ${latest.status} after ${timeoutMs}ms`,
        {
          questionId: latest.questionId,
          derivedScope: latest.derivedScope,
          status: latest.status,
          timeoutMs,
        },
      );
    }
    await sleep(Math.min(pollIntervalMs, remaining));
  }
}

/**
 * Register a question, wait for it, and read the answer: the whole builder
 * loop in one call.
 *
 * @remarks
 * {@link registerQuestion} + {@link waitForQuestion} +
 * {@link readPersonalServerData} on the derived scope, which is why the
 * grant needs a bare read entry for `derivedScope` on top of
 * `write:<derivedScope>` and the source reads. The read is the plain
 * Web3Signed one; when the grant is priced, settle the 402 yourself with the
 * escrow-aware read from `@opendatalabs/vana-sdk/server` and use
 * {@link registerQuestion} and {@link waitForQuestion} directly.
 *
 * A question registered this way keeps recomputing after the call returns:
 * every later change to a source scope refreshes the derived record, and the
 * builder can read it again without registering anything.
 *
 * @example
 * ```typescript
 * const { registration, record } = await askPersonalServer({
 *   personalServerUrl: "https://ps.example.com",
 *   signer,
 *   grantId,
 *   derivedScope: "coach.weekly",
 *   sourceScopes: ["oura.sleep"],
 *   question: "How did my sleep trend this week?",
 * });
 * console.log(record.data.answer, registration.questionId);
 * ```
 * @returns The settled registration and the derived record.
 * @throws {DerivativeQuestionFailedError} The question settled as `failed`
 *   (`details.error` is the server's reason).
 * @throws Everything {@link registerQuestion}, {@link waitForQuestion} and
 *   the read path throw.
 */
export async function askPersonalServer(
  params: AskPersonalServerParams,
): Promise<AskPersonalServerResult> {
  const registered = await registerQuestion(params);
  const registration = await waitForQuestion({
    ...params,
    questionId: registered.questionId,
  });
  if (registration.status !== "ready") {
    throw new DerivativeQuestionFailedError(
      `Derivative question ${registration.questionId} failed: ${registration.error ?? "no reason given"}`,
      {
        questionId: registration.questionId,
        derivedScope: registration.derivedScope,
        error: registration.error,
      },
    );
  }
  const signer = resolveWriteSigner(params.signer, {
    account: params.account,
  });
  const readParams: ReadPersonalServerDataParams = {
    personalServerUrl: normalizeBaseUrl(params.personalServerUrl),
    scope: params.derivedScope,
    grantId: params.grantId,
    signMessage: signer.signMessage,
    ...(params.audience === undefined ? {} : { audience: params.audience }),
    ...(params.headers === undefined ? {} : { headers: params.headers }),
    ...(params.fetch === undefined ? {} : { fetch: params.fetch }),
  };
  const record = await readPersonalServerData(readParams);
  return { registration, record };
}
