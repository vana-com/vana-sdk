/**
 * Tests for the WP8 review findings F1–F12. Probe ids (P1…P19) refer to the
 * reviewer's probe script; each probe that showed a defect is a test here.
 */
import { describe, it, expect } from "vitest";
import {
  PDPP_DATA_ACCESS_TYPE,
  PDPP_DELETION_BOUND_MS,
  PDPP_GRANT_LIFECYCLE_TYPE,
  PDPP_LEGACY_AI_TRAINING_PURPOSE,
  PDPP_STOP_USE_BOUND_MS,
  InMemoryPdppHeldDataStateStore,
  InMemoryPdppLifecycleCredentials,
  InMemoryPdppSyncCopy,
  PdppDisclosureGate,
  PdppDisconnectScopeError,
  PdppGrantErasedError,
  PdppHeldDataManager,
  PdppHttpError,
  PdppLifecycleAgent,
  PdppProtocolError,
  PdppResourceClient,
  buildDataAccessDetail,
  buildLifecycleRecoveryRequest,
  discoverPdppAuthorizationServer,
  discoverPdppResourceServer,
  exchangeAuthorizationCode,
  interpretTokenResponse,
  parseLifecycleResponse,
  pdppHttpErrorFrom,
  refreshPdppToken,
  type PdppGrant,
  type PdppGrantRef,
  type PdppHeldDataStore,
  type PdppLifecycleAnswer,
} from "./index";

const ISSUER = "https://ps.example";
const LIFECYCLE = `${ISSUER}/pdpp/v1/grant-lifecycle`;
const REVOKE = `${ISSUER}/pdpp/v1/token/revoke`;
const H = 3_600_000;
const D = 24 * H;
const T0 = Date.parse("2026-11-01T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function grant(overrides: Partial<PdppGrant> = {}): PdppGrant {
  return {
    version: "0.1.0",
    grant_id: "grt_1",
    issued_at: iso(T0),
    subject: { id: "s" },
    client: { client_id: "c" },
    source: { kind: "connector", id: "src" },
    source_declaration: { version: "r" },
    purpose_code: "https://pdpp.dev/purpose/analytics",
    access_mode: "continuous",
    streams: [{ name: "st", instance_ids: ["i"], fields: ["id", "name"], required_fields: ["id"] }],
    retention: { max_duration: "P90D", on_expiry: "delete" },
    ...overrides,
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const page = (data: unknown[], extra: Record<string, unknown> = {}) =>
  json({ object: "list", has_more: false, next_changes_since: "cs_n", data, ...extra }, 200, { "PDPP-Version": "0.1" });
const rec = (id: string) => ({ object: "record", id, instance_id: "i", stream: "st", data: { id } });
const eraseAnswer = (assessedAt: number, readState = "revoked"): PdppLifecycleAnswer => ({
  grant_id: "grt_1",
  assessed_at: iso(assessedAt),
  read_state: readState as PdppLifecycleAnswer["read_state"],
  held_data: "erase",
  erasure: {
    instruction_id: "ers_1",
    accepted_at: iso(T0),
    effective_at: iso(T0),
    stop_use_by: iso(T0 + PDPP_STOP_USE_BOUND_MS),
  },
});

function clockAt(start = T0) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v), advance: (d: number) => (t += d) };
}

const ref: PdppGrantRef = { issuer: ISSUER, grantId: "grt_1" };

