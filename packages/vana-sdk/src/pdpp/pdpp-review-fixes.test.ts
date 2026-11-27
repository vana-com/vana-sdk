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
  type PdppHeldDataSnapshot,
  type PdppStateLogEntry,
  assertPdppEndpoint,
  fetchPdppMetadata,
  timeoutSignal,
  type PdppHeldDataEvent,
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
    streams: [
      {
        name: "st",
        instance_ids: ["i"],
        fields: ["id", "name"],
        required_fields: ["id"],
      },
    ],
    retention: { max_duration: "P90D", on_expiry: "delete" },
    ...overrides,
  };
}

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const page = (data: unknown[], extra: Record<string, unknown> = {}) =>
  json(
    {
      object: "list",
      has_more: false,
      next_changes_since: "cs_n",
      data,
      ...extra,
    },
    200,
    { "PDPP-Version": "0.1" },
  );
const rec = (id: string) => ({
  object: "record",
  id,
  instance_id: "i",
  stream: "st",
  data: { id },
});
const eraseAnswer = (
  assessedAt: number,
  readState = "revoked",
): PdppLifecycleAnswer => ({
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
  return {
    now: () => t,
    set: (v: number) => (t = v),
    advance: (d: number) => (t += d),
  };
}

const ref: PdppGrantRef = { issuer: ISSUER, grantId: "grt_1" };

describe("F1: deliveries racing an erasure never write the copy back (Client item 22)", () => {
  async function inFlight(responses: Array<() => Promise<Response>>) {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
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
      async () =>
        page([rec("r1")], {
          has_more: true,
          next_cursor: "pc_2",
          next_changes_since: undefined,
        }),
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
    const session = copy.beginSession(
      { issuer: ISSUER, grantId: "grt_1", stream: "st" },
      { replace: false },
    );
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
  ])(
    "P2: an erase answer with assessed_at %s the last one records the instruction and stops use",
    async (_label, at) => {
      const manager = new PdppHeldDataManager({
        state: new InMemoryPdppHeldDataStateStore(),
        now: () => T0 + 10_000,
      });
      manager.recordTokenResponse({ issuer: ISSUER, grant: grant() });
      await manager.recordAnswer(ref, manager.beginAttempt(ref), {
        grant_id: "grt_1",
        assessed_at: iso(T0 + 5000),
        read_state: "active",
        held_data: "permitted",
      });
      await manager.recordAnswer(
        ref,
        manager.beginAttempt(ref),
        eraseAnswer(at),
      );
      expect(manager.erasureRecord(ref)?.instructionId).toBe("ers_1");
      expect(manager.checkUse(ref)).toEqual({
        allowed: false,
        reason: "erased",
      });
    },
  );

  it("P15: an erase answer with an unknown read_state is still applied", async () => {
    const [entry] = parseLifecycleResponse(
      { grants: [{ ...eraseAnswer(T0), read_state: "suspended" }] },
      ["grt_1"],
    );
    expect(entry).toMatchObject({
      kind: "answer",
      answer: { read_state: "unknown", held_data: "erase" },
    });
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    await manager.recordAnswer(
      ref,
      manager.beginAttempt(ref),
      (entry as { answer: PdppLifecycleAnswer }).answer,
    );
    expect(manager.erasureRecord(ref)).toBeDefined();
  });
});

describe("F3: disconnect never reaches grants the owner did not choose (Client item 25; spec L2779, L2783)", () => {
  function twoGrantsOneToken() {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
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
        return json({
          grants: [
            { ...eraseAnswer(clock.now()), grant_id: form.get("grant_id") },
          ],
        });
      },
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          refresh_token: "rt_shared",
          authorization_details: [
            {
              type: PDPP_DATA_ACCESS_TYPE,
              grant: grant({ grant_id: "grt_A" }),
            },
            {
              type: PDPP_DATA_ACCESS_TYPE,
              grant: grant({ grant_id: "grt_B" }),
            },
          ],
        },
        ISSUER,
      ),
    );
    return {
      manager,
      agent,
      calls,
      A: { issuer: ISSUER, grantId: "grt_A" },
      B: { issuer: ISSUER, grantId: "grt_B" },
    };
  }

  it("P3: delete of one grant uses the per-grant lifecycle write, never the shared refresh family", async () => {
    const { manager, agent, calls, A, B } = twoGrantsOneToken();
    expect(
      await agent.disconnect({ grants: [A], disposition: "delete" }),
    ).toEqual({
      conveyed: true,
      results: [{ grant: A, disposition: "delete", state: "conveyed" }],
    });
    expect(calls.some((c) => c.url === REVOKE)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.form.get("grant_id")).toBe("grt_A");
    expect(calls[0]!.form.get("pdpp_disposition")).toBe("delete");
    expect(manager.erasureRecord(B)).toBeUndefined();
    expect(manager.checkUse(B)).toEqual({ allowed: true });
  });

  it("F3: keep for part of a family is refused before anything changes", async () => {
    const { manager, agent, calls, A } = twoGrantsOneToken();
    await expect(
      agent.disconnect({ grants: [A], disposition: "keep" }),
    ).rejects.toBeInstanceOf(PdppDisconnectScopeError);
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
      id: "disk",
      holdsData: () => failing,
      erase: () => {
        if (failing) throw new Error("disk offline");
      },
    };
    const m1 = await PdppHeldDataManager.open({ state, now: clock.now });
    await m1.addStore(disk);
    await m1.recordAnswer(ref, m1.beginAttempt(ref), eraseAnswer(clock.now()));
    const first = { ...m1.erasureRecord(ref)! };
    expect(first.pending).toEqual(["store:disk"]);

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
      return String(url) === REVOKE
        ? new Response(null, { status: 200 })
        : json({ grants: [eraseAnswer(clock.now())] });
    };
    const tokens = interpretTokenResponse(
      {
        access_token: "at",
        refresh_token: "rt",
        authorization_details: [
          { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
        ],
      },
      ISSUER,
    );
    const m1 = await PdppHeldDataManager.open({ state, now: clock.now });
    const a1 = new PdppLifecycleAgent({
      manager: m1,
      lifecycleEndpoint: LIFECYCLE,
      revocationEndpoint: REVOKE,
      clientId: "c",
      credentials,
      fetch,
    });
    a1.recordTokenResponse(tokens);
    const choseAt = clock.now();
    expect(
      await a1.disconnect({ grants: [ref], disposition: "delete" }),
    ).toMatchObject({
      conveyed: false,
      results: [{ grant: ref, disposition: "delete", state: "pending" }],
    });
    // App quits; later it starts again and the AS is back.
    clock.advance(3 * D);
    down = false;
    const m2 = await PdppHeldDataManager.open({ state, now: clock.now });
    const a2 = new PdppLifecycleAgent({
      manager: m2,
      lifecycleEndpoint: LIFECYCLE,
      revocationEndpoint: REVOKE,
      clientId: "c",
      credentials,
      fetch,
    });
    expect(m2.erasureRecord(ref)!.firstReceiptAt).toBe(iso(choseAt));
    await a2.runDue();
    const conveyed = calls.find((f) => f.get("pdpp_disposition") === "delete")!;
    expect(conveyed.get("reported_at")).toBe(iso(choseAt));
    expect(m2.erasureRecord(ref)!.reports.conveyance).toBe("sent");
    expect(m2.erasureRecord(ref)!.deleteBy).toBe(
      iso(choseAt + PDPP_DELETION_BOUND_MS),
    );
  });

  it("C5a: a wall clock below the saved high-water mark makes the clock uncertain until established", async () => {
    const clock = clockAt();
    const state = new InMemoryPdppHeldDataStateStore();
    const m1 = await PdppHeldDataManager.open({ state, now: clock.now });
    m1.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    await m1.flush();
    clock.advance(-D);
    const m2 = await PdppHeldDataManager.open({ state, now: clock.now });
    expect(m2.checkUse(ref)).toEqual({
      allowed: false,
      reason: "clock_uncertain",
    });
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
    await m1.recordLegalRetention(ref, {
      scope: "invoices",
      basis: "tax law",
      until: "unknown",
    });
    const terms = {
      purposeAndRetention: true,
      heldDataDuties: true,
      trainingRestriction: true,
      independentReuse: false,
    };
    m1.registerDownstreamHolder(ref, {
      id: "backup",
      terms,
      relayErasure: () => undefined,
    });
    await m1.registerDerivative({
      id: "emb",
      inputs: [ref],
      erase: () => "deleted",
    });
    const gate1 = new PdppDisclosureGate(m1);
    await expect(
      gate1.release(
        {
          recipient: { kind: "party", id: "lender" },
          inputs: [ref],
          content: "records",
        },
        [],
        () => undefined,
      ),
    ).rejects.toThrow();
    const nextAttempt = m1.nextAttemptAt(ref);
    await m1.flush();

    clock.advance(H);
    const m2 = await PdppHeldDataManager.open({ state, now: clock.now });
    expect(m2.checkUse(ref)).toEqual({ allowed: true });
    expect(m2.nextAttemptAt(ref)).toBe(nextAttempt);
    expect((await new PdppDisclosureGate(m2).history()).decisions).toHaveLength(
      1,
    );
    // The holder and derivative are known before the app registers them again: still held, relay pending.
    expect(m2.holdsData(ref)).toBe(true);
    await m2.ownerChoseDelete(ref);
    expect(m2.erasureRecord(ref)!.legalRetention).toMatchObject({
      until: "unknown",
    });
    expect(m2.erasureRecord(ref)!.pending).toEqual([
      "derivative:emb",
      "holder:backup",
    ]);
    const relayed: string[] = [];
    m2.registerDownstreamHolder(ref, {
      id: "backup",
      terms,
      relayErasure: (n) => void relayed.push(n.deleteBy),
    });
    await m2.registerDerivative({
      id: "emb",
      inputs: [ref],
      erase: () => (relayed.push("emb"), "deleted"),
    });
    await tick();
    expect(relayed).toEqual([m2.erasureRecord(ref)!.deleteBy, "emb"]);
    expect(m2.erasureRecord(ref)!.completedAt).toBeDefined();
  });

  it("F4 backups: a store restored with erased data is cleaned before it is usable", async () => {
    const m = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    await m.ownerChoseDelete(ref);
    const restored = new InMemoryPdppSyncCopy(() => T0);
    const s = restored.beginSession(
      { issuer: ISSUER, grantId: "grt_1", stream: "st" },
      { replace: false },
    );
    s.apply(rec("r1") as never);
    s.commit("cs");
    await m.replayDeletionState(restored);
    expect(restored.holdsData(ref)).toBe(false);
  });
});

