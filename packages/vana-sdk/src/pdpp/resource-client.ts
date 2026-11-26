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
 * - Item 33: expects each StreamGrant's `required_fields` in every returned
 *   record's `data`; a missing one is reported (it may have no stored value),
 *   or refused with `requireRequiredFields`.
 * - With a {@link PdppHeldDataManager}: every acquisition is recorded (it
 *   starts the reconciliation interval), a failure that shows the grant may
 *   have ended makes a lifecycle query due before further use (item 9), and no
 *   request is made under a grant with an erasure instruction.
 *
 * @category PDPP
 */

import {
  PdppHttpError,
  PdppProtocolError,
  pdppHttpErrorFrom,
} from "./errors";
import type { PdppIssuedGrant } from "./authorization";
import type { PdppRecord, PdppRecordPage, PdppStreamGrant } from "./types";
import type { PdppSyncContext, PdppSyncCopy } from "./sync-copy";
import { grantRefOf, type PdppHeldDataManager } from "./held-data";
import { PDPP_FETCH_REDIRECT, assertPdppEndpoint, type PdppEndpointPolicy } from "./endpoints";

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
  /**
   * Required: records acquisitions and grant signals and stops requests on an
   * erased or ended grant (Client items 9, 20–22). The spec gives a client no
   * way to opt out of these duties, so there is no opt-out (review F6).
   */
  heldData: PdppHeldDataManager;
  /** Endpoint policy for `coreQueryBase`; see {@link assertPdppEndpoint}. */
  policy?: PdppEndpointPolicy;
  /** Refuse a record whose `data` lacks a `required_fields` entry (Client item 33). Default: report only. */
  requireRequiredFields?: boolean;
}

/** Thrown once the client has stopped (Client item 9). */
export class PdppClientStoppedError extends Error {
  constructor(readonly reason: "token_inactive" | "grant_revoked" | "grant_ended" | "grant_erased") {
    super(
      reason === "token_inactive"
        ? "the access token is inactive; obtain a new one before further requests"
        : reason === "grant_revoked"
          ? "the grant was revoked; no further requests are made against it"
          : reason === "grant_ended"
            ? "the grant has ended (revoked or expired); no further requests are made against it"
            : "an erasure instruction applies to the grant; no further requests are made against it",
    );
    this.name = "PdppClientStoppedError";
  }
}

/** A returned record that lacks fields of its StreamGrant's `required_fields`. */
export interface PdppRequiredFieldGap {
  stream: string;
  instanceId: string;
  id: string;
  missing: string[];
}

/**
 * Client item 33: the `required_fields` absent from a returned record's
 * `data`. Absence may mean the stored version has no value, so this is an
 * observation, not proof of a bad RS. Tombstones carry no `data` and have none.
 */
export function missingRequiredFields(record: PdppRecord, streamGrant: PdppStreamGrant): string[] {
  if (record.deleted === true) return [];
  const data = record.data ?? {};
  return streamGrant.required_fields.filter((f) => !Object.prototype.hasOwnProperty.call(data, f));
}

/** Protected resource metadata members this client reads (spec-core #protected-resource-metadata). */
export interface PdppProtectedResourceMetadata {
  resource: string;
  authorization_servers?: string[];
  pdpp_core_query_base: string;
  pdpp_provider_connect_version?: string;
  [member: string]: unknown;
}

/** RFC 9728 §3: the well-known string inserted between host and path of the resource identifier. */
export function protectedResourceMetadataUrl(resource: string): string {
  const url = new URL(resource);
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `${url.origin}/.well-known/oauth-protected-resource${path}${url.search}`;
}

/**
 * Fetch protected resource metadata without `PDPP-Version` negotiation, check
 * its `resource`, and resolve `pdpp_core_query_base` against it. The version
 * is still pinned on every record request; nothing is inferred from the path.
 */
export async function discoverPdppResourceServer(
  resource: string,
  options: { fetch?: Fetch; metadataUrl?: string; policy?: PdppEndpointPolicy } = {},
): Promise<PdppProtectedResourceMetadata & { coreQueryBaseUrl: string }> {
  assertPdppEndpoint(resource, resource, "resource", options.policy);
  const metadataUrl = assertPdppEndpoint(
    options.metadataUrl ?? protectedResourceMetadataUrl(resource),
    resource,
    "protected resource metadata URL",
    options.policy,
  );
  const doFetch = options.fetch ?? globalThis.fetch;
  const response = await doFetch(metadataUrl, {
    headers: { Accept: "application/json" },
    redirect: PDPP_FETCH_REDIRECT,
  });
  if (!response.ok) throw await pdppHttpErrorFrom(response);
  const metadata = (await response.json()) as PdppProtectedResourceMetadata;
  if (metadata.resource !== resource) {
    throw new PdppProtocolError("protected resource metadata names a different resource");
  }
  if (typeof metadata.pdpp_core_query_base !== "string") {
    throw new PdppProtocolError("protected resource metadata has no pdpp_core_query_base");
  }
  const coreQueryBaseUrl = assertPdppEndpoint(
    new URL(metadata.pdpp_core_query_base, resource).toString(),
    resource,
    "pdpp_core_query_base",
    options.policy,
  );
  return { ...metadata, coreQueryBaseUrl };
}