describe("F1: deliveries racing an erasure never write the copy back (Client item 22)", () => {
  async function inFlight(responses: Array<() => Promise<Response>>) {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: clock.now });
    const copy = new InMemoryPdppSyncCopy(clock.now);
    await manager.addStore(copy);
    const g = grant();
    manager.recordTokenResponse({ issuer: ISSUER, grant: g });
    let call = 0;
    const client = new PdppResourceClient({
      coreQueryBase: "https://ps.example/v1",
      accessToken: "at",
      issuedGrant: { issuer: ISSUER, grant: g },
      heldData: manager,
      fetch: () => responses[call++]!(),
    });
    return { manager, copy, client };
  }

  it("P1: an incremental session whose terminal page is empty does not restore the erased records", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { manager, copy, client } = await inFlight([
      async () => page([rec("r1"), rec("r2")]),
      async () => {
        await gate;
        return page([]);
      },
    ]);
    await client.sync("st", copy);
    const pending = client.sync("st", copy);
    await tick();
    await manager.ownerChoseDelete(ref);
    release();
    await expect(pending).rejects.toMatchObject({ reason: "grant_erased" });
    const context = { issuer: ISSUER, grantId: "grt_1", stream: "st" };
    expect(copy.records(context)).toEqual([]);
    expect(copy.syncToken(context)).toBeUndefined();
    expect(copy.holdsData(ref)).toBe(false);
  });

  it("F1: a multi-page session that straddles the erasure never commits", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { manager, copy, client } = await inFlight([
      async () => page([rec("r1")], { has_more: true, next_cursor: "pc_2", next_changes_since: undefined }),
      async () => {
        await gate;
        return page([]);
      },
    ]);
    const pending = client.sync("st", copy);
    await tick();
    await manager.ownerChoseDelete(ref);
    release();
    await expect(pending).rejects.toMatchObject({ reason: "grant_erased" });
    expect(copy.holdsData(ref)).toBe(false);
  });

  it("F1: the copy itself refuses to commit or apply in a session begun before an erase", () => {
    const copy = new InMemoryPdppSyncCopy();
    const session = copy.beginSession({ issuer: ISSUER, grantId: "grt_1", stream: "st" }, { replace: false });
    copy.erase(ref);
    expect(() => {
      session.apply(rec("r1") as never);
    }).toThrow(PdppGrantErasedError);
    expect(() => {
      session.commit("cs");
    }).toThrow(PdppGrantErasedError);
  });
});

describe("F2: every erase answer is applied (Client item 22; spec L1640, L1820)", () => {
  it.each([
    ["equal to", T0 + 5000],
    ["earlier than", T0 + 1000],
  ])("P2: an erase answer with assessed_at %s the last one records the instruction and stops use", async (_label, at) => {
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 + 10_000 });
    manager.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    await manager.recordAnswer(ref, manager.beginAttempt(ref), {
      grant_id: "grt_1",
      assessed_at: iso(T0 + 5000),
      read_state: "active",
      held_data: "permitted",
    });
    await manager.recordAnswer(ref, manager.beginAttempt(ref), eraseAnswer(at));
    expect(manager.erasureRecord(ref)?.instructionId).toBe("ers_1");
    expect(manager.checkUse(ref)).toEqual({ allowed: false, reason: "erased" });
  });

  it("P15: an erase answer with an unknown read_state is still applied", async () => {
    const [entry] = parseLifecycleResponse({ grants: [{ ...eraseAnswer(T0), read_state: "suspended" }] }, ["grt_1"]);
    expect(entry).toMatchObject({ kind: "answer", answer: { read_state: "unknown", held_data: "erase" } });
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    await manager.recordAnswer(ref, manager.beginAttempt(ref), (entry as { answer: PdppLifecycleAnswer }).answer);
    expect(manager.erasureRecord(ref)).toBeDefined();
  });
});