describe("F5: retention runs without a use call (Client item 6)", () => {
  it("P9: runDue applies a P1D ceiling for an app that never calls ensureMayUse", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
    const copy = new InMemoryPdppSyncCopy(clock.now);
    await manager.addStore(copy);
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: async () =>
        json({
          grants: [
            {
              grant_id: "grt_1",
              assessed_at: iso(clock.now()),
              read_state: "active",
              held_data: "permitted",
            },
          ],
        }),
    });
    const g = grant({
      retention: { max_duration: "P1D", on_expiry: "delete" },
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: g }],
        },
        ISSUER,
      ),
    );
    const s = copy.beginSession(
      { issuer: ISSUER, grantId: "grt_1", stream: "st" },
      { replace: false },
    );
    s.apply(rec("r1") as never);
    s.commit("cs");
    clock.advance(D + 1);
    await agent.runDue();
    expect(
      copy.records({ issuer: ISSUER, grantId: "grt_1", stream: "st" }),
    ).toEqual([]);
  });

  it("P4: a derivative with no known acquisition time counts as past its ceiling", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
    manager.recordTokenResponse({
      issuer: ISSUER,
      grant: grant({ retention: { max_duration: "P1D", on_expiry: "delete" } }),
    });
    const erased: string[] = [];
    await manager.registerDerivative({
      id: "emb",
      inputs: [ref],
      erase: (_r, why) => (erased.push(why), "deleted"),
    });
    await manager.disposeDue(ref);
    expect(erased).toEqual(["retention"]);
  });
});

