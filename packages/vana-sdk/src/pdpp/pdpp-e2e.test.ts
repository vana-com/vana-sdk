/**
 * PDPP client role against a real Vana Personal Server. Skipped unless
 * `PDPP_E2E_PS_URL` is set.
 *
 * Run (from packages/vana-sdk, against a PS built from the PDPP v0.1.0 branch):
 *
 *   PDPP_E2E_PS_URL=http://127.0.0.1:<port> \
 *   PDPP_E2E_OWNER_TOKEN=<PDPP owner token for the source and instance> \
 *   PDPP_E2E_OWNER_INSTANCE=<owner instance, e.g. spotify:0x…> \
 *   PDPP_E2E_CLIENT_ID=<a client in the PS config pdpp.clients> \
 *   PDPP_E2E_REDIRECT_URI=<one of that client's redirectUris> \
 *   ../../node_modules/.bin/vitest run src/pdpp/pdpp-e2e.test.ts
 *
 * Optional:
 * - PDPP_E2E_SOURCE_ID (default the Spotify connector).
 * - PDPP_E2E_STREAMS (comma-separated, default `top_artists`); the first
 *   stream must hold at least 3 records for the pagination step.
 * - PDPP_E2E_ISSUER (default `<PS>/pdpp/v1`; metadata is found by RFC 8414
 *   path insertion from it).
 * - PDPP_E2E_ALLOW_LOCAL (default true: http and loopback for a local PS).
 * - PDPP_E2E_INGEST_METHOD (default `spotify`) and PDPP_E2E_BINDING_GENERATION
 *   (default 1): the PS owner ingest route used to change data between syncs.
 *   Set PDPP_E2E_MUTATE=false to skip the tombstone step on a server whose data
 *   must not change.
 * - PDPP_E2E_OWNER_SUBJECT: the owner's raw subject (wallet address), to check
 *   that the client sees only pairwise identifiers.
 * - PDPP_E2E_REPORT: a file that receives one detail line per step.
 *
 * Steps (one `it` each, in order, sharing state):
 * 1. discovery (AS by RFC 8414 from the issuer, RS by RFC 9728);
 * 2. authorize and owner approval through the PS owner API;
 * 3. code exchange: `{ type, grant }` result, issuer retained, pairwise handles;
 * 4. list with pagination;
 * 5. changes_since twice, with a tombstone after an owner delete;
 * 6. a 410 `cursor_expired` restart from a legacy token;
 * 7. PDPP-Version pinned on every RS request and selected on every response;
 * 8. a lifecycle query that answers `permitted`;
 * 9. owner revoke with `delete`: the client receives `erase` and the
 *    held-data manager erases the copy and stops use.
 */

import { appendFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  InMemoryPdppHeldDataStateStore,
  InMemoryPdppLifecycleCredentials,
  InMemoryPdppSyncCopy,
  PdppHeldDataManager,
  PdppLifecycleAgent,
  PdppResourceClient,
  buildAuthorizationRequest,
  buildDataAccessDetail,
  createPkcePair,
  discoverPdppAuthorizationServer,
  discoverPdppResourceServer,
  grantRefOf,
  type PdppAuthorizationServerMetadata,
  type PdppGrantRef,
  type PdppIssuedGrant,
  type PdppTokenResult,
} from "./index";

const env = process.env;
const PS = env.PDPP_E2E_PS_URL?.replace(/\/$/, "");
/** Detail lines go to PDPP_E2E_REPORT when set (the test setup silences the console). */
const note = (line: string) => {
  if (env.PDPP_E2E_REPORT) appendFileSync(env.PDPP_E2E_REPORT, `${line}\n`);
};

interface Exchange {
  url: URL;
  method: string;
  requestVersion: string | null;
  status: number;
  responseVersion: string | null;
  body: unknown;
}