describe("F3: disconnect never reaches grants the owner did not choose (Client item 25; spec L2779, L2783)", () => {
  function twoGrantsOneToken() {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: clock.now });
    const credentials = new InMemoryPdppLifecycleCredentials(clock.now);
    const calls: Array<{ url: string; form: URLSearchParams }> = [];
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      revocationEndpoint: REVOKE,
      clientId: "c",
      credentials,
      fetch: async (url, init) => {
        const form = new URLSearchParams(String(init?.body));
        calls.push({ url: String(url), form });
        if (String(url) === REVOKE) return new Response(null, { status: 200 });
        return json({ grants: [{ ...eraseAnswer(clock.now()), grant_id: form.get("grant_id") }] });
      },
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          refresh_token: "rt_shared",
          authorization_details: [
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant({ grant_id: "grt_A" }) },
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant({ grant_id: "grt_B" }) },
          ],
        },
        ISSUER,
      ),
    );
    return { manager, agent, calls, A: { issuer: ISSUER, grantId: "grt_A" }, B: { issuer: ISSUER, grantId: "grt_B" } };
  }

  it("P3: delete of one grant uses the per-grant lifecycle write, never the shared refresh family", async () => {
    const { manager, agent, calls, A, B } = twoGrantsOneToken();
    expect(await agent.disconnect({ grants: [A], disposition: "delete" })).toEqual({ conveyed: true });
    expect(calls.some((c) => c.url === REVOKE)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.form.get("grant_id")).toBe("grt_A");
    expect(calls[0]!.form.get("pdpp_disposition")).toBe("delete");
    expect(manager.erasureRecord(B)).toBeUndefined();
    expect(manager.checkUse(B)).toEqual({ allowed: true });
  });

  it("F3: keep for part of a family is refused before anything changes", async () => {
    const { manager, agent, calls, A } = twoGrantsOneToken();
    await expect(agent.disconnect({ grants: [A], disposition: "keep" })).rejects.toBeInstanceOf(PdppDisconnectScopeError);
    expect(calls).toHaveLength(0);
    expect(manager.hasEnded(A)).toBe(false);
  });

  it("F3: disconnecting every grant of the family revokes it once", async () => {
    const { agent, calls, A, B } = twoGrantsOneToken();
    await agent.disconnect({ grants: [A, B], disposition: "keep" });
    expect(calls.map((c) => c.url)).toEqual([REVOKE]);
    expect(calls[0]!.form.get("pdpp_disposition")).toBe("keep");
  });
});