describe("F6: held-data wiring is the default path (Client items 9, 20)", () => {
  it("P8: a grant the manager knows was revoked gets no request from a new resource client", async () => {
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
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
    await expect(client.listRecords("st")).rejects.toMatchObject({
      reason: "grant_ended",
    });
    expect(requests).toBe(0);
  });

  it("P18: a refresh that fails with invalid_grant makes a lifecycle query due before further use", async () => {
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
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
    expect(manager.checkUse(ref)).toEqual({
      allowed: false,
      reason: "query_required",
    });
  });

  it("F6: a code exchange records its positive assessment without an extra call", async () => {
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    await exchangeAuthorizationCode({
      metadata: { issuer: ISSUER, token_endpoint: `${ISSUER}/token` },
      code: "c",
      codeVerifier: "v",
      clientId: "c",
      redirectUri: "https://app.example/cb",
      heldData: manager,
      fetch: async () =>
        json({
          access_token: "at",
          authorization_details: [
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
          ],
        }),
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
    [
      "link-local token endpoint",
      { token_endpoint: "http://169.254.169.254/latest/meta-data/" },
    ],
    [
      "private lifecycle endpoint",
      { pdpp_grant_lifecycle_endpoint: "https://10.0.0.5/admin" },
    ],
    [
      "non-https revocation endpoint",
      { revocation_endpoint: "file:///etc/passwd" },
    ],
    ["another origin", { token_endpoint: "https://evil.example/token" }],
  ])("P14: refuses metadata with a %s", async (_label, overrides) => {
    await expect(
      discoverPdppAuthorizationServer(ISSUER, {
        fetch: async () => json(metadata(overrides)),
      }),
    ).rejects.toThrow(PdppProtocolError);
  });

  it("F7: an explicitly allowed origin, and loopback http with allowLocal, are accepted", async () => {
    await expect(
      discoverPdppAuthorizationServer(ISSUER, {
        fetch: async () =>
          json(metadata({ token_endpoint: "https://auth.example/token" })),
        policy: { allowedOrigins: ["https://auth.example"] },
      }),
    ).resolves.toMatchObject({ token_endpoint: "https://auth.example/token" });
    const local = "http://127.0.0.1:8080";
    await expect(
      discoverPdppAuthorizationServer(local, {
        fetch: async () =>
          json({
            ...metadata({}),
            issuer: local,
            token_endpoint: `${local}/token`,
            pdpp_grant_lifecycle_endpoint: `${local}/gl`,
          }),
        policy: { allowLocal: true },
      }),
    ).resolves.toBeDefined();
    // Review NEW-5: the configured local issuer is fine, but metadata naming another local host is refused.
    await expect(
      discoverPdppAuthorizationServer(local, {
        fetch: async () =>
          json({
            ...metadata({}),
            issuer: local,
            token_endpoint: "http://127.0.0.1:9999/token",
            pdpp_grant_lifecycle_endpoint: `${local}/gl`,
          }),
        policy: { allowLocal: true },
      }),
    ).rejects.toThrow(/not on http:\/\/127\.0\.0\.1:8080/);
  });

  it("F7: the RS core query base must stay on the resource origin", async () => {
    await expect(
      discoverPdppResourceServer("https://ps.example/", {
        fetch: async () =>
          json({
            resource: "https://ps.example/",
            pdpp_core_query_base: "http://127.0.0.1:2375/v1",
          }),
      }),
    ).rejects.toThrow(PdppProtocolError);
  });

  it("F7: every token-bearing request sets redirect: error and a timeout signal", async () => {
    const inits: RequestInit[] = [];
    const record: typeof globalThis.fetch = async (_url, init) => {
      inits.push(init!);
      return json(
        {
          grants: [
            {
              grant_id: "grt_1",
              assessed_at: iso(T0),
              read_state: "active",
              held_data: "permitted",
            },
          ],
        },
        200,
        {
          "PDPP-Version": "0.1",
        },
      );
    };
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    const credentials = new InMemoryPdppLifecycleCredentials(() => T0);
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials,
      fetch: record,
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          authorization_details: [
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
          ],
        },
        ISSUER,
      ),
    );
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
        return json({
          access_token: "at",
          authorization_details: [
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
          ],
        });
      },
    });
    expect(inits.map((i) => i.redirect)).toEqual(["error", "error", "error"]);
    expect(inits[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(inits[2]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("F7: server error text is bounded and stripped of control characters", async () => {
    const error = await pdppHttpErrorFrom(
      json(
        {
          error: "invalid_grant",
          error_description: `a\u0007b${"x".repeat(5000)}`,
        },
        400,
      ),
    );
    expect(error.message.length).toBeLessThan(330);
    expect(error.message).not.toMatch(/\u0007/);
    expect(error.message.startsWith("HTTP 400 invalid_grant: a b")).toBe(true);
  });
});

describe("F8, F9: runDue retries conveyances and reports; nothing waits for ever", () => {
  it("P5: a delete conveyed while the AS was down is sent by runDue once it is back", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
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
        return String(url) === REVOKE
          ? new Response(null, { status: 200 })
          : json({ grants: [eraseAnswer(clock.now())] });
      },
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          refresh_token: "rt",
          authorization_details: [
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
          ],
        },
        ISSUER,
      ),
    );
    expect(
      await agent.disconnect({ grants: [ref], disposition: "delete" }),
    ).toMatchObject({
      conveyed: false,
      results: [{ grant: ref, disposition: "delete", state: "pending" }],
    });
    down = false;
    for (let day = 0; day < 3; day += 1) {
      clock.advance(D);
      await agent.runDue();
    }
    expect(forms.some((f) => f.get("pdpp_disposition") === "delete")).toBe(
      true,
    );
    expect(manager.erasureRecord(ref)!.reports.conveyance).toBe("sent");
    expect(manager.erasureRecord(ref)!.asInstructionId).toBe("ers_1");
  });

  it("F8: after a delete by revocation, runDue learns the instruction id and asks for recovery to report completion", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
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
          ? json({
              grants: [
                { grant_id: "grt_1", error: "current_authentication_required" },
              ],
            })
          : json({ grants: [eraseAnswer(clock.now())] });
      },
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          refresh_token: "rt",
          authorization_details: [
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
          ],
        },
        ISSUER,
      ),
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
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: () => new Promise<Response>(() => undefined),
      useQueryWaitMs: 20,
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          authorization_details: [
            {
              type: PDPP_DATA_ACCESS_TYPE,
              grant: grant({ retention: undefined }),
            },
          ],
        },
        ISSUER,
      ),
    );
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
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    await manager.addStore(copy);
    const s = copy.beginSession(
      { issuer: "https://ps-a.example", grantId: "grt_1", stream: "st" },
      { replace: false },
    );
    s.apply(rec("victim") as never);
    s.commit("cs");
    const B = { issuer: "https://ps-evil.example", grantId: "grt_1" };
    await manager.recordAnswer(B, manager.beginAttempt(B), eraseAnswer(T0));
    expect(
      copy.holdsData({ issuer: "https://ps-a.example", grantId: "grt_1" }),
    ).toBe(true);
  });

  it("P6 / F11: flow-down terms changed after registration make the party independent again", () => {
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    manager.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    const terms = {
      purposeAndRetention: true,
      heldDataDuties: true,
      trainingRestriction: true,
      independentReuse: false,
    };
    manager.registerDownstreamHolder(ref, {
      id: "llm",
      terms,
      relayErasure: () => undefined,
    });
    terms.independentReuse = true;
    expect(
      new PdppDisclosureGate(manager).decide({
        recipient: { kind: "party", id: "llm" },
        inputs: [ref],
        content: "records",
      }),
    ).toMatchObject({
      allowed: false,
      reason: "independent_recipient",
    });
  });

  it("P11: a choseAt in the future is clamped to now", async () => {
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    await manager.ownerChoseDelete(ref, T0 + 365 * D);
    expect(manager.erasureRecord(ref)!.firstReceiptAt).toBe(iso(T0));
    expect(manager.erasureRecord(ref)!.deleteBy).toBe(
      iso(T0 + PDPP_DELETION_BOUND_MS),
    );
  });

  it("P16: with no query credential the grant is flagged for lifecycle recovery", async () => {
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
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
    expect(
      new PdppHttpError({ status: 401, message: "x", wwwAuthenticate: header })
        .tokenInactive,
    ).toBe(expected);
  });

  it("P19: builds the lifecycle recovery authorization request with only the recovery detail", () => {
    const request = buildLifecycleRecoveryRequest({
      clientId: "c",
      redirectUri: "https://app.example/cb",
      codeChallenge: "x",
      grantIds: ["grt_1"],
    });
    expect(JSON.parse(request.query.get("authorization_details")!)).toEqual([
      { type: PDPP_GRANT_LIFECYCLE_TYPE, grant_ids: ["grt_1"] },
    ]);
    expect(request.json.authorization_details).toEqual([
      { type: PDPP_GRANT_LIFECYCLE_TYPE, grant_ids: ["grt_1"] },
    ]);
  });

  it("F12: a required-by-law send that throws is recorded as failed", async () => {
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    const gate = new PdppDisclosureGate(manager);
    await expect(
      gate.releaseRequiredByLaw({
        obligation: {
          binding: true,
          legalObligation: "order",
          recipient: "court",
          records: [{ instanceId: "i", id: "r1" }],
          fields: ["id"],
        },
        inputs: [ref],
        records: [{ instanceId: "i", id: "r1", data: { id: "r1" } }],
        send: () => {
          throw new Error("network");
        },
      }),
    ).rejects.toThrow("network");
    expect(gate.legalDisclosures()).toMatchObject([
      { status: "failed", records: [{ instanceId: "i", id: "r1" }] },
    ]);
  });

  it("Client 27: the withdrawn ai_training purpose code is not in Appendix A and needs a description", () => {
    expect(() =>
      buildDataAccessDetail({
        source: { id: "s" },
        purpose_code: PDPP_LEGACY_AI_TRAINING_PURPOSE,
        access_mode: "single_use",
        streams: [{ name: "a", fields: ["*"] }],
      }),
    ).toThrow(/purpose_description/);
  });
});

