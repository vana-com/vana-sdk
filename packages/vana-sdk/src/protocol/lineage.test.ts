import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import { LineageReadError } from "../errors";
import {
  createMockGateway,
  createMockPersonalServer,
  type MockGatewayView,
} from "../tests/mock-personal-server";
import {
  deriveDataPointId,
  gatewayLineagePath,
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
    { dataPointId: hiddenId, redacted: true },
  ],
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

  it("builds the canonical gateway lineage uri: lowercase id, version then lowercase grantId", () => {
    const upper = sourceId.toUpperCase().replace("0X", "0x") as Hex;
    expect(gatewayLineagePath(upper)).toBe(`/v1/data/${sourceId}/lineage`);
    expect(gatewayLineagePath(sourceId, { version: 2 })).toBe(
      `/v1/data/${sourceId}/lineage?version=2`,
    );
    expect(gatewayLineagePath(sourceId, { grantId: "0xAbC" })).toBe(
      `/v1/data/${sourceId}/lineage?grantId=0xabc`,
    );
    expect(
      gatewayLineagePath(sourceId, { grantId: "0xAbC", version: "7" }),
    ).toBe(`/v1/data/${sourceId}/lineage?version=7&grantId=0xabc`);
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
      { dataPointId: hiddenId, redacted: true },
    ]);
    const [visible, hidden] = graph.sources;
    expect(isRedactedLineageNode(visible)).toBe(false);
    expect(isRedactedLineageNode(hidden)).toBe(true);

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

  it("appends ?version= to the URL and signs the path the server checks", async () => {
    const server = makeServer();
    server.respondNextWith(200, {
      data: { ...view, dataPointId: derivedId },
      proof: {},
    });
    const result = await getLineage({
      personalServerUrl: PS_ORIGIN,
      scope: DERIVED_SCOPE,
      grantId: READ_GRANT_ID,
      signer: builder,
      version: 2,
      fetch: server.fetch,
    });
    expect(result.version).toBe("3");
    const request = server.requests.at(-1);
    expect(request?.path).toBe(`/v1/data/${DERIVED_SCOPE}/lineage?version=2`);
    expect(
      parseWeb3SignedHeader(request?.headers.authorization).payload.uri,
    ).toBe(`/v1/data/${DERIVED_SCOPE}/lineage`);
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
  it("signs the canonical uri (lowercase id, lowercase grantId claim and query) and reads the envelope", async () => {
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

    const [request] = gateway.requests;
    const expectedUri = `/v1/data/${derivedId}/lineage?grantId=${READ_GRANT_ID.toLowerCase()}`;
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

  it("puts version before grantId in the signed query", async () => {
    const gateway = makeGateway();
    await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      version: "7",
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: gateway.fetch,
    });
    const expectedUri = `/v1/data/${derivedId}/lineage?version=7&grantId=${READ_GRANT_ID.toLowerCase()}`;
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

  it("maps gateway refusals to LineageReadError with the gateway's code and message", async () => {
    const gateway = makeGateway();
    const noGrant = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      signer: builder,
      fetch: gateway.fetch,
    }).catch((e: unknown) => e);
    expect(noGrant).toBeInstanceOf(LineageReadError);
    expect((noGrant as LineageReadError).status).toBe(403);
    expect((noGrant as LineageReadError).errorCode).toBe("FORBIDDEN");
    expect((noGrant as LineageReadError).message).toBe(
      "signer holds no covering grant",
    );

    const strangerRead = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      grantId: READ_GRANT_ID,
      signer: stranger,
      fetch: gateway.fetch,
    }).catch((e: unknown) => e);
    expect((strangerRead as LineageReadError).status).toBe(403);

    const unknown = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: deriveDataPointId(owner.address, "nothing.here"),
      grantId: READ_GRANT_ID,
      signer: builder,
      fetch: gateway.fetch,
    }).catch((e: unknown) => e);
    expect((unknown as LineageReadError).status).toBe(404);
    expect((unknown as LineageReadError).errorCode).toBe(
      "DATA_POINT_NOT_FOUND",
    );
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
