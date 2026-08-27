import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import { LineageReadError, WriteRequestError } from "../errors";
import {
  createMockGateway,
  createMockPersonalServer,
  type MockGatewayView,
} from "../tests/mock-personal-server";
import {
  assertDerivedScopeNaming,
  deriveDataPointId,
  derivedScopeViolatesNaming,
  gatewayLineagePath,
  scopeNamespace,
  getGatewayLineage,
  getLineage,
  getPersonalServerLineage,
  isDataPointId,
  isRedactedLineageNode,
  LineageGraphSchema,
  personalServerLineagePath,
} from "./lineage";
import { openWriteSession, writeData } from "./personal-server-write";

const PS_ORIGIN = "http://ps.test:8798";
const GATEWAY_ORIGIN = "https://gateway.test";
const SOURCE_SCOPE = "notes.entries";
const HIDDEN_SCOPE = "health.records";
const DERIVED_SCOPE = "coach.summary";
const WRITE_GRANT_ID = "0xwritegrant1";
const READ_GRANT_ID = "0xReadGrant1";

const owner = privateKeyToAccount(generatePrivateKey());
const builder = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

const sourceId = deriveDataPointId(owner.address, SOURCE_SCOPE);
const hiddenId = deriveDataPointId(owner.address, HIDDEN_SCOPE);
const derivedId = deriveDataPointId(owner.address, DERIVED_SCOPE);
const danglingId = deriveDataPointId(owner.address, "gone.scope");

