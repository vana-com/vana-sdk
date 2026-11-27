import { describe, it, expect } from "vitest";
import {
  PDPP_DATA_ACCESS_TYPE,
  PDPP_DELETION_BOUND_MS,
  PDPP_GRANT_LIFECYCLE_TYPE,
  PDPP_RECONCILIATION_INTERVAL_MS,
  PDPP_RETRY_INTERVAL_MS,
  PDPP_STOP_USE_BOUND_MS,
  InMemoryPdppLifecycleCredentials,
  InMemoryPdppSyncCopy,
  PdppHeldDataManager,
  InMemoryPdppHeldDataStateStore,
  PdppIndependentRecipientError,
  PdppLifecycleAgent,
  PdppProtocolError,
  PdppResourceClient,
  buildLifecycleRecoveryDetail,
  grantLifecycleEndpointOf,
  interpretRecoveryTokenResponse,
  interpretTokenResponse,
  parseLifecycleResponse,
  supportsLifecycleRecovery,
  type PdppGrant,
  type PdppGrantRef,
  type PdppTokenResult,
} from "./index";

const ISSUER = "https://ps.example";
const LIFECYCLE = `${ISSUER}/pdpp/v1/grant-lifecycle`;
const REVOKE = `${ISSUER}/pdpp/v1/token/revoke`;
const H = 3_600_000;
const T0 = Date.parse("2026-11-01T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function grant(overrides: Partial<PdppGrant> = {}): PdppGrant {
  return {
    version: "0.1.0",
    grant_id: "grt_1",
    issued_at: "2026-11-01T00:00:00Z",
    subject: { id: "sub" },
    client: { client_id: "https://app.example/client" },
    source: {
      kind: "connector",
      id: "https://registry.pdpp.dev/sources/spotify",
    },
    source_declaration: { version: "rev1" },
    purpose_code: "https://pdpp.dev/purpose/analytics",
    access_mode: "continuous",
    streams: [
      {
        name: "top_artists",
        instance_ids: ["inst_A"],
        fields: ["id", "name"],
        required_fields: ["id"],
      },
    ],
    retention: { max_duration: "P90D", on_expiry: "delete" },
    ...overrides,
  };
}

type Erasure = {
  instruction_id: string;
  accepted_at: string;
  effective_at: string;
  stop_use_by: string;
};

/** A fake Personal Server lifecycle endpoint and RFC 7009 revocation endpoint. */
class FakeAs {
  mode: "up" | "transport_down" | "hang" | "unavailable" | "rate_limited" =
    "up";
  retryAfter = "300";
  seq = 0;
  readonly calls: Array<{ url: string; form: URLSearchParams; at: number }> =
    [];
  readonly state = new Map<
    string,
    { read_state: string; ended_at?: string; erasure?: Erasure }
  >();
  /** Tokens issued per grant; `current` ones authenticate writes. */
  readonly issued = new Map<string, Set<string>>();
  readonly current = new Map<string, Set<string>>();
  readonly received: Array<{
    grantId: string;
    report: string;
    reported_at?: string;
  }> = [];

  constructor(private readonly clock: () => number) {}

  grant(grantId: string, tokens: string[], current = tokens): void {
    this.state.set(grantId, { read_state: "active" });
    this.issued.set(grantId, new Set(tokens));
    this.current.set(grantId, new Set(current));
  }

  erase(grantId: string, effectiveAt: number): Erasure {
    const s = this.state.get(grantId)!;
    s.read_state = "revoked";
    s.ended_at = iso(effectiveAt);
    s.erasure = {
      instruction_id: `ers_${grantId}`,
      accepted_at: iso(effectiveAt),
      effective_at: iso(effectiveAt),
      stop_use_by: iso(effectiveAt + PDPP_STOP_USE_BOUND_MS),
    };
    for (const set of this.current.values()) set.clear();
    return s.erasure;
  }

  private answer(grantId: string) {
    const s = this.state.get(grantId)!;
    this.seq += 1;
    return {
      grant_id: grantId,
      assessed_at: iso(this.clock() + this.seq),
      read_state: s.read_state,
      ...(s.ended_at && { ended_at: s.ended_at }),
      held_data: s.erasure ? "erase" : "permitted",
      ...(s.erasure && { erasure: s.erasure, statements: ["ignored member"] }),
      future_member: { ignored: true },
    };
  }

  fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const form = new URLSearchParams(String(init?.body ?? ""));
    this.calls.push({ url, form, at: this.clock() });
    if (this.mode === "transport_down") throw new TypeError("fetch failed");
    if (this.mode === "hang") return new Promise<Response>(() => undefined);
    const json = (
      body: unknown,
      status = 200,
      headers: Record<string, string> = {},
    ) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      });
    if (this.mode === "unavailable") {
      return json({ error: "temporarily_unavailable" }, 503, {
        "Retry-After": this.retryAfter,
      });
    }
    if (this.mode === "rate_limited")
      return json({ error: "rate_limited" }, 429);
    if (url === REVOKE) {
      const token = form.get("token")!;
      for (const [grantId, tokens] of this.issued) {
        if (!tokens.has(token)) continue;
        const s = this.state.get(grantId)!;
        s.read_state = "revoked";
        s.ended_at = iso(this.clock());
        if (
          form.get("pdpp_disposition") === "delete" &&
          this.current.get(grantId)!.has(token)
        ) {
          this.erase(grantId, this.clock());
          this.received.push({
            grantId,
            report: "disposition",
            reported_at: form.get("reported_at") ?? undefined,
          });
        }
      }
      return new Response(null, { status: 200 });
    }
    const grantId = form.get("grant_id")!;
    const token = form.get("token")!;
    if (![...this.issued.values()].some((t) => t.has(token))) {
      return json({ error: "invalid_token" }, 401, {
        "WWW-Authenticate": 'Bearer error="invalid_token"',
      });
    }
    if (!this.issued.get(grantId)?.has(token))
      return json({ grants: [{ grant_id: grantId, error: "invalid_grant" }] });
    const write = form.has("report") || form.has("pdpp_disposition");
    if (write) {
      if (!this.current.get(grantId)!.has(token)) {
        return json({
          grants: [
            { grant_id: grantId, error: "current_authentication_required" },
          ],
        });
      }
      if (form.get("pdpp_disposition") === "delete") {
        if (!this.state.get(grantId)!.erasure)
          this.erase(grantId, this.clock());
        this.received.push({
          grantId,
          report: "disposition",
          reported_at: form.get("reported_at") ?? undefined,
        });
      } else {
        this.received.push({
          grantId,
          report: form.get("report")!,
          reported_at: form.get("reported_at") ?? undefined,
        });
      }
    }
    return json({ grants: [this.answer(grantId)] });
  };
}