describe("F4: durable state across restarts (Client items 22, 23, 26; case C5a)", () => {
  it("P7: after a restart a redelivered instruction keeps its first receipt and deadline; a missed one is recorded", async () => {
    const clock = clockAt();
    const state = new InMemoryPdppHeldDataStateStore();
    let failing = true;
    const disk: PdppHeldDataStore = {
      holdsData: () => failing,
      erase: () => {
        if (failing) throw new Error("disk offline");
      },
    };
    const m1 = await PdppHeldDataManager.open({ state, now: clock.now });
    await m1.addStore(disk);
    await m1.recordAnswer(ref, m1.beginAttempt(ref), eraseAnswer(clock.now()));
    const first = { ...m1.erasureRecord(ref)! };
    expect(first.pending).toEqual(["store:0"]);

    clock.advance(31 * D); // the process was off past the deadline
    const m2 = await PdppHeldDataManager.open({ state, now: clock.now });
    expect(m2.erasureRecord(ref)!.firstReceiptAt).toBe(first.firstReceiptAt);
    failing = false;
    await m2.addStore(disk); // replays deletion state into the store
    await m2.recordAnswer(ref, m2.beginAttempt(ref), eraseAnswer(clock.now()));
    const after = m2.erasureRecord(ref)!;
    expect(after.firstReceiptAt).toBe(first.firstReceiptAt);
    expect(after.deleteBy).toBe(iso(T0 + PDPP_DELETION_BOUND_MS));
    expect(after.completedAt).toBe(iso(clock.now()));
    expect(after.missedDeadline).toBe(true);
    expect(m2.checkUse(ref)).toEqual({ allowed: false, reason: "erased" });
  });

  it("F4: an owner's delete made while the AS is offline survives a restart and is conveyed later", async () => {
    const clock = clockAt();
    const state = new InMemoryPdppHeldDataStateStore();
    let down = true;
    const calls: URLSearchParams[] = [];
    const credentials = new InMemoryPdppLifecycleCredentials(clock.now);
    const fetch: typeof globalThis.fetch = async (url, init) => {
      if (down) throw new TypeError("fetch failed");
      const form = new URLSearchParams(String(init?.body));
      calls.push(form);
      return String(url) === REVOKE ? new Response(null, { status: 200 }) : json({ grants: [eraseAnswer(clock.now())] });
    };
    const tokens = interpretTokenResponse(
      { access_token: "at", refresh_token: "rt", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: grant() }] },
      ISSUER,
    );
    const m1 = await PdppHeldDataManager.open({ state, now: clock.now });
    const a1 = new PdppLifecycleAgent({ manager: m1, lifecycleEndpoint: LIFECYCLE, revocationEndpoint: REVOKE, clientId: "c", credentials, fetch });
    a1.recordTokenResponse(tokens);
    const choseAt = clock.now();
    expect(await a1.disconnect({ grants: [ref], disposition: "delete" })).toEqual({ conveyed: false });
    // App quits; later it starts again and the AS is back.
    clock.advance(3 * D);
    down = false;
    const m2 = await PdppHeldDataManager.open({ state, now: clock.now });
    const a2 = new PdppLifecycleAgent({ manager: m2, lifecycleEndpoint: LIFECYCLE, revocationEndpoint: REVOKE, clientId: "c", credentials, fetch });
    expect(m2.erasureRecord(ref)!.firstReceiptAt).toBe(iso(choseAt));
    await a2.runDue();
    const conveyed = calls.find((f) => f.get("pdpp_disposition") === "delete")!;
    expect(conveyed.get("reported_at")).toBe(iso(choseAt));
    expect(m2.erasureRecord(ref)!.reports.conveyance).toBe("sent");
    expect(m2.erasureRecord(ref)!.deleteBy).toBe(iso(choseAt + PDPP_DELETION_BOUND_MS));
  });

  it("C5a: a wall clock below the saved high-water mark makes the clock uncertain until established", async () => {
    const clock = clockAt();
    const state = new InMemoryPdppHeldDataStateStore();
    const m1 = await PdppHeldDataManager.open({ state, now: clock.now });
    m1.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    await m1.flush();
    clock.advance(-D);
    const m2 = await PdppHeldDataManager.open({ state, now: clock.now });
    expect(m2.checkUse(ref)).toEqual({ allowed: false, reason: "clock_uncertain" });
    expect(m2.now()).toBe(T0);
    m2.establishClock();
    expect(m2.checkUse(ref)).toEqual({ allowed: true });
  });

  it("F4: assessments, acquisition time, legal hold, holders, derivatives and disclosure records come back after a restart", async () => {
    const clock = clockAt();
    const state = new InMemoryPdppHeldDataStateStore();
    const m1 = await PdppHeldDataManager.open({ state, now: clock.now });
    m1.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    m1.recordAcquisition(ref);
    await m1.recordLegalRetention(ref, { scope: "invoices", basis: "tax law", until: "unknown" });
    const terms = { purposeAndRetention: true, heldDataDuties: true, trainingRestriction: true, independentReuse: false };
    m1.registerDownstreamHolder(ref, { id: "backup", terms, relayErasure: () => undefined });
    await m1.registerDerivative({ id: "emb", inputs: [ref], erase: () => "deleted" });
    const gate1 = new PdppDisclosureGate(m1);
    await expect(gate1.release({ recipient: { kind: "party", id: "lender" }, inputs: [ref], content: "records" }, [], () => undefined)).rejects.toThrow();
    const nextAttempt = m1.nextAttemptAt(ref);
    await m1.flush();

    clock.advance(H);
    const m2 = await PdppHeldDataManager.open({ state, now: clock.now });
    expect(m2.checkUse(ref)).toEqual({ allowed: true });
    expect(m2.nextAttemptAt(ref)).toBe(nextAttempt);
    expect(new PdppDisclosureGate(m2).decisions()).toHaveLength(1);
    // The holder and derivative are known before the app registers them again: still held, relay pending.
    expect(m2.holdsData(ref)).toBe(true);
    await m2.ownerChoseDelete(ref);
    expect(m2.erasureRecord(ref)!.legalRetention).toMatchObject({ until: "unknown" });
    expect(m2.erasureRecord(ref)!.pending).toEqual(["derivative:emb", "holder:backup"]);
    const relayed: string[] = [];
    m2.registerDownstreamHolder(ref, { id: "backup", terms, relayErasure: (n) => void relayed.push(n.deleteBy) });
    await m2.registerDerivative({ id: "emb", inputs: [ref], erase: () => (relayed.push("emb"), "deleted") });
    await tick();
    expect(relayed).toEqual([m2.erasureRecord(ref)!.deleteBy, "emb"]);
    expect(m2.erasureRecord(ref)!.completedAt).toBeDefined();
  });

  it("F4 backups: a store restored with erased data is cleaned before it is usable", async () => {
    const m = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    await m.ownerChoseDelete(ref);
    const restored = new InMemoryPdppSyncCopy(() => T0);
    const s = restored.beginSession({ issuer: ISSUER, grantId: "grt_1", stream: "st" }, { replace: false });
    s.apply(rec("r1") as never);
    s.commit("cs");
    await m.replayDeletionState(restored);
    expect(restored.holdsData(ref)).toBe(false);
  });
});