function makeServer() {
  return createMockPersonalServer({
    origin: PS_ORIGIN,
    owner: owner.address,
    grants: [
      {
        id: WRITE_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: ["write:coach.*"],
      },
      {
        id: READ_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: ["notes.*", "coach.*"],
      },
    ],
    knownDataPoints: [
      {
        dataPointId: sourceId,
        scope: SOURCE_SCOPE,
        version: "3",
        deletedAt: null,
      },
      {
        dataPointId: hiddenId,
        scope: HIDDEN_SCOPE,
        version: "1",
        deletedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  });
}

const view: MockGatewayView = {
  dataPointId: derivedId,
  ownerAddress: owner.address,
  scope: DERIVED_SCOPE,
  version: "3",
  deletedAt: null,
  sources: [
    {
      dataPointId: sourceId,
      scope: SOURCE_SCOPE,
      version: "3",
      deletedAt: null,
    },
    { redacted: true },
    // A source that no longer resolves to a registered data point.
    {
      dataPointId: danglingId,
      scope: "gone.scope",
      version: "0",
      deletedAt: null,
    },
  ],
  derivativesTruncated: true,
  derivatives: [
    {
      dataPointId: deriveDataPointId(owner.address, "coach.weekly"),
      scope: "coach.weekly",
      version: "1",
      deletedAt: "2026-08-02T00:00:00.000Z",
    },
  ],
};

function makeGateway(
  overrides: Partial<Parameters<typeof createMockGateway>[0]> = {},
) {
  return createMockGateway({
    origin: GATEWAY_ORIGIN,
    graphs: { [derivedId.toLowerCase()]: view },
    grants: { [builder.address.toLowerCase()]: [READ_GRANT_ID.toLowerCase()] },
    ...overrides,
  });
}

describe("deriveDataPointId", () => {
  it("is keccak256(abi.encode(address owner, string scope))", () => {
    const expected = keccak256(
      encodeAbiParameters(
        [
          { name: "ownerAddress", type: "address" },
          { name: "scope", type: "string" },
        ],
        [owner.address, SOURCE_SCOPE],
      ),
    );
    expect(deriveDataPointId(owner.address, SOURCE_SCOPE)).toBe(expected);
    expect(isDataPointId(expected)).toBe(true);
    expect(deriveDataPointId(owner.address, "other")).not.toBe(expected);
  });

  it("is case-insensitive over the owner address and rejects non-addresses", () => {
    expect(deriveDataPointId(owner.address.toLowerCase() as Hex, "s")).toBe(
      deriveDataPointId(owner.address, "s"),
    );
    expect(() => deriveDataPointId("0x1234" as Hex, "s")).toThrow(
      /not an EVM address/,
    );
  });

  it("isDataPointId accepts only 32-byte hex", () => {
    expect(isDataPointId(sourceId)).toBe(true);
    expect(isDataPointId(sourceId.toUpperCase().replace("0X", "0x"))).toBe(
      true,
    );
    expect(isDataPointId(sourceId.slice(0, 65))).toBe(false);
    expect(isDataPointId(`${sourceId}0`)).toBe(false);
    expect(isDataPointId(sourceId.slice(2))).toBe(false);
    expect(isDataPointId(42)).toBe(false);
  });
});

describe("paths", () => {
  it("builds the Personal Server lineage path", () => {
    expect(personalServerLineagePath("notes.entries")).toBe(
      "/v1/data/notes.entries/lineage",
    );
  });

  it("builds the lineage paths with the version as a path segment and the id lowercased", () => {
    const upper = sourceId.toUpperCase().replace("0X", "0x") as Hex;
    expect(gatewayLineagePath(upper)).toBe(`/v1/data/${sourceId}/lineage`);
    expect(gatewayLineagePath(sourceId, 2)).toBe(
      `/v1/data/${sourceId}/lineage/2`,
    );
    expect(personalServerLineagePath("coach.summary", "7")).toBe(
      "/v1/data/coach.summary/lineage/7",
    );
  });

  it("naming rule helpers mirror the server", () => {
    expect(scopeNamespace("chatgpt.conversations")).toBe("chatgpt");
    expect(
      derivedScopeViolatesNaming("chatgpt.summary", "chatgpt.conversations"),
    ).toBe(true);
    expect(
      derivedScopeViolatesNaming("coach.summary", "chatgpt.conversations"),
    ).toBe(false);
    expect(() =>
      assertDerivedScopeNaming("coach.summary", [
        "chatgpt.conversations",
        "oura.sleep",
      ]),
    ).not.toThrow();
    expect(() =>
      assertDerivedScopeNaming("oura.summary", [
        "chatgpt.conversations",
        "oura.sleep",
      ]),
    ).toThrow(WriteRequestError);
  });
});

describe("getPersonalServerLineage", () => {
  it("reads the lineage of a derivative written through the SDK, redacting sources the grant does not cover", async () => {
    const server = makeServer();
    const session = await openWriteSession({
      personalServerUrl: PS_ORIGIN,
      signer: builder,
      grantId: WRITE_GRANT_ID,
      fetch: server.fetch,
    });
    await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "derived" },
      lineage: [sourceId, hiddenId],
      fetch: server.fetch,
    });

    const graph = await getPersonalServerLineage({
      personalServerUrl: `${PS_ORIGIN}/`,
      scope: DERIVED_SCOPE,
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: server.fetch,
    });

    expect(graph).toMatchObject({
      dataPointId: derivedId,
      ownerAddress: owner.address,
      scope: DERIVED_SCOPE,
      version: "1",
      deletedAt: null,
      derivatives: [],
      proof: { status: "confirmed" },
    });
    expect(graph.sources).toEqual([
      {
        dataPointId: sourceId,
        scope: SOURCE_SCOPE,
        version: "3",
        deletedAt: null,
      },
      { redacted: true },
    ]);
    const [visible, hidden] = graph.sources;
    expect(isRedactedLineageNode(visible)).toBe(false);
    expect(isRedactedLineageNode(hidden)).toBe(true);
    // A builder view discloses no 0x identifier beyond its own data point.
    const identifiers = JSON.stringify(graph).match(/0x[0-9a-fA-F]{40,}/g);
    expect(identifiers).toEqual([derivedId, owner.address, sourceId]);
    expect(JSON.stringify(graph)).not.toContain(hiddenId);

    const request = server.requests.at(-1);
    expect(request?.method).toBe("GET");
    expect(request?.path).toBe(`/v1/data/${DERIVED_SCOPE}/lineage`);
    const proof = parseWeb3SignedHeader(request?.headers.authorization);
    expect(proof.payload).toMatchObject({
      aud: PS_ORIGIN,
      method: "GET",
      uri: `/v1/data/${DERIVED_SCOPE}/lineage`,
      grantId: READ_GRANT_ID,
      bodyHash:
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
  });

  it("sends the version as a path segment and signs that full path", async () => {
    const server = makeServer();
    const session = await openWriteSession({
      personalServerUrl: PS_ORIGIN,
      signer: builder,
      grantId: WRITE_GRANT_ID,
      fetch: server.fetch,
    });
    for (const summary of ["v1", "v2"]) {
      await writeData({
        session,
        scope: DERIVED_SCOPE,
        data: { summary },
        lineage: [sourceId],
        fetch: server.fetch,
      });
    }
    const result = await getLineage({
      personalServerUrl: PS_ORIGIN,
      scope: DERIVED_SCOPE,
      grantId: READ_GRANT_ID,
      signer: builder,
      version: 2,
      fetch: server.fetch,
    });
    expect(result.version).toBe("2");
    const request = server.requests.at(-1);
    expect(request?.path).toBe(`/v1/data/${DERIVED_SCOPE}/lineage/2`);
    expect(
      parseWeb3SignedHeader(request?.headers.authorization).payload.uri,
    ).toBe(`/v1/data/${DERIVED_SCOPE}/lineage/2`);

    const missing = await getLineage({
      personalServerUrl: PS_ORIGIN,
      scope: DERIVED_SCOPE,
      grantId: READ_GRANT_ID,
      signer: builder,
      version: 9,
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect((missing as LineageReadError).status).toBe(404);
    expect((missing as LineageReadError).errorCode).toBe("NOT_FOUND");
  });

  it("the servers refuse a query string; the client never sends one", async () => {
    const server = makeServer();
    const res = await server.fetch(
      `${PS_ORIGIN}/v1/data/${DERIVED_SCOPE}/lineage?version=2`,
    );
    expect(res.status).toBe(400);
    const gateway = makeGateway();
    const gres = await gateway.fetch(
      `${GATEWAY_ORIGIN}/v1/data/${derivedId}/lineage?version=2`,
    );
    expect(gres.status).toBe(400);
  });

  it("refuses a malformed version before any request", async () => {
    const server = makeServer();
    for (const version of ["0", "1.5", "-2", "abc"]) {
      const err = await getPersonalServerLineage({
        personalServerUrl: PS_ORIGIN,
        scope: DERIVED_SCOPE,
        grantId: READ_GRANT_ID,
        signer: builder,
        version,
        fetch: server.fetch,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LineageReadError);
      expect((err as LineageReadError).errorCode).toBe("INVALID_VERSION");
    }
    expect(server.requests).toHaveLength(0);
  });

  it("maps a refused read and an unregistered scope to LineageReadError with the server's code", async () => {
    const server = makeServer();
    const forbidden = await getPersonalServerLineage({
      personalServerUrl: PS_ORIGIN,
      scope: DERIVED_SCOPE,
      grantId: WRITE_GRANT_ID,
      signer: builder,
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(forbidden).toBeInstanceOf(LineageReadError);
    expect((forbidden as LineageReadError).status).toBe(403);
    expect((forbidden as LineageReadError).errorCode).toBe("SCOPE_MISMATCH");
    expect((forbidden as LineageReadError).code).toBe("LINEAGE_READ_ERROR");

    const missing = await getPersonalServerLineage({
      personalServerUrl: PS_ORIGIN,
      scope: DERIVED_SCOPE,
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(LineageReadError);
    expect((missing as LineageReadError).status).toBe(404);
    expect((missing as LineageReadError).errorCode).toBe("NOT_FOUND");
  });

  it("refuses a view whose redacted node carries anything but `redacted: true`", async () => {
    const server = makeServer();
    const leaking = [
      { dataPointId: hiddenId, redacted: true },
      // Every visible-node field plus the marker: must not pass as visible.
      {
        dataPointId: hiddenId,
        scope: HIDDEN_SCOPE,
        version: "1",
        deletedAt: null,
        redacted: true,
      },
      { redacted: true, scope: HIDDEN_SCOPE },
      { redacted: true, version: "1" },
    ];
    for (const node of leaking) {
      server.respondNextWith(200, {
        data: { ...view, sources: [view.sources[0], node] },
        proof: {},
      });
      const err = await getPersonalServerLineage({
        personalServerUrl: PS_ORIGIN,
        scope: DERIVED_SCOPE,
        grantId: READ_GRANT_ID,
        signer: builder,
        fetch: server.fetch,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LineageReadError);
      expect((err as LineageReadError).details).toHaveProperty("issues");
      expect(JSON.stringify(err)).not.toContain(HIDDEN_SCOPE);
    }
    expect(
      isRedactedLineageNode({
        dataPointId: hiddenId,
        redacted: true,
      } as unknown as Parameters<typeof isRedactedLineageNode>[0]),
    ).toBe(false);
    expect(isRedactedLineageNode({ redacted: true })).toBe(true);
  });

  it("rejects a body that is not a lineage view, including a malformed version", async () => {
    const server = makeServer();
    for (const version of ["abc", "0", -1, 1.5]) {
      server.respondNextWith(200, { data: { ...view, version }, proof: {} });
      const bad = await getPersonalServerLineage({
        personalServerUrl: PS_ORIGIN,
        scope: DERIVED_SCOPE,
        grantId: READ_GRANT_ID,
        signer: builder,
        fetch: server.fetch,
      }).catch((e: unknown) => e);
      expect(bad).toBeInstanceOf(LineageReadError);
      expect((bad as LineageReadError).details).toHaveProperty("issues");
    }
    server.respondNextWith(200, { data: { dataPointId: "nope", sources: [] } });
    const err = await getPersonalServerLineage({
      personalServerUrl: PS_ORIGIN,
      scope: DERIVED_SCOPE,
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LineageReadError);
    expect((err as LineageReadError).details).toHaveProperty("issues");
  });

  it("wraps a thrown fetch", async () => {
    const server = makeServer();
    server.failNext(1, new TypeError("fetch failed"));
    const err = await getPersonalServerLineage({
      personalServerUrl: PS_ORIGIN,
      scope: DERIVED_SCOPE,
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LineageReadError);
    expect((err as LineageReadError).status).toBeUndefined();
    expect((err as LineageReadError).message).toContain("fetch failed");
  });
});

describe("getGatewayLineage", () => {
  it("signs the bare path (lowercase id) with the lowercase grantId claim and reads the envelope", async () => {
    const gateway = makeGateway();
    const upper = derivedId.toUpperCase().replace("0X", "0x") as Hex;
    const result = await getLineage({
      gatewayUrl: `${GATEWAY_ORIGIN}/`,
      dataPointId: upper,
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: gateway.fetch,
    });
    expect(result).toEqual({ ...view, proof: expect.any(Object) });
    expect(LineageGraphSchema.parse(result)).toEqual(view);
    expect(result.derivativesTruncated).toBe(true);
    expect(result.sources[2]).toEqual({
      dataPointId: danglingId,
      scope: "gone.scope",
      version: "0",
      deletedAt: null,
    });

    const [request] = gateway.requests;
    const expectedUri = `/v1/data/${derivedId}/lineage`;
    expect(request.path).toBe(expectedUri);
    const proof = parseWeb3SignedHeader(request.headers.authorization);
    expect(proof.payload).toMatchObject({
      aud: GATEWAY_ORIGIN,
      method: "GET",
      uri: expectedUri,
      grantId: READ_GRANT_ID.toLowerCase(),
      bodyHash:
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
    expect(proof.payload.exp - proof.payload.iat).toBeLessThanOrEqual(3600);
  });

  it("puts the version in the signed path", async () => {
    const gateway = makeGateway();
    await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      version: "7",
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: gateway.fetch,
    });
    const expectedUri = `/v1/data/${derivedId}/lineage/7`;
    expect(gateway.requests[0].path).toBe(expectedUri);
    expect(
      parseWeb3SignedHeader(gateway.requests[0].headers.authorization).payload
        .uri,
    ).toBe(expectedUri);
  });

  it("accepts an unwrapped view too", async () => {
    const gateway = makeGateway({ envelope: false });
    const result = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: gateway.fetch,
    });
    expect(result).toEqual(view);
    expect(result.proof).toBeUndefined();
    expect(result.derivatives[0]).toMatchObject({ scope: "coach.weekly" });
  });

  it("maps the uniform 404 (no grant, wrong signer, unknown id) and reads gateway error bodies", async () => {
    const gateway = makeGateway();
    const cases = [
      { dataPointId: derivedId, signer: builder },
      { dataPointId: derivedId, signer: stranger, grantId: READ_GRANT_ID },
      {
        dataPointId: deriveDataPointId(owner.address, "nothing.here"),
        signer: builder,
        grantId: READ_GRANT_ID,
      },
    ];
    for (const params of cases) {
      const err = await getGatewayLineage({
        gatewayUrl: GATEWAY_ORIGIN,
        fetch: gateway.fetch,
        ...params,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LineageReadError);
      expect((err as LineageReadError).status).toBe(404);
      expect((err as LineageReadError).errorCode).toBe("NOT_FOUND");
      expect((err as LineageReadError).message).toBe("Unknown data point");
    }

    const unsigned = await gateway.fetch(
      `${GATEWAY_ORIGIN}/v1/data/${derivedId}/lineage`,
    );
    expect(unsigned.status).toBe(401);
    expect((await unsigned.json()).code).toBe("LINEAGE_SIGNATURE_REQUIRED");

    const gatewayBodyFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: "Lineage source is not a data point of this owner",
          code: "LINEAGE_SOURCE_UNKNOWN",
          unknown: [hiddenId],
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    const detailed = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: gatewayBodyFetch,
    }).catch((e: unknown) => e);
    expect((detailed as LineageReadError).status).toBe(422);
    expect((detailed as LineageReadError).errorCode).toBe(
      "LINEAGE_SOURCE_UNKNOWN",
    );
    expect((detailed as LineageReadError).details).toEqual({
      unknown: [hiddenId],
    });
  });

  it("refuses a malformed data point id or version before any request", async () => {
    const gateway = makeGateway();
    const badId = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: "0xabc" as Hex,
      signer: builder,
      fetch: gateway.fetch,
    }).catch((e: unknown) => e);
    expect(badId).toBeInstanceOf(LineageReadError);
    expect((badId as LineageReadError).errorCode).toBe("INVALID_DATA_POINT_ID");
    const badVersion = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      version: 0,
      signer: builder,
      fetch: gateway.fetch,
    }).catch((e: unknown) => e);
    expect((badVersion as LineageReadError).errorCode).toBe("INVALID_VERSION");
    expect(gateway.requests).toHaveLength(0);
  });
});