function setup(
  options: {
    grant?: PdppGrant;
    tokens?: { access: string; refresh?: string };
  } = {},
) {
  let t = T0;
  const clock = {
    now: () => t,
    set: (v: number) => (t = v),
    advance: (d: number) => (t += d),
  };
  const as = new FakeAs(clock.now);
  const g = options.grant ?? grant();
  const tokens = options.tokens ?? { access: "at_1", refresh: "rt_1" };
  as.grant(g.grant_id, [
    tokens.access,
    ...(tokens.refresh ? [tokens.refresh] : []),
  ]);
  const manager = new PdppHeldDataManager({
    state: new InMemoryPdppHeldDataStateStore(),
    now: clock.now,
    random: () => 1,
  });
  const copy = new InMemoryPdppSyncCopy(clock.now);
  void manager.addStore(copy);
  const credentials = new InMemoryPdppLifecycleCredentials(clock.now);
  const agent = new PdppLifecycleAgent({
    manager,
    lifecycleEndpoint: LIFECYCLE,
    revocationEndpoint: REVOKE,
    clientId: "https://app.example/client",
    credentials,
    fetch: as.fetch,
  });
  const result: PdppTokenResult = interpretTokenResponse(
    {
      access_token: tokens.access,
      ...(tokens.refresh && { refresh_token: tokens.refresh }),
      expires_in: 3600,
      authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: g }],
    },
    ISSUER,
  );
  const ref: PdppGrantRef = { issuer: ISSUER, grantId: g.grant_id };
  const hold = () => {
    const session = copy.beginSession(
      { issuer: ISSUER, grantId: g.grant_id, stream: "top_artists" },
      { replace: false },
    );
    session.apply({
      object: "record",
      id: "r1",
      instance_id: "inst_A",
      stream: "top_artists",
      data: { id: "r1" },
    });
    session.commit("cs_1");
    manager.recordAcquisition(ref, g);
  };
  const lifecycleCalls = () => as.calls.filter((c) => c.url === LIFECYCLE);
  return {
    clock,
    as,
    manager,
    copy,
    credentials,
    agent,
    result,
    ref,
    hold,
    grant: g,
    lifecycleCalls,
  };
}

describe("lifecycle discovery and wire (Client items 15, 21; cases D2, D3)", () => {
  it("Client 21: reads pdpp_grant_lifecycle_endpoint and refuses an AS without one", () => {
    expect(
      grantLifecycleEndpointOf({
        issuer: ISSUER,
        token_endpoint: "x",
        pdpp_grant_lifecycle_endpoint: LIFECYCLE,
      }),
    ).toBe(LIFECYCLE);
    expect(() =>
      grantLifecycleEndpointOf({ issuer: ISSUER, token_endpoint: "x" }),
    ).toThrow(PdppProtocolError);
    expect(
      supportsLifecycleRecovery({
        issuer: ISSUER,
        token_endpoint: "x",
        authorization_details_types_supported: [
          PDPP_DATA_ACCESS_TYPE,
          PDPP_GRANT_LIFECYCLE_TYPE,
        ],
      }),
    ).toBe(true);
  });

  it("Client 15: ignores unknown members and refuses an entry for another grant or an incomplete erase", () => {
    const entries = parseLifecycleResponse(
      {
        grants: [
          {
            grant_id: "g",
            assessed_at: iso(T0),
            read_state: "active",
            held_data: "permitted",
            extra: 1,
          },
        ],
        meta: {},
      },
      ["g"],
    );
    expect(entries[0]).toEqual({
      kind: "answer",
      answer: {
        grant_id: "g",
        assessed_at: iso(T0),
        read_state: "active",
        held_data: "permitted",
      },
    });
    expect(() =>
      parseLifecycleResponse(
        {
          grants: [
            {
              grant_id: "other",
              assessed_at: iso(T0),
              read_state: "active",
              held_data: "permitted",
            },
          ],
        },
        ["g"],
      ),
    ).toThrow(PdppProtocolError);
    expect(() =>
      parseLifecycleResponse(
        {
          grants: [
            {
              grant_id: "g",
              assessed_at: iso(T0),
              read_state: "revoked",
              held_data: "erase",
            },
          ],
        },
        ["g"],
      ),
    ).toThrow(/erasure/);
  });

  it("D2: an invalid_grant entry is a failed attempt, not an assessment", async () => {
    const { manager, agent, credentials, as, hold } = setup();
    const other: PdppGrantRef = { issuer: ISSUER, grantId: "grt_foreign" };
    credentials.recordTokenResponse({
      accessToken: "at_1",
      grants: [{ issuer: ISSUER, grant: grant({ grant_id: "grt_foreign" }) }],
    });
    hold();
    expect(await agent.query(other)).toBe("failed");
    expect(manager.checkUse(other).allowed).toBe(false);
    expect(as.calls.at(-1)!.form.get("grant_id")).toBe("grt_foreign");
  });

  it("D3: a recovery token response is not a data grant or an assessment, and yields no refresh token", () => {
    expect(buildLifecycleRecoveryDetail(["g1", "g2"])).toEqual({
      type: PDPP_GRANT_LIFECYCLE_TYPE,
      grant_ids: ["g1", "g2"],
    });
    expect(() => buildLifecycleRecoveryDetail(["g1", "g1"])).toThrow(TypeError);
    expect(() => buildLifecycleRecoveryDetail([])).toThrow(TypeError);
    const recovered = interpretRecoveryTokenResponse({
      access_token: "lt_1",
      token_type: "Bearer",
      refresh_token: "should_not_be_kept",
      authorization_details: [
        { type: PDPP_GRANT_LIFECYCLE_TYPE, grant_ids: ["g1"] },
      ],
    });
    expect(recovered).toEqual({ accessToken: "lt_1", grantIds: ["g1"] });
    expect(() =>
      interpretRecoveryTokenResponse({
        access_token: "x",
        authorization_details: [
          { type: PDPP_DATA_ACCESS_TYPE, grant: grant() },
        ],
      }),
    ).toThrow(/data-access/);
    // Item 13: the data path refuses a recovery response, so it can never authorize reads.
    expect(() =>
      interpretTokenResponse(
        {
          access_token: "x",
          authorization_details: [
            { type: PDPP_GRANT_LIFECYCLE_TYPE, grant_ids: ["g1"] },
          ],
        },
        ISSUER,
      ),
    ).toThrow(PdppProtocolError);
    const manager = new PdppHeldDataManager({
      state: new InMemoryPdppHeldDataStateStore(),
    });
    manager.recordAcquisition({ issuer: ISSUER, grantId: "g1" });
    expect(manager.checkUse({ issuer: ISSUER, grantId: "g1" })).toEqual({
      allowed: false,
      reason: "no_positive_assessment",
    });
  });
});