describe("F5: retention runs without a use call (Client item 6)", () => {
  it("P9: runDue applies a P1D ceiling for an app that never calls ensureMayUse", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: clock.now });
    const copy = new InMemoryPdppSyncCopy(clock.now);
    await manager.addStore(copy);
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: async () => json({ grants: [{ grant_id: "grt_1", assessed_at: iso(clock.now()), read_state: "active", held_data: "permitted" }] }),
    });
    const g = grant({ retention: { max_duration: "P1D", on_expiry: "delete" } });
    agent.recordTokenResponse(interpretTokenResponse({ access_token: "at", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: g }] }, ISSUER));
    const s = copy.beginSession({ issuer: ISSUER, grantId: "grt_1", stream: "st" }, { replace: false });
    s.apply(rec("r1") as never);
    s.commit("cs");
    clock.advance(D + 1);
    await agent.runDue();
    expect(copy.records({ issuer: ISSUER, grantId: "grt_1", stream: "st" })).toEqual([]);
  });

  it("P4: a derivative with no known acquisition time counts as past its ceiling", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: clock.now });
    manager.recordTokenResponse({ issuer: ISSUER, grant: grant({ retention: { max_duration: "P1D", on_expiry: "delete" } }) });
    const erased: string[] = [];
    await manager.registerDerivative({ id: "emb", inputs: [ref], erase: (_r, why) => (erased.push(why), "deleted") });
    await manager.disposeDue(ref);
    expect(erased).toEqual(["retention"]);
  });
});

describe("F6: held-data wiring is the default path (Client items 9, 20)", () => {
  it("P8: a grant the manager knows was revoked gets no request from a new resource client", async () => {
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    const g = grant();
    manager.recordTokenResponse({ issuer: ISSUER, grant: g });
    await manager.recordAnswer(ref, manager.beginAttempt(ref), {
      grant_id: "grt_1",
      assessed_at: iso(T0 + 1),
      read_state: "revoked",
      ended_at: iso(T0),
      held_data: "permitted",
    });
    let requests = 0;
    const client = new PdppResourceClient({
      coreQueryBase: "https://ps.example/v1",
      accessToken: "at2",
      issuedGrant: { issuer: ISSUER, grant: g },
      heldData: manager,
      fetch: async () => {
        requests += 1;
        return page([rec("r1")]);
      },
    });
    await expect(client.listRecords("st")).rejects.toMatchObject({ reason: "grant_ended" });
    expect(requests).toBe(0);
  });

  it("P18: a refresh that fails with invalid_grant makes a lifecycle query due before further use", async () => {
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    manager.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    await expect(
      refreshPdppToken({
        metadata: { issuer: ISSUER, token_endpoint: `${ISSUER}/token` },
        refreshToken: "rt",
        clientId: "c",
        heldData: manager,
        grants: [ref],
        fetch: async () => json({ error: "invalid_grant" }, 400),
      }),
    ).rejects.toBeInstanceOf(PdppHttpError);
    expect(manager.checkUse(ref)).toEqual({ allowed: false, reason: "query_required" });
  });

  it("F6: a code exchange records its positive assessment without an extra call", async () => {
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    await exchangeAuthorizationCode({
      metadata: { issuer: ISSUER, token_endpoint: `${ISSUER}/token` },
      code: "c",
      codeVerifier: "v",
      clientId: "c",
      redirectUri: "https://app.example/cb",
      heldData: manager,
      fetch: async () => json({ access_token: "at", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: grant() }] }),
    });
    expect(manager.checkUse(ref)).toEqual({ allowed: true });
  });
});

