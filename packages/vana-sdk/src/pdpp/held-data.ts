/**
 * PDPP client role: duties for held data (spec-core §7 "Held data after a
 * grant ends" through "Downstream holders").
 *
 * @remarks
 * {@link PdppHeldDataManager} is the client's local record and gate for each
 * grant's held data. It does no network I/O; {@link PdppLifecycleAgent} in
 * `lifecycle.ts` drives it against the AS. It implements:
 * - Item 19: surviving-use terms after a grant ends (approved purpose only; no
 *   ordinary surviving use for a grant that carries a processing permission).
 * - Item 20: a positive assessment is held before first use. Only a token
 *   response that returns the grant and a lifecycle answer with `held_data`
 *   `permitted` count; record delivery, introspection and read errors never do.
 * - Item 21: the reconciliation schedule (first attempt one interval after
 *   first acquisition, retries within the retry interval of each attempt's
 *   start even while it is unanswered, `Retry-After` and transport-failure
 *   widening capped at the reconciliation interval, a query before further use
 *   after a sign that the grant may have ended or after an attempt fell due).
 *   A failed query never stops permitted use.
 * - Item 22: erasure. Use stops at once on receipt (which meets both "as soon
 *   as practicable" and the late-receipt rule), covered data is deleted from
 *   every registered store, derivative and downstream holder, the first
 *   receipt is recorded once and never restarts a deadline, and the
 *   instruction is terminal.
 * - Item 23: overdue disposal is completed before further use and a missed
 *   deadline is recorded.
 * - Item 24: parties acting for the client accept the flow-down terms and get
 *   every erasure relayed with absolute deadlines; informed parties and
 *   confirmations are recorded.
 * - Item 26: the instruction record (receipt, stop-use, completion, exception,
 *   parties informed) holds identifiers, never deleted data.
 *
 * Time: every limit is elapsed time on the injected clock, which must count
 * suspension (wall-clock milliseconds do). A clock that moves backwards never
 * moves a deadline later: the manager keeps the latest time it has seen
 * (spec-core #held-data-limits, case C5a).
 *
 * @category PDPP
 */

import type { PdppHttpError } from "./errors";
import type { PdppIssuedGrant } from "./authorization";
import type { PdppGrant } from "./types";

/** spec-core #held-data-limits. Elapsed time; a day is 24 hours. */
export const PDPP_RECONCILIATION_INTERVAL_MS = 24 * 3_600_000;
export const PDPP_RETRY_INTERVAL_MS = 3_600_000;
export const PDPP_STOP_USE_BOUND_MS = 48 * 3_600_000;
export const PDPP_DELETION_BOUND_MS = 30 * 24 * 3_600_000;
/** First retry delay before exponential growth; capped at the retry interval. */
const BASE_RETRY_DELAY_MS = 60_000;

/** A grant is identified by its authenticated issuer and `grant_id` together (Client item 28). */
export interface PdppGrantRef {
  issuer: string;
  grantId: string;
}

export const grantRefOf = (issued: PdppIssuedGrant): PdppGrantRef => ({
  issuer: issued.issuer,
  grantId: issued.grant.grant_id,
});

const keyOf = (ref: PdppGrantRef) => JSON.stringify([ref.issuer, ref.grantId]);

/** A place the client keeps held data, e.g. {@link InMemoryPdppSyncCopy}. */
export interface PdppHeldDataStore {
  holdsData(ref: PdppGrantRef): boolean;
  /** Delete every copy of the grant's held data in this store. */
  erase(ref: PdppGrantRef): void | Promise<void>;
  /** Apply the grant's retention ceiling; called before use (Client items 6, 23). */
  applyRetention?(
    ref: PdppGrantRef,
    retention: NonNullable<PdppGrant["retention"]>,
  ): unknown;
}

/**
 * A derivative the app keeps: an embedding, index, cache, label, summary.
 * `erase` must delete it, or regenerate it without the covered grant's data
 * and remove the old one (spec-core #erasure "Scope").
 */
