import { describe, it, expect } from "vitest";
import {
  PDPP_DATA_ACCESS_TYPE,
  PdppHttpError,
  PdppProtocolError,
  PdppResourceClient,
  PdppClientStoppedError,
  InMemoryPdppSyncCopy,
  assertSupportsDataAccess,
  authorizationServerMetadataUrl,
  buildDataAccessDetail,
  createPkcePair,
  discoverPdppAuthorizationServer,
  exchangeAuthorizationCode,
  interpretTokenResponse,
  type PdppGrant,
  type PdppRecordPage,
} from "./index";

const ISSUER = "https://ps.example/pdpp/v1";

function grant(overrides: Partial<PdppGrant> = {}): PdppGrant {
  return {
    version: "0.1.0",
    grant_id: "grt_1",
    issued_at: "2026-11-26T00:00:00Z",
    subject: { id: "sub_pairwise" },
    client: { client_id: "https://app.example/client" },
    source: { kind: "connector", id: "https://registry.pdpp.dev/sources/spotify" },
    source_declaration: { version: "rev1" },
    purpose_code: "https://pdpp.dev/purpose/personalization",
    access_mode: "continuous",
    streams: [
      { name: "top_artists", instance_ids: ["inst_A", "inst_B"], fields: ["id", "name"], required_fields: ["id"] },
    ],
    retention: { max_duration: "P30D", on_expiry: "delete" },
    ...overrides,
  };
}

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

/** A scripted RS: each call pops the next response; records the requests. */
function scripted(responses: Response[]) {
  const calls: { url: URL; headers: Headers }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  };
  return { fetch, calls };
}

const v = { "PDPP-Version": "0.1" };
const page = (p: Partial<PdppRecordPage>): PdppRecordPage => ({ object: "list", has_more: false, data: [], ...p });

describe("authorization (Client items 1, 12, 13, 27, 28, 33)", () => {
  it("derives the RFC 8414 metadata URL with path insertion", () => {
    expect(authorizationServerMetadataUrl(ISSUER)).toBe(
      "https://ps.example/.well-known/oauth-authorization-server/pdpp/v1",
    );
  });

  it("refuses an AS that does not advertise data-access (item 12)", async () => {
    expect(() => {
      assertSupportsDataAccess({ authorization_details_types_supported: ["x"] });
    }).toThrow(
      PdppProtocolError,
    );
    const { fetch } = scripted([json({ issuer: ISSUER, token_endpoint: `${ISSUER}/token` })]);
    await expect(discoverPdppAuthorizationServer(ISSUER, { fetch })).rejects.toThrow(PdppProtocolError);
  });

  it("refuses metadata for a different issuer", async () => {
    const { fetch } = scripted([
      json({
        issuer: "https://evil.example",
        token_endpoint: "https://evil.example/token",
        authorization_details_types_supported: [PDPP_DATA_ACCESS_TYPE],
      }),
    ]);
    await expect(discoverPdppAuthorizationServer(ISSUER, { fetch })).rejects.toThrow(/issuer/);
  });

  it("builds an RFC 9396 data-access detail and enforces its client-side rules (items 1, 27)", () => {
    const detail = buildDataAccessDetail({
      source: { id: "https://registry.pdpp.dev/sources/spotify" },
      purpose_code: "https://pdpp.dev/purpose/personalization",
      access_mode: "continuous",
      streams: [{ name: "top_artists", fields: ["*"] }],
    });
    expect(detail.type).toBe(PDPP_DATA_ACCESS_TYPE);
    expect(() =>
      buildDataAccessDetail({
        source: { id: "s" },
        purpose_code: "https://app.example/purpose/playlist",
        access_mode: "continuous",
        streams: [{ name: "a", fields: ["*"] }],
      }),
    ).toThrow(/purpose_description/);
    expect(() =>
      buildDataAccessDetail({
        source: { id: "s" },
        purpose_code: "https://pdpp.dev/purpose/export",
        access_mode: "single_use",
        streams: [{ name: "a" }],
      }),
    ).toThrow(/fields or view/);
    expect(() =>
      buildDataAccessDetail({
        source: { id: "s" },
        purpose_code: "https://pdpp.dev/purpose/export",
        access_mode: "single_use",
      }),
    ).toThrow(/exactly one/);
  });

  it("creates an S256 PKCE pair", async () => {
    const pair = await createPkcePair();
    expect(pair.codeChallengeMethod).toBe("S256");
    expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.codeChallenge).not.toBe(pair.codeVerifier);
  });

  it("refuses a token response without an authorization result (item 13)", () => {
    expect(() => interpretTokenResponse({ access_token: "t" }, ISSUER)).toThrow(/no authorization result/);
    // A lossy summary is not the result: it has no grant.
    expect(() =>
      interpretTokenResponse(
        { access_token: "t", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, streams: [] }] },
        ISSUER,
      ),
    ).toThrow(PdppProtocolError);
  });

  it("requires required_fields on every granted stream (item 33)", () => {
    const g = grant();
    delete (g.streams[0] as { required_fields?: string[] }).required_fields;
    expect(() =>
      interpretTokenResponse({ access_token: "t", authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: g }] }, ISSUER),
    ).toThrow(/required_fields/);
  });

  it("retains the authenticated issuer with every grant (item 28)", async () => {
    const { fetch, calls } = scripted([
      json({ access_token: "at", refresh_token: "rt", expires_in: 3600, authorization_details: [{ type: PDPP_DATA_ACCESS_TYPE, grant: grant() }] }),
    ]);
    const result = await exchangeAuthorizationCode({
      metadata: { issuer: ISSUER, token_endpoint: `${ISSUER}/token` },
      code: "c",
      codeVerifier: "v",
      clientId: "https://app.example/client",
      redirectUri: "https://app.example/cb",
      fetch,
    });
    expect(result.grants).toEqual([{ issuer: ISSUER, grant: grant() }]);
    expect(result.refreshToken).toBe("rt");
    expect(calls[0]!.url.toString()).toBe(`${ISSUER}/token`);
  });
});

