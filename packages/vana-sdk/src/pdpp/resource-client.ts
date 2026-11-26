/**
 * PDPP client role: reading from a Core Resource Server.
 *
 * @remarks
 * Implements the PDPP Core v0.1.0 Client items that concern reads:
 * - Item 2: authenticates with an access token, never a raw grant.
 * - Item 3: `cursor` and `changes_since` tokens stay opaque and in separate spaces.
 * - Items 4–5: stores the terminal `next_changes_since`; on 410 `cursor_expired`
 *   restarts from `beginning` and replaces its copy; each returned record replaces
 *   its copy within the same projection.
 * - Item 7: status and headers are authoritative; unknown codes are opaque.
 * - Item 9: stops using a token on 401 `invalid_token` and stops requests against a
 *   grant on `grant_revoked`.
 * - Item 10: identifies records by `instance_id` and `id`; a tombstone for an unheld
 *   record is a no-op.
 * - Item 11: never infers that a record does not exist from an empty page, the end
 *   of pagination, a tombstone or a 404.
 * - Items 14–15: projected `data` is not validated as a full record; unknown members
 *   are ignored.
 * - Item 32: pins `PDPP-Version: 0.1` on every RS operation, including retries and
 *   pages, and verifies the selected version before using a successful response.
 *
 * @category PDPP
 */

import {
  PdppHttpError,
  PdppProtocolError,
  pdppHttpErrorFrom,
} from "./errors";
import type { PdppIssuedGrant } from "./authorization";
import type { PdppRecord, PdppRecordPage } from "./types";
import type { PdppSyncCopy } from "./sync-copy";

type Fetch = typeof globalThis.fetch;

/** The RS HTTP contract this client implements (spec-core §8 "API versioning"). */
export const PDPP_CLIENT_VERSION = "0.1";

export interface PdppResourceClientOptions {
  /** Absolute base the §8 paths extend (protected resource metadata `pdpp_core_query_base`). */
  coreQueryBase: string;
  accessToken: string;
  /** The grant this token covers, as interpreted from the token response. */
  issuedGrant: PdppIssuedGrant;
  fetch?: Fetch;
}

/** Thrown once the client has stopped (Client item 9). */
export class PdppClientStoppedError extends Error {
  constructor(readonly reason: "token_inactive" | "grant_revoked") {
    super(
      reason === "token_inactive"
        ? "the access token is inactive; obtain a new one before further requests"
        : "the grant was revoked; no further requests are made against it",
    );
    this.name = "PdppClientStoppedError";
  }
}

export class PdppResourceClient {
  private readonly base: string;
  private readonly doFetch: Fetch;
  private stopped: PdppClientStoppedError | undefined;

  constructor(private readonly options: PdppResourceClientOptions) {
    this.base = options.coreQueryBase.replace(/\/$/, "");
    this.doFetch = options.fetch ?? globalThis.fetch;
  }

  /** The grant this client reads under, with its issuer (Client item 28). */
  get issuedGrant(): PdppIssuedGrant {
    return this.options.issuedGrant;
  }

  /** Why the client stopped, if it has. */
  get stoppedReason(): PdppClientStoppedError["reason"] | undefined {
    return this.stopped?.reason;
  }

  listStreams(): Promise<unknown> {
    return this.get("/streams", {});
  }

  getStreamMetadata(stream: string): Promise<unknown> {
    return this.get(`/streams/${encodeURIComponent(stream)}`, {});
  }

  /** One page of a list read. `fields` must be within the grant (else 403 `field_not_granted`). */
  listRecords(
    stream: string,
    query: { limit?: number; cursor?: string; order?: "asc" | "desc"; fields?: string[] } = {},
  ): Promise<PdppRecordPage> {
    return this.get(`/streams/${encodeURIComponent(stream)}/records`, {
      ...(query.limit !== undefined && { limit: String(query.limit) }),
      ...(query.cursor !== undefined && { cursor: query.cursor }),
      ...(query.order !== undefined && { order: query.order }),
      ...(query.fields !== undefined && { fields: query.fields.join(",") }),
    }) as Promise<PdppRecordPage>;
  }