describe("positive assessment and surviving use (Client items 19, 20)", () => {
  it("Client 20: no first use before a positive assessment; delivery and read errors are never one", async () => {
    const { manager, ref, hold, agent, result, grant: g } = setup();
    hold(); // record delivery only
    expect(manager.checkUse(ref)).toEqual({
      allowed: false,
      reason: "no_positive_assessment",
    });
    const client = new PdppResourceClient({
      coreQueryBase: "https://ps.example/v1",
      accessToken: "at_1",
      issuedGrant: { issuer: ISSUER, grant: g },
      heldData: manager,
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { code: "internal", message: "x" } }),
          { status: 500 },
        ),
    });
    await expect(client.listRecords("top_artists")).rejects.toThrow();
    expect(manager.checkUse(ref).allowed).toBe(false);
    agent.recordTokenResponse(result);
    expect(manager.checkUse(ref)).toEqual({ allowed: true });
  });

  it("Client 20: a lifecycle answer with held_data permitted is a positive assessment", async () => {
    const { manager, ref, hold, agent, credentials, result } = setup();
    credentials.recordTokenResponse(result);
    hold();
    expect(await agent.query(ref)).toBe("answered");
    expect(manager.checkUse(ref)).toEqual({ allowed: true });
    expect(manager.assessments(ref).map((a) => a.source)).toEqual([
      "lifecycle",
    ]);
  });

  it("Client 20: a replayed answer with an earlier assessed_at is not a new assessment", async () => {
    const { manager, ref, agent, result } = setup();
    agent.recordTokenResponse(result);
    const first = manager.beginAttempt(ref);
    await manager.recordAnswer(ref, first, {
      grant_id: "grt_1",
      assessed_at: iso(T0 + 10),
      read_state: "active",
      held_data: "permitted",
    });
    const before = manager.assessments(ref).length;
    const replay = manager.beginAttempt(ref);
    await manager.recordAnswer(ref, replay, {
      grant_id: "grt_1",
      assessed_at: iso(T0 + 10),
      read_state: "active",
      held_data: "permitted",
    });
    expect(manager.assessments(ref)).toHaveLength(before);
    // The replay counts as a failed attempt: a retry is due within the retry interval.
    expect(manager.nextAttemptAt(ref)! - T0).toBeLessThanOrEqual(
      PDPP_RETRY_INTERVAL_MS,
    );
  });

  it("Client 19 / P6: after expiry with keep, use stays within the approved purpose; other purposes need a new grant", async () => {
    const g = grant({ expires_at: iso(T0 + 2 * H) });
    const { manager, ref, agent, result, clock, hold } = setup({ grant: g });
    agent.recordTokenResponse(result);
    hold();
    clock.advance(3 * H);
    expect(manager.hasEnded(ref)).toBe(true);
    expect(manager.checkUse(ref, { purpose: g.purpose_code })).toEqual({
      allowed: true,
    });
    expect(
      manager.checkUse(ref, { purpose: "https://pdpp.dev/purpose/research" }),
    ).toEqual({
      allowed: false,
      reason: "purpose_not_approved",
    });
  });

  it("Client 19: a grant that carries a processing permission has no ordinary surviving use after it ends", async () => {
    const g = grant({
      processing_permissions: ["https://example.test/processing/x"],
      expires_at: iso(T0 + H),
    });
    const { manager, ref, agent, result, clock, hold } = setup({ grant: g });
    agent.recordTokenResponse(result);
    hold();
    expect(manager.checkUse(ref)).toEqual({ allowed: true });
    clock.advance(2 * H);
    expect(manager.checkUse(ref)).toEqual({
      allowed: false,
      reason: "no_surviving_use",
    });
    // Keeping is allowed: nothing is deleted.
    expect(manager.holdsData(ref)).toBe(true);
  });
});

