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
    if (!READ_STATES.includes(e.read_state as PdppReadState)) bad("read_state");
    if (e.held_data !== "permitted" && e.held_data !== "erase") bad("held_data");
    const answer: PdppLifecycleAnswer = {
      grant_id: expected,
      assessed_at: e.assessed_at as string,
      read_state: e.read_state as PdppReadState,
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

async function postForm(
  endpoint: string,
  form: URLSearchParams,
  fetchImpl: Fetch | undefined,
): Promise<Response> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  return doFetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
  });
}

async function lifecycleRequest(
  endpoint: string,
  grantId: string,
  credential: PdppLifecycleToken,
  extra: Record<string, string>,
  fetchImpl?: Fetch,
): Promise<PdppLifecycleEntry> {
  const form = new URLSearchParams({ grant_id: grantId, token: credential.token });
  if (credential.hint) form.set("token_type_hint", credential.hint);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const response = await postForm(endpoint, form, fetchImpl);
  if (!response.ok) throw await pdppHttpErrorFrom(response);
  return parseLifecycleResponse(await response.json(), [grantId])[0]!;
}

/** A lifecycle query (public client: one grant, authenticated by `token`). */
export function queryGrantLifecycle(input: {
  endpoint: string;
  grantId: string;
  credential: PdppLifecycleToken;
  fetch?: Fetch;
}): Promise<PdppLifecycleEntry> {
  return lifecycleRequest(input.endpoint, input.grantId, input.credential, {}, input.fetch);
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
  );
}

