/**
 * PDPP client role: the grant lifecycle operation (spec-core #grant-lifecycle),
 * lifecycle recovery (#lifecycle-recovery), client revocation with a
 * disposition (#revocation) and the client's own disconnect (#client-disconnect).
 *
 * @remarks
 * - Discovery: `pdpp_grant_lifecycle_endpoint` from RFC 8414 metadata; every AS
 *   must provide it, so its absence is a protocol failure.
 * - Queries authenticate with any token issued for the grant (active, expired,
 *   superseded or revoked). Writes (`received`, `completed`, `retained`,
 *   `pdpp_disposition=delete`) need current authentication; a refusal with
 *   `current_authentication_required` is kept pending until the owner approves
 *   lifecycle recovery.
 * - Unknown members are ignored (Client item 15). An answer must name the
 *   grant asked about, in request order.
 * - A recovery token response is never a positive assessment and never a data
 *   grant: it is interpreted separately from `interpretTokenResponse`.
 * - {@link PdppLifecycleAgent} drives {@link PdppHeldDataManager}: scheduled
 *   and required queries, reports, the use gate and the disconnect helper
 *   (Client items 9, 19–26).
 *
 * @category PDPP
 */

import { PdppHttpError, PdppProtocolError, pdppHttpErrorFrom } from "./errors";
import {
  PDPP_FETCH_REDIRECT,
  PDPP_REQUEST_TIMEOUT_MS,
  assertPdppEndpoint,
  timeoutSignal,
  type PdppEndpointPolicy,
} from "./endpoints";
import type { PdppAuthorizationServerMetadata, PdppTokenResult } from "./authorization";
import {
  type PdppHeldDataManager,
  type PdppGrantRef,
  type PdppLifecycleAnswer,
  type PdppReadState,
  type PdppUseDecision,
  grantRefOf,
} from "./held-data";
import { PDPP_DATA_ACCESS_TYPE, PDPP_GRANT_LIFECYCLE_TYPE } from "./types";

type Fetch = typeof globalThis.fetch;

/** The lifecycle endpoint from AS metadata (spec-core #grant-lifecycle "Discovery"). */
export function grantLifecycleEndpointOf(metadata: PdppAuthorizationServerMetadata): string {
  const endpoint = metadata.pdpp_grant_lifecycle_endpoint;
  if (typeof endpoint !== "string" || endpoint === "") {
    throw new PdppProtocolError(
      "authorization server metadata has no pdpp_grant_lifecycle_endpoint; every AS must provide it",
    );
  }
  return endpoint;
}

/** Whether the AS advertises lifecycle recovery (every AS must). */
export function supportsLifecycleRecovery(metadata: PdppAuthorizationServerMetadata): boolean {
  return metadata.authorization_details_types_supported?.includes(PDPP_GRANT_LIFECYCLE_TYPE) ?? false;
}

export type PdppLifecycleEntryError =
  | "invalid_grant"
  | "current_authentication_required"
  | "invalid_instruction";

export type PdppLifecycleEntry =
  | { kind: "answer"; answer: PdppLifecycleAnswer }
  | { kind: "error"; grant_id: string; error: PdppLifecycleEntryError | string };

export interface PdppLifecycleToken {
  token: string;
  hint?: "access_token" | "refresh_token";
}

const READ_STATES: readonly PdppReadState[] = ["active", "window_closed", "expired", "revoked"];