describe("reconciliation (Client item 21; cases C1, C1a)", () => {
  it("C1: first attempt is due one interval after first acquisition, then once per interval; none while nothing is held", async () => {
    const { manager, ref, agent, result, clock, hold, lifecycleCalls, copy } =
      setup();
    agent.recordTokenResponse(result);
    clock.advance(H);
    await agent.runDue();
    expect(lifecycleCalls()).toHaveLength(0); // nothing held yet
    hold();
    clock.advance(PDPP_RECONCILIATION_INTERVAL_MS - H - 1);
    await agent.runDue();
    expect(lifecycleCalls()).toHaveLength(0);
    clock.advance(H + 1);
    await agent.runDue();
    expect(lifecycleCalls()).toHaveLength(1);
    // Rereading never restarts the interval.
    manager.recordAcquisition(ref);
    clock.advance(PDPP_RECONCILIATION_INTERVAL_MS);
    await agent.runDue();
    expect(lifecycleCalls()).toHaveLength(2);
    // No held data: no attempt is due.
    copy.erase(ref);
    clock.advance(3 * PDPP_RECONCILIATION_INTERVAL_MS);
    await agent.runDue();
    expect(lifecycleCalls()).toHaveLength(2);
  });

  it("C1 variant: data cleared before the first attempt, then reacquired after an interval: query before further use", async () => {
    const { manager, ref, agent, result, clock, hold, copy, lifecycleCalls } =
      setup();
    agent.recordTokenResponse(result);
    hold();
    copy.erase(ref);
    clock.advance(PDPP_RECONCILIATION_INTERVAL_MS + H);
    hold();
    expect(manager.checkUse(ref)).toEqual({
      allowed: false,
      reason: "query_required",
    });
    expect(await agent.ensureMayUse(ref)).toEqual({ allowed: true });
    expect(lifecycleCalls()).toHaveLength(1);
  });

  it("C1a: an outage covering a scheduled attempt is retried within the retry interval of each start", async () => {
    const { ref, agent, result, clock, hold, as, lifecycleCalls, manager } =
      setup();
    agent.recordTokenResponse(result);
    hold();
    for (let outage = 0; outage < 2; outage += 1) {
      // Each outage covers the next scheduled attempt and lasts one hour.
      const scheduled = manager.nextAttemptAt(ref)!;
      clock.set(scheduled);
      as.mode = "transport_down";
      const before = lifecycleCalls().length;
      await agent.runDue();
      // Retry starts are never more than the retry interval apart while failing.
      for (let step = 0; step < 20 && as.mode !== "up"; step += 1) {
        const next = manager.nextAttemptAt(ref)!;
        const lastStart = lifecycleCalls().at(-1)!.at;
        expect(next - lastStart).toBeLessThanOrEqual(PDPP_RETRY_INTERVAL_MS);
        clock.set(next);
        if (clock.now() - scheduled >= H) as.mode = "up";
        await agent.runDue();
      }
      expect(lifecycleCalls().length).toBeGreaterThan(before + 1);
      expect(manager.checkUse(ref)).toEqual({ allowed: true });
    }
  });

  it("C1a: an unanswered request does not delay the next attempt beyond the retry interval of its start", async () => {
    const { ref, agent, result, clock, hold, as, lifecycleCalls, manager } =
      setup();
    agent.recordTokenResponse(result);
    hold();
    clock.advance(PDPP_RECONCILIATION_INTERVAL_MS);
    as.mode = "hang";
    void agent.runDue(); // never answered
    await tick(); // runDue completes due disposal before it starts attempts
    const firstStart = lifecycleCalls().at(-1)!.at;
    expect(manager.nextAttemptAt(ref)! - firstStart).toBeLessThanOrEqual(
      PDPP_RETRY_INTERVAL_MS,
    );
    clock.set(manager.nextAttemptAt(ref)!);
    void agent.runDue();
    await tick();
    expect(lifecycleCalls()).toHaveLength(2);
  });

  it("C1a: 503 with Retry-After and 429 are failed attempts; Retry-After never stretches past the reconciliation interval", async () => {
    const { ref, agent, result, clock, hold, as, manager } = setup();
    agent.recordTokenResponse(result);
    hold();
    clock.advance(PDPP_RECONCILIATION_INTERVAL_MS);
    as.mode = "unavailable";
    as.retryAfter = "7200";
    expect(await agent.runDue()).toEqual(["failed"]);
    expect(manager.nextAttemptAt(ref)! - clock.now()).toBe(2 * H);
    as.retryAfter = String(5 * 24 * 3600);
    clock.set(manager.nextAttemptAt(ref)!);
    await agent.runDue();
    expect(manager.nextAttemptAt(ref)! - clock.now()).toBe(
      PDPP_RECONCILIATION_INTERVAL_MS,
    );
    as.mode = "rate_limited";
    clock.set(manager.nextAttemptAt(ref)!);
    expect(await agent.runDue()).toEqual(["failed"]);
    expect(manager.nextAttemptAt(ref)! - clock.now()).toBeLessThanOrEqual(
      PDPP_RETRY_INTERVAL_MS,
    );
    // A failed query does not stop permitted use.
    expect(manager.checkUse(ref)).toEqual({ allowed: true });
  });

  it("C1a: a 3-day transport outage widens retries only after one interval of failures, never beyond it", async () => {
    const { ref, agent, result, clock, hold, as, manager, lifecycleCalls } =
      setup();
    agent.recordTokenResponse(result);
    hold();
    const outageStart = T0 + PDPP_RECONCILIATION_INTERVAL_MS;
    clock.set(outageStart);
    as.mode = "transport_down";
    while (clock.now() < outageStart + 3 * PDPP_RECONCILIATION_INTERVAL_MS) {
      await agent.runDue();
      clock.set(manager.nextAttemptAt(ref)!);
    }
    const starts = lifecycleCalls().map((c) => c.at);
    const gaps = starts
      .slice(1)
      .map((s, i) => ({ at: starts[i]!, gap: s - starts[i]! }));
    for (const { at, gap } of gaps) {
      expect(gap).toBeLessThanOrEqual(
        at - outageStart >= PDPP_RECONCILIATION_INTERVAL_MS
          ? PDPP_RECONCILIATION_INTERVAL_MS
          : PDPP_RETRY_INTERVAL_MS,
      );
    }
    expect(Math.max(...gaps.map((g) => g.gap))).toBeGreaterThan(
      PDPP_RETRY_INTERVAL_MS,
    ); // widening happened
  });

  it("C1a suspension: no attempts while off; on resume a query starts before any use, and a failed one does not stop use", async () => {
    const { ref, agent, result, clock, hold, as, manager, lifecycleCalls } =
      setup();
    agent.recordTokenResponse(result);
    hold();
    clock.advance(PDPP_RECONCILIATION_INTERVAL_MS);
    as.mode = "transport_down";
    await agent.runDue();
    const calls = lifecycleCalls().length;
    clock.advance(3 * 24 * H); // powered off
    expect(lifecycleCalls()).toHaveLength(calls);
    expect(manager.checkUse(ref)).toEqual({
      allowed: false,
      reason: "query_required",
    });
    expect(await agent.ensureMayUse(ref)).toEqual({ allowed: true });
    expect(lifecycleCalls()).toHaveLength(calls + 1);
  });
});