describe("Round 2 (WP8-r2)", () => {
  function failingStore() {
    const box = { failing: true, held: true };
    const store: PdppHeldDataStore = {
      id: "app-db",
      holdsData: () => box.held,
      erase: () => {
        if (box.failing) throw new Error("disk offline");
        box.held = false;
      },
    };
    return { box, store };
  }

  it("R2-1 / N-c: after a restart, runDue and ensureMayUse before addStore never mark or report the erasure complete", async () => {
    const clock = clockAt();
    const state = new InMemoryPdppHeldDataStateStore();
    const { box, store } = failingStore();
    const m1 = await PdppHeldDataManager.open({ state, now: clock.now });
    await m1.addStore(store);
    await m1.recordAnswer(ref, m1.beginAttempt(ref), eraseAnswer(clock.now()));
    expect(m1.erasureRecord(ref)!.pending).toEqual(["store:app-db"]);

    clock.advance(31 * D);
    box.failing = false;
    const forms: URLSearchParams[] = [];
    const m2 = await PdppHeldDataManager.open({ state, now: clock.now });
    const credentials = new InMemoryPdppLifecycleCredentials(clock.now);
    credentials.recordRecoveryToken(ISSUER, {
      accessToken: "lt",
      grantIds: ["grt_1"],
    });
    const agent = new PdppLifecycleAgent({
      manager: m2,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials,
      fetch: async (_url, init) => {
        const form = new URLSearchParams(String(init?.body));
        forms.push(form);
        return json({ grants: [eraseAnswer(clock.now())] });
      },
    });
    expect(m2.missingStores()).toEqual(["app-db"]);
    await agent.runDue();
    expect(await agent.ensureMayUse(ref)).toEqual({
      allowed: false,
      reason: "erased",
    });
    let record = m2.erasureRecord(ref)!;
    expect(record.completedAt).toBeUndefined();
    expect(record.pending).toEqual(["store:app-db"]);
    expect(record.reports.completed).toBe("not_needed");
    expect(forms.some((f) => f.get("report") === "completed")).toBe(false);
    expect(box.held).toBe(true);

    await m2.addStore(store); // the app opens its database
    record = m2.erasureRecord(ref)!;
    expect(box.held).toBe(false);
    expect(record.completedAt).toBe(iso(clock.now()));
    expect(record.missedDeadline).toBe(true);
    expect(record.reports.completed).toBe("pending");
  });

  it("R2-1: a retired store no longer blocks completion; duplicate or missing ids are refused", async () => {
    const state = new InMemoryPdppHeldDataStateStore();
    const { store } = failingStore();
    const m1 = await PdppHeldDataManager.open({ state, now: () => T0 });
    await m1.addStore(store);
    await m1.recordAnswer(ref, m1.beginAttempt(ref), eraseAnswer(T0));
    const m2 = await PdppHeldDataManager.open({ state, now: () => T0 + H });
    await m2.retireStore("app-db"); // the app deleted that database file
    expect(m2.erasureRecord(ref)!.completedAt).toBeDefined();
    const m3 = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
    });
    await m3.addStore(new InMemoryPdppSyncCopy());
    await expect(m3.addStore(new InMemoryPdppSyncCopy())).rejects.toThrow(
      /already registered/,
    );
    await expect(
      m3.addStore({ id: "", holdsData: () => false, erase: () => undefined }),
    ).rejects.toThrow(/stable id/);
  });

  it.each([
    "https://[::ffff:10.0.0.5]/x",
    "https://[::ffff:127.0.0.1]/x",
    "https://[64:ff9b::a00:5]/x",
    "https://[64:ff9b:1::a9fe:a9fe]/x",
    "https://[::a00:5]/x",
    "https://[::]/x",
    "https://localhost./x",
    "https://metadata.google.internal/x",
    "https://printer.local/x",
  ])("R2-2: refuses the local or private literal %s", (url) => {
    // Named by metadata on an allowed origin, not the configured one: the literal check applies.
    expect(() =>
      assertPdppEndpoint(url, "https://ps.example", "endpoint", {
        allowedOrigins: [new URL(url).origin],
      }),
    ).toThrow(PdppProtocolError);
  });

  it.each([
    "https://[::ffff:8.8.8.8]/x",
    "https://[2001:db8::1]/x",
    "https://ps.example./x",
  ])("R2-2: accepts the public host %s", (url) => {
    expect(assertPdppEndpoint(url, url, "endpoint")).toBe(
      new URL(url).toString(),
    );
  });

  it("R2-3: each release appends one bounded log entry; the snapshot does not grow; history survives a restart", async () => {
    const state = new InMemoryPdppHeldDataStateStore();
    const manager = await PdppHeldDataManager.open({
      state,
      now: () => T0,
      recentLogLimit: 100,
    });
    manager.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    await manager.flush();
    const gate = new PdppDisclosureGate(manager);
    const owner = {
      kind: "owner_destination" as const,
      destination: "mailto:o@example.com",
      ownerControlled: true,
      designatedByOwner: true,
    };
    const before = state.bytesWritten;
    for (let i = 0; i < 2000; i += 1) {
      await gate.release(
        { recipient: owner, inputs: [ref], content: "summary" },
        i,
        () => undefined,
      );
    }
    const perRelease = (state.bytesWritten - before) / 2000;
    expect(perRelease).toBeLessThan(400);
    expect(
      JSON.stringify(state.load() as PdppHeldDataSnapshot).length,
    ).toBeLessThan(5000);
    expect(gate.decisions()).toHaveLength(100);
    const restarted = await PdppHeldDataManager.open({ state, now: () => T0 });
    expect(
      (await new PdppDisclosureGate(restarted).history()).decisions,
    ).toHaveLength(2000);
  });

  it("R2-4: a failed save of an erase answer is surfaced, not counted as a transport failure, and stop-use holds", async () => {
    let broken = true;
    const errors: unknown[] = [];
    const inner = new InMemoryPdppHeldDataStateStore();
    const state = {
      load: () => inner.load(),
      save: (snapshot: PdppHeldDataSnapshot) => {
        if (broken) throw new Error("disk full");
        inner.save(snapshot);
      },
      appendLog: (entry: PdppStateLogEntry) => {
        inner.appendLog(entry);
      },
      readLog: () => inner.readLog(),
    };
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state,
      now: clock.now,
      onPersistError: (e) => errors.push(e),
    });
    const credentials = new InMemoryPdppLifecycleCredentials(clock.now);
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials,
      fetch: async () => json({ grants: [eraseAnswer(clock.now())] }),
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          authorization_details: [
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
          ],
        },
        ISSUER,
      ),
    );
    const signal = manager.useSignal(ref);
    expect(await agent.query(ref)).toBe("answered");
    expect(errors.length).toBeGreaterThan(0);
    expect(signal.aborted).toBe(true);
    expect(manager.checkUse(ref)).toEqual({ allowed: false, reason: "erased" });
    expect(manager.nextAttemptAt(ref)).toBe(clock.now() + 24 * H); // a success, not a failure
    broken = false;
    await agent.runDue();
    expect(manager.lastPersistError).toBeUndefined();
    expect(inner.load()!.grants[0]!.erasure?.instructionId).toBe("ers_1");
  });

  it("R2-5: with no query credential use stops until a query succeeds", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
    let token: string | undefined;
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials: {
        queryToken: () => (token ? { token } : undefined),
        writeToken: () => undefined,
      },
      fetch: async () =>
        json({
          grants: [
            {
              grant_id: "grt_1",
              assessed_at: iso(clock.now()),
              read_state: "active",
              held_data: "permitted",
            },
          ],
        }),
    });
    manager.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    expect(await agent.query(ref)).toBe("failed");
    expect(manager.checkUse(ref)).toEqual({
      allowed: false,
      reason: "recovery_required",
    });
    token = "lt_recovery"; // the owner approved lifecycle recovery
    clock.advance(2 * H);
    expect(await agent.query(ref)).toBe("answered");
    expect(manager.checkUse(ref)).toEqual({ allowed: true });
  });
});