/** Parse a lifecycle response body for the grants requested, in request order. */
export function parseLifecycleResponse(body: unknown, requested: string[]): PdppLifecycleEntry[] {
  const grants = (body as { grants?: unknown } | null)?.grants;
  if (!Array.isArray(grants) || grants.length !== requested.length) {
    throw new PdppProtocolError("lifecycle response must carry one entry per requested grant_id");
  }
  return grants.map((raw, index) => {
    const expected = requested[index]!;
    const e = raw as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || e.grant_id !== expected) {
      throw new PdppProtocolError(`lifecycle entry ${index} does not name grant ${expected}`);
    }
    if (typeof e.error === "string") return { kind: "error", grant_id: expected, error: e.error };
    const bad = (what: string): never => {
      throw new PdppProtocolError(`lifecycle answer for ${expected}: ${what}`);
    };
    if (typeof e.assessed_at !== "string" || Number.isNaN(Date.parse(e.assessed_at))) bad("assessed_at");
    if (e.held_data !== "permitted" && e.held_data !== "erase") bad("held_data");
    // An unrecognized read_state never hides an erasure instruction (review F12).
    const answer: PdppLifecycleAnswer = {
      grant_id: expected,
      assessed_at: e.assessed_at as string,
      read_state: READ_STATES.includes(e.read_state as PdppReadState) ? (e.read_state as PdppReadState) : "unknown",
      held_data: e.held_data as "permitted" | "erase",
      ...(typeof e.ended_at === "string" && { ended_at: e.ended_at }),
    };
    if (answer.held_data === "erase") {
      const x = e.erasure as Record<string, unknown> | undefined;
      if (
        !x ||
        typeof x.instruction_id !== "string" ||
        typeof x.accepted_at !== "string" ||
        typeof x.effective_at !== "string" ||
        typeof x.stop_use_by !== "string" ||
        [x.accepted_at, x.effective_at, x.stop_use_by].some((t) => Number.isNaN(Date.parse(t as string)))
      ) {
        bad("an erase answer lacks a complete erasure object");
      }
      answer.erasure = {
        instruction_id: x!.instruction_id as string,
        accepted_at: x!.accepted_at as string,
        effective_at: x!.effective_at as string,
        stop_use_by: x!.stop_use_by as string,
      };
    }
    return { kind: "answer", answer };
  });
}

/** Token-bearing POST: no redirects (review F7), bounded by a timeout (review F9). */
async function postForm(
  endpoint: string,
  form: URLSearchParams,
  fetchImpl: Fetch | undefined,
  timeoutMs: number = PDPP_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const signal = timeoutSignal(timeoutMs);
  return doFetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
    redirect: PDPP_FETCH_REDIRECT,
    ...(signal && { signal }),
  });
}

async function lifecycleRequest(
  endpoint: string,
  grantId: string,
  credential: PdppLifecycleToken,
  extra: Record<string, string>,
  fetchImpl?: Fetch,
  timeoutMs?: number,
): Promise<PdppLifecycleEntry> {
  const form = new URLSearchParams({ grant_id: grantId, token: credential.token });
  if (credential.hint) form.set("token_type_hint", credential.hint);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const response = await postForm(endpoint, form, fetchImpl, timeoutMs);
  if (!response.ok) throw await pdppHttpErrorFrom(response);
  return parseLifecycleResponse(await response.json(), [grantId])[0]!;
}

/** A lifecycle query (public client: one grant, authenticated by `token`). */
export function queryGrantLifecycle(input: {
  endpoint: string;
  grantId: string;
  credential: PdppLifecycleToken;
  fetch?: Fetch;
  timeoutMs?: number;
}): Promise<PdppLifecycleEntry> {
  return lifecycleRequest(input.endpoint, input.grantId, input.credential, {}, input.fetch, input.timeoutMs);
}

/** A `received`, `completed` or `retained` report; needs current authentication. */
export function reportGrantLifecycle(input: {
  endpoint: string;
  grantId: string;
  credential: PdppLifecycleToken;
  report: "received" | "completed" | "retained";
  instructionId: string;
  reportedAt: string;
  retainedUntil?: string;
  retentionBasis?: string;
  retentionScope?: string;
  fetch?: Fetch;
  timeoutMs?: number;
}): Promise<PdppLifecycleEntry> {
  if (input.report === "retained" && input.retainedUntil === undefined) {
    throw new TypeError("report=retained requires retainedUntil");
  }
  return lifecycleRequest(
    input.endpoint,
    input.grantId,
    input.credential,
    {
      report: input.report,
      instruction_id: input.instructionId,
      reported_at: input.reportedAt,
      ...(input.report === "retained" && {
        retained_until: input.retainedUntil!,
        ...(input.retentionBasis !== undefined && { retention_basis: input.retentionBasis }),
        ...(input.retentionScope !== undefined && { retention_scope: input.retentionScope }),
      }),
    },
    input.fetch,
    input.timeoutMs,
  );
}