describe.skipIf(!PS)("PDPP client e2e against a Personal Server (PDPP_E2E_PS_URL)", () => {
  const issuer = env.PDPP_E2E_ISSUER ?? `${PS}/pdpp/v1`;
  const sourceId = env.PDPP_E2E_SOURCE_ID ?? "https://registry.pdpp.dev/connectors/spotify";
  const streams = (env.PDPP_E2E_STREAMS ?? "top_artists").split(",").map((s) => s.trim());
  const clientId = env.PDPP_E2E_CLIENT_ID ?? "music_recommendations";
  const redirectUri = env.PDPP_E2E_REDIRECT_URI ?? "https://app.example.com/callback";
  const owner = env.PDPP_E2E_OWNER_TOKEN ?? "";
  const ownerInstance = env.PDPP_E2E_OWNER_INSTANCE ?? "";
  const policy = { allowLocal: env.PDPP_E2E_ALLOW_LOCAL !== "false" };
  const ownerHeaders = { authorization: `Bearer ${owner}`, "content-type": "application/json" };

  // Every RS exchange, as the wire carried it.
  const rsLog: Exchange[] = [];
  const recordingFetch: typeof globalThis.fetch = async (input, init) => {
    const response = await globalThis.fetch(input, init);
    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      body = undefined;
    }
    rsLog.push({
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      requestVersion: new Headers(init?.headers).get("PDPP-Version"),
      status: response.status,
      responseVersion: response.headers.get("PDPP-Version"),
      body,
    });
    return response;
  };

  let as: PdppAuthorizationServerMetadata;
  let coreQueryBaseUrl: string;
  let manager: PdppHeldDataManager;
  let agent: PdppLifecycleAgent;
  let copy: InMemoryPdppSyncCopy;
  let tokens: PdppTokenResult;
  let issued: PdppIssuedGrant;
  let ref: PdppGrantRef;
  let client: PdppResourceClient;
  let code: string;
  let codeVerifier: string;

  it("1. discovers the AS by RFC 8414 from its issuer and the RS by RFC 9728", async () => {
    as = await discoverPdppAuthorizationServer(issuer, { policy });
    expect(as.issuer).toBe(issuer);
    expect(as.pdpp_grant_lifecycle_endpoint).toBeTypeOf("string");
    const rs = await discoverPdppResourceServer(PS!, { policy });
    expect(rs.authorization_servers ?? [issuer]).toContain(issuer);
    coreQueryBaseUrl = rs.coreQueryBaseUrl;
    note(`[e2e] AS ${as.issuer}; RS core base ${coreQueryBaseUrl}`);
  });

  it("2. authorizes, with owner approval through the PS owner API", async () => {
    expect(owner, "PDPP_E2E_OWNER_TOKEN").not.toBe("");
    const pkce = await createPkcePair();
    codeVerifier = pkce.codeVerifier;
    const detail = buildDataAccessDetail({
      source: { id: sourceId },
      purpose_code: "https://pdpp.dev/purpose/personalization",
      access_mode: "continuous",
      streams: streams.map((name) => ({ name, fields: ["*"] })),
    });
    const request = buildAuthorizationRequest({ clientId, redirectUri, codeChallenge: pkce.codeChallenge, details: [detail] });
    const authorized = await fetch(as.authorization_endpoint!, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ ...request.json, client_display: { name: "vana-sdk PDPP e2e" } }),
    });
    expect(authorized.status, await peek(authorized)).toBe(201);
    const { session_id: sessionId } = (await authorized.json()) as { session_id: string };
    const reviewed = await fetch(`${as.authorization_endpoint}/${sessionId}/review`, { headers: ownerHeaders });
    expect(reviewed.status, await peek(reviewed)).toBe(200);
    const { review } = (await reviewed.json()) as { review: { review_digest: string } };
    const approved = await fetch(`${as.authorization_endpoint}/${sessionId}/approve`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ review_digest: review.review_digest }),
    });
    expect(approved.status, await peek(approved)).toBe(200);
    const { redirect_uri: back } = (await approved.json()) as { redirect_uri: string };
    code = new URL(back).searchParams.get("code")!;
    expect(code).toBeTruthy();
  });

  it("3. exchanges the code: { type, grant } result, issuer retained, pairwise handles only", async () => {
    manager = await PdppHeldDataManager.open({ state: new InMemoryPdppHeldDataStateStore() });
    copy = new InMemoryPdppSyncCopy();
    await manager.addStore(copy);
    agent = PdppLifecycleAgent.fromMetadata(as, {
      manager,
      clientId,
      credentials: new InMemoryPdppLifecycleCredentials(),
      policy,
    });
    tokens = await agent.exchangeAuthorizationCode({ metadata: as, code, codeVerifier, clientId, redirectUri });
    expect(tokens.grants).toHaveLength(1);
    issued = tokens.grants[0]!;
    ref = grantRefOf(issued);
    expect(issued.issuer).toBe(issuer);
    expect(issued.grant.streams.map((s) => s.name).sort()).toEqual([...streams].sort());
    for (const s of issued.grant.streams) expect(s.required_fields).toEqual(expect.any(Array));
    // Pairwise: the client never sees the owner's subject or instance identifiers.
    const raw = JSON.stringify(issued.grant);
    if (env.PDPP_E2E_OWNER_SUBJECT) expect(raw.toLowerCase()).not.toContain(env.PDPP_E2E_OWNER_SUBJECT.toLowerCase());
    if (ownerInstance) expect(raw).not.toContain(ownerInstance);
    expect(manager.checkUse(ref)).toEqual({ allowed: true });
    client = new PdppResourceClient({
      coreQueryBase: coreQueryBaseUrl,
      accessToken: tokens.accessToken,
      issuedGrant: issued,
      heldData: manager,
      policy,
      fetch: recordingFetch,
    });
    note(
      `[e2e] grant ${issued.grant.grant_id}; subject ${issued.grant.subject.id}; instance handles ${JSON.stringify(
        issued.grant.streams.map((s) => s.instance_ids),
      )}`,
    );
  });

  it("4. lists with pagination; records carry the grant's pairwise instance handle", async () => {
    const stream = streams[0]!;
    const handles = issued.grant.streams.find((s) => s.name === stream)!.instance_ids;
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await client.listRecords(stream, { limit: 2, ...(cursor !== undefined && { cursor }) });
      pages += 1;
      for (const r of page.data) {
        expect(handles).toContain(r.instance_id);
        if (ownerInstance) expect(r.instance_id).not.toBe(ownerInstance);
        seen.push(r.id);
      }
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor !== undefined && pages < 50);
    expect(pages).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(seen.length);
    note(`[e2e] ${stream}: ${seen.length} records over ${pages} pages`);
  });

  it("5. runs changes_since twice; an owner delete arrives as a tombstone", async () => {
    const counts: Record<string, number> = {};
    for (const stream of streams) {
      await client.sync(stream, copy, { limit: 2 });
      counts[stream] = copy.records({ issuer, grantId: ref.grantId, stream }).length;
    }
    const stream = streams[0]!;
    const context = { issuer, grantId: ref.grantId, stream };
    const before = copy.records(context).map((r) => r.id).sort();
    expect(before.length).toBeGreaterThan(1);
    if (env.PDPP_E2E_MUTATE === "false") return;
    const victim = before[0]!;
    const deleted = await fetch(
      `${coreQueryBaseUrl}/streams/${stream}/records/${encodeURIComponent(victim)}?instance_id=${encodeURIComponent(ownerInstance)}`,
      { method: "DELETE", headers: { authorization: `Bearer ${owner}` } },
    );
    expect(deleted.status, await peek(deleted)).toBe(204);
    const ingested = await fetch(
      `${coreQueryBaseUrl}/streams/${stream}/records/ingest?method=${env.PDPP_E2E_INGEST_METHOD ?? "spotify"}&binding_generation=${env.PDPP_E2E_BINDING_GENERATION ?? "1"}`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify([
          { instance: ownerInstance, key: "e2e_new", data: { id: "e2e_new", name: "New" }, emitted_at: new Date().toISOString() },
        ]),
      },
    );
    expect(ingested.status, await peek(ingested)).toBe(200);
    const mark = rsLog.length;
    const second = await client.sync(stream, copy, { limit: 2 });
    expect(second.restarted).toBe(false);
    const sessionPages = rsLog.slice(mark);
    expect(sessionPages.every((e) => e.url.searchParams.get("changes_since") !== "beginning")).toBe(true);
    const tombstones = sessionPages.flatMap((e) =>
      ((e.body as { data?: Array<{ id: string; deleted?: boolean }> } | undefined)?.data ?? []).filter((r) => r.deleted),
    );
    expect(tombstones.map((t) => t.id)).toContain(victim);
    const after = copy.records(context).map((r) => r.id).sort();
    expect(after).not.toContain(victim);
    expect(after).toContain("e2e_new");
    note(
      `[e2e] first sync ${JSON.stringify(counts)}; second sync applied ${second.applied}, tombstones ${tombstones.length}; held ${after.length}`,
    );
  });

  it("6. restarts from beginning on 410 cursor_expired (legacy token)", async () => {
    const stream = streams[0]!;
    const context = { issuer, grantId: ref.grantId, stream };
    const held = copy.records(context).length;
    // A token from an older server format: this PS answers it with 410 cursor_expired.
    const s = copy.beginSession(context, { replace: false });
    s.commit("0");
    const mark = rsLog.length;
    const result = await client.sync(stream, copy, { limit: 2 });
    expect(result.restarted).toBe(true);
    const session = rsLog.slice(mark);
    expect(session[0]!.status).toBe(410);
    expect((session[0]!.body as { error?: { code?: string } }).error?.code).toBe("cursor_expired");
    expect(session[1]!.url.searchParams.get("changes_since")).toBe("beginning");
    expect(copy.records(context).length).toBe(held);
    note(`[e2e] 410 restart: ${session.length} requests, copy ${held} records`);
  });

  it("7. pins PDPP-Version on every RS request and sees it selected on every success", () => {
    expect(rsLog.length).toBeGreaterThan(5);
    expect(rsLog.every((e) => e.requestVersion === "0.1")).toBe(true);
    expect(rsLog.filter((e) => e.status < 300).every((e) => e.responseVersion === "0.1")).toBe(true);
    note(`[e2e] ${rsLog.length} RS requests, all pinned to 0.1`);
  });

  it("8. a lifecycle query answers permitted", async () => {
    expect(await agent.query(ref)).toBe("answered");
    expect(manager.assessments(ref).at(-1)).toMatchObject({ source: "lifecycle", held_data: "permitted" });
  });

  it("9. owner revoke with delete: the client receives erase and the held-data manager erases", async () => {
    const signal = manager.useSignal(ref);
    const revoked = await fetch(`${issuer}/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${owner}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_id: ref.grantId, disposition: "delete" }).toString(),
    });
    expect(revoked.status, await peek(revoked)).toBeLessThan(300);
    expect(await agent.query(ref)).toBe("answered");
    const record = manager.erasureRecord(ref);
    expect(record?.origin).toBe("lifecycle");
    expect(record?.asInstructionId).toBeTypeOf("string");
    expect(signal.aborted).toBe(true);
    expect(manager.checkUse(ref)).toEqual({ allowed: false, reason: "erased" });
    expect(copy.holdsData(ref)).toBe(false);
    expect(record?.completedAt).toBeTypeOf("string");
    await expect(client.listRecords(streams[0]!)).rejects.toMatchObject({ reason: "grant_erased" });
    note(
      `[e2e] erase: instruction ${record?.asInstructionId}; reports ${JSON.stringify(record?.reports)}; needs recovery ${JSON.stringify(
        agent.grantsNeedingRecovery(),
      )}`,
    );
  });
});

async function peek(response: Response): Promise<string> {
  return response.ok ? "" : `HTTP ${response.status}: ${await response.clone().text()}`;
}