describe("resource reads (Client items 2, 7, 9, 11, 14, 15, 32)", () => {
  const issuedGrant = { issuer: ISSUER, grant: grant() };

  it("sends the access token and pins PDPP-Version 0.1 (items 2, 32)", async () => {
    const { fetch, calls } = scripted([json(page({}), { headers: v })]);
    const client = new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch });
    await client.listRecords("top_artists");
    expect(calls[0]!.headers.get("Authorization")).toBe("Bearer at");
    expect(calls[0]!.headers.get("PDPP-Version")).toBe("0.1");
  });

  it.each([undefined, "2026-04-06", "0.1, 0.1"])(
    "does not use a successful response whose PDPP-Version is %j (item 32)",
    async (selected) => {
      const { fetch } = scripted([json(page({}), { headers: selected === undefined ? {} : { "PDPP-Version": selected } })]);
      const client = new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch });
      await expect(client.listRecords("top_artists")).rejects.toThrow(PdppProtocolError);
    },
  );

  it("treats an unknown error code as opaque and keeps the status authoritative (item 7)", async () => {
    const { fetch } = scripted([
      json({ error: { code: "brand_new_code", type: "permission_error", message: "x" } }, { status: 429, headers: { "Retry-After": "7" } }),
    ]);
    const client = new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch });
    const error = (await client.listRecords("top_artists").catch((e) => e)) as PdppHttpError;
    expect(error.status).toBe(429);
    expect(error.code).toBe("brand_new_code");
    expect(error.type).toBeUndefined(); // type incompatible with 429 is ignored
    expect(error.retryAfter).toBe("7");
  });

  it("stops on 401 invalid_token and on grant_revoked (item 9)", async () => {
    const { fetch } = scripted([
      json(
        { error: { code: "grant_revoked", type: "authentication_error", message: "revoked" } },
        { status: 401, headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } },
      ),
    ]);
    const client = new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch });
    await expect(client.listRecords("top_artists")).rejects.toBeInstanceOf(PdppHttpError);
    expect(client.stoppedReason).toBe("grant_revoked");
    await expect(client.listRecords("top_artists")).rejects.toBeInstanceOf(PdppClientStoppedError);
  });

  it("raises on a 404 rather than reporting the record as absent at the source (item 11)", async () => {
    const { fetch } = scripted([json({ error: { code: "not_found", type: "not_found_error", message: "no" } }, { status: 404, headers: v })]);
    const client = new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch });
    await expect(client.getRecord("top_artists", "r1", "inst_A")).rejects.toMatchObject({ status: 404 });
  });

  it("accepts unknown members and projected data without full-record validation (items 14, 15)", async () => {
    const { fetch } = scripted([
      json(page({ data: [{ object: "record", id: "r1", instance_id: "inst_A", stream: "top_artists", data: { id: "r1" }, future_member: 1 }], extra: true }), { headers: v }),
    ]);
    const client = new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch });
    const result = await client.listRecords("top_artists");
    expect(result.data[0]!.data).toEqual({ id: "r1" });
  });
});