  /**
   * A single record. A 404 raises {@link PdppHttpError}; it is not evidence
   * that the record does not exist at the source (Client item 11).
   */
  getRecord(stream: string, id: string, instanceId?: string): Promise<PdppRecord> {
    return this.get(
      `/streams/${encodeURIComponent(stream)}/records/${encodeURIComponent(id)}`,
      instanceId ? { instance_id: instanceId } : {},
    ) as Promise<PdppRecord>;
  }

  /**
   * One incremental-sync pass of `stream` into `copy` (Client items 3–5, 10).
   *
   * Starts from the copy's stored token, or `beginning`. Pages within the
   * session follow `next_cursor` with the same token. On 410 `cursor_expired`
   * it restarts once from `beginning`. A completed `beginning` session replaces
   * the copy's stream. The terminal `next_changes_since` is stored for the next
   * pass; a terminal page without one is a protocol failure.
   */
  async sync(
    stream: string,
    copy: PdppSyncCopy,
    query: { fields?: string[]; limit?: number } = {},
  ): Promise<{ applied: number; restarted: boolean }> {
    const grantId = this.options.issuedGrant.grant.grant_id;
    const context = { grantId, stream, fields: query.fields };
    let restarted = false;
    let token = copy.syncToken(context) ?? "beginning";
    for (;;) {
      try {
        const applied = await this.syncSession(stream, copy, context, token, query);
        return { applied, restarted };
      } catch (error) {
        if (
          error instanceof PdppHttpError &&
          error.status === 410 &&
          error.code === "cursor_expired" &&
          !restarted
        ) {
          // Client item 5: start again from beginning, never retry the expired token.
          restarted = true;
          token = "beginning";
          continue;
        }
        throw error;
      }
    }
  }

  private async syncSession(
    stream: string,
    copy: PdppSyncCopy,
    context: { grantId: string; stream: string; fields?: string[] },
    changesSince: string,
    query: { fields?: string[]; limit?: number },
  ): Promise<number> {
    const fromBeginning = changesSince === "beginning";
    const session = copy.beginSession(context, { replace: fromBeginning });
    let cursor: string | undefined;
    let applied = 0;
    for (;;) {
      const page = (await this.get(`/streams/${encodeURIComponent(stream)}/records`, {
        changes_since: changesSince,
        ...(cursor !== undefined && { cursor }),
        ...(query.fields !== undefined && { fields: query.fields.join(",") }),
        ...(query.limit !== undefined && { limit: String(query.limit) }),
      })) as PdppRecordPage;
      for (const record of page.data ?? []) {
        session.apply(record);
        applied += 1;
      }
      if (page.has_more) {
        if (typeof page.next_cursor !== "string") {
          throw new PdppProtocolError("a non-terminal sync page carries no next_cursor");
        }
        // Client item 3: a page cursor is never used as a changes_since token.
        cursor = page.next_cursor;
        continue;
      }
      if (typeof page.next_changes_since !== "string") {
        throw new PdppProtocolError("the terminal sync page carries no next_changes_since");
      }
      session.commit(page.next_changes_since);
      return applied;
    }
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    if (this.stopped) throw this.stopped;
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const response = await this.doFetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.options.accessToken}`,
        "PDPP-Version": PDPP_CLIENT_VERSION,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const error = await pdppHttpErrorFrom(response);
      if (error.tokenInactive) {
        this.stopped = new PdppClientStoppedError(
          error.grantRevoked ? "grant_revoked" : "token_inactive",
        );
      } else if (error.grantRevoked) {
        this.stopped = new PdppClientStoppedError("grant_revoked");
      }
      throw error;
    }
    // Client item 32: exactly one PDPP-Version equal to the requested identifier.
    // `Headers.get` joins repeated fields with ", ", so a duplicate never equals "0.1".
    const selected = response.headers.get("PDPP-Version");
    if (selected?.trim() !== PDPP_CLIENT_VERSION) {
      throw new PdppProtocolError(
        `response selected PDPP-Version ${String(selected)}, not ${PDPP_CLIENT_VERSION}; its data is not used`,
      );
    }
    return response.json();
  }
}