export interface PdppDerivative {
  id: string;
  /** Every grant whose held data contributed (lineage). */
  inputs: PdppGrantRef[];
  /** Earliest first acquisition among its inputs; defaults to the earliest grant acquisition. */
  acquiredAt?: number;
  erase(
    covered: PdppGrantRef,
    reason: "erasure" | "retention",
  ): "deleted" | "regenerated" | Promise<"deleted" | "regenerated">;
}

/** Flow-down a party acting for the client accepts (spec-core #downstream-holders). */
export interface PdppFlowDownTerms {
  /** The grant's purpose and retention bind the party. */
  purposeAndRetention: boolean;
  /** The held-data duties (reconciliation, erasure, deadlines) bind the party. */
  heldDataDuties: boolean;
  /** The AI training restriction binds the party. */
  trainingRestriction: boolean;
  /** The party may reuse the data for itself (training, product improvement…). Must be false. */
  independentReuse: boolean;
}

/** An erasure relay. Deadlines are the client's, as absolute times; a relay never starts a new period. */
export interface PdppErasureRelayNotice {
  issuer: string;
  grantId: string;
  instructionId: string;
  stopUseAsSoonAsPracticable: true;
  stopUseBy: string;
  deleteBy: string;
}

/** A party acting for the client (Client item 24). The app implements this for each such party. */
export interface PdppDownstreamHolder {
  id: string;
  terms: PdppFlowDownTerms;
  /** Whether the party still holds data of the grant; when omitted it is assumed to. */
  holdsData?(ref: PdppGrantRef): boolean;
  relayErasure(
    notice: PdppErasureRelayNotice,
  ): Promise<{ confirmedAt?: string } | void> | { confirmedAt?: string } | void;
}

/** Raised when a receiving party is, for this operation, an independent recipient. */
export class PdppIndependentRecipientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdppIndependentRecipientError";
  }
}

export type PdppReadState = "active" | "window_closed" | "expired" | "revoked";

/** A lifecycle answer (spec-core #grant-lifecycle "Response"). */
export interface PdppLifecycleAnswer {
  grant_id: string;
  assessed_at: string;
  read_state: PdppReadState;
  ended_at?: string;
  held_data: "permitted" | "erase";
  erasure?: {
    instruction_id: string;
    accepted_at: string;
    effective_at: string;
    stop_use_by: string;
  };
}

export type PdppUseRefusal =
  | "unknown_grant"
  | "clock_uncertain"
  | "erased"
  | "no_positive_assessment"
  | "query_required"
  | "no_surviving_use"
  | "purpose_not_approved";

export type PdppUseDecision =
  | { allowed: true }
  | { allowed: false; reason: PdppUseRefusal };

type ReportState =
  | "not_needed"
  | "pending"
  | "sent"
  | "needs_current_authentication";

/** Legal-retention end: an RFC 3339 date-time, `event:<text>`, or `unknown` (spec-core #grant-lifecycle). */
export type PdppRetainedUntil = string;

/** The client's record of one erasure instruction (Client items 22, 26). Identifiers only. */
export interface PdppErasureRecord {
  /** The AS instruction id, or a local id until the AS returns one. */
  instructionId: string;
  asInstructionId?: string;
  origin: "lifecycle" | "client_choice";
  acceptedAt?: string;
  effectiveAt: string;
  /** `stop_use_by` as the AS stated it, if any. */
  asStopUseBy?: string;
  /** First authenticated receipt, on the client clock. Recorded once. */
  firstReceiptAt: string;
  /** Receipt came after the stop-use deadline: use stopped at once. */
  learnedAfterStopUseBound: boolean;
  /** The binding stop-use deadline, relayed to downstream holders. */
  stopUseBy: string;
  /** When this client stopped use. */
  stopUseAt: string;
  /** First receipt plus the deletion bound. Never restarted. */
  deleteBy: string;
  completedAt?: string;
  missedDeadline: boolean;
  /** What is not yet deleted: store indexes, derivative ids, holder ids. */
  pending: string[];
  legalRetention?: {
    scope: string;
    basis: string;
    until: PdppRetainedUntil;
    recordedAt: string;
    /** The obligation ended and the retained data was deleted. */
    endedAt?: string;
  };
  partiesInformed: Array<{ id: string; informedAt: string; confirmedAt?: string }>;
  reports: {
    /** Client choice conveyed to the AS (`pdpp_disposition=delete`, `reported_at`). */
    conveyance: ReportState;
    received: ReportState;
    completed: ReportState;
    retained: ReportState;
  };
}