describe("Round 3 (WP8-r3)", () => {
  it("R3-c: addStore replays deletions even when its save fails, and a retry with the same store succeeds", async () => {
    let broken = true;
    const errors: unknown[] = [];
    const inner = new InMemoryPdppHeldDataStateStore();
    const state = {
      load: () => inner.load(),
      save: (snapshot: PdppHeldDataSnapshot) => {
        if (broken) throw new Error("disk full");
        inner.save(snapshot);
      },
      appendLog: (entry: PdppStateLogEntry) => {
        inner.appendLog(entry);
      },
      readLog: () => inner.readLog(),
    };
    const manager = new PdppHeldDataManager({
      state,
      now: () => T0,
      onPersistError: (e) => errors.push(e),
    });
    await manager.ownerChoseDelete(ref).catch(() => undefined); // the record's save fails too; erasure still applies
    const restored = new InMemoryPdppSyncCopy(() => T0, { id: "restored" });
    const s = restored.beginSession(
      { issuer: ISSUER, grantId: "grt_1", stream: "st" },
      { replace: false },
    );
    s.apply(rec("r1") as never);
    s.commit("cs");
    await expect(manager.addStore(restored)).rejects.toThrow(
      /could not be saved/,
    );
    expect(restored.holdsData(ref)).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
    broken = false;
    await expect(manager.addStore(restored)).resolves.toBeUndefined();
    expect(inner.load()!.storeIds).toEqual(["restored"]);
    await expect(
      manager.addStore(new InMemoryPdppSyncCopy(() => T0, { id: "restored" })),
    ).rejects.toThrow(/already registered/);
  });

  it("R3-e: for one grant of a shared refresh family the disconnect offer has delete only, and says why", () => {
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      revocationEndpoint: REVOKE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(() => T0),
      fetch: async () => json({}),
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          refresh_token: "rt_shared",
          authorization_details: [
            {
              type: PDPP_DATA_ACCESS_TYPE,
              grant: grant({ grant_id: "grt_A" }),
            },
            {
              type: PDPP_DATA_ACCESS_TYPE,
              grant: grant({ grant_id: "grt_B" }),
            },
          ],
        },
        ISSUER,
      ),
    );
    const A = { issuer: ISSUER, grantId: "grt_A" };
    const B = { issuer: ISSUER, grantId: "grt_B" };
    const one = agent.describeDisconnect([A]);
    expect(one.choices.map((c) => c.value)).toEqual(["delete"]);
    expect(one.preselected).toBeNull();
    expect(one.statement).toMatch(/approved together with other sources/);
    expect(one.statement).toMatch(/Vana account/);
    expect(
      agent.describeDisconnect([A, B]).choices.map((c) => c.value),
    ).toEqual(["keep", "delete"]);
  });

  it.each([
    "https://[2002:a00:5::1]/x",
    "https://[2002:7f00:1::]/x",
    "https://[2001:0:a00:1::1]/x",
    "https://[2001:0:808:808:0:0:80ff:fffe]/x",
  ])(
    "R3-f: refuses the 6to4 or Teredo literal %s that embeds a private or local IPv4",
    (url) => {
      // Named by metadata on an allowed origin, not the configured one: the literal check applies.
      expect(() =>
        assertPdppEndpoint(url, "https://ps.example", "endpoint", {
          allowedOrigins: [new URL(url).origin],
        }),
      ).toThrow(PdppProtocolError);
    },
  );

  it.each([
    "https://[2002:808:808::1]/x",
    "https://[2001:0:808:808:0:0:f7f7:f7f7]/x",
  ])(
    "R3-f: accepts the 6to4 or Teredo literal %s that embeds only public IPv4",
    (url) => {
      expect(assertPdppEndpoint(url, url, "endpoint")).toBe(
        new URL(url).toString(),
      );
    },
  );
});