/** Convey the owner's `delete` made in the client, with the choice time as `reported_at`. */
export function conveyClientErasure(input: {
  endpoint: string;
  grantId: string;
  credential: PdppLifecycleToken;
  reportedAt: string;
  fetch?: Fetch;
  timeoutMs?: number;
}): Promise<PdppLifecycleEntry> {
  return lifecycleRequest(
    input.endpoint,
    input.grantId,
    input.credential,
    { pdpp_disposition: "delete", reported_at: input.reportedAt },
    input.fetch,
    input.timeoutMs,
  );
}

/**
 * RFC 7009 revocation with an optional `pdpp_disposition` (spec-core
 * #revocation). Revoking the refresh token ends every grant its family covers.
 * `reportedAt` is sent only with `delete`.
 */
export async function revokeWithDisposition(input: {
  revocationEndpoint: string;
  clientId: string;
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
  disposition?: "keep" | "delete";
  reportedAt?: string;
  fetch?: Fetch;
  timeoutMs?: number;
}): Promise<void> {
  const form = new URLSearchParams({ token: input.token, client_id: input.clientId });
  if (input.tokenTypeHint) form.set("token_type_hint", input.tokenTypeHint);
  if (input.disposition) form.set("pdpp_disposition", input.disposition);
  if (input.reportedAt !== undefined) {
    if (input.disposition !== "delete") {
      throw new TypeError("reported_at goes only with pdpp_disposition=delete");
    }
    form.set("reported_at", input.reportedAt);
  }
  const response = await postForm(input.revocationEndpoint, form, input.fetch, input.timeoutMs);
  if (!response.ok) throw await pdppHttpErrorFrom(response);
}

/** A lifecycle recovery authorization detail: `type` and distinct, non-empty `grant_ids` only. */
export function buildLifecycleRecoveryDetail(grantIds: string[]): {
  type: typeof PDPP_GRANT_LIFECYCLE_TYPE;
  grant_ids: string[];
} {
  if (
    grantIds.length === 0 ||
    grantIds.some((g) => typeof g !== "string" || g === "") ||
    new Set(grantIds).size !== grantIds.length
  ) {
    throw new TypeError("grant_ids must be a non-empty array of distinct, non-empty strings");
  }
  return { type: PDPP_GRANT_LIFECYCLE_TYPE, grant_ids: [...grantIds] };
}

/**
 * The authorization request for lifecycle recovery (spec-core
 * #lifecycle-recovery, case D5): exactly one recovery detail and nothing
 * else, in the same query and JSON forms as `buildAuthorizationRequest`.
 */
export function buildLifecycleRecoveryRequest(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  grantIds: string[];
  state?: string;
}): { query: URLSearchParams; json: Record<string, unknown> } {
  const details = [buildLifecycleRecoveryDetail(input.grantIds)];
  const base = {
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    ...(input.state !== undefined && { state: input.state }),
  };
  return {
    query: new URLSearchParams({ ...base, authorization_details: JSON.stringify(details) }),
    json: { ...base, authorization_details: details },
  };
}

/**
 * Interpret a lifecycle recovery token response. It authenticates lifecycle
 * reports for the approved grants only. It is not a positive assessment, not
 * a data grant, and no refresh token is kept from it.
 */
export function interpretRecoveryTokenResponse(body: unknown): {
  accessToken: string;
  grantIds: string[];
} {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b.access_token !== "string" || b.access_token === "") {
    throw new PdppProtocolError("recovery token response has no access_token");
  }
  const details = b.authorization_details;
  if (!Array.isArray(details) || details.length !== 1) {
    throw new PdppProtocolError("recovery token response must return exactly the recovery element");
  }
  const d = details[0] as Record<string, unknown>;
  if (d?.type === PDPP_DATA_ACCESS_TYPE) {
    throw new PdppProtocolError("a recovery token response must not return a data-access grant");
  }
  if (
    d?.type !== PDPP_GRANT_LIFECYCLE_TYPE ||
    !Array.isArray(d.grant_ids) ||
    d.grant_ids.length === 0 ||
    !d.grant_ids.every((g) => typeof g === "string" && g !== "")
  ) {
    throw new PdppProtocolError("recovery token response carries no approved grant_ids");
  }
  return { accessToken: b.access_token, grantIds: [...(d.grant_ids as string[])] };
}

