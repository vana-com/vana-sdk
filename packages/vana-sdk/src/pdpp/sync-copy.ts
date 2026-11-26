/**
 * The client's synchronized copy of PDPP records.
 *
 * @remarks
 * - Records are identified by `instance_id` and `id` together (Client item 10).
 * - A returned record replaces the held copy within the same projection; an
 *   omitted optional field is removed, a present `null` is stored (Client item 5).
 * - A tombstone for a record that is not held is a no-op (Client item 10).
 * - A completed `beginning` session replaces the stream's copy (Client item 5).
 * - Retention counts from each record's first acquisition and never restarts;
 *   `on_expiry` applies at the ceiling with no grace period (Client item 6). A
 *   `max_duration` not of the form `PnD` (n ≥ 1) fails closed: the ceiling
 *   counts as already reached (spec-core #grant-retention).
 * - It is a {@link PdppHeldDataStore}: an erasure instruction deletes every
 *   record and sync token of the grant in every query context (Client item 22).
 * - Its clock never runs backwards: a rollback cannot move a ceiling later
 *   (case C5a).
 *
 * This in-memory store is the reference behaviour. An application that keeps
 * the copy elsewhere implements {@link PdppSyncCopy} with the same rules, and
 * carries the same duties to derivatives and to parties acting for it.
 *
 * @category PDPP
 */

import { PdppGrantErasedError } from "./errors";
import type { PdppRecord } from "./types";
import type { PdppGrantRef, PdppHeldDataStore } from "./held-data";

/** The query context a sync token is bound to. The issuer is part of it (Client item 28). */
export interface PdppSyncContext {
  issuer: string;
  grantId: string;
  stream: string;
  fields?: string[];
}

export interface PdppHeldRecord {
  instanceId: string;
  id: string;
  data: Record<string, unknown>;
  /** First acquisition time; never reset by later reads (Client item 6). */
  firstAcquiredAt: number;
}

export interface PdppSyncSession {
  apply(record: PdppRecord): void;
  /** Store the terminal token; for a `beginning` session, replace the stream's copy. */
  commit(nextChangesSince: string): void;
}

export interface PdppSyncCopy {
  syncToken(context: PdppSyncContext): string | undefined;
  beginSession(context: PdppSyncContext, options: { replace: boolean }): PdppSyncSession;
}

const contextKey = (c: PdppSyncContext) =>
  JSON.stringify([c.issuer, c.grantId, c.stream, c.fields ? [...c.fields].sort() : null]);
const grantKey = (r: Pick<PdppGrantRef, "issuer" | "grantId">) => JSON.stringify([r.issuer, r.grantId]);
const sameGrant = (c: PdppSyncContext, r: Pick<PdppGrantRef, "issuer" | "grantId">) =>
  c.issuer === r.issuer && c.grantId === r.grantId;
const recordKey = (instanceId: string, id: string) => `${instanceId}\u0000${id}`;

/** Parse an ISO 8601 `PnD` duration (the only form spec-core allows for `max_duration`). */
export function parseRetentionDays(maxDuration: string): number {
  const match = /^P([1-9]\d*)D$/.exec(maxDuration);
  if (!match) throw new TypeError(`retention.max_duration ${maxDuration} is not PnD`);
  return Number(match[1]);
}

export interface InMemoryPdppSyncCopyOptions {
  /**
   * Called with the keys of records disposed at their retention ceiling, so
   * the app applies the same ceiling to their derivatives (Client item 6).
   */
  onExpired?: (
    context: PdppSyncContext,
    records: Array<{ instanceId: string; id: string }>,
  ) => void;
}

export class InMemoryPdppSyncCopy implements PdppSyncCopy, PdppHeldDataStore {
  private readonly tokens = new Map<string, string>();
  private readonly streams = new Map<string, Map<string, PdppHeldRecord>>();
  private readonly contexts = new Map<string, PdppSyncContext>();
  /** First-acquisition times survive copy replacement and deletion-then-reacquisition. */
  private readonly firstSeen = new Map<string, number>();
  private floor = Number.NEGATIVE_INFINITY;
  private readonly clock: () => number;
  /** Bumped by every erase of a grant: a session begun earlier never commits (review F1). */
  private readonly erasures = new Map<string, number>();

  constructor(
    now: () => number = Date.now,
    private readonly options: InMemoryPdppSyncCopyOptions = {},
  ) {
    this.clock = now;
  }

  private now(): number {
    this.floor = Math.max(this.floor, this.clock());
    return this.floor;
  }