describe("sync (Client items 3, 4, 5, 6, 10)", () => {
  const issuedGrant = { issuer: ISSUER, grant: grant() };
  const ctx = { grantId: "grt_1", stream: "top_artists" };
  const rec = (instance: string, id: string, data?: Record<string, unknown>, deleted = false) => ({
    object: "record" as const, id, instance_id: instance, stream: "top_artists", ...(deleted ? { deleted: true } : { data }),
  });

  it("starts from beginning, follows next_cursor with the same token, and stores the terminal next_changes_since (items 3, 4)", async () => {
    const { fetch, calls } = scripted([
      json(page({ has_more: true, next_cursor: "pc_2", data: [rec("inst_A", "r1", { id: "r1" })] }), { headers: v }),
      json(page({ next_changes_since: "cs_9", data: [rec("inst_B", "r1", { id: "r1" })] }), { headers: v }),
    ]);
    const copy = new InMemoryPdppSyncCopy();
    const client = new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch });
    await client.sync("top_artists", copy);
    expect(calls[0]!.url.searchParams.get("changes_since")).toBe("beginning");
    expect(calls[1]!.url.searchParams.get("changes_since")).toBe("beginning");
    expect(calls[1]!.url.searchParams.get("cursor")).toBe("pc_2");
    expect(copy.syncToken(ctx)).toBe("cs_9");
    // Same id in two instances: two records (item 10).
    expect(copy.records(ctx)).toHaveLength(2);
  });

  it("replaces a record within its projection, removes omitted fields, keeps nulls, and ignores tombstones for unheld records (items 5, 10)", async () => {
    const copy = new InMemoryPdppSyncCopy();
    const first = scripted([json(page({ next_changes_since: "cs_1", data: [rec("inst_A", "r1", { id: "r1", name: "x", genre: "y" })] }), { headers: v })]);
    await new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch: first.fetch }).sync("top_artists", copy);
    const second = scripted([
      json(page({ next_changes_since: "cs_2", data: [rec("inst_A", "r1", { id: "r1", name: null }), rec("inst_A", "ghost", undefined, true)] }), { headers: v }),
    ]);
    await new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch: second.fetch }).sync("top_artists", copy);
    expect(second.calls[0]!.url.searchParams.get("changes_since")).toBe("cs_1");
    expect(copy.records(ctx).map((r) => r.data)).toEqual([{ id: "r1", name: null }]);
  });

  it("restarts from beginning on 410 cursor_expired and replaces the copy (item 5)", async () => {
    const copy = new InMemoryPdppSyncCopy();
    const seed = scripted([json(page({ next_changes_since: "cs_1", data: [rec("inst_A", "old", { id: "old" })] }), { headers: v })]);
    await new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch: seed.fetch }).sync("top_artists", copy);
    const { fetch, calls } = scripted([
      json({ error: { code: "cursor_expired", type: "gone_error", message: "expired" } }, { status: 410, headers: v }),
      json(page({ next_changes_since: "cs_fresh", data: [rec("inst_A", "new", { id: "new" })] }), { headers: v }),
    ]);
    const result = await new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch }).sync("top_artists", copy);
    expect(result.restarted).toBe(true);
    expect(calls[1]!.url.searchParams.get("changes_since")).toBe("beginning");
    expect(copy.records(ctx).map((r) => r.id)).toEqual(["new"]);
  });

  it("refuses a terminal page without next_changes_since", async () => {
    const { fetch } = scripted([json(page({}), { headers: v })]);
    await expect(
      new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch }).sync("top_artists", new InMemoryPdppSyncCopy()),
    ).rejects.toThrow(/next_changes_since/);
  });

  it("counts retention from first acquisition and never restarts it (item 6)", async () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const copy = new InMemoryPdppSyncCopy(() => now);
    const client = (responses: Response[]) =>
      new PdppResourceClient({ coreQueryBase: "https://ps.example/v1", accessToken: "at", issuedGrant, fetch: scripted(responses).fetch });
    await client([json(page({ next_changes_since: "cs_1", data: [rec("inst_A", "r1", { id: "r1" })] }), { headers: v })]).sync("top_artists", copy);
    now += 20 * 86_400_000;
    // Re-read 20 days later: the ceiling still counts from day 0.
    await client([json(page({ next_changes_since: "cs_2", data: [rec("inst_A", "r1", { id: "r1", name: "n" })] }), { headers: v })]).sync("top_artists", copy);
    now += 11 * 86_400_000;
    expect(copy.applyRetention(ctx, { max_duration: "P30D", on_expiry: "delete" })).toEqual({ expired: 1 });
    expect(copy.records(ctx)).toHaveLength(0);
  });
});