interface GrantState {
  ref: PdppGrantRef;
  grant?: PdppGrant;
  positive?: { source: "token_response" | "lifecycle"; at: number; assessedAt?: string };
  lastAssessedAt?: string;
  readState?: PdppReadState;
  endedAt?: string;
  firstAcquiredAt?: number;
  attemptSeq: number;
  lastAttempt?: { id: number; startedAt: number };
  lastSuccessAt?: number;
  failures: number;
  transportStreakStart?: number;
  nextAttemptAt?: number;
  queryRequired: boolean;
  erasure?: PdppErasureRecord;
  abort: AbortController;
  holders: Map<string, PdppDownstreamHolder>;
  legalHold?: { scope: string; basis: string; until: PdppRetainedUntil; recordedAt: string };
  assessments: Array<{ at: string; source: string; held_data?: string }>;
}

export interface PdppHeldDataManagerOptions {
  /** Wall-clock milliseconds that count suspension. Defaults to `Date.now`. */
  now?: () => number;
  /** Jitter source in [0, 1). Defaults to `Math.random`. */
  random?: () => number;
}

export class PdppHeldDataManager {
  private readonly grants = new Map<string, GrantState>();
  private readonly stores: PdppHeldDataStore[] = [];
  private readonly derivatives = new Map<string, PdppDerivative>();
  private readonly clock: () => number;
  private readonly random: () => number;
  private floor = Number.NEGATIVE_INFINITY;
  private clockUncertain = false;
  /** Clock discontinuities seen (case C5a). */
  clockDiscontinuities = 0;