  /** Whether any record of the grant is held, in any query context. */
  holdsData(ref: Pick<PdppGrantRef, "issuer" | "grantId">): boolean {
    for (const [key, held] of this.streams) {
      const context = this.contexts.get(key);
      if (context && sameGrant(context, ref) && held.size > 0) return true;
    }
    return false;
  }

  /** Delete every record, sync token and acquisition time of the grant (erasure). */
  erase(ref: Pick<PdppGrantRef, "issuer" | "grantId">): void {
    this.erasures.set(grantKey(ref), (this.erasures.get(grantKey(ref)) ?? 0) + 1);
    for (const [key, context] of this.contexts) {
      if (!sameGrant(context, ref)) continue;
      this.streams.delete(key);
      this.tokens.delete(key);
      for (const fk of [...this.firstSeen.keys()]) {
        if (fk.startsWith(`${key}\u0001`)) this.firstSeen.delete(fk);
      }
      this.contexts.delete(key);
    }
  }

  syncToken(context: PdppSyncContext): string | undefined {
    return this.tokens.get(contextKey(context));
  }

  records(context: PdppSyncContext): PdppHeldRecord[] {
    return [...(this.streams.get(contextKey(context))?.values() ?? [])];
  }

  beginSession(context: PdppSyncContext, options: { replace: boolean }): PdppSyncSession {
    const key = contextKey(context);
    const generation = this.erasures.get(grantKey(context)) ?? 0;
    const erasedSince = () => (this.erasures.get(grantKey(context)) ?? 0) !== generation;
    const current = this.streams.get(key) ?? new Map<string, PdppHeldRecord>();
    // A `beginning` session builds its result in isolation and replaces the copy on commit.
    const target = options.replace ? new Map<string, PdppHeldRecord>() : new Map(current);
    return {
      apply: (record) => {
        if (erasedSince()) throw new PdppGrantErasedError(context.grantId);
        const rk = recordKey(record.instance_id, record.id);
        if (record.deleted === true) {
          target.delete(rk); // no-op when not held
          return;
        }
        const firstKey = `${key}\u0001${rk}`;
        const firstAcquiredAt = this.firstSeen.get(firstKey) ?? this.now();
        this.firstSeen.set(firstKey, firstAcquiredAt);
        // Full replacement within the projection: never merge with the old value.
        target.set(rk, {
          instanceId: record.instance_id,
          id: record.id,
          data: { ...(record.data ?? {}) },
          firstAcquiredAt,
        });
      },
      commit: (nextChangesSince) => {
        // A session begun before an erasure of its grant never writes back.
        if (erasedSince()) throw new PdppGrantErasedError(context.grantId);
        this.contexts.set(key, { ...context });
        this.streams.set(key, target);
        this.tokens.set(key, nextChangesSince);
      },
    };
  }

  /**
   * Apply the grant's retention commitment (Client item 6).
   *
   * Records whose ceiling, counted from first acquisition, has passed are
   * deleted, or anonymized by `anonymize` when `on_expiry` is `anonymize`.
   * Without an anonymizer the record is deleted, which is stricter. The caller
   * applies the same ceiling to its derivatives.
   */
  applyRetention(
    target: PdppSyncContext | Pick<PdppGrantRef, "issuer" | "grantId">,
    retention: { max_duration: string; on_expiry: "delete" | "anonymize" },
    anonymize?: (data: Record<string, unknown>) => Record<string, unknown>,
  ): { expired: number } {
    const now = this.now();
    if (!("stream" in target)) {
      // Every query context of the grant (the held-data store form, called before use).
      let expired = 0;
      for (const context of [...this.contexts.values()]) {
        if (sameGrant(context, target)) {
          expired += this.applyRetention(context, retention, anonymize).expired;
        }
      }
      return { expired };
    }
    const context = target;
    let ceilingMs: number;
    try {
      ceilingMs = parseRetentionDays(retention.max_duration) * 86_400_000;
    } catch {
      ceilingMs = 0; // fail closed: every ceiling is already reached
    }
    const held = this.streams.get(contextKey(context));
    if (!held) return { expired: 0 };
    const expiredKeys: Array<{ instanceId: string; id: string }> = [];
    for (const [rk, record] of held) {
      if (now - record.firstAcquiredAt < ceilingMs) continue;
      expiredKeys.push({ instanceId: record.instanceId, id: record.id });
      if (retention.on_expiry === "anonymize" && anonymize) {
        held.set(rk, { ...record, data: anonymize(record.data) });
      } else {
        held.delete(rk);
      }
    }
    if (expiredKeys.length > 0) this.options.onExpired?.(context, expiredKeys);
    return { expired: expiredKeys.length };
  }
}