describe("grant signals (Client item 9)", () => {
  const rs =
    (status: number, body: unknown, headers: Record<string, string>) =>
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      });

  it("Client 9: 401 invalid_token stops the token, is not revocation, and makes a lifecycle query due before use", async () => {
    const {
      manager,
      ref,
      agent,
      result,
      hold,
      grant: g,
      lifecycleCalls,
    } = setup();
    agent.recordTokenResponse(result);
    hold();
    const client = new PdppResourceClient({
      coreQueryBase: "https://ps.example/v1",
      accessToken: "at_1",
      issuedGrant: { issuer: ISSUER, grant: g },
      heldData: manager,
      fetch: rs(
        401,
        { error: { code: "authentication_error", message: "x" } },
        { "WWW-Authenticate": 'Bearer error="invalid_token"' },
      ),
    });
    await expect(client.listRecords("top_artists")).rejects.toThrow();
    expect(client.stoppedReason).toBe("token_inactive");
    expect(manager.hasEnded(ref)).toBe(false);
    expect(manager.erasureRecord(ref)).toBeUndefined();
    expect(manager.checkUse(ref)).toEqual({
      allowed: false,
      reason: "query_required",
    });
    expect(await agent.ensureMayUse(ref)).toEqual({ allowed: true });
    expect(lifecycleCalls()).toHaveLength(1);
  });

  it("Client 9: grant_revoked stops requests on the grant and requires a query, not deletion", async () => {
    const { manager, ref, agent, result, hold, grant: g } = setup();
    agent.recordTokenResponse(result);
    hold();
    const client = new PdppResourceClient({
      coreQueryBase: "https://ps.example/v1",
      accessToken: "at_1",
      issuedGrant: { issuer: ISSUER, grant: g },
      heldData: manager,
      fetch: rs(
        401,
        { error: { code: "grant_revoked", message: "x" } },
        { "WWW-Authenticate": 'Bearer error="invalid_token"' },
      ),
    });
    await expect(
      client.sync("top_artists", new InMemoryPdppSyncCopy()),
    ).rejects.toThrow();
    expect(client.stoppedReason).toBe("grant_revoked");
    expect(manager.checkUse(ref).allowed).toBe(false);
    expect(manager.holdsData(ref)).toBe(true);
  });
});