  constructor(options: PdppHeldDataManagerOptions = {}) {
    this.clock = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  /** Conservative current time: never earlier than any time already seen. */
  now(): number {
    const t = this.clock();
    if (t < this.floor) {
      this.clockDiscontinuities += 1;
      return this.floor;
    }
    this.floor = t;
    return t;
  }

  /** The client cannot establish elapsed time (e.g. restored state): refuse use until {@link establishClock}. */
  markClockUncertain(): void {
    this.clockUncertain = true;
  }

  /** Elapsed time is established again; `notBefore` raises the floor (never lowers it). */
  establishClock(notBefore?: number): void {
    if (notBefore !== undefined && notBefore > this.floor) this.floor = notBefore;
    this.clockUncertain = false;
  }

  addStore(store: PdppHeldDataStore): void {
    this.stores.push(store);
  }

  registerDerivative(derivative: PdppDerivative): void {
    for (const input of derivative.inputs) {
      if (this.state(input)?.erasure) {
        throw new Error(
          `grant ${input.grantId} has an erasure instruction; no derivative of its data may be made`,
        );
      }
      this.ensure(input);
    }
    this.derivatives.set(derivative.id, derivative);
  }

  /**
   * Record a successful token response that returned the grant (spec-core
   * #reconciliation): a positive assessment and a successful query. It never
   * cancels a known erasure instruction.
   */
  recordTokenResponse(issued: PdppIssuedGrant): void {
    const s = this.ensure(grantRefOf(issued));
    s.grant = issued.grant;
    const now = this.now();
    s.assessments.push({ at: iso(now), source: "token_response" });
    if (s.erasure) return;
    s.positive = { source: "token_response", at: now };
    this.succeeded(s, now);
  }

  /** Data of the grant was acquired (sync, list or single-record read). Never restarts the interval. */
  recordAcquisition(ref: PdppGrantRef, grant?: PdppGrant): void {
    const s = this.ensure(ref);
    if (grant && !s.grant) s.grant = grant;
    const now = this.now();
    s.firstAcquiredAt ??= now;
    s.nextAttemptAt ??= now + PDPP_RECONCILIATION_INTERVAL_MS;
  }

  /** A read or refresh failed. When it shows the grant may have ended, a query is due before further use. */
  recordGrantSignal(ref: PdppGrantRef, error: PdppHttpError): void {
    if (error.grantMayHaveEnded) this.ensure(ref).queryRequired = true;
  }

  /** Whether this client or a party acting for it holds data of the grant. */
  holdsData(ref: PdppGrantRef): boolean {
    const s = this.state(ref);
    if (this.stores.some((store) => store.holdsData(ref))) return true;
    for (const d of this.derivatives.values()) {
      if (d.inputs.some((i) => keyOf(i) === keyOf(ref))) return true;
    }
    for (const h of s?.holders.values() ?? []) {
      if (h.holdsData ? h.holdsData(ref) : true) return true;
    }
    return false;
  }

  /** Grants whose lifecycle query is due now (Client item 21). */
  dueGrants(): PdppGrantRef[] {
    const now = this.now();
    const due: PdppGrantRef[] = [];
    for (const s of this.grants.values()) {
      if (!this.holdsData(s.ref)) continue;
      if (s.queryRequired || (s.nextAttemptAt !== undefined && s.nextAttemptAt <= now)) {
        due.push(s.ref);
      }
    }
    return due;
  }

  /** When the next attempt for the grant is due, if any. */
  nextAttemptAt(ref: PdppGrantRef): number | undefined {
    return this.state(ref)?.nextAttemptAt;
  }

  /**
   * Start an attempt. Until it succeeds, the next attempt is scheduled within
   * the retry interval of this start, whether or not this one is answered.
   */
  beginAttempt(ref: PdppGrantRef): number {
    const s = this.ensure(ref);
    const now = this.now();
    s.attemptSeq += 1;
    s.lastAttempt = { id: s.attemptSeq, startedAt: now };
    s.queryRequired = false;
    s.nextAttemptAt = now + this.retryDelay(s, s.failures + 1, now);
    return s.attemptSeq;
  }

  /**
   * Apply a lifecycle answer. An answer whose `assessed_at` is not later than
   * one already applied is a replay or cached copy, not a new assessment; it
   * counts as a failed attempt.
   */
  recordAnswer(ref: PdppGrantRef, attemptId: number, answer: PdppLifecycleAnswer): Promise<void> {
    const s = this.ensure(ref);
    if (answer.grant_id !== ref.grantId) {
      throw new Error(`lifecycle answer names ${answer.grant_id}, not ${ref.grantId}`);
    }
    if (s.lastAssessedAt !== undefined && !(Date.parse(answer.assessed_at) > Date.parse(s.lastAssessedAt))) {
      this.recordFailure(ref, attemptId, { kind: "http" });
      return Promise.resolve();
    }
    const now = this.now();
    s.lastAssessedAt = answer.assessed_at;
    s.assessments.push({ at: iso(now), source: "lifecycle", held_data: answer.held_data });
    s.readState = answer.read_state;
    if (answer.ended_at !== undefined) s.endedAt = answer.ended_at;
    const startedAt = s.lastAttempt?.id === attemptId ? s.lastAttempt.startedAt : now;
    this.succeeded(s, startedAt);
    if (answer.held_data === "erase" && answer.erasure) {
      return this.receiveErasure(s, {
        origin: "lifecycle",
        instructionId: answer.erasure.instruction_id,
        acceptedAt: answer.erasure.accepted_at,
        effectiveAt: answer.erasure.effective_at,
        asStopUseBy: answer.erasure.stop_use_by,
      });
    }
    // Terminal: a later `permitted` never cancels a known instruction.
    if (answer.held_data === "permitted" && !s.erasure) {
      s.positive = { source: "lifecycle", at: now, assessedAt: answer.assessed_at };
    }
    return Promise.resolve();
  }

  /**
   * A failed attempt: transport error, HTTP 401/429/5xx, a per-grant error, or
   * an answer that is not a new assessment.
   */
  recordFailure(
    ref: PdppGrantRef,
    attemptId: number,
    failure: { kind: "transport" | "http" | "per_grant"; retryAfterMs?: number },
  ): void {
    const s = this.ensure(ref);
    const now = this.now();
    const start = s.lastAttempt?.id === attemptId ? s.lastAttempt.startedAt : now;
    if (failure.kind === "transport") s.transportStreakStart ??= start;
    else s.transportStreakStart = undefined;
    // A failure of an older attempt never reschedules the newest one.
    if (s.lastAttempt && s.lastAttempt.id !== attemptId) return;
    s.failures += 1;
    let delay = this.retryDelay(s, s.failures, now);
    if (failure.retryAfterMs !== undefined) {
      // The client MAY wait `Retry-After` instead; the reconciliation interval takes precedence.
      delay = Math.min(Math.max(delay, failure.retryAfterMs), PDPP_RECONCILIATION_INTERVAL_MS);
    }
    s.nextAttemptAt = start + delay;
  }

  /**
   * The owner chose `delete` in this client: an erasure instruction effective
   * at once, and the client's first authenticated receipt (spec-core
   * #client-disconnect). Conveying it to the AS is reported as pending.
   */
  ownerChoseDelete(ref: PdppGrantRef, choseAt: number = this.now()): Promise<void> {
    const s = this.ensure(ref);
    return this.receiveErasure(s, {
      origin: "client_choice",
      instructionId: `local:${ref.grantId}:${choseAt}`,
      effectiveAt: iso(choseAt),
      receivedAt: choseAt,
    });
  }

  /** The AS returned the instruction id for a client-conveyed `delete`. Never moves a clock. */
  linkInstruction(ref: PdppGrantRef, asInstructionId: string): void {
    const e = this.state(ref)?.erasure;
    if (e && e.asInstructionId === undefined) {
      e.asInstructionId = asInstructionId;
      e.instructionId = asInstructionId;
    }
  }

  /** The grant ended locally, e.g. after this client revoked it with `keep`. */
  recordEnding(ref: PdppGrantRef, readState: "revoked" | "expired", endedAt: number = this.now()): void {
    const s = this.ensure(ref);
    if (s.readState === "revoked" || s.readState === "expired") return;
    s.readState = readState;
    s.endedAt = iso(endedAt);
  }

  /**
   * Decide whether held data of the grant may be used now (Client items 19,
   * 20, 21, 22). `purpose` is the purpose code of the intended use; any purpose
   * other than the grant's approved one needs a new grant.
   */
  checkUse(ref: PdppGrantRef, options: { purpose?: string } = {}): PdppUseDecision {
    const s = this.state(ref);
    if (!s) return { allowed: false, reason: "unknown_grant" };
    if (this.clockUncertain) return { allowed: false, reason: "clock_uncertain" };
    if (s.erasure) return { allowed: false, reason: "erased" };
    if (!s.positive) return { allowed: false, reason: "no_positive_assessment" };
    const now = this.now();
    if (s.queryRequired || (s.nextAttemptAt !== undefined && s.nextAttemptAt <= now)) {
      return { allowed: false, reason: "query_required" };
    }
    if (this.ended(s, now) && (s.grant?.processing_permissions?.length ?? 0) > 0) {
      return { allowed: false, reason: "no_surviving_use" };
    }
    if (options.purpose !== undefined && s.grant && options.purpose !== s.grant.purpose_code) {
      return { allowed: false, reason: "purpose_not_approved" };
    }
    return { allowed: true };
  }

  /** Whether the grant has ended (revoked or expired), from AS answers or `expires_at`. */
  hasEnded(ref: PdppGrantRef): boolean {
    const s = this.state(ref);
    return s ? this.ended(s, this.now()) : false;
  }

  /** Aborted when use must stop: pass it to queued and in-flight work (case C2). */
  useSignal(ref: PdppGrantRef): AbortSignal {
    return this.ensure(ref).abort.signal;
  }

  /** The grant as delivered, if known. */
  grantOf(ref: PdppGrantRef): PdppGrant | undefined {
    return this.state(ref)?.grant;
  }

  /** The erasure record, if an instruction applies (Client item 26). */
  erasureRecord(ref: PdppGrantRef): Readonly<PdppErasureRecord> | undefined {
    return this.state(ref)?.erasure;
  }

  /** Assessment history: token responses and lifecycle answers, with the client receipt time. */
  assessments(ref: PdppGrantRef): ReadonlyArray<{ at: string; source: string; held_data?: string }> {
    return this.state(ref)?.assessments ?? [];
  }

  /** Every known grant. */
  knownGrants(): PdppGrantRef[] {
    return [...this.grants.values()].map((s) => s.ref);
  }

  /**
   * Register a party acting for the client for this grant (Client item 24).
   * Throws {@link PdppIndependentRecipientError} unless the party accepts every
   * flow-down term and makes no independent reuse.
   */
  registerDownstreamHolder(ref: PdppGrantRef, holder: PdppDownstreamHolder): void {
    const failure = flowDownFailure(holder.terms);
    if (failure) {
      throw new PdppIndependentRecipientError(
        `${holder.id} does not act for the client (${failure}); it would be an independent recipient`,
      );
    }
    const s = this.ensure(ref);
    if (s.erasure) {
      throw new Error(`grant ${ref.grantId} has an erasure instruction; no party may receive its data`);
    }
    s.holders.set(holder.id, holder);
  }

  /** The registered party acting for the client for this grant, if any. */
  downstreamHolder(ref: PdppGrantRef, id: string): PdppDownstreamHolder | undefined {
    return this.state(ref)?.holders.get(id);
  }

  /**
   * Record a legal-retention exception (spec-core #erasure "Legal retention").
   * `until` is an RFC 3339 date-time, `event:<text>`, or `unknown`; never an
   * invented date. Declare it before an instruction arrives (the retained data
   * lives outside the registered stores, which erasure empties), so the agent
   * reports `retained` rather than `completed`. Declared after completion was
   * reported, it is recorded and reported as a correction.
   */
  recordLegalRetention(
    ref: PdppGrantRef,
    retention: { scope: string; basis: string; until: PdppRetainedUntil },
  ): void {
    if (!isRetainedUntil(retention.until)) {
      throw new TypeError("retained_until must be an RFC 3339 date-time, event:<text>, or unknown");
    }
    const hold = { ...retention, recordedAt: iso(this.now()) };
    const s = this.ensure(ref);
    s.legalHold = hold;
    if (s.erasure) {
      s.erasure.legalRetention = hold;
      s.erasure.reports.retained = "pending";
    }
  }

  /** The legal obligation ended and the retained data is deleted: completion is reportable. */
  recordLegalRetentionEnded(ref: PdppGrantRef): void {
    const e = this.state(ref)?.erasure;
    if (!e?.legalRetention || e.legalRetention.endedAt !== undefined) return;
    e.legalRetention.endedAt = iso(this.now());
    if (e.completedAt) e.reports.completed = "pending";
  }

  /** Mark a report outcome; used by the lifecycle agent. */
  setReportState(
    ref: PdppGrantRef,
    report: keyof PdppErasureRecord["reports"],
    state: ReportState,
  ): void {
    const e = this.state(ref)?.erasure;
    if (e) e.reports[report] = state;
  }

  /**
   * Complete due disposal before further use (Client item 23): retry any
   * unfinished erasure and apply retention ceilings in every store and to
   * derivatives. Returns whether erasure, if any, is complete.
   */
  async disposeDue(ref: PdppGrantRef): Promise<{ erasureComplete: boolean }> {
    const s = this.ensure(ref);
    if (s.erasure) {
      if (s.erasure.completedAt === undefined) await this.dispose(s);
      return { erasureComplete: s.erasure.completedAt !== undefined };
    }
    const retention = s.grant?.retention;
    if (retention) {
      for (const store of this.stores) await store.applyRetention?.(ref, retention);
      const ceilingMs = retentionCeilingMs(retention.max_duration);
      const now = this.now();
      for (const d of [...this.derivatives.values()]) {
        if (!d.inputs.some((i) => keyOf(i) === keyOf(ref))) continue;
        const acquiredAt = d.acquiredAt ?? s.firstAcquiredAt ?? now;
        if (now - acquiredAt >= ceilingMs) {
          await d.erase(ref, "retention");
          this.derivatives.delete(d.id);
        }
      }
    }
    return { erasureComplete: true };
  }

  // ── internals ──────────────────────────────────────────────────────────

  private state(ref: PdppGrantRef): GrantState | undefined {
    return this.grants.get(keyOf(ref));
  }

  private ensure(ref: PdppGrantRef): GrantState {
    let s = this.grants.get(keyOf(ref));
    if (!s) {
      s = {
        ref: { issuer: ref.issuer, grantId: ref.grantId },
        attemptSeq: 0,
        failures: 0,
        queryRequired: false,
        abort: new AbortController(),
        holders: new Map(),
        assessments: [],
      };
      this.grants.set(keyOf(ref), s);
    }
    return s;
  }

  private ended(s: GrantState, now: number): boolean {
    if (s.readState === "revoked" || s.readState === "expired") return true;
    const expiresAt = s.grant?.expires_at;
    return expiresAt !== undefined && now >= Date.parse(expiresAt);
  }

  private succeeded(s: GrantState, startedAt: number): void {
    s.lastSuccessAt = startedAt;
    s.failures = 0;
    s.transportStreakStart = undefined;
    s.queryRequired = false;
    s.nextAttemptAt = startedAt + PDPP_RECONCILIATION_INTERVAL_MS;
  }

  /** Exponential backoff with jitter, capped at the retry interval, or the reconciliation interval while widened. */
  private retryDelay(s: GrantState, failureCount: number, now: number): number {
    const widened =
      s.transportStreakStart !== undefined &&
      now - s.transportStreakStart >= PDPP_RECONCILIATION_INTERVAL_MS;
    const cap = widened ? PDPP_RECONCILIATION_INTERVAL_MS : PDPP_RETRY_INTERVAL_MS;
    const exp = Math.min(cap, BASE_RETRY_DELAY_MS * 2 ** Math.min(30, failureCount - 1));
    // Jitter only shortens the delay, so the cap always holds.
    return Math.max(1_000, Math.round(exp * (0.5 + 0.5 * this.random())));
  }

  private receiveErasure(
    s: GrantState,
    input: {
      origin: "lifecycle" | "client_choice";
      instructionId: string;
      acceptedAt?: string;
      effectiveAt: string;
      asStopUseBy?: string;
      receivedAt?: number;
    },
  ): Promise<void> {
    if (s.erasure) {
      // Terminal, recorded once: redelivery only links the AS id.
      if (input.origin === "lifecycle") this.linkInstruction(s.ref, input.instructionId);
      return s.erasure.completedAt === undefined ? this.dispose(s) : Promise.resolve();
    }
    const receivedAt = input.receivedAt ?? this.now();
    const effective = Date.parse(input.effectiveAt);
    const stopUseDeadline = Math.min(
      effective + PDPP_STOP_USE_BOUND_MS,
      input.asStopUseBy !== undefined ? Date.parse(input.asStopUseBy) : Number.POSITIVE_INFINITY,
    );
    const late = receivedAt > stopUseDeadline;
    const deleteBy = receivedAt + PDPP_DELETION_BOUND_MS;
    s.erasure = {
      instructionId: input.instructionId,
      ...(input.origin === "lifecycle" && { asInstructionId: input.instructionId }),
      origin: input.origin,
      ...(input.acceptedAt !== undefined && { acceptedAt: input.acceptedAt }),
      effectiveAt: input.effectiveAt,
      ...(input.asStopUseBy !== undefined && { asStopUseBy: input.asStopUseBy }),
      firstReceiptAt: iso(receivedAt),
      learnedAfterStopUseBound: late,
      stopUseBy: iso(late ? receivedAt : stopUseDeadline),
      // Use stops at once on receipt: it is the earliest practicable point.
      stopUseAt: iso(receivedAt),
      deleteBy: iso(deleteBy),
      missedDeadline: false,
      pending: [],
      partiesInformed: [],
      ...(s.legalHold && { legalRetention: s.legalHold }),
      reports: {
        conveyance: input.origin === "client_choice" ? "pending" : "not_needed",
        // A conveyed choice with `reported_at` reports the receipt itself.
        received: input.origin === "lifecycle" ? "pending" : "not_needed",
        completed: "not_needed",
        retained: s.legalHold ? "pending" : "not_needed",
      },
    };
    s.positive = undefined;
    s.abort.abort(new Error(`erasure instruction for grant ${s.ref.grantId}`));
    return this.dispose(s);
  }

  /** Delete covered data everywhere; record what remains pending. */
  private async dispose(s: GrantState): Promise<void> {
    const e = s.erasure!;
    const pending: string[] = [];
    for (const [index, store] of this.stores.entries()) {
      try {
        await store.erase(s.ref);
      } catch {
        pending.push(`store:${index}`);
      }
    }
    for (const d of [...this.derivatives.values()]) {
      if (!d.inputs.some((i) => keyOf(i) === keyOf(s.ref))) continue;
      try {
        const outcome = await d.erase(s.ref, "erasure");
        if (outcome === "regenerated") {
          d.inputs = d.inputs.filter((i) => keyOf(i) !== keyOf(s.ref));
          if (d.inputs.length === 0) this.derivatives.delete(d.id);
        } else {
          this.derivatives.delete(d.id);
        }
      } catch {
        pending.push(`derivative:${d.id}`);
      }
    }
    for (const holder of s.holders.values()) {
      if (e.partiesInformed.some((p) => p.id === holder.id)) continue;
      try {
        const confirmation = await holder.relayErasure({
          issuer: s.ref.issuer,
          grantId: s.ref.grantId,
          instructionId: e.instructionId,
          stopUseAsSoonAsPracticable: true,
          stopUseBy: e.stopUseBy,
          deleteBy: e.deleteBy,
        });
        e.partiesInformed.push({
          id: holder.id,
          informedAt: iso(this.now()),
          ...(confirmation?.confirmedAt !== undefined && { confirmedAt: confirmation.confirmedAt }),
        });
      } catch {
        pending.push(`holder:${holder.id}`);
      }
    }
    e.pending = pending;
    const now = this.now();
    if (now > Date.parse(e.deleteBy)) e.missedDeadline = true;
    if (pending.length === 0 && e.completedAt === undefined) {
      e.completedAt = iso(now);
      e.reports.completed = "pending";
    }
  }
}

function flowDownFailure(terms: PdppFlowDownTerms | undefined): string | undefined {
  if (!terms) return "no flow-down terms";
  if (terms.independentReuse !== false) return "it may reuse the data independently";
  if (terms.purposeAndRetention !== true) return "purpose and retention do not bind it";
  if (terms.heldDataDuties !== true) return "the held-data duties do not bind it";
  if (terms.trainingRestriction !== true) return "the AI training restriction does not bind it";
  return undefined;
}

/** Retention ceiling in ms; an invalid `max_duration` fails closed as already reached (spec-core #grant-retention). */
export function retentionCeilingMs(maxDuration: string): number {
  const match = /^P([1-9]\d*)D$/.exec(maxDuration);
  return match ? Number(match[1]) * 86_400_000 : 0;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}[tT]\d{2}:\d{2}:\d{2}(\.\d+)?([zZ]|[+-]\d{2}:\d{2})$/;

export function isRetainedUntil(value: string): boolean {
  if (value === "unknown") return true;
  if (value.startsWith("event:")) return value.slice(6).trim().length > 0;
  return RFC3339.test(value) && !Number.isNaN(Date.parse(value));
}

const iso = (ms: number) => new Date(ms).toISOString();