describe("F7: endpoints from metadata are checked; tokens never follow redirects", () => {
  const metadata = (overrides: Record<string, unknown>) => ({
    issuer: ISSUER,
    token_endpoint: `${ISSUER}/token`,
    authorization_details_types_supported: [PDPP_DATA_ACCESS_TYPE],
    pdpp_grant_lifecycle_endpoint: `${ISSUER}/grant-lifecycle`,
    ...overrides,
  });

  it.each([
    ["link-local token endpoint", { token_endpoint: "http://169.254.169.254/latest/meta-data/" }],
    ["private lifecycle endpoint", { pdpp_grant_lifecycle_endpoint: "https://10.0.0.5/admin" }],
    ["non-https revocation endpoint", { revocation_endpoint: "file:///etc/passwd" }],
    ["another origin", { token_endpoint: "https://evil.example/token" }],
  ])("P14: refuses metadata with a %s", async (_label, overrides) => {
    await expect(discoverPdppAuthorizationServer(ISSUER, { fetch: async () => json(metadata(overrides)) })).rejects.toThrow(
      PdppProtocolError,
    );
  });

  it("F7: an explicitly allowed origin, and loopback http with allowLocal, are accepted", async () => {
    await expect(
      discoverPdppAuthorizationServer(ISSUER, {
        fetch: async () => json(metadata({ token_endpoint: "https://auth.example/token" })),
        policy: { allowedOrigins: ["https://auth.example"] },
      }),
    ).resolves.toMatchObject({ token_endpoint: "https://auth.example/token" });
    const local = "http://127.0.0.1:8080";
    await expect(
      discoverPdppAuthorizationServer(local, {
        fetch: async () => json({ ...metadata({}), issuer: local, token_endpoint: `${local}/token`, pdpp_grant_lifecycle_endpoint: `${local}/gl` }),
        policy: { allowLocal: true },
      }),
    ).resolves.toBeDefined();
    await expect(discoverPdppAuthorizationServer(local, { fetch: async () => json({}) })).rejects.toThrow(/https/);
  });

  it("F7: the RS core query base must stay on the resource origin", async () => {
    await expect(
      discoverPdppResourceServer("https://ps.example/", {
        fetch: async () => json({ resource: "https://ps.example/", pdpp_core_query_base: "http://127.0.0.1:2375/v1" }),
      }),
    ).rejects.toThrow(PdppProtocolError);
  });

  it("F7: every token-bearing request sets redirect: error and a timeout signal", async () => {
    const inits: RequestInit[] = [];
    const record: typeof globalThis.fetch = async (_url, init) => {
      inits.push(init!);
      return json({ grants: [{ grant_id: "grt_1", assessed_at: iso(T0), read_state: "active", held_data: "permitted" }] }, 200, {
        "PDPP-Version": "0.1",
      });
    };
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    const credentials = new InMemoryPdppLifecycleCredentials(() => T0);
    const agent = new PdppLifecycleAgent({ manager, lifecycleEndpoint: LIFECYCLE, clientId: "c", credentials, fetch: record });
    agent.recordTokenResponse(interpretTokenResponse({ access_token: "at", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: grant() }] }, ISSUER));
    await agent.query(ref);
    const client = new PdppResourceClient({
      coreQueryBase: "https://ps.example/v1",
      accessToken: "at",
      issuedGrant: { issuer: ISSUER, grant: grant() },
      heldData: manager,
      fetch: record,
    });
    await client.listStreams();
    await exchangeAuthorizationCode({
      metadata: { issuer: ISSUER, token_endpoint: `${ISSUER}/token` },
      code: "c",
      codeVerifier: "v",
      clientId: "c",
      redirectUri: "r",
      heldData: manager,
      fetch: async (_url, init) => {
        inits.push(init!);
        return json({ access_token: "at", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: grant() }] });
      },
    });
    expect(inits.map((i) => i.redirect)).toEqual(["error", "error", "error"]);
    expect(inits[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(inits[2]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("F7: server error text is bounded and stripped of control characters", async () => {
    const error = await pdppHttpErrorFrom(json({ error: "invalid_grant", error_description: `a\u0007b${"x".repeat(5000)}` }, 400));
    expect(error.message.length).toBeLessThan(330);
    expect(error.message).not.toMatch(/\u0007/);
    expect(error.message.startsWith("HTTP 400 invalid_grant: a b")).toBe(true);
  });
});

describe("F8, F9: runDue retries conveyances and reports; nothing waits for ever", () => {
  it("P5: a delete conveyed while the AS was down is sent by runDue once it is back", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: clock.now });
    const copy = new InMemoryPdppSyncCopy(clock.now);
    await manager.addStore(copy);
    let down = true;
    const forms: URLSearchParams[] = [];
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      revocationEndpoint: REVOKE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: async (url, init) => {
        if (down) throw new TypeError("fetch failed");
        forms.push(new URLSearchParams(String(init?.body)));
        return String(url) === REVOKE ? new Response(null, { status: 200 }) : json({ grants: [eraseAnswer(clock.now())] });
      },
    });
    agent.recordTokenResponse(
      interpretTokenResponse({ access_token: "at", refresh_token: "rt", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: grant() }] }, ISSUER),
    );
    expect(await agent.disconnect({ grants: [ref], disposition: "delete" })).toEqual({ conveyed: false });
    down = false;
    for (let day = 0; day < 3; day += 1) {
      clock.advance(D);
      await agent.runDue();
    }
    expect(forms.some((f) => f.get("pdpp_disposition") === "delete")).toBe(true);
    expect(manager.erasureRecord(ref)!.reports.conveyance).toBe("sent");
    expect(manager.erasureRecord(ref)!.asInstructionId).toBe("ers_1");
  });

  it("F8: after a delete by revocation, runDue learns the instruction id and asks for recovery to report completion", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: clock.now });
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      revocationEndpoint: REVOKE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: async (url, init) => {
        if (String(url) === REVOKE) return new Response(null, { status: 200 });
        const form = new URLSearchParams(String(init?.body));
        return form.has("report")
          ? json({ grants: [{ grant_id: "grt_1", error: "current_authentication_required" }] })
          : json({ grants: [eraseAnswer(clock.now())] });
      },
    });
    agent.recordTokenResponse(
      interpretTokenResponse({ access_token: "at", refresh_token: "rt", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: grant() }] }, ISSUER),
    );
    await agent.disconnect({ grants: [ref], disposition: "delete" });
    expect(manager.erasureRecord(ref)!.asInstructionId).toBeUndefined();
    clock.advance(H);
    await agent.runDue();
    expect(manager.erasureRecord(ref)!.asInstructionId).toBe("ers_1");
    expect(agent.grantsNeedingRecovery()).toEqual([ref]);
  });

  it("P12: ensureMayUse returns within its wait bound when the AS never answers", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: clock.now });
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: () => new Promise<Response>(() => undefined),
      useQueryWaitMs: 20,
    });
    agent.recordTokenResponse(interpretTokenResponse({ access_token: "at", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: grant({ retention: undefined }) }] }, ISSUER));
    manager.recordAcquisition(ref);
    clock.advance(25 * H);
    const started = Date.now();
    expect(await agent.ensureMayUse(ref)).toEqual({ allowed: true });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("F10–F12: lower-severity fixes", () => {
  it("P17 / Client 28: an erase from another issuer for the same grant_id leaves this issuer's copy alone", async () => {
    const copy = new InMemoryPdppSyncCopy(() => T0);
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    await manager.addStore(copy);
    const s = copy.beginSession({ issuer: "https://ps-a.example", grantId: "grt_1", stream: "st" }, { replace: false });
    s.apply(rec("victim") as never);
    s.commit("cs");
    const B = { issuer: "https://ps-evil.example", grantId: "grt_1" };
    await manager.recordAnswer(B, manager.beginAttempt(B), eraseAnswer(T0));
    expect(copy.holdsData({ issuer: "https://ps-a.example", grantId: "grt_1" })).toBe(true);
  });

  it("P6 / F11: flow-down terms changed after registration make the party independent again", () => {
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    manager.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    const terms = { purposeAndRetention: true, heldDataDuties: true, trainingRestriction: true, independentReuse: false };
    manager.registerDownstreamHolder(ref, { id: "llm", terms, relayErasure: () => undefined });
    terms.independentReuse = true;
    expect(new PdppDisclosureGate(manager).decide({ recipient: { kind: "party", id: "llm" }, inputs: [ref], content: "records" })).toMatchObject({
      allowed: false,
      reason: "independent_recipient",
    });
  });

  it("P11: a choseAt in the future is clamped to now", async () => {
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    await manager.ownerChoseDelete(ref, T0 + 365 * D);
    expect(manager.erasureRecord(ref)!.firstReceiptAt).toBe(iso(T0));
    expect(manager.erasureRecord(ref)!.deleteBy).toBe(iso(T0 + PDPP_DELETION_BOUND_MS));
  });

  it("P16: with no query credential the grant is flagged for lifecycle recovery", async () => {
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials: { queryToken: () => undefined, writeToken: () => undefined },
      fetch: async () => json({}),
    });
    manager.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    expect(await agent.query(ref)).toBe("failed");
    expect(agent.grantsNeedingRecovery()).toEqual([ref]);
  });

  it.each([
    ["Bearer error=invalid_token", true],
    ['Bearer realm="x", ERROR="invalid_token"', true],
    ['Bearer error="invalid_token_x"', false],
    ['Bearer error="insufficient_scope"', false],
  ])("P10: tokenInactive for %j is %s", (header, expected) => {
    expect(new PdppHttpError({ status: 401, message: "x", wwwAuthenticate: header }).tokenInactive).toBe(expected);
  });

  it("P19: builds the lifecycle recovery authorization request with only the recovery detail", () => {
    const request = buildLifecycleRecoveryRequest({ clientId: "c", redirectUri: "https://app.example/cb", codeChallenge: "x", grantIds: ["grt_1"] });
    expect(JSON.parse(request.query.get("authorization_details")!)).toEqual([{ type: PDPP_GRANT_LIFECYCLE_TYPE, grant_ids: ["grt_1"] }]);
    expect(request.json.authorization_details).toEqual([{ type: PDPP_GRANT_LIFECYCLE_TYPE, grant_ids: ["grt_1"] }]);
  });

  it("F12: a required-by-law send that throws is recorded as failed", async () => {
    const manager = new PdppHeldDataManager({ state: new InMemoryPdppHeldDataStateStore(), now: () => T0 });
    const gate = new PdppDisclosureGate(manager);
    await expect(
      gate.releaseRequiredByLaw({
        obligation: { binding: true, legalObligation: "order", recipient: "court", records: [{ instanceId: "i", id: "r1" }], fields: ["id"] },
        inputs: [ref],
        records: [{ instanceId: "i", id: "r1", data: { id: "r1" } }],
        send: () => {
          throw new Error("network");
        },
      }),
    ).rejects.toThrow("network");
    expect(gate.legalDisclosures()).toMatchObject([{ status: "failed", records: [{ instanceId: "i", id: "r1" }] }]);
  });

  it("Client 27: the withdrawn ai_training purpose code is not in Appendix A and needs a description", () => {
    expect(() =>
      buildDataAccessDetail({ source: { id: "s" }, purpose_code: PDPP_LEGACY_AI_TRAINING_PURPOSE, access_mode: "single_use", streams: [{ name: "a", fields: ["*"] }] }),
    ).toThrow(/purpose_description/);
  });
});