describe("Trade-off sweep (NEW-1 to NEW-7)", () => {
  const lan = "http://192.168.1.20:8080";
  const lanMetadata = (overrides: Record<string, unknown> = {}) => ({
    issuer: `${lan}/pdpp/v1`,
    token_endpoint: `${lan}/pdpp/v1/token`,
    authorization_details_types_supported: [PDPP_DATA_ACCESS_TYPE],
    pdpp_grant_lifecycle_endpoint: `${lan}/pdpp/v1/grant-lifecycle`,
    ...overrides,
  });

  it.each([
    ["a LAN Personal Server over https", "https://192.168.1.20:8443"],
    ["a tailscale address over http", "http://100.101.102.103:8080"],
    ["localhost over http", "http://localhost:8080"],
    ["a .local name over https", "https://vana-ps.local"],
  ])(
    "F-SDK-3: %s works as the configured issuer only with allowLocal",
    async (_label, origin) => {
      const issuer = `${origin}/pdpp/v1`;
      const md = {
        ...lanMetadata(),
        issuer,
        token_endpoint: `${issuer}/token`,
        pdpp_grant_lifecycle_endpoint: `${issuer}/grant-lifecycle`,
      };
      await expect(
        discoverPdppAuthorizationServer(issuer, {
          fetch: async () => json(md),
        }),
      ).rejects.toThrow(/local or private host; Desktop and self-hosted/);
      await expect(
        discoverPdppAuthorizationServer(issuer, {
          fetch: async () => json(md),
          policy: { allowLocal: true },
        }),
      ).resolves.toMatchObject({ issuer });
    },
  );

  it("F-SDK-3: with allowLocal, metadata naming another local host is still refused; a public host still needs https", async () => {
    await expect(
      discoverPdppAuthorizationServer(`${lan}/pdpp/v1`, {
        fetch: async () =>
          json(lanMetadata({ token_endpoint: "http://192.168.1.21/token" })),
        policy: { allowLocal: true, allowInsecureLan: true },
      }),
    ).rejects.toThrow(/not on http:\/\/192\.168\.1\.20:8080/);
    await expect(
      discoverPdppAuthorizationServer("http://ps.example/pdpp/v1", {
        fetch: async () => json({}),
      }),
    ).rejects.toThrow(/https/);
  });

  it("NEW-5: metadata fetches follow a same-host path redirect or an http→https upgrade, nothing else", async () => {
    const hop = (from: string, to: string) => (url: string) =>
      url === from
        ? new Response(null, { status: 308, headers: { Location: to } })
        : undefined;
    const serve =
      (
        ...rules: Array<(url: string) => Response | undefined>
      ): typeof globalThis.fetch =>
      async (input, init) => {
        expect(init?.redirect).toBe("manual");
        for (const rule of rules) {
          const r = rule(String(input));
          if (r) return r;
        }
        return json({ ok: String(input) });
      };
    const path = await fetchPdppMetadata(
      `${lan}/a`,
      serve(hop(`${lan}/a`, "/b")),
    );
    expect(await path.json()).toEqual({ ok: `${lan}/b` });
    const upgrade = await fetchPdppMetadata(
      "http://ps.example/a",
      serve(hop("http://ps.example/a", "https://ps.example/a")),
    );
    expect(await upgrade.json()).toEqual({ ok: "https://ps.example/a" });
    await expect(
      fetchPdppMetadata(
        `${lan}/a`,
        serve(hop(`${lan}/a`, "http://10.0.0.5/a")),
      ),
    ).rejects.toThrow(/leaves the configured host/);
    await expect(
      fetchPdppMetadata(
        "https://ps.example/a",
        serve(hop("https://ps.example/a", "http://ps.example/a")),
      ),
    ).rejects.toThrow(/leaves the configured host/);
    const loop: typeof globalThis.fetch = async (input) =>
      new Response(null, {
        status: 302,
        headers: { Location: `${String(input)}x` },
      });
    await expect(fetchPdppMetadata(`${lan}/a`, loop)).rejects.toThrow(
      /too many redirects/,
    );
  });

  it("NEW-7: timeoutSignal falls back to a manual AbortController where AbortSignal.timeout is missing", async () => {
    const original = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true,
    });
    try {
      const signal = timeoutSignal(10)!;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
      await new Promise((r) => setTimeout(r, 30));
      expect(signal.aborted).toBe(true);
    } finally {
      if (original) Object.defineProperty(AbortSignal, "timeout", original);
    }
  });

  function rsClient(
    fetch: typeof globalThis.fetch,
    extra: { requestTimeoutMs?: number; maxSyncPages?: number } = {},
  ) {
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
    });
    return new PdppResourceClient({
      coreQueryBase: "https://ps.example/v1",
      accessToken: "at",
      issuedGrant: { issuer: ISSUER, grant: grant() },
      heldData: manager,
      fetch,
      ...extra,
    });
  }

  it("NEW-7: each RS request is bounded by a timeout", async () => {
    const hanging: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal!.reason as Error);
        });
      });
    await expect(
      rsClient(hanging, { requestTimeoutMs: 20 }).listRecords("st"),
    ).rejects.toThrow(/timed out|abort/i);
  });

  it("NEW-7: a sync session that never ends is stopped by the page cap, and a repeated cursor by the progress check", async () => {
    let n = 0;
    const endless: typeof globalThis.fetch = async () =>
      page([rec(`r${n}`)], {
        has_more: true,
        next_cursor: `pc_${++n}`,
        next_changes_since: undefined,
      });
    const copy = new InMemoryPdppSyncCopy(() => T0);
    await expect(
      rsClient(endless, { maxSyncPages: 5 }).sync("st", copy),
    ).rejects.toThrow(/exceeded 5 pages/);
    expect(copy.holdsData(ref)).toBe(false);
    const stuck: typeof globalThis.fetch = async () =>
      page([rec("r")], {
        has_more: true,
        next_cursor: "pc_same",
        next_changes_since: undefined,
      });
    await expect(
      rsClient(stuck).sync("st", new InMemoryPdppSyncCopy(() => T0)),
    ).rejects.toThrow(/no progress/);
  });

  it("NEW-4: a hung store erase times out, stays pending, raises an event, and does not block other grants", async () => {
    const events: PdppHeldDataEvent[] = [];
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
      eraseTimeoutMs: 20,
      onEvent: (e) => events.push(e),
    });
    const hungFor = new Set(["grt_1"]);
    await manager.addStore({
      id: "slow-db",
      holdsData: () => true,
      erase: (r) =>
        hungFor.has(r.grantId) ? new Promise<void>(() => undefined) : undefined,
    });
    const other = { issuer: ISSUER, grantId: "grt_2" };
    const started = Date.now();
    await manager.ownerChoseDelete(ref);
    await manager.ownerChoseDelete(other);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(manager.erasureRecord(ref)!.pending).toEqual(["store:slow-db"]);
    expect(manager.erasureRecord(other)!.completedAt).toBeDefined();
    expect(events).toContainEqual({
      type: "erase_timeout",
      grant: ref,
      target: "store:slow-db",
      ms: 20,
    });
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: async () => json({}),
    });
    const t = Date.now();
    await agent.runDue();
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it("NEW-2: a keep whose revocation fails is queued and retried by runDue; results are per grant", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
    const credentials = new InMemoryPdppLifecycleCredentials(clock.now);
    let down = true;
    const revokes: URLSearchParams[] = [];
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      revocationEndpoint: REVOKE,
      clientId: "c",
      credentials,
      fetch: async (url, init) => {
        if (String(url) === REVOKE) {
          if (down) throw new TypeError("fetch failed");
          revokes.push(new URLSearchParams(String(init?.body)));
          return new Response(null, { status: 200 });
        }
        return json({
          grants: [
            {
              grant_id: "grt_1",
              assessed_at: iso(clock.now()),
              read_state: "active",
              held_data: "permitted",
            },
          ],
        });
      },
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          refresh_token: "rt",
          authorization_details: [
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
          ],
        },
        ISSUER,
      ),
    );
    const outcome = await agent.disconnect({
      grants: [ref],
      disposition: "keep",
    });
    expect(outcome).toEqual({
      conveyed: false,
      results: [
        {
          grant: ref,
          disposition: "keep",
          state: "pending",
          reason: "revocation failed; queued for retry",
        },
      ],
    });
    expect(manager.pendingRevocation(ref)).toBeDefined();
    // Spec-core L1569: the owner's keep binds at once; access has ended for this client.
    expect(manager.hasEnded(ref)).toBe(true);
    down = false;
    clock.advance(H);
    await agent.runDue();
    expect(revokes).toHaveLength(1);
    expect(revokes[0]!.get("pdpp_disposition")).toBe("keep");
    expect(manager.pendingRevocation(ref)).toBeUndefined();
    expect(manager.hasEnded(ref)).toBe(true);
  });

  it("NEW-2: a multi-grant delete reports each grant's state", async () => {
    const clock = clockAt();
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: async (_url, init) => {
        const id = new URLSearchParams(String(init?.body)).get("grant_id")!;
        if (id === "grt_B") throw new TypeError("fetch failed");
        return json({
          grants: [{ ...eraseAnswer(clock.now()), grant_id: id }],
        });
      },
    });
    for (const id of ["grt_A", "grt_B"]) {
      agent.recordTokenResponse(
        interpretTokenResponse(
          {
            access_token: `at_${id}`,
            authorization_details: [
              { type: PDPP_DATA_ACCESS_TYPE, grant: grant({ grant_id: id }) },
            ],
          },
          ISSUER,
        ),
      );
    }
    const A = { issuer: ISSUER, grantId: "grt_A" };
    const B = { issuer: ISSUER, grantId: "grt_B" };
    const outcome = await agent.disconnect({
      grants: [A, B],
      disposition: "delete",
    });
    expect(outcome.conveyed).toBe(false);
    expect(outcome.results).toMatchObject([
      { grant: A, state: "conveyed" },
      { grant: B, state: "pending", reason: "not delivered; queued for retry" },
    ]);
  });

  it("NEW-6: a malformed max_duration refuses use and raises an event before the spec's fail-closed disposal (L1847)", async () => {
    const events: PdppHeldDataEvent[] = [];
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: () => T0,
      onEvent: (e) => events.push(e),
    });
    const copy = new InMemoryPdppSyncCopy(() => T0);
    await manager.addStore(copy);
    manager.recordTokenResponse({
      issuer: ISSUER,
      grant: grant({ retention: { max_duration: "P1W", on_expiry: "delete" } }),
    });
    const session = copy.beginSession(
      { issuer: ISSUER, grantId: "grt_1", stream: "st" },
      { replace: false },
    );
    session.apply(rec("r1") as never);
    session.commit("cs");
    expect(manager.checkUse(ref)).toEqual({
      allowed: false,
      reason: "invalid_retention",
    });
    expect(events).toEqual([
      { type: "invalid_retention", grant: ref, maxDuration: "P1W" },
    ]);
    await manager.disposeDue(ref);
    expect(copy.holdsData(ref)).toBe(false); // spec-core L1847: every ceiling counts as reached
    expect(events).toHaveLength(1); // noticed once
  });

  it("NEW-1: a clock below the saved high-water mark is reported to the app at open", async () => {
    const clock = clockAt();
    const state = new InMemoryPdppHeldDataStateStore();
    const m1 = await PdppHeldDataManager.open({ state, now: clock.now });
    m1.recordTokenResponse({ issuer: ISSUER, grant: grant() });
    await m1.flush();
    clock.advance(-D);
    const events: PdppHeldDataEvent[] = [];
    const m2 = await PdppHeldDataManager.open({
      state,
      now: clock.now,
      onEvent: (e) => events.push(e),
    });
    expect(events).toEqual([
      { type: "clock_uncertain", highWater: T0, wallClock: T0 - D },
    ]);
    expect(m2.checkUse(ref)).toEqual({
      allowed: false,
      reason: "clock_uncertain",
    });
  });

  describe("host classes (decided, review F-SDK-3)", () => {
    const local = { allowLocal: true };
    const check = (url: string, policy = {}) =>
      assertPdppEndpoint(url, url, "issuer", policy);

    it.each([
      "http://localhost:8080/pdpp/v1",
      "http://127.0.0.5:8080/x",
      "http://[::1]:8080/x",
      "https://192.168.1.20/x",
      "http://100.64.0.1/x",
      "https://vana-ps.local/x",
    ])(
      "without allowLocal every local or private host is refused, issuer or not: %s",
      (url) => {
        expect(() => check(url)).toThrow(/local or private host/);
      },
    );

    it.each([
      "http://localhost:8080/pdpp/v1",
      "http://127.0.0.5:8080/x",
      "http://[::1]:8080/x",
    ])("with allowLocal, loopback over http is accepted: %s", (url) => {
      expect(check(url, local)).toBe(new URL(url).toString());
    });

    it.each([
      "http://100.64.0.1:8080/x",
      "http://100.101.102.103/x",
      "http://100.127.255.254/x",
    ])("with allowLocal, tailscale CGNAT over http is accepted: %s", (url) => {
      expect(check(url, local)).toBe(new URL(url).toString());
    });

    it.each([
      "http://100.100.100.200/latest/meta-data",
      "https://100.100.100.200/x",
      "http://169.254.169.254/latest/meta-data",
      "https://169.254.0.1/x",
      "http://[::ffff:169.254.169.254]/x",
      "http://[fd00:ec2::254]/x",
    ])(
      "a cloud instance-metadata address is refused whatever the policy: %s",
      (url) => {
        expect(() =>
          check(url, { allowLocal: true, allowInsecureLan: true }),
        ).toThrow(/instance-metadata/);
      },
    );

    it("an address just outside CGNAT is public and needs https", () => {
      expect(() => check("http://100.128.0.1/x", local)).toThrow(
        /must use https/,
      );
    });

    it.each([
      "http://10.0.0.5:8080/x",
      "http://172.16.0.1/x",
      "http://172.31.255.1/x",
      "http://192.168.1.20:8080/x",
      "http://vana-ps.local/x",
      "http://nas.lan/x",
      "http://[fd00::1]/x",
      "http://[fe80::1]/x",
    ])(
      "with allowLocal, a LAN host over http needs https unless allowInsecureLan: %s",
      (url) => {
        expect(() => check(url, local)).toThrow(/must use https/);
        expect(check(url, { allowLocal: true, allowInsecureLan: true })).toBe(
          new URL(url).toString(),
        );
      },
    );

    it.each([
      "https://10.0.0.5/x",
      "https://192.168.1.20:8443/x",
      "https://vana-ps.local/x",
      "https://[fd00::1]/x",
    ])("with allowLocal, a LAN host over https is accepted: %s", (url) => {
      expect(check(url, local)).toBe(new URL(url).toString());
    });

    it("allowInsecureLan and allowLocal do not widen the origin rule", () => {
      expect(() =>
        assertPdppEndpoint(
          "http://192.168.1.21/x",
          "http://192.168.1.20",
          "endpoint",
          { allowLocal: true, allowInsecureLan: true },
        ),
      ).toThrow(/not on http:\/\/192\.168\.1\.20/);
    });

    it("F-SDK-4: an http→https upgrade keeps host and port", () => {
      expect(
        assertPdppEndpoint(
          "https://localhost/t",
          "http://localhost",
          "endpoint",
          local,
        ),
      ).toBe("https://localhost/t");
      expect(() =>
        assertPdppEndpoint(
          "https://localhost:9443/t",
          "http://localhost:8080",
          "endpoint",
          local,
        ),
      ).toThrow(/not on/);
      expect(() =>
        assertPdppEndpoint(
          "https://192.168.1.20:9999/t",
          "http://192.168.1.20:8080",
          "endpoint",
          local,
        ),
      ).toThrow(/not on/);
    });
  });
});

