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
 *   `on_expiry` applies at the ceiling with no grace period (Client item 6).
 *
 * This in-memory store is the reference behaviour. An application that keeps
 * the copy elsewhere implements {@link PdppSyncCopy} with the same rules, and
 * carries the same duties to derivatives and to parties acting for it.
 *
 * @category PDPP
 */

import type { PdppRecord } from "./types";

/** The query context a sync token is bound to. */
export interface PdppSyncContext {
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
  JSON.stringify([c.grantId, c.stream, c.fields ? [...c.fields].sort() : null]);
const recordKey = (instanceId: string, id: string) => `${instanceId}\u0000${id}`;

/** Parse an ISO 8601 `PnD` duration (the only form spec-core allows for `max_duration`). */
export function parseRetentionDays(maxDuration: string): number {
  const match = /^P(\d+)D$/.exec(maxDuration);
  if (!match) throw new TypeError(`retention.max_duration ${maxDuration} is not PnD`);
  return Number(match[1]);
}

export class InMemoryPdppSyncCopy implements PdppSyncCopy {
  private readonly tokens = new Map<string, string>();
  private readonly streams = new Map<string, Map<string, PdppHeldRecord>>();
  /** First-acquisition times survive copy replacement and deletion-then-reacquisition. */
  private readonly firstSeen = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  syncToken(context: PdppSyncContext): string | undefined {
    return this.tokens.get(contextKey(context));
  }

  records(context: PdppSyncContext): PdppHeldRecord[] {
    return [...(this.streams.get(contextKey(context))?.values() ?? [])];
  }

  beginSession(context: PdppSyncContext, options: { replace: boolean }): PdppSyncSession {
    const key = contextKey(context);
    const current = this.streams.get(key) ?? new Map<string, PdppHeldRecord>();
    // A `beginning` session builds its result in isolation and replaces the copy on commit.
    const target = options.replace ? new Map<string, PdppHeldRecord>() : new Map(current);
    return {
      apply: (record) => {
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
    context: PdppSyncContext,
    retention: { max_duration: string; on_expiry: "delete" | "anonymize" },
    anonymize?: (data: Record<string, unknown>) => Record<string, unknown>,
  ): { expired: number } {
    const ceilingMs = parseRetentionDays(retention.max_duration) * 86_400_000;
    const held = this.streams.get(contextKey(context));
    if (!held) return { expired: 0 };
    let expired = 0;
    const now = this.now();
    for (const [rk, record] of held) {
      if (now - record.firstAcquiredAt < ceilingMs) continue;
      expired += 1;
      if (retention.on_expiry === "anonymize" && anonymize) {
        held.set(rk, { ...record, data: anonymize(record.data) });
      } else {
        held.delete(rk);
      }
    }
    return { expired };
  }
}