export class PdppResourceClient {
  private readonly base: string;
  private readonly doFetch: Fetch;
  private stopped: PdppClientStoppedError | undefined;

  constructor(private readonly options: PdppResourceClientOptions) {
    this.base = assertPdppEndpoint(options.coreQueryBase, options.coreQueryBase, "coreQueryBase", options.policy).replace(/\/$/, "");
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
  async listRecords(
    stream: string,
    query: { limit?: number; cursor?: string; order?: "asc" | "desc"; fields?: string[] } = {},
  ): Promise<PdppRecordPage> {
    const page = (await this.get(`/streams/${encodeURIComponent(stream)}/records`, {
      ...(query.limit !== undefined && { limit: String(query.limit) }),
      ...(query.cursor !== undefined && { cursor: query.cursor }),
      ...(query.order !== undefined && { order: query.order }),
      ...(query.fields !== undefined && { fields: query.fields.join(",") }),
    })) as PdppRecordPage;
    // Client item 10: records read outside sync are held data the client reconciles itself.
    for (const record of page.data ?? []) this.observe(stream, record);
    return page;
  }

  /** Required-field gaps seen so far (Client item 33). */
  get requiredFieldGaps(): readonly PdppRequiredFieldGap[] {
    return this.gaps;
  }

  private readonly gaps: PdppRequiredFieldGap[] = [];

  /** Record an acquisition and check required fields for one returned record. */
  private observe(stream: string, record: PdppRecord): void {
    this.assertNotErased();
    if (record.deleted === true) return;
    const streamGrant = this.options.issuedGrant.grant.streams.find((s) => s.name === stream);
    if (streamGrant) {
      const missing = missingRequiredFields(record, streamGrant);
      if (missing.length > 0) {
        if (this.options.requireRequiredFields) {
          throw new PdppProtocolError(
            `record ${record.instance_id}/${record.id} lacks required fields ${missing.join(", ")}`,
          );
        }
        this.gaps.push({ stream, instanceId: record.instance_id, id: record.id, missing });
      }
    }
    this.options.heldData.recordAcquisition(grantRefOf(this.options.issuedGrant), this.options.issuedGrant.grant);
  }

  /**
   * A delivery that arrives after an erasure instruction is covered data: it
   * is never applied or returned, and no session commits (review F1).
   */
  private assertNotErased(): void {
    if (this.options.heldData.erasureRecord(grantRefOf(this.options.issuedGrant))) {
      this.stopped = new PdppClientStoppedError("grant_erased");
      throw this.stopped;
    }
  }

  /**
   * A single record. A 404 raises {@link PdppHttpError}; it is not evidence
   * that the record does not exist at the source (Client item 11).
   */
  async getRecord(stream: string, id: string, instanceId?: string): Promise<PdppRecord> {
    const record = (await this.get(
      `/streams/${encodeURIComponent(stream)}/records/${encodeURIComponent(id)}`,
      instanceId ? { instance_id: instanceId } : {},
    )) as PdppRecord;
    this.observe(stream, record);
    return record;
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
    const context = {
      issuer: this.options.issuedGrant.issuer,
      grantId: this.options.issuedGrant.grant.grant_id,
      stream,
      ...(query.fields !== undefined && { fields: query.fields }),
    };
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
    context: PdppSyncContext,
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
      // Checked after every awaited response, including an empty page.
      this.assertNotErased();
      for (const record of page.data ?? []) {
        this.observe(stream, record);
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
      this.assertNotErased();
      session.commit(page.next_changes_since);
      return applied;
    }
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    if (this.stopped) throw this.stopped;
    this.assertNotErased();
    // Review F6: a grant the manager knows has ended gets no request at all.
    if (this.options.heldData.hasEnded(grantRefOf(this.options.issuedGrant))) {
      this.stopped = new PdppClientStoppedError("grant_ended");
      throw this.stopped;
    }
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const response = await this.doFetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.options.accessToken}`,
        "PDPP-Version": PDPP_CLIENT_VERSION,
        Accept: "application/json",
      },
      redirect: PDPP_FETCH_REDIRECT,
    });
    if (!response.ok) {
      const error = await pdppHttpErrorFrom(response);
      // Client item 9: a sign the grant may have ended obliges a lifecycle query before further use.
      this.options.heldData.recordGrantSignal(grantRefOf(this.options.issuedGrant), error);
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