describe("Final sweep fixes (F-SDK-1, F-SDK-2, F-SDK-5)", () => {
  function keepSetup(lifecycleAnswer: () => unknown) {
    let t = T0;
    const clock = { now: () => t, advance: (d: number) => (t += d) };
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
      now: clock.now,
    });
    const copy = new InMemoryPdppSyncCopy(clock.now);
    void manager.addStore(copy);
    const calls = { lifecycle: 0, revoke: [] as URLSearchParams[] };
    const revoke = { status: 503 };
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      revocationEndpoint: REVOKE,
      clientId: "c",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: async (url, init) => {
        const form = new URLSearchParams(String(init?.body));
        if (String(url) === REVOKE) {
          calls.revoke.push(form);
          return new Response(null, { status: revoke.status });
        }
        calls.lifecycle += 1;
        return json({ grants: [lifecycleAnswer()] });
      },
    });
    agent.recordTokenResponse(
      interpretTokenResponse(
        {
          access_token: "at",
          refresh_token: "rt",
          authorization_details: [
            { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
          ],
        },
        ISSUER,
      ),
    );
    const session = copy.beginSession(
      { issuer: ISSUER, grantId: "grt_1", stream: "st" },
      { replace: false },
    );
    session.apply(rec("r1") as never);
    session.commit("cs");
    manager.recordAcquisition(ref);
    return { clock, manager, copy, agent, calls, revoke };
  }

  it("F-SDK-1: a keep revocation that fails for 60 days never stops the lifecycle query; the AS erasure is learned on day 1", async () => {
    const x = keepSetup(() => eraseAnswer(T0 + 1));
    const outcome = await x.agent.disconnect({
      grants: [ref],
      disposition: "keep",
    });
    expect(outcome.results[0]!.state).toBe("pending");
    let learned = -1;
    for (let day = 1; day <= 60; day += 1) {
      x.clock.advance(D);
      await x.agent.runDue();
      if (learned < 0 && x.manager.erasureRecord(ref)) learned = day;
    }
    expect(learned).toBe(1);
    expect(x.calls.lifecycle).toBeGreaterThan(0);
    expect(x.copy.holdsData(ref)).toBe(false);
    expect(x.manager.checkUse(ref)).toEqual({
      allowed: false,
      reason: "erased",
    });
    // The delete cleared the queued keep; no keep revocation is sent after it (F-SDK-2).
    expect(x.manager.pendingRevocation(ref)).toBeUndefined();
    const lastRevokes = x.calls.revoke.length;
    x.clock.advance(D);
    await x.agent.runDue();
    expect(x.calls.revoke.length).toBe(lastRevokes);
  });

  it("F-SDK-1: while a keep is pending, reads stop and use stays within the surviving-use terms (spec-core L1569, L1540)", async () => {
    const x = keepSetup(() => ({
      grant_id: "grt_1",
      assessed_at: iso(Date.now()),
      read_state: "active",
      held_data: "permitted",
    }));
    await x.agent.disconnect({ grants: [ref], disposition: "keep" });
    expect(x.manager.hasEnded(ref)).toBe(true);
    expect(x.manager.checkUse(ref, { purpose: grant().purpose_code })).toEqual({
      allowed: true,
    });
    expect(
      x.manager.checkUse(ref, { purpose: "https://pdpp.dev/purpose/research" }),
    ).toEqual({
      allowed: false,
      reason: "purpose_not_approved",
    });
    const reads: string[] = [];
    const client = new PdppResourceClient({
      coreQueryBase: "https://ps.example/v1",
      accessToken: "at",
      issuedGrant: { issuer: ISSUER, grant: grant() },
      heldData: x.manager,
      fetch: async (u) => {
        reads.push(String(u));
        return page([]);
      },
    });
    await expect(client.listRecords("st")).rejects.toMatchObject({
      reason: "grant_ended",
    });
    expect(reads).toEqual([]);
    // A later "active" lifecycle answer does not reopen reads.
    x.clock.advance(D);
    await x.agent.runDue();
    expect(x.calls.lifecycle).toBeGreaterThan(0);
    expect(x.manager.hasEnded(ref)).toBe(true);
  });

  it("F-SDK-2: delete after a queued keep clears it and only delete is sent", async () => {
    const x = keepSetup(() => eraseAnswer(T0 + 1));
    await x.agent.disconnect({ grants: [ref], disposition: "keep" });
    expect(x.manager.pendingRevocation(ref)).toBeDefined();
    x.revoke.status = 200;
    await x.agent.disconnect({ grants: [ref], disposition: "delete" });
    expect(x.manager.pendingRevocation(ref)).toBeUndefined();
    x.clock.advance(D);
    await x.agent.runDue();
    expect(x.calls.revoke.map((f) => f.get("pdpp_disposition"))).toEqual([
      "keep",
      "delete",
    ]); // the failed keep, then delete
  });

  it("F-SDK-2: a lifecycle answer that shows the grant ended clears the queued keep", async () => {
    const x = keepSetup(() => ({
      grant_id: "grt_1",
      assessed_at: iso(Date.now()),
      read_state: "revoked",
      ended_at: iso(T0),
      held_data: "permitted",
    }));
    await x.agent.disconnect({ grants: [ref], disposition: "keep" });
    x.clock.advance(D);
    await x.agent.runDue();
    expect(x.manager.pendingRevocation(ref)).toBeUndefined();
  });

  it("F-SDK-2: a successful retry clears the grant even when familyGrants no longer lists it", async () => {
    const x = keepSetup(() => ({
      grant_id: "grt_1",
      assessed_at: iso(Date.now()),
      read_state: "active",
      held_data: "permitted",
    }));
    await x.agent.disconnect({ grants: [ref], disposition: "keep" });
    x.revoke.status = 200;
    const credentials = (
      x.agent as unknown as {
        options: { credentials: InMemoryPdppLifecycleCredentials };
      }
    ).options.credentials;
    credentials.familyGrants = () => [];
    x.clock.advance(H);
    await x.agent.runDue();
    expect(x.manager.pendingRevocation(ref)).toBeUndefined();
    const sent = x.calls.revoke.length;
    x.clock.advance(D);
    await x.agent.runDue();
    expect(x.calls.revoke.length).toBe(sent);
  });

  it("F-SDK-5: a runtime that ignores redirect: manual and lands on another host is refused", async () => {
    const autoFollow: typeof globalThis.fetch = async () => {
      const r = json({ issuer: "x" });
      Object.defineProperty(r, "redirected", { value: true });
      Object.defineProperty(r, "url", {
        value: "https://evil.example/.well-known/x",
      });
      return r;
    };
    await expect(
      fetchPdppMetadata("https://ps.example/.well-known/x", autoFollow),
    ).rejects.toThrow(/leaves the configured host/);
  });
});
