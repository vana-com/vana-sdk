import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import { LineageReadError } from "../errors";
import {
  createMockGateway,
  createMockPersonalServer,
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
const DERIVED_SCOPE = "notes.summary";
const WRITE_GRANT_ID = "0xwritegrant1";
const READ_GRANT_ID = "0xreadgrant1";

const owner = privateKeyToAccount(generatePrivateKey());
const builder = privateKeyToAccount(generatePrivateKey());

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
        scopes: ["write:notes.*"],
      },
      {
        id: READ_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: ["notes.*"],
      },
    ],
    knownDataPoints: [
      {
        dataPointId: sourceId,
        scope: SOURCE_SCOPE,
        version: 3,
        deletedAt: null,
      },
      {
        dataPointId: hiddenId,
        scope: HIDDEN_SCOPE,
        version: 1,
        deletedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
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
  it("builds the lineage paths", () => {
    expect(personalServerLineagePath("notes.entries")).toBe(
      "/v1/data/notes.entries/lineage",
    );
    expect(gatewayLineagePath(sourceId)).toBe(`/v1/data/${sourceId}/lineage`);
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

    expect(graph.dataPointId).toBe(derivedId);
    expect(graph.derivatives).toEqual([]);
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
    });
  });

  it("appends ?version= to the URL but signs the bare path", async () => {
    const server = makeServer();
    server.respondNextWith(200, {
      dataPointId: derivedId,
      sources: [],
      derivatives: [],
    });
    await getLineage({
      personalServerUrl: PS_ORIGIN,
      scope: DERIVED_SCOPE,
      grantId: READ_GRANT_ID,
      signer: builder,
      version: 2,
      fetch: server.fetch,
    });
    const request = server.requests.at(-1);
    expect(request?.path).toBe(`/v1/data/${DERIVED_SCOPE}/lineage?version=2`);
    expect(
      parseWeb3SignedHeader(request?.headers.authorization).payload.uri,
    ).toBe(`/v1/data/${DERIVED_SCOPE}/lineage`);
  });

  it("maps a refused read to LineageReadError with the server's code", async () => {
    const server = makeServer();
    const err = await getPersonalServerLineage({
      personalServerUrl: PS_ORIGIN,
      scope: DERIVED_SCOPE,
      grantId: WRITE_GRANT_ID,
      signer: builder,
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LineageReadError);
    expect((err as LineageReadError).status).toBe(403);
    expect((err as LineageReadError).errorCode).toBe("SCOPE_MISMATCH");
    expect((err as LineageReadError).code).toBe("LINEAGE_READ_ERROR");
  });

  it("rejects a body that is not a lineage graph", async () => {
    const server = makeServer();
    server.respondNextWith(200, { dataPointId: "nope", sources: [] });
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
  const graph = {
    dataPointId: derivedId,
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
        dataPointId: deriveDataPointId(owner.address, "notes.digest"),
        scope: "notes.digest",
        version: "1",
        deletedAt: "2026-08-02T00:00:00.000Z",
      },
    ],
  };

  it("reads a graph from the gateway envelope, unauthenticated by default", async () => {
    const gateway = createMockGateway({
      origin: GATEWAY_ORIGIN,
      graphs: { [derivedId.toLowerCase()]: graph },
    });
    const result = await getLineage({
      gatewayUrl: `${GATEWAY_ORIGIN}/`,
      dataPointId: derivedId,
      fetch: gateway.fetch,
    });
    expect(result).toEqual(graph);
    expect(LineageGraphSchema.parse(result)).toEqual(graph);
    const [request] = gateway.requests;
    expect(request.path).toBe(`/v1/data/${derivedId}/lineage`);
    expect(request.headers.authorization).toBeUndefined();
  });

  it("accepts an unwrapped graph too, and forwards ?version=", async () => {
    const gateway = createMockGateway({
      origin: GATEWAY_ORIGIN,
      graphs: { [derivedId.toLowerCase()]: graph },
      envelope: false,
    });
    const result = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      version: "7",
      fetch: gateway.fetch,
    });
    expect(result.derivatives[0]).toMatchObject({ scope: "notes.digest" });
    expect(gateway.requests[0].path).toBe(
      `/v1/data/${derivedId}/lineage?version=7`,
    );
  });

  it("signs the request for the gateway audience when a signer is given", async () => {
    const gateway = createMockGateway({
      origin: GATEWAY_ORIGIN,
      graphs: { [derivedId.toLowerCase()]: graph },
    });
    await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      signer: builder,
      grantId: READ_GRANT_ID,
      fetch: gateway.fetch,
    });
    const proof = parseWeb3SignedHeader(
      gateway.requests[0].headers.authorization,
    );
    expect(proof.payload).toMatchObject({
      aud: GATEWAY_ORIGIN,
      method: "GET",
      uri: `/v1/data/${derivedId}/lineage`,
      grantId: READ_GRANT_ID,
    });
  });

  it("maps 404 to LineageReadError DATA_POINT_NOT_FOUND", async () => {
    const gateway = createMockGateway({ origin: GATEWAY_ORIGIN, graphs: {} });
    const err = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: derivedId,
      fetch: gateway.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LineageReadError);
    expect((err as LineageReadError).status).toBe(404);
    expect((err as LineageReadError).errorCode).toBe("DATA_POINT_NOT_FOUND");
  });

  it("refuses a malformed data point id before any request", async () => {
    const gateway = createMockGateway({ origin: GATEWAY_ORIGIN, graphs: {} });
    const err = await getGatewayLineage({
      gatewayUrl: GATEWAY_ORIGIN,
      dataPointId: "0xabc" as Hex,
      fetch: gateway.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LineageReadError);
    expect((err as LineageReadError).errorCode).toBe("INVALID_DATA_POINT_ID");
    expect(gateway.requests).toHaveLength(0);
  });
});
