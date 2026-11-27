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
 *   A failed query never stops permitted use, with one exception: when no
 *   credential can query at all (`recovery_required`), use stops until a
 *   query succeeds, because no erasure could ever be learned (review R2-5).
 *   The app shows `grantsNeedingRecovery()` to the owner.
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
 * State: everything above lives in a {@link PdppHeldDataStateStore} the app
 * implements. The manager saves an erasure record before it deletes anything,
 * and loads it back at start ({@link PdppHeldDataManager.open}), so a restart
 * never restarts a deadline and an owner's offline `delete` survives (items
 * 22, 23, 26, case C5a).
 *
 * Time: every limit is elapsed time on the injected clock, which must count
 * suspension (wall-clock milliseconds do). A clock that moves backwards never
 * moves a deadline later: the manager keeps the latest time it has seen, saves
 * it as a high-water mark, and treats a clock below it at load as uncertain
 * (spec-core #held-data-limits, case C5a).
 *
 * @category PDPP
 */

import type { PdppHttpError } from "./errors";
import { PdppTimeoutError, withTimeout } from "./endpoints";
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

/**
 * A place the client keeps held data, e.g. {@link InMemoryPdppSyncCopy}.
 * `id` is stable across restarts: the manager saves the ids of registered
 * stores, and until a saved store is registered again its deletion stays
 * pending (review R2-1).
 */
export interface PdppHeldDataStore {
  readonly id: string;
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
  /** `unknown` when the AS sent a value this client does not recognize (an erasure still applies). */
  read_state: PdppReadState | "unknown";
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
  | "recovery_required"
  | "invalid_retention"
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
  partiesInformed: Array<{
    id: string;
    informedAt: string;
    confirmedAt?: string;
  }>;
  reports: {
    /** Client choice conveyed to the AS (`pdpp_disposition=delete`, `reported_at`). */
    conveyance: ReportState;
    received: ReportState;
    completed: ReportState;
    retained: ReportState;
  };
}

/** The serializable state of one grant (review F4). Identifiers and times only; never held data. */
export interface PdppPersistedGrantState {
  ref: PdppGrantRef;
  grant?: PdppGrant;
  positive?: {
    source: "token_response" | "lifecycle";
    at: number;
    assessedAt?: string;
  };
  lastAssessedAt?: string;
  readState?: PdppReadState;
  endedAt?: string;
  firstAcquiredAt?: number;
  lastSuccessAt?: number;
  failures: number;
  transportStreakStart?: number;
  nextAttemptAt?: number;
  queryRequired: boolean;
  erasure?: PdppErasureRecord;
  legalHold?: {
    scope: string;
    basis: string;
    until: PdppRetainedUntil;
    recordedAt: string;
  };
  assessments: Array<{ at: string; source: string; held_data?: string }>;
  /** Parties acting for the client, with the flow-down terms frozen at registration. */
  holderTerms: Array<{ id: string; terms: PdppFlowDownTerms }>;
  /** No credential can query or write for this grant: the owner must approve lifecycle recovery. */
  needsRecovery?: boolean;
  /** A `keep` disconnect whose revocation has not reached the AS yet (review NEW-2). */
  pendingRevocation?: { disposition: "keep"; choseAt: number };
}

/** Everything the manager must find again after a restart (review F4). */
export interface PdppHeldDataSnapshot {
  format: "pdpp-held-data/2";
  /** The latest time the manager has seen; a wall clock below it on load makes the clock uncertain. */
  clockHighWater: number;
  grants: PdppPersistedGrantState[];
  derivatives: Array<{
    id: string;
    inputs: PdppGrantRef[];
    acquiredAt?: number;
  }>;
  /** Ids of every store registered and not retired (review R2-1). */
  storeIds: string[];
}

/**
 * One append-only log entry: a disclosure-gate decision, or a version of a
 * required-by-law disclosure record (the last version per `id` is current).
 */
export type PdppStateLogEntry =
  | { kind: "disclosure"; entry: unknown }
  | { kind: "legal_disclosure"; id: string; record: unknown };

/**
 * Durable storage the app implements (review F4, R2-3).
 *
 * Contract:
 * - `save` replaces the snapshot. The snapshot holds per-grant state and store,
 *   holder and derivative identities only, so its size grows with the number
 *   of grants, not with use. It is written after every change and before
 *   the manager acts on an erasure instruction, an owner's `delete` or a legal
 *   hold. It must be durable when its promise resolves.
 * - `appendLog` adds one entry to an append-only log, durable when it
 *   resolves; it is written before any data leaves. Each call writes one
 *   entry, never the whole log. `readLog` returns the entries in order; the
 *   manager reads it only on request, not at load.
 * - The store must never return a snapshot older than the last one saved,
 *   or drop log entries (restoring an old copy cannot be detected).
 */
export interface PdppHeldDataStateStore {
  load():
    | PdppHeldDataSnapshot
    | undefined
    | Promise<PdppHeldDataSnapshot | undefined>;
  save(snapshot: PdppHeldDataSnapshot): void | Promise<void>;
  appendLog(entry: PdppStateLogEntry): void | Promise<void>;
  readLog(): PdppStateLogEntry[] | Promise<PdppStateLogEntry[]>;
}

/** Reference state store. Not durable: for tests and processes that never restart. */
export class InMemoryPdppHeldDataStateStore implements PdppHeldDataStateStore {
  private snapshot: string | undefined;
  private readonly log: string[] = [];
  /** Number of completed saves, and bytes written in total (snapshots and log entries). */
  saves = 0;
  bytesWritten = 0;

  load(): PdppHeldDataSnapshot | undefined {
    return this.snapshot === undefined
      ? undefined
      : (JSON.parse(this.snapshot) as PdppHeldDataSnapshot);
  }

  save(snapshot: PdppHeldDataSnapshot): void {
    this.snapshot = JSON.stringify(snapshot);
    this.saves += 1;
    this.bytesWritten += this.snapshot.length;
  }

  appendLog(entry: PdppStateLogEntry): void {
    const line = JSON.stringify(entry);
    this.log.push(line);
    this.bytesWritten += line.length;
  }

  readLog(): PdppStateLogEntry[] {
    return this.log.map((line) => JSON.parse(line) as PdppStateLogEntry);
  }
}

/** Raised when the state store failed to save before an action that needs a durable record. */
export class PdppStatePersistError extends Error {
  constructor(cause: unknown) {
    super(
      "PDPP held-data state could not be saved; the action ran but its record is not durable",
      { cause },
    );
    this.name = "PdppStatePersistError";
  }
}

interface GrantState extends PdppPersistedGrantState {
  abort: AbortController;
  holders: Map<string, PdppDownstreamHolder>;
  attempts: Map<number, number>;
  attemptSeq: number;
  lastAttemptId?: number;
}

interface DerivativeEntry {
  id: string;
  inputs: PdppGrantRef[];
  acquiredAt?: number;
  /** Absent after a restart until the app registers the derivative again. */
  erase?: PdppDerivative["erase"];
}

/**
 * Events for the app (review NEW-1, NEW-4, NEW-6).
 *
 * - `clock_uncertain`: the wall clock is below the saved high-water mark (clock
 *   set back, restored image, VM snapshot), or the app called
 *   `markClockUncertain`. Use of all held data is refused until the app calls
 *   `establishClock(trustedNow)`. Prompt the owner, or fetch a trusted time.
 * - `invalid_retention`: a grant's `retention.max_duration` is not `PnD`. Use of
 *   that grant is refused (`invalid_retention`). Spec-core L1847 requires the
 *   client to treat every covered record's ceiling as already reached, so its
 *   data is disposed at the next disposal pass; this event is the notice.
 * - `erase_timeout`: a store, derivative or holder did not finish an erase or
 *   retention call in time; the erasure stays pending and is retried.
 */
export type PdppHeldDataEvent =
  | { type: "clock_uncertain"; highWater: number; wallClock: number }
  | { type: "invalid_retention"; grant: PdppGrantRef; maxDuration: string }
  | { type: "erase_timeout"; grant: PdppGrantRef; target: string; ms: number };

export interface PdppHeldDataManagerOptions {
  /** Durable state the app implements; see {@link PdppHeldDataStateStore}. */
  state: PdppHeldDataStateStore;
  /** Wall-clock milliseconds that count suspension. Defaults to `Date.now`. */
  now?: () => number;
  /** Jitter source in [0, 1). Defaults to `Math.random`. */
  random?: () => number;
  /**
   * Called whenever a save fails (review R2-4). Use already stopped stays
   * stopped; the manager retries the save on the next change and on every
   * `runDue`. Without this callback a failure is still kept in `lastPersistError`.
   */
  onPersistError?: (error: unknown) => void;
  /**
   * Called for conditions the app should show or act on (review NEW-1, NEW-4,
   * NEW-6). See {@link PdppHeldDataEvent}. The callback never breaks a duty.
   */
  onEvent?: (event: PdppHeldDataEvent) => void;
  /** Timeout for each store, derivative and holder erase or retention call (review NEW-4). Default 30 s. */
  eraseTimeoutMs?: number;
  /** How many recent disclosure decisions to keep in memory (the full log is in the store). Default 1000. */
  recentLogLimit?: number;
}

const waiting = (state: ReportState) =>
  state === "pending" || state === "needs_current_authentication";

export class PdppHeldDataManager {
  private readonly grants = new Map<string, GrantState>();
  private readonly stores = new Map<string, PdppHeldDataStore>();
  /** Every store id registered and not retired, including ones not registered again since a restart. */
  private readonly knownStoreIds = new Set<string>();
  private readonly onPersistError: ((error: unknown) => void) | undefined;
  private readonly recentLogLimit: number;
  private readonly onEvent: ((event: PdppHeldDataEvent) => void) | undefined;
  private readonly eraseTimeoutMs: number;
  private readonly invalidRetentionNoticed = new Set<string>();
  private readonly derivatives = new Map<string, DerivativeEntry>();
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly state: PdppHeldDataStateStore;
  private floor = Number.NEGATIVE_INFINITY;
  private clockUncertain = false;
  private saving: Promise<void> = Promise.resolve();
  private readonly disclosures: unknown[] = [];
  private readonly legalDisclosures = new Map<string, unknown>();
  /** Clock discontinuities seen (case C5a). */
  clockDiscontinuities = 0;
  /** The last background save failure, if any. */
  lastPersistError: unknown;

  /**
   * Prefer {@link PdppHeldDataManager.open}, which loads saved state. A manager
   * built with `new` starts empty.
   */
  constructor(options: PdppHeldDataManagerOptions) {
    this.state = options.state;
    this.onPersistError = options.onPersistError;
    this.recentLogLimit = options.recentLogLimit ?? 1000;
    this.onEvent = options.onEvent;
    this.eraseTimeoutMs = options.eraseTimeoutMs ?? 30_000;
    this.clock = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  /** Create a manager and load its saved state (review F4). */
  static async open(
    options: PdppHeldDataManagerOptions,
  ): Promise<PdppHeldDataManager> {
    const manager = new PdppHeldDataManager(options);
    await manager.load();
    return manager;
  }

  /**
   * Load saved state. A wall clock below the saved high-water mark makes the
   * clock uncertain: use is refused until {@link establishClock} (case C5a).
   * Deadlines, first receipts and acquisition times come back unchanged.
   */
  async load(): Promise<void> {
    const snapshot = await this.state.load();
    if (!snapshot) return;
    if (snapshot.format !== "pdpp-held-data/2")
      throw new Error("unknown PDPP held-data state format");
    const wallClock = this.clock();
    if (wallClock < snapshot.clockHighWater) {
      this.clockUncertain = true;
      this.emit({
        type: "clock_uncertain",
        highWater: snapshot.clockHighWater,
        wallClock,
      });
    }
    this.floor = Math.max(this.floor, snapshot.clockHighWater);
    for (const persisted of snapshot.grants) {
      const s: GrantState = {
        ...persisted,
        abort: new AbortController(),
        holders: new Map(),
        attempts: new Map(),
        attemptSeq: 0,
      };
      if (s.erasure)
        s.abort.abort(
          new Error(`erasure instruction for grant ${s.ref.grantId}`),
        );
      this.grants.set(keyOf(s.ref), s);
    }
    for (const d of snapshot.derivatives) this.derivatives.set(d.id, { ...d });
    for (const id of snapshot.storeIds) this.knownStoreIds.add(id);
  }

  /** The state as saved. */
  snapshot(): PdppHeldDataSnapshot {
    return {
      format: "pdpp-held-data/2",
      clockHighWater:
        this.floor === Number.NEGATIVE_INFINITY ? this.clock() : this.floor,
      grants: [...this.grants.values()].map((s) => ({
        ref: s.ref,
        ...(s.grant && { grant: s.grant }),
        ...(s.positive && { positive: s.positive }),
        ...(s.lastAssessedAt !== undefined && {
          lastAssessedAt: s.lastAssessedAt,
        }),
        ...(s.readState && { readState: s.readState }),
        ...(s.endedAt !== undefined && { endedAt: s.endedAt }),
        ...(s.firstAcquiredAt !== undefined && {
          firstAcquiredAt: s.firstAcquiredAt,
        }),
        ...(s.lastSuccessAt !== undefined && {
          lastSuccessAt: s.lastSuccessAt,
        }),
        failures: s.failures,
        ...(s.transportStreakStart !== undefined && {
          transportStreakStart: s.transportStreakStart,
        }),
        ...(s.nextAttemptAt !== undefined && {
          nextAttemptAt: s.nextAttemptAt,
        }),
        queryRequired: s.queryRequired,
        ...(s.erasure && { erasure: s.erasure }),
        ...(s.legalHold && { legalHold: s.legalHold }),
        assessments: s.assessments,
        holderTerms: s.holderTerms,
        ...(s.needsRecovery && { needsRecovery: true }),
        ...(s.pendingRevocation && { pendingRevocation: s.pendingRevocation }),
      })),
      derivatives: [...this.derivatives.values()].map((d) => ({
        id: d.id,
        inputs: d.inputs,
        ...(d.acquiredAt !== undefined && { acquiredAt: d.acquiredAt }),
      })),
      storeIds: [...this.knownStoreIds],
    };
  }

  /** Save now; resolves when the store has the current state. */
  persist(): Promise<void> {
    const snapshot = this.snapshot();
    const next = this.saving
      .catch(() => undefined)
      .then(() => this.state.save(snapshot));
    this.saving = next;
    return next;
  }

  /** Wait for every pending save. */
  async flush(): Promise<void> {
    await this.saving;
  }

  private persistInBackground(): void {
    this.persist().catch((error: unknown) => {
      this.reportPersistError(error);
    });
  }

  /** Record and surface a failed save (review R2-4). */
  reportPersistError(error: unknown): void {
    this.lastPersistError = error;
    try {
      this.onPersistError?.(error);
    } catch {
      // the app's callback never breaks the duty path
    }
  }

  /** Retry a failed save; called by `runDue`. Resolves true when the state is saved. */
  async retryPersist(): Promise<boolean> {
    if (this.lastPersistError === undefined) return true;
    try {
      await this.persist();
      this.lastPersistError = undefined;
      return true;
    } catch (error) {
      this.reportPersistError(error);
      return false;
    }
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

  /** The client cannot establish elapsed time: refuse use until {@link establishClock}. */
  markClockUncertain(): void {
    this.clockUncertain = true;
    this.emit({
      type: "clock_uncertain",
      highWater: this.floor,
      wallClock: this.clock(),
    });
  }

  /**
   * Elapsed time is established again. Pass a trusted current time as
   * `notBefore` (for example from a time service); it raises the floor and
   * never lowers it. Without it the saved high-water mark is taken as now,
   * which is conservative for deadlines but may understate elapsed time.
   */
  establishClock(notBefore?: number): void {
    if (notBefore !== undefined && notBefore > this.floor)
      this.floor = notBefore;
    this.clockUncertain = false;
    this.persistInBackground();
  }

  /**
   * Register a place held data lives. Deletion state is replayed into it
   * before it is used: every grant with an erasure instruction is erased from
   * it (spec-core #erasure "Backups": a restore replays deletion state).
   */
  async addStore(store: PdppHeldDataStore): Promise<void> {
    if (typeof store.id !== "string" || store.id === "")
      throw new TypeError("a held-data store needs a stable id");
    const existing = this.stores.get(store.id);
    // Registering the same store again is allowed (a retry after a failed save); another store with its id is not.
    if (existing !== undefined && existing !== store)
      throw new Error(`a store with id ${store.id} is already registered`);
    this.stores.set(store.id, store);
    this.knownStoreIds.add(store.id);
    // Review R3-c: deletion state is replayed whether or not the save below succeeds.
    let replayError: unknown;
    try {
      await this.replayDeletionState(store);
    } catch (error) {
      replayError = error;
    }
    // Erasures that waited for this store can complete now (a store that failed stays pending).
    for (const s of this.grants.values()) {
      if (s.erasure && s.erasure.completedAt === undefined)
        await this.dispose(s);
    }
    let saveError: unknown;
    try {
      await this.persist();
    } catch (error) {
      saveError = error;
      this.reportPersistError(error);
    }
    if (replayError !== undefined) throw replayError;
    if (saveError !== undefined) throw new PdppStatePersistError(saveError);
  }

  /**
   * The app destroyed a store and every copy in it (for example it deleted a
   * database file). Its id is forgotten, so erasures no longer wait for it.
   * Never call this for a store that is only closed or not yet opened.
   */
  async retireStore(id: string): Promise<void> {
    this.stores.delete(id);
    this.knownStoreIds.delete(id);
    await this.persist();
    for (const s of this.grants.values()) {
      if (s.erasure && s.erasure.completedAt === undefined)
        await this.dispose(s);
    }
  }

  /** Saved store ids not registered in this process yet. */
  missingStores(): string[] {
    return [...this.knownStoreIds].filter((id) => !this.stores.has(id));
  }

  /** Erase every grant that has an erasure instruction from `store`, e.g. after restoring a backup into it. */
  async replayDeletionState(store: PdppHeldDataStore): Promise<void> {
    for (const s of this.grants.values()) {
      if (s.erasure) await store.erase(s.ref);
    }
  }

  /**
   * Register a derivative (again, after a restart). A derivative of a grant
   * that has an erasure instruction is erased at once.
   */
  async registerDerivative(derivative: PdppDerivative): Promise<void> {
    const previous = this.derivatives.get(derivative.id);
    const inputs = [...(previous?.inputs ?? [])];
    for (const i of derivative.inputs)
      if (!inputs.some((x) => keyOf(x) === keyOf(i))) inputs.push(i);
    const acquiredAt = [previous?.acquiredAt, derivative.acquiredAt]
      .filter((t): t is number => t !== undefined)
      .sort((a, b) => a - b)[0];
    this.derivatives.set(derivative.id, {
      id: derivative.id,
      inputs,
      ...(acquiredAt !== undefined && { acquiredAt }),
      erase: derivative.erase,
    });
    for (const input of inputs) this.ensure(input);
    await this.persist();
    for (const input of inputs) {
      const s = this.state_(input);
      if (s?.erasure) await this.dispose(s);
    }
  }

  /**
   * Record a successful token response that returned the grant (spec-core
   * #reconciliation): a positive assessment and a successful query. It never
   * cancels a known erasure instruction.
   */
  private emit(event: PdppHeldDataEvent): void {
    try {
      this.onEvent?.(event);
    } catch {
      // the app's callback never breaks the duty path
    }
  }

  /** Emit `invalid_retention` once per grant; true when the grant's retention is malformed. */
  private retentionInvalid(s: GrantState): boolean {
    const maxDuration = s.grant?.retention?.max_duration;
    if (maxDuration === undefined || /^P[1-9]\d*D$/.test(maxDuration))
      return false;
    if (!this.invalidRetentionNoticed.has(keyOf(s.ref))) {
      this.invalidRetentionNoticed.add(keyOf(s.ref));
      this.emit({ type: "invalid_retention", grant: s.ref, maxDuration });
    }
    return true;
  }

  /** Bound one callee (review NEW-4); a timeout is reported and rethrown. */
  private async bounded<T>(
    work: () => T | Promise<T>,
    ref: PdppGrantRef,
    target: string,
  ): Promise<T> {
    try {
      return await withTimeout(work(), this.eraseTimeoutMs, target);
    } catch (error) {
      if (error instanceof PdppTimeoutError) {
        this.emit({
          type: "erase_timeout",
          grant: ref,
          target,
          ms: this.eraseTimeoutMs,
        });
      }
      throw error;
    }
  }

  recordTokenResponse(issued: PdppIssuedGrant): void {
    const s = this.ensure(grantRefOf(issued));
    s.grant = issued.grant;
    const now = this.now();
    s.assessments.push({ at: iso(now), source: "token_response" });
    s.needsRecovery = false;
    if (!s.erasure) {
      s.positive = { source: "token_response", at: now };
      this.succeeded(s, now);
    }
    this.persistInBackground();
  }

  /** Data of the grant was acquired (sync, list or single-record read). Never restarts the interval. */
  recordAcquisition(ref: PdppGrantRef, grant?: PdppGrant): void {
    const s = this.ensure(ref);
    if (grant && !s.grant) s.grant = grant;
    const now = this.now();
    const changed =
      s.firstAcquiredAt === undefined || s.nextAttemptAt === undefined;
    s.firstAcquiredAt ??= now;
    s.nextAttemptAt ??= now + PDPP_RECONCILIATION_INTERVAL_MS;
    if (changed) this.persistInBackground();
  }

  /** A read or refresh failed. When it shows the grant may have ended, a query is due before further use. */
  recordGrantSignal(ref: PdppGrantRef, error: PdppHttpError): void {
    if (!error.grantMayHaveEnded) return;
    this.ensure(ref).queryRequired = true;
    this.persistInBackground();
  }

  /** No credential can query or write for the grant: ask the owner for lifecycle recovery. */
  markNeedsRecovery(ref: PdppGrantRef): void {
    this.ensure(ref).needsRecovery = true;
    this.persistInBackground();
  }

  /** Whether this client or a party acting for it holds data of the grant. */
  holdsData(ref: PdppGrantRef): boolean {
    const s = this.state_(ref);
    if ([...this.stores.values()].some((store) => store.holdsData(ref)))
      return true;
    // A saved store not registered again since a restart may hold anything.
    if (this.missingStores().length > 0 && s !== undefined) return true;
    for (const d of this.derivatives.values()) {
      if (d.inputs.some((i) => keyOf(i) === keyOf(ref))) return true;
    }
    for (const { id } of s?.holderTerms ?? []) {
      const holder = s!.holders.get(id);
      if (!holder) return true; // not re-registered since a restart: assume it still holds
      if (holder.holdsData ? holder.holdsData(ref) : true) return true;
    }
    return false;
  }

  /**
   * A `keep` disconnect could not be conveyed: queue the revocation so
   * `runDue` retries it (review NEW-2). Access has not ended yet.
   */
  queueRevocation(ref: PdppGrantRef, choseAt: number): void {
    const s = this.ensure(ref);
    s.pendingRevocation = { disposition: "keep", choseAt };
    s.nextAttemptAt = Math.min(s.nextAttemptAt ?? choseAt, this.now());
    this.persistInBackground();
  }

  /** The queued `keep` revocation, if any. */
  pendingRevocation(
    ref: PdppGrantRef,
  ): { disposition: "keep"; choseAt: number } | undefined {
    return this.state_(ref)?.pendingRevocation;
  }

  /** The queued revocation reached the AS. */
  clearRevocation(ref: PdppGrantRef): void {
    const s = this.state_(ref);
    if (s?.pendingRevocation) {
      s.pendingRevocation = undefined;
      this.persistInBackground();
    }
  }

  /** Work still owed to the AS: a queued revocation, a conveyance, a report, or learning the AS instruction id. */
  hasPendingLifecycleWork(ref: PdppGrantRef): boolean {
    if (this.state_(ref)?.pendingRevocation) return true;
    const e = this.state_(ref)?.erasure;
    if (!e) return false;
    return (
      Object.values(e.reports).some(waiting) || e.asInstructionId === undefined
    );
  }

  /** Grants whose lifecycle query, conveyance or report is due now (Client item 21, review F8). */
  dueGrants(): PdppGrantRef[] {
    const now = this.now();
    const due: PdppGrantRef[] = [];
    for (const s of this.grants.values()) {
      if (!this.holdsData(s.ref) && !this.hasPendingLifecycleWork(s.ref))
        continue;
      if (
        s.queryRequired ||
        (s.nextAttemptAt !== undefined && s.nextAttemptAt <= now)
      )
        due.push(s.ref);
    }
    return due;
  }

  /** When the next attempt for the grant is due, if any. */
  nextAttemptAt(ref: PdppGrantRef): number | undefined {
    return this.state_(ref)?.nextAttemptAt;
  }

  /**
   * Start an attempt. Until it succeeds, the next attempt is scheduled within
   * the retry interval of this start, whether or not this one is answered.
   */
  beginAttempt(ref: PdppGrantRef): number {
    const s = this.ensure(ref);
    const now = this.now();
    s.attemptSeq += 1;
    s.lastAttemptId = s.attemptSeq;
    s.attempts.set(s.attemptSeq, now);
    if (s.attempts.size > 16)
      s.attempts.delete(s.attempts.keys().next().value!);
    s.queryRequired = false;
    s.nextAttemptAt = now + this.retryDelay(s, s.failures + 1, now);
    this.persistInBackground();
    return s.attemptSeq;
  }

  /**
   * Apply a lifecycle answer. An `erase` answer is always applied: a terminal
   * instruction stays true whatever its `assessed_at` (spec-core L1640, L1820;
   * review F2). A `permitted` answer whose `assessed_at` is not later than one
   * already applied is a replay or cached copy, not a new assessment; it
   * counts as a failed attempt.
   */
  async recordAnswer(
    ref: PdppGrantRef,
    attemptId: number,
    answer: PdppLifecycleAnswer,
  ): Promise<void> {
    const s = this.ensure(ref);
    if (answer.grant_id !== ref.grantId) {
      throw new Error(
        `lifecycle answer names ${answer.grant_id}, not ${ref.grantId}`,
      );
    }
    const isNew =
      s.lastAssessedAt === undefined ||
      Date.parse(answer.assessed_at) > Date.parse(s.lastAssessedAt);
    const erase = answer.held_data === "erase" && answer.erasure !== undefined;
    if (!isNew && !erase) {
      this.recordFailure(ref, attemptId, { kind: "http" });
      return;
    }
    const now = this.now();
    if (isNew) s.lastAssessedAt = answer.assessed_at;
    s.needsRecovery = false; // a query succeeded
    s.assessments.push({
      at: iso(now),
      source: "lifecycle",
      held_data: answer.held_data,
    });
    if (answer.read_state !== "unknown") s.readState = answer.read_state;
    if (answer.ended_at !== undefined) s.endedAt = answer.ended_at;
    this.succeeded(s, s.attempts.get(attemptId) ?? now);
    if (erase) {
      await this.receiveErasure(s, {
        origin: "lifecycle",
        instructionId: answer.erasure!.instruction_id,
        acceptedAt: answer.erasure!.accepted_at,
        effectiveAt: answer.erasure!.effective_at,
        asStopUseBy: answer.erasure!.stop_use_by,
      });
      return;
    }
    // Terminal: a later `permitted` never cancels a known instruction.
    if (answer.held_data === "permitted" && !s.erasure) {
      s.positive = {
        source: "lifecycle",
        at: now,
        assessedAt: answer.assessed_at,
      };
    }
    await this.persist();
  }

  /**
   * A failed attempt: transport error, HTTP 401/429/5xx, a per-grant error, or
   * an answer that is not a new assessment.
   */
  recordFailure(
    ref: PdppGrantRef,
    attemptId: number,
    failure: {
      kind: "transport" | "http" | "per_grant";
      retryAfterMs?: number;
    },
  ): void {
    const s = this.ensure(ref);
    const now = this.now();
    const start = s.attempts.get(attemptId) ?? now;
    if (failure.kind === "transport") s.transportStreakStart ??= start;
    else s.transportStreakStart = undefined;
    // A failure of an older attempt never reschedules the newest one.
    if (s.lastAttemptId !== undefined && s.lastAttemptId !== attemptId) return;
    s.failures += 1;
    let delay = this.retryDelay(s, s.failures, now);
    if (failure.retryAfterMs !== undefined) {
      // The client MAY wait `Retry-After` instead; the reconciliation interval takes precedence.
      delay = Math.min(
        Math.max(delay, failure.retryAfterMs),
        PDPP_RECONCILIATION_INTERVAL_MS,
      );
    }
    s.nextAttemptAt = start + delay;
    this.persistInBackground();
  }

  /**
   * The owner chose `delete` in this client: an erasure instruction effective
   * at once, and the client's first authenticated receipt (spec-core
   * #client-disconnect). Saved before use stops and data is deleted, so it
   * survives a restart with its conveyance pending. A `choseAt` in the future
   * is clamped to now (review F12).
   */
  async ownerChoseDelete(
    ref: PdppGrantRef,
    choseAt: number = this.now(),
  ): Promise<void> {
    const s = this.ensure(ref);
    const at = Math.min(choseAt, this.now());
    await this.receiveErasure(s, {
      origin: "client_choice",
      instructionId: `local:${ref.grantId}:${at}`,
      effectiveAt: iso(at),
      receivedAt: at,
    });
  }

  /** The AS returned the instruction id for a client-conveyed `delete`. Never moves a clock. */
  linkInstruction(ref: PdppGrantRef, asInstructionId: string): void {
    const e = this.state_(ref)?.erasure;
    if (e && e.asInstructionId === undefined) {
      e.asInstructionId = asInstructionId;
      e.instructionId = asInstructionId;
      this.persistInBackground();
    }
  }

  /** The grant ended locally, e.g. after this client revoked it with `keep`. */
  recordEnding(
    ref: PdppGrantRef,
    readState: "revoked" | "expired",
    endedAt: number = this.now(),
  ): void {
    const s = this.ensure(ref);
    if (s.readState === "revoked" || s.readState === "expired") return;
    s.readState = readState;
    s.endedAt = iso(endedAt);
    this.persistInBackground();
  }

  /**
   * Decide whether held data of the grant may be used now (Client items 19,
   * 20, 21, 22). `purpose` is the purpose code of the intended use; any purpose
   * other than the grant's approved one needs a new grant. This check does not
   * run overdue disposal; {@link PdppLifecycleAgent.ensureMayUse} does.
   */
  checkUse(
    ref: PdppGrantRef,
    options: { purpose?: string } = {},
  ): PdppUseDecision {
    const s = this.state_(ref);
    if (!s) return { allowed: false, reason: "unknown_grant" };
    if (this.clockUncertain)
      return { allowed: false, reason: "clock_uncertain" };
    if (s.erasure) return { allowed: false, reason: "erased" };
    if (!s.positive)
      return { allowed: false, reason: "no_positive_assessment" };
    const now = this.now();
    if (
      s.queryRequired ||
      (s.nextAttemptAt !== undefined && s.nextAttemptAt <= now)
    ) {
      return { allowed: false, reason: "query_required" };
    }
    // Review R2-5: no credential can query, so no erasure could ever be learned. Fail closed.
    if (s.needsRecovery) return { allowed: false, reason: "recovery_required" };
    // Review NEW-6: a malformed retention fails closed loudly, never silently.
    if (this.retentionInvalid(s))
      return { allowed: false, reason: "invalid_retention" };
    if (
      this.ended(s, now) &&
      (s.grant?.processing_permissions?.length ?? 0) > 0
    ) {
      return { allowed: false, reason: "no_surviving_use" };
    }
    if (
      options.purpose !== undefined &&
      s.grant &&
      options.purpose !== s.grant.purpose_code
    ) {
      return { allowed: false, reason: "purpose_not_approved" };
    }
    return { allowed: true };
  }

  /** Whether the grant has ended (revoked or expired), from AS answers or `expires_at`. */
  hasEnded(ref: PdppGrantRef): boolean {
    const s = this.state_(ref);
    return s ? this.ended(s, this.now()) : false;
  }

  /** Aborted when use must stop: pass it to queued and in-flight work (case C2). */
  useSignal(ref: PdppGrantRef): AbortSignal {
    return this.ensure(ref).abort.signal;
  }

  /** The grant as delivered, if known. */
  grantOf(ref: PdppGrantRef): PdppGrant | undefined {
    return this.state_(ref)?.grant;
  }

  /** The erasure record, if an instruction applies (Client item 26). */
  erasureRecord(ref: PdppGrantRef): Readonly<PdppErasureRecord> | undefined {
    return this.state_(ref)?.erasure;
  }

  /** Assessment history: token responses and lifecycle answers, with the client receipt time. */
  assessments(
    ref: PdppGrantRef,
  ): ReadonlyArray<{ at: string; source: string; held_data?: string }> {
    return this.state_(ref)?.assessments ?? [];
  }

  /** Every known grant. */
  knownGrants(): PdppGrantRef[] {
    return [...this.grants.values()].map((s) => s.ref);
  }

  /** Grants that wait for the owner to approve lifecycle recovery. */
  grantsNeedingRecovery(): PdppGrantRef[] {
    return [...this.grants.values()]
      .filter(
        (s) =>
          s.needsRecovery === true ||
          (s.erasure
            ? Object.values(s.erasure.reports).includes(
                "needs_current_authentication",
              )
            : false),
      )
      .map((s) => s.ref);
  }

  /**
   * Register a party acting for the client for this grant (Client item 24),
   * also again after a restart. Throws {@link PdppIndependentRecipientError}
   * unless the party accepts every flow-down term and makes no independent
   * reuse. The terms are frozen as registered and checked again on every
   * classification. If an erasure instruction applies, it is relayed now.
   */
  registerDownstreamHolder(
    ref: PdppGrantRef,
    holder: PdppDownstreamHolder,
  ): void {
    const failure = flowDownFailure(holder.terms);
    if (failure) {
      throw new PdppIndependentRecipientError(
        `${holder.id} does not act for the client (${failure}); it would be an independent recipient`,
      );
    }
    const s = this.ensure(ref);
    s.holders.set(holder.id, holder);
    if (!s.holderTerms.some((h) => h.id === holder.id)) {
      s.holderTerms.push({
        id: holder.id,
        terms: Object.freeze({ ...holder.terms }),
      });
    }
    this.persistInBackground();
    if (s.erasure) void this.dispose(s).catch(() => undefined);
  }

  /** The party, if it is registered for the grant and its frozen and current terms still pass the flow-down. */
  actingForClient(
    ref: PdppGrantRef,
    id: string,
  ): PdppDownstreamHolder | undefined {
    const s = this.state_(ref);
    const holder = s?.holders.get(id);
    const frozen = s?.holderTerms.find((h) => h.id === id)?.terms;
    if (!holder || flowDownFailure(frozen) || flowDownFailure(holder.terms))
      return undefined;
    return holder;
  }

  /** @deprecated Use {@link actingForClient}, which re-checks the terms. */
  downstreamHolder(
    ref: PdppGrantRef,
    id: string,
  ): PdppDownstreamHolder | undefined {
    return this.actingForClient(ref, id);
  }

  /**
   * Record a legal-retention exception (spec-core #erasure "Legal retention").
   * `until` is an RFC 3339 date-time, `event:<text>`, or `unknown`; never an
   * invented date. Declare it before an instruction arrives (the retained data
   * lives outside the registered stores, which erasure empties), so the agent
   * reports `retained` rather than `completed`. Saved before it returns.
   */
  async recordLegalRetention(
    ref: PdppGrantRef,
    retention: { scope: string; basis: string; until: PdppRetainedUntil },
  ): Promise<void> {
    if (!isRetainedUntil(retention.until)) {
      throw new TypeError(
        "retained_until must be an RFC 3339 date-time, event:<text>, or unknown",
      );
    }
    const hold = { ...retention, recordedAt: iso(this.now()) };
    const s = this.ensure(ref);
    s.legalHold = hold;
    if (s.erasure) {
      s.erasure.legalRetention = hold;
      s.erasure.reports.retained = "pending";
    }
    await this.persist();
  }

  /** The legal obligation ended and the retained data is deleted: completion is reportable. */
  async recordLegalRetentionEnded(ref: PdppGrantRef): Promise<void> {
    const e = this.state_(ref)?.erasure;
    if (!e?.legalRetention || e.legalRetention.endedAt !== undefined) return;
    e.legalRetention.endedAt = iso(this.now());
    if (e.completedAt) e.reports.completed = "pending";
    await this.persist();
  }

  /** Mark a report outcome; used by the lifecycle agent. */
  setReportState(
    ref: PdppGrantRef,
    report: keyof PdppErasureRecord["reports"],
    state: ReportState,
  ): void {
    const e = this.state_(ref)?.erasure;
    if (e) {
      e.reports[report] = state;
      this.persistInBackground();
    }
  }

  /** Append one disclosure-gate decision to the state log; durable before the release proceeds. */
  async appendDisclosure(entry: unknown): Promise<void> {
    await this.state.appendLog({ kind: "disclosure", entry });
    this.disclosures.push(entry);
    if (this.disclosures.length > this.recentLogLimit) this.disclosures.shift();
  }

  /** Append a version of a required-by-law disclosure record; the last version per id is current. */
  async putLegalDisclosure(
    id: string | undefined,
    record: unknown,
  ): Promise<string> {
    const key = id ?? `legal:${this.now()}:${Math.round(this.random() * 1e9)}`;
    await this.state.appendLog({ kind: "legal_disclosure", id: key, record });
    this.legalDisclosures.set(key, record);
    return key;
  }

  /** Recent disclosure decisions made in this process (at most `recentLogLimit`). */
  disclosureLog(): readonly unknown[] {
    return this.disclosures;
  }

  /** Required-by-law records written in this process, current version of each. */
  legalDisclosureLog(): readonly unknown[] {
    return [...this.legalDisclosures.values()];
  }

  /** The full saved log, folded: every disclosure decision, and the current version of each legal record. */
  async readSavedLog(): Promise<{
    disclosures: unknown[];
    legalDisclosures: unknown[];
  }> {
    const disclosures: unknown[] = [];
    const legal = new Map<string, unknown>();
    for (const e of await this.state.readLog()) {
      if (e.kind === "disclosure") disclosures.push(e.entry);
      else legal.set(e.id, e.record);
    }
    return { disclosures, legalDisclosures: [...legal.values()] };
  }

  /**
   * Complete due disposal (Client items 6, 23): retry any unfinished erasure
   * and apply retention ceilings in every store and to derivatives. A
   * derivative whose acquisition time is unknown counts as past its ceiling
   * (review F5). Called before use and on every `runDue`.
   */
  async disposeDue(ref: PdppGrantRef): Promise<{ erasureComplete: boolean }> {
    const s = this.ensure(ref);
    if (s.erasure) {
      if (s.erasure.completedAt === undefined) await this.dispose(s);
      return { erasureComplete: s.erasure.completedAt !== undefined };
    }
    const retention = s.grant?.retention;
    if (retention) {
      // Spec-core L1847: a malformed max_duration means every ceiling is reached. Notice first.
      this.retentionInvalid(s);
      for (const store of this.stores.values()) {
        await this.bounded(
          () => store.applyRetention?.(ref, retention),
          ref,
          `store:${store.id} retention`,
        );
      }
      const ceilingMs = retentionCeilingMs(retention.max_duration);
      const now = this.now();
      let changed = false;
      for (const d of [...this.derivatives.values()]) {
        if (!d.inputs.some((i) => keyOf(i) === keyOf(ref))) continue;
        const acquiredAt =
          d.acquiredAt ?? s.firstAcquiredAt ?? Number.NEGATIVE_INFINITY;
        if (now - acquiredAt >= ceilingMs && d.erase) {
          await this.bounded(
            () => d.erase!(ref, "retention"),
            ref,
            `derivative:${d.id} retention`,
          );
          this.derivatives.delete(d.id);
          changed = true;
        }
      }
      if (changed) await this.persist();
    }
    return { erasureComplete: true };
  }

  // ── internals ──────────────────────────────────────────────────────────

  private state_(ref: PdppGrantRef): GrantState | undefined {
    return this.grants.get(keyOf(ref));
  }

  private ensure(ref: PdppGrantRef): GrantState {
    let s = this.grants.get(keyOf(ref));
    if (!s) {
      s = {
        ref: { issuer: ref.issuer, grantId: ref.grantId },
        failures: 0,
        queryRequired: false,
        assessments: [],
        holderTerms: [],
        abort: new AbortController(),
        holders: new Map(),
        attempts: new Map(),
        attemptSeq: 0,
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
    const cap = widened
      ? PDPP_RECONCILIATION_INTERVAL_MS
      : PDPP_RETRY_INTERVAL_MS;
    const exp = Math.min(
      cap,
      BASE_RETRY_DELAY_MS * 2 ** Math.min(30, failureCount - 1),
    );
    // Jitter only shortens the delay, so the cap always holds.
    return Math.max(1_000, Math.round(exp * (0.5 + 0.5 * this.random())));
  }

  private async receiveErasure(
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
      // Terminal, recorded once: redelivery only links the AS id, and never restarts a clock.
      if (input.origin === "lifecycle")
        this.linkInstruction(s.ref, input.instructionId);
      if (s.erasure.completedAt === undefined) await this.dispose(s);
      return;
    }
    const receivedAt = input.receivedAt ?? this.now();
    const effective = Date.parse(input.effectiveAt);
    const stopUseDeadline = Math.min(
      effective + PDPP_STOP_USE_BOUND_MS,
      input.asStopUseBy !== undefined
        ? Date.parse(input.asStopUseBy)
        : Number.POSITIVE_INFINITY,
    );
    const late = receivedAt > stopUseDeadline;
    s.erasure = {
      instructionId: input.instructionId,
      ...(input.origin === "lifecycle" && {
        asInstructionId: input.instructionId,
      }),
      origin: input.origin,
      ...(input.acceptedAt !== undefined && { acceptedAt: input.acceptedAt }),
      effectiveAt: input.effectiveAt,
      ...(input.asStopUseBy !== undefined && {
        asStopUseBy: input.asStopUseBy,
      }),
      firstReceiptAt: iso(receivedAt),
      learnedAfterStopUseBound: late,
      stopUseBy: iso(late ? receivedAt : stopUseDeadline),
      // Use stops at once on receipt: it is the earliest practicable point.
      stopUseAt: iso(receivedAt),
      deleteBy: iso(receivedAt + PDPP_DELETION_BOUND_MS),
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
    // Conveying the owner's choice, and learning the AS instruction id, are due at once.
    if (input.origin === "client_choice")
      s.nextAttemptAt = Math.min(s.nextAttemptAt ?? receivedAt, receivedAt);
    // Stopping use is always safe, so it never waits for storage.
    s.abort.abort(new Error(`erasure instruction for grant ${s.ref.grantId}`));
    let persistError: unknown;
    try {
      await this.persist(); // the record is durable before any deletion
    } catch (error) {
      persistError = error;
      this.reportPersistError(error);
    }
    await this.dispose(s);
    if (persistError !== undefined)
      throw new PdppStatePersistError(persistError);
  }

  /** Delete covered data everywhere; record what remains pending. */
  private async dispose(s: GrantState): Promise<void> {
    const e = s.erasure!;
    const pending: string[] = [];
    for (const id of this.knownStoreIds) {
      const store = this.stores.get(id);
      if (!store) {
        pending.push(`store:${id}`); // saved before a restart and not registered again yet (review R2-1)
        continue;
      }
      try {
        await this.bounded(() => store.erase(s.ref), s.ref, `store:${id}`);
      } catch {
        pending.push(`store:${id}`);
      }
    }
    for (const d of [...this.derivatives.values()]) {
      if (!d.inputs.some((i) => keyOf(i) === keyOf(s.ref))) continue;
      if (!d.erase) {
        pending.push(`derivative:${d.id}`); // waits for the app to register it again
        continue;
      }
      try {
        const erase = d.erase;
        const outcome = await this.bounded(
          () => erase(s.ref, "erasure"),
          s.ref,
          `derivative:${d.id}`,
        );
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
    for (const { id } of s.holderTerms) {
      if (e.partiesInformed.some((p) => p.id === id)) continue;
      const holder = s.holders.get(id);
      if (!holder) {
        pending.push(`holder:${id}`);
        continue;
      }
      try {
        const confirmation = await this.bounded(
          () =>
            holder.relayErasure({
              issuer: s.ref.issuer,
              grantId: s.ref.grantId,
              instructionId: e.instructionId,
              stopUseAsSoonAsPracticable: true,
              stopUseBy: e.stopUseBy,
              deleteBy: e.deleteBy,
            }),
          s.ref,
          `holder:${id}`,
        );
        e.partiesInformed.push({
          id,
          informedAt: iso(this.now()),
          ...(confirmation?.confirmedAt !== undefined && {
            confirmedAt: confirmation.confirmedAt,
          }),
        });
      } catch {
        pending.push(`holder:${id}`);
      }
    }
    e.pending = pending;
    const now = this.now();
    if (now > Date.parse(e.deleteBy)) e.missedDeadline = true;
    if (pending.length === 0 && e.completedAt === undefined) {
      e.completedAt = iso(now);
      e.reports.completed = "pending";
    }
    await this.persist().catch((error: unknown) => {
      this.reportPersistError(error);
    });
  }
}

function flowDownFailure(
  terms: PdppFlowDownTerms | undefined,
): string | undefined {
  if (!terms) return "no flow-down terms";
  if (terms.independentReuse !== false)
    return "it may reuse the data independently";
  if (terms.purposeAndRetention !== true)
    return "purpose and retention do not bind it";
  if (terms.heldDataDuties !== true)
    return "the held-data duties do not bind it";
  if (terms.trainingRestriction !== true)
    return "the AI training restriction does not bind it";
  return undefined;
}

/** Retention ceiling in ms; an invalid `max_duration` fails closed as already reached (spec-core #grant-retention). */
export function retentionCeilingMs(maxDuration: string): number {
  const match = /^P([1-9]\d*)D$/.exec(maxDuration);
  return match ? Number(match[1]) * 86_400_000 : 0;
}

const RFC3339 =
  /^\d{4}-\d{2}-\d{2}[tT]\d{2}:\d{2}:\d{2}(\.\d+)?([zZ]|[+-]\d{2}:\d{2})$/;

export function isRetainedUntil(value: string): boolean {
  if (value === "unknown") return true;
  if (value.startsWith("event:")) return value.slice(6).trim().length > 0;
  return RFC3339.test(value) && !Number.isNaN(Date.parse(value));
}

const iso = (ms: number) => new Date(ms).toISOString();