/** Convey the owner's `delete` made in the client, with the choice time as `reported_at`. */
export function conveyClientErasure(input: {
  endpoint: string;
  grantId: string;
  credential: PdppLifecycleToken;
  reportedAt: string;
  fetch?: Fetch;
}): Promise<PdppLifecycleEntry> {
  return lifecycleRequest(
    input.endpoint,
    input.grantId,
    input.credential,
    { pdpp_disposition: "delete", reported_at: input.reportedAt },
    input.fetch,
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
  const response = await postForm(input.revocationEndpoint, form, input.fetch);
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
  /** The AS refused this token for a write; do not offer it again for writes. */
  refusedForWrites?(ref: PdppGrantRef, token: string): void;
}

/**
 * Reference credential store. Keeps every token issued for a grant for
 * queries (an AS keeps only digests; a client may keep the tokens).
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

  constructor(private readonly now: () => number = Date.now) {}

  private entry(ref: PdppGrantRef) {
    const key = JSON.stringify([ref.issuer, ref.grantId]);
    let e = this.byGrant.get(key);
    if (!e) {
      e = { access: [], refresh: [], refused: new Set() };
      this.byGrant.set(key, e);
    }
    return e;
  }

  /** Record a token response; the newest refresh token supersedes older ones. */
  recordTokenResponse(result: PdppTokenResult): void {
    const expiresAt = result.expiresIn !== undefined ? this.now() + result.expiresIn * 1000 : undefined;
    for (const issued of result.grants) {
      const e = this.entry(grantRefOf(issued));
      e.access.push({ token: result.accessToken, ...(expiresAt !== undefined && { expiresAt }) });
      if (result.refreshToken) e.refresh.push(result.refreshToken);
    }
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
}

/** The disconnect statement and choices (Client item 25). Neither choice is preselected. */
export interface PdppDisconnectOffer {
  grants: PdppGrantRef[];
  statement: string;
  choices: Array<{ value: "keep" | "delete"; label: string; explanation: string }>;
  preselected: null;
}

/**
 * Drives the client's lifecycle duties against one AS: scheduled and
 * required queries, reports, the use gate and disconnect.
 */
export class PdppLifecycleAgent {
  private readonly manager: PdppHeldDataManager;
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(private readonly options: PdppLifecycleAgentOptions) {
    this.manager = options.manager;
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
      this.manager.recordFailure(ref, attempt, { kind: "per_grant" });
      return "failed";
    }
    try {
      const entry = await queryGrantLifecycle({
        endpoint: this.options.lifecycleEndpoint,
        grantId: ref.grantId,
        credential,
        ...(this.options.fetch && { fetch: this.options.fetch }),
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
      } else if (error instanceof PdppProtocolError) {
        this.manager.recordFailure(ref, attempt, { kind: "http" });
      } else {
        this.manager.recordFailure(ref, attempt, { kind: "transport" });
      }
      return "failed";
    }
  }

  /**
   * Start an attempt for every due grant (Client item 21). Call it on a timer
   * (for example every minute) and on resume from suspension. It does not wait
   * for earlier unanswered attempts: each start schedules the next one.
   */
  runDue(): Promise<Array<"answered" | "failed">> {
    const started = this.manager.dueGrants().map((ref) => {
      const p = this.query(ref);
      this.inFlight.add(p);
      void p.finally(() => this.inFlight.delete(p));
      return p;
    });
    return Promise.all(started);
  }

  /**
   * The use gate (Client items 9, 19–23, 26): starts a required query first
   * (a failed one does not stop permitted use), completes due disposal, then
   * decides.
   */
  async ensureMayUse(ref: PdppGrantRef, options: { purpose?: string } = {}): Promise<PdppUseDecision> {
    let decision = this.manager.checkUse(ref, options);
    if (!decision.allowed && decision.reason === "query_required") {
      await this.query(ref);
      decision = this.manager.checkUse(ref, options);
    }
    await this.manager.disposeDue(ref);
    return decision.allowed ? this.manager.checkUse(ref, options) : decision;
  }

  /** Send pending reports for one grant, or for all (spec-core #erasure "Reports and records"). */
  async sendReports(ref?: PdppGrantRef): Promise<void> {
    for (const r of ref ? [ref] : this.manager.knownGrants()) await this.sendReportsFor(r);
  }

  /** Grants whose reports wait for current authentication: ask the owner to approve lifecycle recovery. */
  grantsNeedingRecovery(): PdppGrantRef[] {
    return this.manager.knownGrants().filter((ref) => {
      const reports = this.manager.erasureRecord(ref)?.reports;
      return reports ? Object.values(reports).includes("needs_current_authentication") : false;
    });
  }

  /** The disconnect offer. The app shows it and the owner picks; nothing is preselected. */
  describeDisconnect(grants: PdppGrantRef[]): PdppDisconnectOffer {
    return {
      grants,
      statement:
        "Disconnecting ends this app's access. Choose what happens to the data it already holds.",
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
   * required; there is no default. `delete` is an erasure instruction
   * effective at once and the first receipt, whether or not the AS is
   * reachable. The choice is then conveyed with current authentication and
   * `reported_at`; a failed conveyance stays pending and {@link sendReports}
   * retries it. `conveyed: false` for `keep` means access did not end (no
   * revocation endpoint or refresh token, or the revocation failed).
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
    const choseAt = input.choseAt ?? this.manager.now();
    if (disposition === "delete") {
      for (const ref of input.grants) await this.manager.ownerChoseDelete(ref, choseAt);
    }
    let conveyed = true;
    const revoked = new Set<string>();
    for (const ref of input.grants) {
      const refresh = this.options.credentials.refreshToken?.(ref);
      if (this.options.revocationEndpoint && refresh) {
        if (revoked.has(refresh)) {
          this.afterRevocation(ref, disposition);
          continue;
        }
        try {
          await revokeWithDisposition({
            revocationEndpoint: this.options.revocationEndpoint,
            clientId: this.options.clientId,
            token: refresh,
            tokenTypeHint: "refresh_token",
            disposition,
            ...(disposition === "delete" && { reportedAt: new Date(choseAt).toISOString() }),
            ...(this.options.fetch && { fetch: this.options.fetch }),
          });
          revoked.add(refresh);
          this.afterRevocation(ref, disposition);
        } catch {
          conveyed = false;
        }
        continue;
      }
      if (disposition === "delete") {
        if (!(await this.conveyDelete(ref))) conveyed = false;
      } else {
        // `keep` needs client revocation to end access; without it nothing ends.
        conveyed = false;
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
        endpoint: this.options.lifecycleEndpoint,
        grantId: ref.grantId,
        credential,
        reportedAt: e.firstReceiptAt,
        ...(this.options.fetch && { fetch: this.options.fetch }),
      }),
    );
  }

  private async sendReportsFor(ref: PdppGrantRef): Promise<void> {
    const e = this.manager.erasureRecord(ref);
    if (!e) return;
    if (e.reports.conveyance === "pending" || e.reports.conveyance === "needs_current_authentication") {
      await this.conveyDelete(ref);
    }
    const instructionId = e.asInstructionId;
    if (instructionId === undefined) return; // learned through the next query
    const send = (
      report: "received" | "completed" | "retained",
      reportedAt: string,
      extra: { retainedUntil?: string; retentionBasis?: string; retentionScope?: string } = {},
    ) =>
      this.write(ref, report, (credential) =>
        reportGrantLifecycle({
          endpoint: this.options.lifecycleEndpoint,
          grantId: ref.grantId,
          credential,
          report,
          instructionId,
          reportedAt,
          ...extra,
          ...(this.options.fetch && { fetch: this.options.fetch }),
        }),
      );
    const waiting = (s: string) => s === "pending" || s === "needs_current_authentication";
    if (waiting(e.reports.received)) await send("received", e.firstReceiptAt);
    const retaining = e.legalRetention !== undefined && e.legalRetention.endedAt === undefined;
    if (retaining && waiting(e.reports.retained)) {
      await send("retained", e.legalRetention.recordedAt, {
        retainedUntil: e.legalRetention.until,
        retentionBasis: e.legalRetention.basis,
        retentionScope: e.legalRetention.scope,
      });
    } else if (!retaining && e.completedAt && waiting(e.reports.completed)) {
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
      return false; // stays pending; retried by sendReports
    }
  }
}