describe("erasure (Client items 22, 23, 26; cases C2, C4, C5a, C6, C9, P2)", () => {
  it("C2 / Client 22: on receipt use stops at once, covered data and derivatives go, receipt is recorded and reported", async () => {
    const { manager, ref, agent, result, hold, clock, as, copy } = setup();
    agent.recordTokenResponse(result);
    hold();
    const other: PdppGrantRef = { issuer: ISSUER, grantId: "grt_B" };
    const derivatives: string[] = [];
    await manager.registerDerivative({
      id: "emb_1",
      inputs: [ref],
      erase: () => (derivatives.push("emb_1 deleted"), "deleted"),
    });
    // P2: a derivative mixing two grants is regenerated without the covered one.
    await manager.registerDerivative({
      id: "mix_1",
      inputs: [ref, other],
      erase: () => (derivatives.push("mix_1 regenerated"), "regenerated"),
    });
    const signal = manager.useSignal(ref);
    clock.advance(5 * H);
    as.erase("grt_1", clock.now() - H);
    clock.advance(PDPP_RECONCILIATION_INTERVAL_MS - 5 * H);
    const receivedAt = clock.now();
    await agent.query(ref);
    expect(signal.aborted).toBe(true);
    expect(manager.checkUse(ref)).toEqual({ allowed: false, reason: "erased" });
    expect(copy.holdsData(ref)).toBe(false);
    expect(derivatives).toEqual(["emb_1 deleted", "mix_1 regenerated"]);
    expect(manager.holdsData(other)).toBe(true);
    const record = manager.erasureRecord(ref)!;
    expect(record.firstReceiptAt).toBe(iso(receivedAt));
    expect(record.stopUseAt).toBe(iso(receivedAt));
    expect(record.deleteBy).toBe(iso(receivedAt + PDPP_DELETION_BOUND_MS));
    expect(record.completedAt).toBe(iso(receivedAt));
    expect(record.learnedAfterStopUseBound).toBe(false);
    // The write token was cleared by the AS (revoked grant): reports wait for recovery.
    expect(record.reports.received).toBe("needs_current_authentication");
    expect(agent.grantsNeedingRecovery()).toEqual([ref]);
  });

  it("C4: redelivery the next day never moves the deadline; a later permitted answer cannot cancel it (terminal)", async () => {
    const { manager, ref, agent, result, hold, clock, as } = setup();
    agent.recordTokenResponse(result);
    hold();
    as.erase("grt_1", clock.now());
    await agent.query(ref);
    const first = { ...manager.erasureRecord(ref)! };
    clock.advance(24 * H);
    await agent.query(ref);
    expect(manager.erasureRecord(ref)!.firstReceiptAt).toBe(
      first.firstReceiptAt,
    );
    expect(manager.erasureRecord(ref)!.deleteBy).toBe(first.deleteBy);
    const attempt = manager.beginAttempt(ref);
    await manager.recordAnswer(ref, attempt, {
      grant_id: "grt_1",
      assessed_at: iso(clock.now() + 10_000),
      read_state: "revoked",
      held_data: "permitted",
    });
    agent.recordTokenResponse(result);
    expect(manager.checkUse(ref)).toEqual({ allowed: false, reason: "erased" });
  });

  it("C2 late variant: an instruction learned after its stop-use deadline stops at once", async () => {
    const { manager, ref, agent, result, hold, clock, as } = setup();
    agent.recordTokenResponse(result);
    hold();
    as.erase("grt_1", clock.now());
    clock.advance(PDPP_STOP_USE_BOUND_MS + H);
    await agent.query(ref);
    const record = manager.erasureRecord(ref)!;
    expect(record.learnedAfterStopUseBound).toBe(true);
    expect(record.stopUseBy).toBe(iso(clock.now()));
    expect(record.stopUseAt).toBe(iso(clock.now()));
  });

  it("Client 22: the received report carries the first receipt time when current authentication exists", async () => {
    const { manager, ref, agent, result, hold, clock, as } = setup();
    agent.recordTokenResponse(result);
    hold();
    const erasure = as.erase("grt_1", clock.now());
    as.current.get("grt_1")!.add("rt_1"); // the client still holds a current refresh token
    clock.advance(H);
    await agent.query(ref);
    expect(as.received).toEqual([
      { grantId: "grt_1", report: "received", reported_at: iso(clock.now()) },
      { grantId: "grt_1", report: "completed", reported_at: iso(clock.now()) },
    ]);
    expect(manager.erasureRecord(ref)!.instructionId).toBe(
      erasure.instruction_id,
    );
  });

  it("Client 23: overdue disposal is completed before further use and the missed deadline is recorded", async () => {
    const { manager, ref, agent, result, hold, clock, as } = setup();
    agent.recordTokenResponse(result);
    hold();
    let failing = true;
    await manager.addStore({
      id: "disk",
      holdsData: () => failing,
      erase: () => {
        if (failing) throw new Error("disk offline");
      },
    });
    as.erase("grt_1", clock.now());
    await agent.query(ref);
    expect(manager.erasureRecord(ref)!.completedAt).toBeUndefined();
    expect(manager.erasureRecord(ref)!.pending).toEqual(["store:disk"]);
    clock.advance(PDPP_DELETION_BOUND_MS + H); // powered off past the deadline
    failing = false;
    expect(await agent.ensureMayUse(ref)).toEqual({
      allowed: false,
      reason: "erased",
    });
    const record = manager.erasureRecord(ref)!;
    expect(record.completedAt).toBe(iso(clock.now()));
    expect(record.missedDeadline).toBe(true);
  });

  it("C6 / Client 23: a record past its retention ceiling is disposed before further use", async () => {
    const g = grant({
      retention: { max_duration: "P1D", on_expiry: "delete" },
    });
    const { manager, ref, agent, result, hold, clock, copy } = setup({
      grant: g,
    });
    agent.recordTokenResponse(result);
    hold();
    const expired: string[] = [];
    await manager.registerDerivative({
      id: "summary",
      inputs: [ref],
      erase: (_r, reason) => (expired.push(reason), "deleted"),
    });
    clock.advance(PDPP_RECONCILIATION_INTERVAL_MS + 1);
    await agent.ensureMayUse(ref);
    expect(copy.holdsData(ref)).toBe(false);
    expect(expired).toEqual(["retention"]);
  });

  it("C5a: a clock that moves backwards never moves a deadline later; an uncertain clock stops use", async () => {
    const { manager, ref, agent, result, hold, clock, as } = setup();
    agent.recordTokenResponse(result);
    hold();
    as.erase("grt_1", clock.now());
    await agent.query(ref);
    const deleteBy = manager.erasureRecord(ref)!.deleteBy;
    const before = manager.now();
    clock.advance(-10 * 24 * H);
    expect(manager.now()).toBe(before);
    expect(manager.clockDiscontinuities).toBeGreaterThan(0);
    expect(manager.erasureRecord(ref)!.deleteBy).toBe(deleteBy);
    const fresh = setup();
    fresh.agent.recordTokenResponse(fresh.result);
    fresh.manager.markClockUncertain();
    expect(fresh.manager.checkUse(fresh.ref)).toEqual({
      allowed: false,
      reason: "clock_uncertain",
    });
    fresh.manager.establishClock();
    expect(fresh.manager.checkUse(fresh.ref)).toEqual({ allowed: true });
  });

  it("C9 / Client 26: legal retention is reported as retained with an event end, then completed; records hold identifiers only", async () => {
    const { manager, ref, agent, result, hold, clock, as } = setup();
    agent.recordTokenResponse(result);
    hold();
    await expect(
      manager.recordLegalRetention(ref, {
        scope: "invoices",
        basis: "tax law",
        until: "event:  ",
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      manager.recordLegalRetention(ref, {
        scope: "invoices",
        basis: "tax law",
        until: "2027",
      }),
    ).rejects.toThrow(TypeError);
    await manager.recordLegalRetention(ref, {
      scope: "invoices for 2026",
      basis: "tax record-keeping law",
      until: "event:close of the 2026 tax audit",
    });
    as.erase("grt_1", clock.now());
    as.current.get("grt_1")!.add("rt_1");
    await agent.query(ref);
    const retained = as.calls.filter(
      (c) => c.form.get("report") === "retained",
    );
    expect(retained).toHaveLength(1);
    expect(retained[0]!.form.get("retained_until")).toBe(
      "event:close of the 2026 tax audit",
    );
    expect(retained[0]!.form.get("retention_basis")).toBe(
      "tax record-keeping law",
    );
    await manager.recordLegalRetentionEnded(ref);
    await agent.sendReports(ref);
    expect(as.received.map((r) => r.report)).toEqual([
      "received",
      "retained",
      "completed",
    ]);
    expect(manager.erasureRecord(ref)!.legalRetention).toMatchObject({
      basis: "tax record-keeping law",
      until: "event:close of the 2026 tax audit",
    });
    const record = manager.erasureRecord(ref)!;
    expect(Object.keys(record).sort()).toEqual(
      [
        "instructionId",
        "asInstructionId",
        "origin",
        "acceptedAt",
        "effectiveAt",
        "asStopUseBy",
        "firstReceiptAt",
        "learnedAfterStopUseBound",
        "stopUseBy",
        "stopUseAt",
        "deleteBy",
        "completedAt",
        "missedDeadline",
        "pending",
        "legalRetention",
        "partiesInformed",
        "reports",
      ].sort(),
    );
  });
});

describe("downstream holders (Client item 24; cases C8, O5)", () => {
  it("C8: a party acting for the client gets the client's deadlines as absolute times, and is recorded", async () => {
    const { manager, ref, agent, result, hold, clock, as } = setup();
    agent.recordTokenResponse(result);
    hold();
    const notices: unknown[] = [];
    manager.registerDownstreamHolder(ref, {
      id: "storage-provider",
      terms: {
        purposeAndRetention: true,
        heldDataDuties: true,
        trainingRestriction: true,
        independentReuse: false,
      },
      relayErasure: (notice) => {
        notices.push(notice);
        return { confirmedAt: iso(clock.now()) };
      },
    });
    as.erase("grt_1", clock.now());
    clock.advance(H);
    await agent.query(ref);
    const record = manager.erasureRecord(ref)!;
    expect(notices).toEqual([
      {
        issuer: ISSUER,
        grantId: "grt_1",
        instructionId: "ers_grt_1",
        stopUseAsSoonAsPracticable: true,
        stopUseBy: record.stopUseBy,
        deleteBy: record.deleteBy,
      },
    ]);
    expect(record.partiesInformed).toEqual([
      {
        id: "storage-provider",
        informedAt: iso(clock.now()),
        confirmedAt: iso(clock.now()),
      },
    ]);
  });

  it("Client 24: a party without the flow-down, or with independent reuse, cannot be registered as acting for the client", () => {
    const { manager, ref } = setup();
    expect(() => {
      manager.registerDownstreamHolder(ref, {
        id: "model-host",
        terms: {
          purposeAndRetention: true,
          heldDataDuties: true,
          trainingRestriction: true,
          independentReuse: true,
        },
        relayErasure: () => undefined,
      });
    }).toThrow(PdppIndependentRecipientError);
    expect(() => {
      manager.registerDownstreamHolder(ref, {
        id: "cache",
        terms: {
          purposeAndRetention: true,
          heldDataDuties: false,
          trainingRestriction: true,
          independentReuse: false,
        },
        relayErasure: () => undefined,
      });
    }).toThrow(/held-data duties/);
  });

  it("Client 21 / 24: data held only by a party acting for the client keeps reconciliation due", async () => {
    const { manager, ref, agent, result, hold, clock, copy, lifecycleCalls } =
      setup();
    agent.recordTokenResponse(result);
    hold();
    manager.registerDownstreamHolder(ref, {
      id: "backup",
      terms: {
        purposeAndRetention: true,
        heldDataDuties: true,
        trainingRestriction: true,
        independentReuse: false,
      },
      relayErasure: () => undefined,
    });
    copy.erase(ref);
    clock.advance(PDPP_RECONCILIATION_INTERVAL_MS);
    await agent.runDue();
    expect(lifecycleCalls()).toHaveLength(1);
  });
});

describe("disconnect in the client (Client item 25; cases P4, D5)", () => {
  it("Client 25: the offer states the effect and preselects neither keep nor delete; a disposition is required", async () => {
    const { agent, ref } = setup();
    const offer = agent.describeDisconnect([ref]);
    expect(offer.preselected).toBeNull();
    expect(offer.choices.map((c) => c.value)).toEqual(["keep", "delete"]);
    expect(offer.statement).toMatch(/data it already holds/);
    await expect(
      agent.disconnect({
        grants: [ref],
        disposition: undefined as unknown as "keep",
      }),
    ).rejects.toThrow(/explicit disposition/);
  });

  it("P4: delete while the AS is unreachable binds at the owner's choice; conveyed later with reported_at", async () => {
    const { manager, ref, agent, result, hold, clock, as, copy } = setup();
    agent.recordTokenResponse(result);
    hold();
    as.mode = "transport_down";
    const choseAt = clock.now();
    const outcome = await agent.disconnect({
      grants: [ref],
      disposition: "delete",
      choseAt,
    });
    expect(outcome.conveyed).toBe(false);
    expect(manager.checkUse(ref)).toEqual({ allowed: false, reason: "erased" });
    expect(copy.holdsData(ref)).toBe(false);
    const record = manager.erasureRecord(ref)!;
    expect(record.firstReceiptAt).toBe(iso(choseAt));
    expect(record.deleteBy).toBe(iso(choseAt + PDPP_DELETION_BOUND_MS));
    expect(record.reports.conveyance).toBe("pending");
    clock.advance(6 * H);
    as.mode = "up";
    await agent.sendReports(ref);
    // No revocation went through, so the lifecycle write conveys it.
    const conveyed = as.calls.filter(
      (c) => c.form.get("pdpp_disposition") === "delete",
    );
    expect(conveyed.at(-1)!.form.get("reported_at")).toBe(iso(choseAt));
    expect(manager.erasureRecord(ref)!.reports.conveyance).toBe("sent");
    expect(manager.erasureRecord(ref)!.firstReceiptAt).toBe(iso(choseAt));
    expect(manager.erasureRecord(ref)!.instructionId).toBe("ers_grt_1");
  });

  it("Client 25: delete on revocation sends pdpp_disposition=delete and reported_at with the current refresh token", async () => {
    const { ref, agent, result, hold, clock, as, credentials } = setup();
    agent.recordTokenResponse(result);
    hold();
    expect(credentials.refreshToken(ref)).toBe("rt_1");
    await agent.disconnect({ grants: [ref], disposition: "delete" });
    const revoke = as.calls.find((c) => c.url === REVOKE)!;
    expect(revoke.form.get("token")).toBe("rt_1");
    expect(revoke.form.get("token_type_hint")).toBe("refresh_token");
    expect(revoke.form.get("pdpp_disposition")).toBe("delete");
    expect(revoke.form.get("reported_at")).toBe(iso(clock.now()));
  });

  it("Client 25: keep revokes with pdpp_disposition=keep, deletes nothing, and leaves surviving use", async () => {
    const { manager, ref, agent, result, hold, as, copy } = setup();
    agent.recordTokenResponse(result);
    hold();
    await agent.disconnect({ grants: [ref], disposition: "keep" });
    const revoke = as.calls.find((c) => c.url === REVOKE)!;
    expect(revoke.form.get("pdpp_disposition")).toBe("keep");
    expect(revoke.form.has("reported_at")).toBe(false);
    expect(copy.holdsData(ref)).toBe(true);
    expect(manager.hasEnded(ref)).toBe(true);
    expect(
      manager.checkUse(ref, { purpose: "https://pdpp.dev/purpose/analytics" }),
    ).toEqual({ allowed: true });
  });

  it("D5: a report refused for lack of current authentication is resent with a lifecycle recovery token", async () => {
    const { manager, ref, agent, result, hold, clock, as, credentials } =
      setup();
    agent.recordTokenResponse(result);
    hold();
    as.erase("grt_1", clock.now());
    await agent.query(ref);
    expect(manager.erasureRecord(ref)!.reports.received).toBe(
      "needs_current_authentication",
    );
    const recovery = interpretRecoveryTokenResponse({
      access_token: "lt_1",
      authorization_details: [
        { type: PDPP_GRANT_LIFECYCLE_TYPE, grant_ids: ["grt_1"] },
      ],
    });
    as.issued.get("grt_1")!.add("lt_1");
    as.current.get("grt_1")!.add("lt_1");
    credentials.recordRecoveryToken(ISSUER, recovery);
    // The recovery token response is not an assessment.
    expect(manager.checkUse(ref).allowed).toBe(false);
    await agent.sendReports(ref);
    expect(as.received.map((r) => r.report)).toEqual(["received", "completed"]);
    expect(as.received[0]!.reported_at).toBe(
      manager.erasureRecord(ref)!.firstReceiptAt,
    );
    expect(as.calls.at(-1)!.form.get("token")).toBe("lt_1");
  });

  it("Client 25: keep without client revocation reports that access did not end", async () => {
    const { ref, result, manager, as, clock } = setup();
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint: LIFECYCLE,
      clientId: "https://app.example/client",
      credentials: new InMemoryPdppLifecycleCredentials(clock.now),
      fetch: as.fetch,
    });
    agent.recordTokenResponse(result);
    expect(
      await agent.disconnect({ grants: [ref], disposition: "keep" }),
    ).toEqual({
      conveyed: false,
      results: [
        {
          grant: ref,
          disposition: "keep",
          state: "not_conveyable",
          reason: expect.stringMatching(/access did not end/),
        },
      ],
    });
    // The AS was not told (not_conveyable), but the owner's keep binds locally at once (spec-core L1569).
    expect(manager.hasEnded(ref)).toBe(true);
  });
});