/** Redeem a lifecycle recovery authorization code (RFC 6749 §4.1.3 + PKCE). */
export async function exchangeLifecycleRecoveryCode(input: {
  metadata: PdppAuthorizationServerMetadata;
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  fetch?: Fetch;
}): Promise<{ accessToken: string; grantIds: string[] }> {
  const response = await postForm(
    input.metadata.token_endpoint,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
    }),
    input.fetch,
  );
  if (!response.ok) throw await pdppHttpErrorFrom(response);
  return interpretRecoveryTokenResponse(await response.json());
}

/** Where the agent gets lifecycle credentials. The app owns token storage. */
export interface PdppLifecycleCredentials {
  /** Any token the AS issued to this client covering the grant: queries accept expired, superseded and revoked tokens. */
  queryToken(ref: PdppGrantRef): PdppLifecycleToken | undefined;
  /** Current authentication: an active access token, the current refresh token, or an unexpired recovery token. */
  writeToken(ref: PdppGrantRef): PdppLifecycleToken | undefined;
  /** The current refresh token of the family covering the grant, for revocation. */
  refreshToken?(ref: PdppGrantRef): string | undefined;
  /**
   * Every grant the grant's refresh-token family covers. Revoking the family
   * ends all of them (spec-core #revocation), so the agent revokes only when
   * this set lies inside the disconnect (review F3). When it is not
   * implemented, the agent never revokes.
   */
  familyGrants?(ref: PdppGrantRef): PdppGrantRef[];
  /** The AS refused this token for a write; do not offer it again for writes. */
  refusedForWrites?(ref: PdppGrantRef, token: string): void;
}

const refKey = (ref: PdppGrantRef) => JSON.stringify([ref.issuer, ref.grantId]);

/**
 * Reference credential store. Keeps every token issued for a grant for
 * queries (an AS keeps only digests; a client may keep the tokens). Not
 * durable: an app persists tokens in its own secure storage.
 */
export class InMemoryPdppLifecycleCredentials implements PdppLifecycleCredentials {
  private readonly byGrant = new Map<
    string,
    {
      access: Array<{ token: string; expiresAt?: number }>;
      refresh: string[];
      recovery?: string;
      refused: Set<string>;
    }
  >();
  private readonly families = new Map<string, PdppGrantRef[]>();

  constructor(private readonly now: () => number = Date.now) {}

  private entry(ref: PdppGrantRef) {
    let e = this.byGrant.get(refKey(ref));
    if (!e) {
      e = { access: [], refresh: [], refused: new Set() };
      this.byGrant.set(refKey(ref), e);
    }
    return e;
  }

  /** Record a token response; the newest refresh token supersedes older ones and covers every grant returned. */
  recordTokenResponse(result: PdppTokenResult): void {
    const expiresAt = result.expiresIn !== undefined ? this.now() + result.expiresIn * 1000 : undefined;
    const refs = result.grants.map(grantRefOf);
    for (const ref of refs) {
      const e = this.entry(ref);
      e.access.push({ token: result.accessToken, ...(expiresAt !== undefined && { expiresAt }) });
      if (result.refreshToken) e.refresh.push(result.refreshToken);
    }
    if (result.refreshToken) this.families.set(result.refreshToken, refs);
  }

  /** Record a lifecycle recovery token for the approved grants of one issuer. */
  recordRecoveryToken(issuer: string, recovery: { accessToken: string; grantIds: string[] }): void {
    for (const grantId of recovery.grantIds) this.entry({ issuer, grantId }).recovery = recovery.accessToken;
  }

  queryToken(ref: PdppGrantRef): PdppLifecycleToken | undefined {
    const e = this.entry(ref);
    const refresh = e.refresh.at(-1);
    if (refresh) return { token: refresh, hint: "refresh_token" };
    const access = e.access.at(-1);
    if (access) return { token: access.token, hint: "access_token" };
    return e.recovery ? { token: e.recovery, hint: "access_token" } : undefined;
  }

  writeToken(ref: PdppGrantRef): PdppLifecycleToken | undefined {
    const e = this.entry(ref);
    if (e.recovery && !e.refused.has(e.recovery)) return { token: e.recovery, hint: "access_token" };
    const refresh = e.refresh.at(-1);
    if (refresh && !e.refused.has(refresh)) return { token: refresh, hint: "refresh_token" };
    const access = e.access.at(-1);
    if (access && !e.refused.has(access.token) && (access.expiresAt === undefined || access.expiresAt > this.now())) {
      return { token: access.token, hint: "access_token" };
    }
    return undefined;
  }

  refreshToken(ref: PdppGrantRef): string | undefined {
    return this.entry(ref).refresh.at(-1);
  }

  familyGrants(ref: PdppGrantRef): PdppGrantRef[] {
    const refresh = this.refreshToken(ref);
    return refresh ? (this.families.get(refresh) ?? [ref]) : [];
  }

  refusedForWrites(ref: PdppGrantRef, token: string): void {
    this.entry(ref).refused.add(token);
  }
}

export interface PdppLifecycleAgentOptions {
  manager: PdppHeldDataManager;
  /** `pdpp_grant_lifecycle_endpoint`, see {@link grantLifecycleEndpointOf}. */
  lifecycleEndpoint: string;
  /** `revocation_endpoint`, when the AS supports client revocation. */
  revocationEndpoint?: string;
  clientId: string;
  credentials: PdppLifecycleCredentials;
  fetch?: Fetch;
  /** Endpoint policy (https, no local hosts unless allowed). */
  policy?: PdppEndpointPolicy;
  /** Timeout for each lifecycle and revocation request (review F9). Default 30 s. */
  requestTimeoutMs?: number;
  /** How long `ensureMayUse` waits for a required query before deciding (review F9). Default 2 s. */
  useQueryWaitMs?: number;
}

/** The disconnect statement and choices (Client item 25). Neither choice is preselected. */
export interface PdppDisconnectOffer {
  grants: PdppGrantRef[];
  statement: string;
  choices: Array<{ value: "keep" | "delete"; label: string; explanation: string }>;
  preselected: null;
}

/** Raised when a disconnect would end grants the owner did not choose (review F3). */
export class PdppDisconnectScopeError extends Error {
  constructor(readonly outside: PdppGrantRef[]) {
    super(
      `keep cannot be conveyed for part of a refresh-token family: revoking it would also end ${outside
        .map((r) => r.grantId)
        .join(", ")}; disconnect those grants too, or use delete`,
    );
    this.name = "PdppDisconnectScopeError";
  }
}

/**
 * Drives the client's lifecycle duties against one AS: scheduled and
 * required queries, disposal, conveyances, reports, the use gate and
 * disconnect. Call {@link runDue} on a timer (for example once a minute) and
 * on resume from suspension; {@link start} does that with `setInterval`.
 */