describe("deliveries after erasure (Client item 22, erasure scope)", () => {
  it("Client 22: a sync page that arrives after the instruction is not applied and the session is not committed", async () => {
    const { manager, ref, agent, result, grant: g, copy } = setup();
    agent.recordTokenResponse(result);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const client = new PdppResourceClient({
      coreQueryBase: "https://ps.example/v1",
      accessToken: "at_1",
      issuedGrant: { issuer: ISSUER, grant: g },
      heldData: manager,
      fetch: async () => {
        await gate;
        return new Response(
          JSON.stringify({
            object: "list",
            has_more: false,
            next_changes_since: "cs_9",
            data: [
              {
                object: "record",
                id: "late",
                instance_id: "inst_A",
                stream: "top_artists",
                data: { id: "late" },
              },
            ],
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "PDPP-Version": "0.1",
            },
          },
        );
      },
    });
    const pending = client.sync("top_artists", copy);
    await manager.ownerChoseDelete(ref);
    release();
    await expect(pending).rejects.toMatchObject({ reason: "grant_erased" });
    expect(copy.holdsData(ref)).toBe(false);
    expect(
      copy.syncToken({
        issuer: ISSUER,
        grantId: g.grant_id,
        stream: "top_artists",
      }),
    ).toBeUndefined();
  });
});