export class PdppLifecycleAgent {
  private readonly manager: PdppHeldDataManager;
  private readonly lifecycleEndpoint: string;
  private readonly revocationEndpoint: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: PdppLifecycleAgentOptions) {
    this.manager = options.manager;
    this.lifecycleEndpoint = assertPdppEndpoint(
      options.lifecycleEndpoint,
      options.lifecycleEndpoint,
      "lifecycle endpoint",
      options.policy,
    );
    this.revocationEndpoint =
      options.revocationEndpoint !== undefined
        ? assertPdppEndpoint(options.revocationEndpoint, options.lifecycleEndpoint, "revocation endpoint", options.policy)
        : undefined;
  }

  /** Build an agent from discovered (and checked) AS metadata. */
  static fromMetadata(
    metadata: PdppAuthorizationServerMetadata,
    options: Omit<PdppLifecycleAgentOptions, "lifecycleEndpoint" | "revocationEndpoint">,
  ): PdppLifecycleAgent {
    return new PdppLifecycleAgent({
      ...options,
      lifecycleEndpoint: grantLifecycleEndpointOf(metadata),
      ...(metadata.revocation_endpoint !== undefined && { revocationEndpoint: metadata.revocation_endpoint }),
    });
  }

  /** Run {@link runDue} every `intervalMs` (default one minute). */
  start(intervalMs = 60_000): void {
    this.stop();
    this.timer = setInterval(() => {
      void this.runDue();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private get fetchOptions() {
    return {
      ...(this.options.fetch && { fetch: this.options.fetch }),
      timeoutMs: this.options.requestTimeoutMs ?? PDPP_REQUEST_TIMEOUT_MS,
    };
  }

  /** Record a token response: credentials and the positive assessment it carries. */
  recordTokenResponse(result: PdppTokenResult): void {
    if (this.options.credentials instanceof InMemoryPdppLifecycleCredentials) {
      this.options.credentials.recordTokenResponse(result);
    }
    for (const issued of result.grants) this.manager.recordTokenResponse(issued);
  }

  /** One lifecycle query attempt. Resolves when it is answered or fails; never throws. */
  async query(ref: PdppGrantRef): Promise<"answered" | "failed"> {
    const attempt = this.manager.beginAttempt(ref);
    const credential = this.options.credentials.queryToken(ref);
    if (!credential) {
      // Review F12 (P16): nothing can query; the owner must approve lifecycle recovery.
      this.manager.recordFailure(ref, attempt, { kind: "per_grant" });
      this.manager.markNeedsRecovery(ref);
      return "failed";
    }
    try {
      const entry = await queryGrantLifecycle({
        endpoint: this.lifecycleEndpoint,
        grantId: ref.grantId,
        credential,
        ...this.fetchOptions,
      });
      if (entry.kind === "error") {
        this.manager.recordFailure(ref, attempt, { kind: "per_grant" });
        return "failed";
      }
      await this.manager.recordAnswer(ref, attempt, entry.answer);
      await this.sendReports(ref);
      return "answered";
    } catch (error) {
      if (error instanceof PdppHttpError) {
        const retryAfterMs = error.retryAfterMs(this.manager.now());
        this.manager.recordFailure(ref, attempt, {
          kind: "http",
          ...(retryAfterMs !== undefined && { retryAfterMs }),
        });
        // A disabled or unknown token: recovery is the path back (case D3).
        if (error.status === 401 && error.code === "invalid_token") this.manager.markNeedsRecovery(ref);
      } else if (error instanceof PdppProtocolError) {
        this.manager.recordFailure(ref, attempt, { kind: "http" });
      } else {
        this.manager.recordFailure(ref, attempt, { kind: "transport" });
      }
      return "failed";
    }
  }

  /**
   * The periodic duty runner (Client items 6, 21–25; review F5, F8):
   * 1. complete due disposal for every known grant (retention ceilings,
   *    unfinished erasure);
   * 2. for every due grant, retry a pending conveyance of the owner's
   *    `delete`, else start a lifecycle query (which also sends reports and
   *    learns the AS instruction id).
   * It does not wait for earlier unanswered attempts: each start schedules
   * the next one.
   */
  async runDue(): Promise<Array<"answered" | "failed">> {
    for (const ref of this.manager.knownGrants()) {
      try {
        await this.manager.disposeDue(ref);
      } catch {
        // retried on the next run; a missed deadline is recorded by the manager
      }
    }
    const started = this.manager.dueGrants().map((ref) => {
      const conveyance = this.manager.erasureRecord(ref)?.reports.conveyance;
      return conveyance === "pending" || conveyance === "needs_current_authentication"
        ? this.retryConveyance(ref)
        : this.query(ref);
    });
    return Promise.all(started);
  }

  private async retryConveyance(ref: PdppGrantRef): Promise<"answered" | "failed"> {
    const attempt = this.manager.beginAttempt(ref);
    const ok = await this.conveyDelete(ref);
    if (!ok) {
      this.manager.recordFailure(ref, attempt, { kind: "per_grant" });
      return "failed";
    }
    await this.sendReports(ref);
    return "answered";
  }

  /**
   * The use gate (Client items 9, 19–23, 26): starts a required query first
   * and waits for it at most `useQueryWaitMs` (a failed or slow one does not
   * stop permitted use), completes due disposal, then decides.
   */
  async ensureMayUse(ref: PdppGrantRef, options: { purpose?: string } = {}): Promise<PdppUseDecision> {
    const decision = this.manager.checkUse(ref, options);
    if (!decision.allowed && decision.reason === "query_required") {
      const pending = this.query(ref);
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        pending,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, this.options.useQueryWaitMs ?? 2_000);
        }),
      ]);
      if (timer !== undefined) clearTimeout(timer);
    }
    await this.manager.disposeDue(ref);
    return this.manager.checkUse(ref, options);
  }

  /** Send pending reports for one grant, or for all (spec-core #erasure "Reports and records"). */
  async sendReports(ref?: PdppGrantRef): Promise<void> {
    for (const r of ref ? [ref] : this.manager.knownGrants()) await this.sendReportsFor(r);
  }

  /** Grants that wait for the owner to approve lifecycle recovery (see {@link buildLifecycleRecoveryRequest}). */
  grantsNeedingRecovery(): PdppGrantRef[] {
    return this.manager.grantsNeedingRecovery();
  }

  /** The disconnect offer. The app shows it and the owner picks; nothing is preselected. */
  describeDisconnect(grants: PdppGrantRef[]): PdppDisconnectOffer {
    return {
      grants,
      statement: "Disconnecting ends this app's access. Choose what happens to the data it already holds.",
      choices: [
        {
          value: "keep",
          label: "Keep",
          explanation:
            "The app keeps the data it holds and may use it only for the purpose you approved, within the retention limit you approved. It never passes it to an independent party.",
        },
        {
          value: "delete",
          label: "Delete",
          explanation:
            "The app stops using the data at once and deletes it, its derivatives, and copies held for it, within 30 days. Legally required copies and stated exclusions may remain.",
        },
      ],
      preselected: null,
    };
  }

  /**
   * Disconnect at the owner's direction (Client item 25). `disposition` is
   * required; there is no default. A `choseAt` in the future is clamped to now.
   *
   * - `delete` is an erasure instruction effective at once and the first
   *   receipt, whether or not the AS is reachable; it is saved before data is
   *   deleted. It is conveyed with `reported_at`: by revoking the refresh
   *   family when that family covers only grants in this disconnect, else by
   *   the per-grant lifecycle write (`pdpp_disposition=delete`), which ends
   *   that grant only. A failed conveyance stays pending and {@link runDue}
   *   retries it.
   * - `keep` is conveyed by revoking the family, and only when the family lies
   *   inside the disconnect; otherwise {@link PdppDisconnectScopeError} is
   *   thrown before anything changes (review F3). `conveyed: false` means
   *   access did not end (no revocation endpoint or refresh token, or the
   *   revocation failed).
   */
  async disconnect(input: {
    grants: PdppGrantRef[];
    disposition: "keep" | "delete";
    choseAt?: number;
  }): Promise<{ conveyed: boolean }> {
    const disposition = input.disposition as unknown;
    if (disposition !== "keep" && disposition !== "delete") {
      throw new TypeError("disconnect needs an explicit disposition: keep or delete");
    }
    const chosen = new Set(input.grants.map(refKey));
    const plan = input.grants.map((ref) => {
      const refresh = this.options.credentials.refreshToken?.(ref);
      const family = this.options.credentials.familyGrants?.(ref);
      const outside = family ? family.filter((f) => !chosen.has(refKey(f))) : undefined;
      const revocable = this.revocationEndpoint !== undefined && refresh !== undefined && outside !== undefined && outside.length === 0;
      return { ref, refresh, outside: outside ?? [], revocable };
    });
    if (disposition === "keep") {
      const outside = plan.flatMap((p) => (p.refresh !== undefined && this.revocationEndpoint ? p.outside : []));
      if (outside.length > 0) throw new PdppDisconnectScopeError(outside);
    }
    const choseAt = Math.min(input.choseAt ?? this.manager.now(), this.manager.now());
    if (disposition === "delete") {
      for (const ref of input.grants) await this.manager.ownerChoseDelete(ref, choseAt);
    }
    let conveyed = true;
    const revoked = new Set<string>();
    for (const p of plan) {
      if (p.revocable) {
        if (!revoked.has(p.refresh!)) {
          try {
            await revokeWithDisposition({
              revocationEndpoint: this.revocationEndpoint!,
              clientId: this.options.clientId,
              token: p.refresh!,
              tokenTypeHint: "refresh_token",
              disposition,
              ...(disposition === "delete" && { reportedAt: new Date(choseAt).toISOString() }),
              ...this.fetchOptions,
            });
            revoked.add(p.refresh!);
          } catch {
            conveyed = false;
            continue;
          }
        }
        this.afterRevocation(p.ref, disposition);
        continue;
      }
      if (disposition === "delete") {
        if (!(await this.conveyDelete(p.ref))) conveyed = false;
      } else {
        conveyed = false; // no revocation path: access did not end
      }
    }
    return { conveyed };
  }

  private afterRevocation(ref: PdppGrantRef, disposition: "keep" | "delete"): void {
    this.manager.recordEnding(ref, "revoked");
    if (disposition === "delete") this.manager.setReportState(ref, "conveyance", "sent");
  }

  private async conveyDelete(ref: PdppGrantRef): Promise<boolean> {
    const e = this.manager.erasureRecord(ref);
    if (!e) return true;
    return this.write(ref, "conveyance", (credential) =>
      conveyClientErasure({
        endpoint: this.lifecycleEndpoint,
        grantId: ref.grantId,
        credential,
        reportedAt: e.firstReceiptAt,
        ...this.fetchOptions,
      }),
    );
  }

  private async sendReportsFor(ref: PdppGrantRef): Promise<void> {
    const e = this.manager.erasureRecord(ref);
    if (!e) return;
    const isWaiting = (s: string) => s === "pending" || s === "needs_current_authentication";
    if (isWaiting(e.reports.conveyance)) await this.conveyDelete(ref);
    const instructionId = e.asInstructionId;
    if (instructionId === undefined) return; // learned through the next query
    const send = (
      report: "received" | "completed" | "retained",
      reportedAt: string,
      extra: { retainedUntil?: string; retentionBasis?: string; retentionScope?: string } = {},
    ) =>
      this.write(ref, report, (credential) =>
        reportGrantLifecycle({
          endpoint: this.lifecycleEndpoint,
          grantId: ref.grantId,
          credential,
          report,
          instructionId,
          reportedAt,
          ...extra,
          ...this.fetchOptions,
        }),
      );
    if (isWaiting(e.reports.received)) await send("received", e.firstReceiptAt);
    const retaining = e.legalRetention !== undefined && e.legalRetention.endedAt === undefined;
    if (retaining && isWaiting(e.reports.retained)) {
      await send("retained", e.legalRetention!.recordedAt, {
        retainedUntil: e.legalRetention!.until,
        retentionBasis: e.legalRetention!.basis,
        retentionScope: e.legalRetention!.scope,
      });
    } else if (!retaining && e.completedAt && isWaiting(e.reports.completed)) {
      // After a legal retention ends, completion is the deletion of the retained data.
      await send("completed", e.legalRetention?.endedAt ?? e.completedAt);
    }
  }

  /** One write; maps the outcome onto the record's report state. */
  private async write(
    ref: PdppGrantRef,
    report: "conveyance" | "received" | "completed" | "retained",
    call: (credential: PdppLifecycleToken) => Promise<PdppLifecycleEntry>,
  ): Promise<boolean> {
    const credential = this.options.credentials.writeToken(ref);
    if (!credential) {
      this.manager.setReportState(ref, report, "needs_current_authentication");
      return false;
    }
    try {
      const entry = await call(credential);
      if (entry.kind === "error") {
        if (entry.error === "current_authentication_required") {
          this.options.credentials.refusedForWrites?.(ref, credential.token);
          this.manager.setReportState(ref, report, "needs_current_authentication");
        }
        return false;
      }
      if (entry.answer.erasure) this.manager.linkInstruction(ref, entry.answer.erasure.instruction_id);
      this.manager.setReportState(ref, report, "sent");
      return true;
    } catch {
      return false; // stays pending; retried by runDue
    }
  }
}
