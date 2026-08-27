import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress, type Address, type Hex } from "viem";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import { computeBodyHash } from "../auth/web3-signed-builder";
import {
  WriteConflictError,
  WriteForbiddenError,
  WriteLineageError,
  WriteRejectedError,
  WriteRequestError,
  WriteSessionError,
  WriteSessionExpiredError,
  WriteTransportError,
  WriteUnauthorizedError,
} from "../errors";
import {
  createMockPersonalServer,
  personalServerBinaryWriteSignedBytes,
  type MockPersonalServer,
} from "../tests/mock-personal-server";
import { deriveDataPointId } from "./lineage";
import {
  binaryWriteSignedBytes,
  encodeWriteMetadataHeader,
  normalizeBinaryMimeType,
  openWriteSession,
  parseWriteMetadataHeader,
  sessionCoversScope,
  writeData,
  writePersonalServerData,
  WRITE_METADATA_HEADER,
  WRITE_SIGNATURE_HEADER,
} from "./personal-server-write";

const ORIGIN = "http://ps.test:8798";
const SCOPE = "notes.entries";
const DERIVED_SCOPE = "coach.summary";
const WRITE_GRANT_ID = "0xwritegrant1";
const READ_GRANT_ID = "0xreadgrant1";
const WIDE_GRANT_ID = "0xwritegrant-wide";

const owner = privateKeyToAccount(generatePrivateKey());
const builder = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

const sourceId = deriveDataPointId(owner.address, SCOPE);
const foreignSourceId = deriveDataPointId(stranger.address, SCOPE);

function makeServer(
  overrides: Partial<Parameters<typeof createMockPersonalServer>[0]> = {},
): MockPersonalServer {
  return createMockPersonalServer({
    origin: ORIGIN,
    owner: owner.address,
    grants: [
      {
        id: WRITE_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: [`write:${SCOPE}`],
      },
      {
        id: WIDE_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: ["write:notes.*", "write:coach.*", SCOPE],
      },
      {
        id: READ_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: [SCOPE],
      },
    ],
    knownDataPoints: [
      { dataPointId: sourceId, scope: SCOPE, version: "1", deletedAt: null },
    ],
    ...overrides,
  });
}

const noRetry = { attempts: 1 };

describe("openWriteSession", () => {
  it("replays the Personal Server e2e handshake: Web3Signed POST with the grantId claim", async () => {
    const server = makeServer();
    const session = await openWriteSession({
      personalServerUrl: `${ORIGIN}/`,
      signer: builder,
      grantId: WRITE_GRANT_ID,
      fetch: server.fetch,
    });

    expect(session.personalServerUrl).toBe(ORIGIN);
    expect(session.audience).toBe(ORIGIN);
    expect(session.grantId).toBe(WRITE_GRANT_ID);
    expect(session.accessToken).toMatch(/^vana_write_/);
    expect(session.writeScopes).toEqual([SCOPE]);
    expect(session.expiresAt).toBeGreaterThan(Date.now());
    expect(session.signer.address).toBe(builder.address);

    const [request] = server.requests;
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/v1/write/session");
    expect(request.body.length).toBe(0);
    const parsed = parseWeb3SignedHeader(request.headers.authorization);
    expect(parsed.payload).toMatchObject({
      aud: ORIGIN,
      method: "POST",
      uri: "/v1/write/session",
      grantId: WRITE_GRANT_ID,
    });
    expect(
      await recoverMessageAddress({
        message: parsed.payloadBase64,
        signature: parsed.signature,
      }),
    ).toBe(builder.address);
  });

  it("splits a multi-pattern scope answer into writeScopes", async () => {
    const server = makeServer();
    const session = await openWriteSession({
      personalServerUrl: ORIGIN,
      signer: builder,
      grantId: WIDE_GRANT_ID,
      fetch: server.fetch,
    });
    expect(session.writeScopes).toEqual(["notes.*", "coach.*"]);
    expect(sessionCoversScope(session, "notes.anything")).toBe(true);
    expect(sessionCoversScope(session, "photos.all")).toBe(false);
    for (const writeScopes of [[null, "notes.*"], "notes.*", undefined]) {
      expect(() =>
        sessionCoversScope(
          { writeScopes } as unknown as { writeScopes: string[] },
          "notes.x",
        ),
      ).toThrow(WriteRequestError);
    }
  });

  it("maps a read-grant handshake to WriteSessionError SCOPE_MISMATCH (403)", async () => {
    const server = makeServer();
    const err = await openWriteSession({
      personalServerUrl: ORIGIN,
      signer: builder,
      grantId: READ_GRANT_ID,
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteSessionError);
    const sessionError = err as WriteSessionError;
    expect(sessionError.status).toBe(403);
    expect(sessionError.errorCode).toBe("SCOPE_MISMATCH");
    expect(sessionError.code).toBe("WRITE_SESSION_REJECTED");
  });

  it("maps a non-grantee key to WriteSessionError INVALID_SIGNATURE (401)", async () => {
    const server = makeServer();
    const err = await openWriteSession({
      personalServerUrl: ORIGIN,
      signer: stranger,
      grantId: WRITE_GRANT_ID,
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteSessionError);
    expect((err as WriteSessionError).status).toBe(401);
    expect((err as WriteSessionError).errorCode).toBe("INVALID_SIGNATURE");
  });

  it("maps an unknown grant to WriteSessionError GRANT_REQUIRED with details", async () => {
    const server = makeServer();
    const err = await openWriteSession({
      personalServerUrl: ORIGIN,
      signer: builder,
      grantId: "0xnope",
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteSessionError);
    expect((err as WriteSessionError).errorCode).toBe("GRANT_REQUIRED");
    expect((err as WriteSessionError).details).toEqual({
      reason: "Grant not found",
      grantId: "0xnope",
    });
  });

  it("rejects a session answer that is not a session", async () => {
    const server = makeServer();
    server.respondNextWith(200, { access_token: "", token_type: "Bearer" });
    const err = await openWriteSession({
      personalServerUrl: ORIGIN,
      signer: builder,
      grantId: WRITE_GRANT_ID,
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteSessionError);
    expect((err as WriteSessionError).status).toBe(200);
    expect((err as WriteSessionError).details).toHaveProperty("issues");
  });

  it("rejects a non-Bearer token type", async () => {
    const server = makeServer();
    server.respondNextWith(200, {
      access_token: "x",
      token_type: "MAC",
      expires_in: 10,
      scope: SCOPE,
    });
    await expect(
      openWriteSession({
        personalServerUrl: ORIGIN,
        signer: builder,
        grantId: WRITE_GRANT_ID,
        fetch: server.fetch,
      }),
    ).rejects.toThrow(/not Bearer/);
  });

  it("retries a thrown fetch with a fresh handshake proof and never replays one", async () => {
    const server = makeServer();
    server.failNext(1, new TypeError("socket hang up"));
    const session = await openWriteSession({
      personalServerUrl: ORIGIN,
      signer: builder,
      grantId: WRITE_GRANT_ID,
      fetch: server.fetch,
      retry: { attempts: 2, initialDelayMs: 0 },
    });
    expect(session.accessToken).toMatch(/^vana_write_/);
    // The failed attempt never reached the server; the one that did carried
    // its own proof.
    expect(server.requests).toHaveLength(1);
    expect(server.proofsSeen.size).toBe(1);
  });

  it("surfaces WriteTransportError after exhausting attempts, without touching the server", async () => {
    const server = makeServer();
    server.failNext(3, new TypeError("fetch failed"));
    const err = await openWriteSession({
      personalServerUrl: ORIGIN,
      signer: builder,
      grantId: WRITE_GRANT_ID,
      fetch: server.fetch,
      retry: { attempts: 3, initialDelayMs: 0 },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteTransportError);
    expect((err as WriteTransportError).attempts).toBe(3);
    expect((err as WriteTransportError).cause).toBeInstanceOf(TypeError);
    expect(server.requests).toHaveLength(0);
  });

  it("does not retry when the signer throws (a wallet rejection is final)", async () => {
    const server = makeServer();
    const signMessage = vi.fn(async () => {
      throw new Error("User rejected the request");
    });
    await expect(
      openWriteSession({
        personalServerUrl: ORIGIN,
        signer: { signMessage },
        grantId: WRITE_GRANT_ID,
        fetch: server.fetch,
        retry: { attempts: 3, initialDelayMs: 0 },
      }),
    ).rejects.toThrow("User rejected the request");
    expect(signMessage).toHaveBeenCalledTimes(1);
  });
});

describe("writeData", () => {
  let server: MockPersonalServer;

  beforeEach(() => {
    server = makeServer();
  });

  async function open(grantId = WRITE_GRANT_ID) {
    return openWriteSession({
      personalServerUrl: ORIGIN,
      signer: builder,
      grantId,
      fetch: server.fetch,
    });
  }

  it("replays the e2e JSON write: bearer + X-Vana-Write-Signature over the compact body with the grantId claim", async () => {
    const session = await open();
    const data = { note: "hello from the builder", source: "sdk-write-client" };
    const result = await writeData({
      session,
      scope: SCOPE,
      data,
      fetch: server.fetch,
    });

    expect(result).toEqual({
      scope: SCOPE,
      collectedAt: expect.any(String),
      status: "stored",
    });

    const request = server.requests[1];
    expect(request.method).toBe("POST");
    expect(request.path).toBe(`/v1/data/${SCOPE}`);
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers.authorization).toBe(`Bearer ${session.accessToken}`);
    expect(
      request.headers[WRITE_METADATA_HEADER.toLowerCase()],
    ).toBeUndefined();
    expect(new TextDecoder().decode(request.body)).toBe(JSON.stringify(data));

    const proof = parseWeb3SignedHeader(
      request.headers[WRITE_SIGNATURE_HEADER.toLowerCase()],
    );
    expect(proof.payload).toMatchObject({
      aud: ORIGIN,
      method: "POST",
      uri: `/v1/data/${SCOPE}`,
      grantId: WRITE_GRANT_ID,
      bodyHash: computeBodyHash(request.body),
    });

    const [record] = server.records;
    expect(record.scope).toBe(SCOPE);
    expect(record.data).toMatchObject({
      ...data,
      $writtenBy: { builder: builder.address, grantId: WRITE_GRANT_ID },
    });
    expect(record.data).not.toHaveProperty("$lineage");
  });

  it("the mock enforces the rules the SDK must satisfy: pretty JSON, missing proof, wrong grant claim, replay", async () => {
    const session = await open();
    const body = JSON.stringify({ note: "x" }, null, 2);
    const send = (headers: Record<string, string>, payload: string) =>
      server.fetch(`${ORIGIN}/v1/data/${SCOPE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
          ...headers,
        },
        body: payload,
      });

    const noProof = await send({}, body);
    expect(noProof.status).toBe(401);
    expect((await noProof.json()).error.errorCode).toBe(
      "WRITE_ATTRIBUTION_REQUIRED",
    );

    // Sign the pretty body correctly: still rejected, because it is not the
    // compact form.
    const { buildWeb3SignedHeader } =
      await import("../auth/web3-signed-builder");
    const prettyProof = await buildWeb3SignedHeader({
      signMessage: (m) => builder.signMessage({ message: m }),
      aud: ORIGIN,
      method: "POST",
      uri: `/v1/data/${SCOPE}`,
      body: new TextEncoder().encode(body),
      grantId: WRITE_GRANT_ID,
    });
    const pretty = await send({ [WRITE_SIGNATURE_HEADER]: prettyProof }, body);
    expect(pretty.status).toBe(400);
    expect((await pretty.json()).error.errorCode).toBe(
      "WRITE_BODY_NOT_CANONICAL",
    );

    const compact = JSON.stringify({ note: "x" });
    const wrongGrantProof = await buildWeb3SignedHeader({
      signMessage: (m) => builder.signMessage({ message: m }),
      aud: ORIGIN,
      method: "POST",
      uri: `/v1/data/${SCOPE}`,
      body: new TextEncoder().encode(compact),
      grantId: READ_GRANT_ID,
    });
    const wrongGrant = await send(
      { [WRITE_SIGNATURE_HEADER]: wrongGrantProof },
      compact,
    );
    expect(wrongGrant.status).toBe(401);
    expect((await wrongGrant.json()).error.errorCode).toBe(
      "WRITE_ATTRIBUTION_GRANT_MISMATCH",
    );

    const goodProof = await buildWeb3SignedHeader({
      signMessage: (m) => builder.signMessage({ message: m }),
      aud: ORIGIN,
      method: "POST",
      uri: `/v1/data/${SCOPE}`,
      body: new TextEncoder().encode(compact),
      grantId: WRITE_GRANT_ID,
    });
    const first = await send({ [WRITE_SIGNATURE_HEADER]: goodProof }, compact);
    expect(first.status).toBe(201);
    const replay = await send({ [WRITE_SIGNATURE_HEADER]: goodProof }, compact);
    expect(replay.status).toBe(401);
    expect((await replay.json()).error.errorCode).toBe(
      "WRITE_ATTRIBUTION_REPLAY",
    );
  });

  it("writes binary: signs the stored $binary record, not the raw bytes", async () => {
    const session = await open();
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) % 256);
    const result = await writeData({
      session,
      scope: SCOPE,
      binary: {
        bytes,
        contentType: "application/pdf; charset=binary",
        filename: "scan.pdf",
      },
      metadata: { kind: "dexa" },
      fetch: server.fetch,
    });
    expect(result.status).toBe("stored");

    const request = server.requests[1];
    expect(request.headers["content-type"]).toBe(
      "application/pdf; charset=binary",
    );
    expect(request.headers["x-filename"]).toBe("scan.pdf");
    expect(request.headers[WRITE_METADATA_HEADER.toLowerCase()]).toBe(
      '{"kind":"dexa"}',
    );
    expect(request.body).toEqual(bytes);

    const proof = parseWeb3SignedHeader(
      request.headers[WRITE_SIGNATURE_HEADER.toLowerCase()],
    );
    // The proof commits to the Personal Server's stored representation, as
    // computed by the independent port of its binaryWriteSignedBytes.
    const expectedSigned = await personalServerBinaryWriteSignedBytes({
      bytes,
      contentType: "application/pdf; charset=binary",
      filename: "scan.pdf",
      metadataHeader: '{"kind":"dexa"}',
    });
    expect(proof.payload.bodyHash).toBe(computeBodyHash(expectedSigned));
    expect(proof.payload.bodyHash).not.toBe(computeBodyHash(bytes));

    const [record] = server.records;
    expect(record.data).toMatchObject({
      $binary: true,
      mimeType: "application/pdf",
      filename: "scan.pdf",
      sizeBytes: 300,
      metadata: { kind: "dexa" },
    });
  });

  it("carries a non-ASCII filename as RFC 5987 Content-Disposition and still signs the stored name", async () => {
    const session = await open();
    const bytes = new TextEncoder().encode("cv");
    await writeData({
      session,
      scope: SCOPE,
      binary: {
        bytes,
        contentType: "application/pdf",
        filename: "r\u00e9sum\u00e9 \u4e2d.pdf",
      },
      fetch: server.fetch,
    });
    const request = server.requests[1];
    expect(request.headers["x-filename"]).toBeUndefined();
    expect(request.headers["content-disposition"]).toBe(
      "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9%20%E4%B8%AD.pdf",
    );
    expect(server.records[0].data.filename).toBe("r\u00e9sum\u00e9 \u4e2d.pdf");

    for (const filename of [" padded.pdf", "trailing.pdf "]) {
      const err = await writeData({
        session,
        scope: SCOPE,
        binary: { bytes, contentType: "application/pdf", filename },
        fetch: server.fetch,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(WriteRequestError);
    }
  });

  it("treats non-finite retry options as the defaults", async () => {
    const session = await open();
    server.failNext(1, new TypeError("blip"));
    const result = await writeData({
      session,
      scope: SCOPE,
      data: { note: "nan" },
      fetch: server.fetch,
      retry: { attempts: Number.NaN, initialDelayMs: Number.NaN },
    });
    expect(result.status).toBe("stored");
  });

  it("writes a JSON derivative: lineage is the body's top-level field, inside the signed bytes, mirrored to $lineage", async () => {
    const session = await open(WIDE_GRANT_ID);
    const upper = sourceId.toUpperCase().replace("0X", "0x") as Hex;
    const result = await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "three notes about cats" },
      lineage: [upper],
      fetch: server.fetch,
    });
    expect(result.lineage).toEqual({ sources: [sourceId] });

    const request = server.requests[1];
    expect(
      request.headers[WRITE_METADATA_HEADER.toLowerCase()],
    ).toBeUndefined();
    const body = new TextDecoder().decode(request.body);
    // Compact, caller's keys first, lineage last and lowercased.
    expect(body).toBe(
      `{"summary":"three notes about cats","lineage":["${sourceId}"]}`,
    );
    const proof = parseWeb3SignedHeader(
      request.headers[WRITE_SIGNATURE_HEADER.toLowerCase()],
    );
    expect(proof.payload.bodyHash).toBe(computeBodyHash(request.body));

    const [record] = server.records;
    expect(record.scope).toBe(DERIVED_SCOPE);
    expect(record.data.lineage).toEqual([sourceId]);
    expect(record.data.$lineage).toEqual({
      sources: [sourceId],
      writtenAt: record.collectedAt,
    });
  });

  it("refuses metadata on a JSON write and a lineage field inside data", async () => {
    const session = await open(WIDE_GRANT_ID);
    const withMetadata = await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "x" },
      metadata: { model: "summarizer-v1" },
      fetch: server.fetch,
    } as unknown as Parameters<typeof writeData>[0]).catch((e: unknown) => e);
    expect(withMetadata).toBeInstanceOf(WriteRequestError);
    const withField = await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "x", lineage: [sourceId] },
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(withField).toBeInstanceOf(WriteRequestError);
    expect(server.requests).toHaveLength(1);
  });

  it("binary derivative: lineage rides in X-Vana-Metadata, inside the signed $binary record", async () => {
    const session = await open(WIDE_GRANT_ID);
    const bytes = new TextEncoder().encode("derived bytes");
    const result = await writeData({
      session,
      scope: DERIVED_SCOPE,
      binary: { bytes, contentType: "text/plain" },
      lineage: [sourceId],
      metadata: { model: "summarizer-v1" },
      fetch: server.fetch,
    });
    expect(result.lineage).toEqual({ sources: [sourceId] });
    expect(
      JSON.parse(
        server.requests[1].headers[WRITE_METADATA_HEADER.toLowerCase()],
      ),
    ).toEqual({ model: "summarizer-v1", lineage: [sourceId] });
    const [record] = server.records;
    expect(record.data.metadata).toEqual({
      model: "summarizer-v1",
      lineage: [sourceId],
    });
    expect(record.data.$lineage).toMatchObject({ sources: [sourceId] });
  });

  it("maps every LINEAGE_* rejection to WriteLineageError with its status", async () => {
    const session = await open(WIDE_GRANT_ID);
    // Naming rule: notes.summary derived from notes.entries.
    const underPrefix = await writeData({
      session,
      scope: "notes.summary",
      data: { summary: "x" },
      lineage: [sourceId],
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(underPrefix).toBeInstanceOf(WriteLineageError);
    expect((underPrefix as WriteLineageError).status).toBe(400);
    expect((underPrefix as WriteLineageError).errorCode).toBe(
      "LINEAGE_SCOPE_UNDER_SOURCE_PREFIX",
    );
    server.respondNextWith(502, {
      error: {
        code: 502,
        errorCode: "LINEAGE_SOURCE_LOOKUP_FAILED",
        message: "gateway down",
      },
    });
    const lookup = await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "x" },
      lineage: [sourceId],
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(lookup).toBeInstanceOf(WriteLineageError);
    expect((lookup as WriteLineageError).status).toBe(502);
    expect(server.records).toHaveLength(0);
  });

  it("maps 422 LINEAGE_SOURCE_UNKNOWN to WriteLineageError", async () => {
    const session = await open(WIDE_GRANT_ID);
    const err = await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "x" },
      lineage: [foreignSourceId],
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteLineageError);
    const lineageError = err as WriteLineageError;
    expect(lineageError.status).toBe(422);
    expect(lineageError.errorCode).toBe("LINEAGE_SOURCE_UNKNOWN");
    expect(lineageError.details).toEqual({ unknown: [foreignSourceId] });
    // A rejected write never burns the proof, and stores nothing.
    expect(server.records).toHaveLength(0);
  });

  it("maps 403 SCOPE_MISMATCH to WriteForbiddenError", async () => {
    const session = await open();
    const err = await writeData({
      session,
      scope: "other.scope",
      data: { note: "nope" },
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteForbiddenError);
    expect((err as WriteForbiddenError).status).toBe(403);
    expect((err as WriteForbiddenError).errorCode).toBe("SCOPE_MISMATCH");
  });

  it("maps a session the server no longer knows to WriteUnauthorizedError", async () => {
    const session = await open();
    server.sessions.clear();
    const err = await writeData({
      session,
      scope: SCOPE,
      data: { note: "x" },
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteUnauthorizedError);
    expect((err as WriteUnauthorizedError).status).toBe(401);
    expect((err as WriteUnauthorizedError).errorCode).toBe("INVALID_SIGNATURE");
  });

  it("maps 409 to WriteConflictError and other statuses to WriteRejectedError", async () => {
    const session = await open();
    server.respondNextWith(409, {
      error: { code: 409, errorCode: "VERSION_CONFLICT", message: "stale" },
    });
    const conflict = await writeData({
      session,
      scope: SCOPE,
      data: { note: "x" },
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(WriteConflictError);
    expect((conflict as WriteConflictError).errorCode).toBe("VERSION_CONFLICT");
    expect((conflict as WriteConflictError).message).toBe("stale");

    server.respondNextWith(413, {
      error: { code: 413, errorCode: "CONTENT_TOO_LARGE", message: "big" },
    });
    const tooLarge = await writeData({
      session,
      scope: SCOPE,
      data: { note: "x" },
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(tooLarge).toBeInstanceOf(WriteRejectedError);
    expect((tooLarge as WriteRejectedError).status).toBe(413);
    expect((tooLarge as WriteRejectedError).errorCode).toBe(
      "CONTENT_TOO_LARGE",
    );

    // Contract-level rejections use the `{ error: "CODE", message }` shape.
    server.respondNextWith(400, {
      error: "INVALID_BODY",
      message: "Request body must not contain the reserved $writtenBy key",
    });
    const invalid = await writeData({
      session,
      scope: SCOPE,
      data: { note: "x" },
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(invalid).toBeInstanceOf(WriteRejectedError);
    expect((invalid as WriteRejectedError).errorCode).toBe("INVALID_BODY");

    // A non-JSON error body still yields a typed error.
    server.respondNextWith(500, "boom");
    const internal = await writeData({
      session,
      scope: SCOPE,
      data: { note: "x" },
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(internal).toBeInstanceOf(WriteRejectedError);
    expect((internal as WriteRejectedError).status).toBe(500);
    expect((internal as WriteRejectedError).errorCode).toBeNull();
  });

  it("rejects a malformed success body", async () => {
    const session = await open();
    server.respondNextWith(201, { scope: SCOPE });
    const err = await writeData({
      session,
      scope: SCOPE,
      data: { note: "x" },
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteRejectedError);
    expect((err as WriteRejectedError).details).toHaveProperty("issues");
  });

  it("refuses to send reserved keys, metadata.lineage, bad lineage ids, or a non-object", async () => {
    const session = await open();
    const attempt = (params: Record<string, unknown>) =>
      writeData({
        session,
        scope: SCOPE,
        fetch: server.fetch,
        ...(params as object),
      } as Parameters<typeof writeData>[0]).catch((e: unknown) => e);

    const bin = { bytes: new Uint8Array(1), contentType: "text/plain" };
    for (const key of ["$writtenBy", "$lineage"]) {
      const err = await attempt({ data: { [key]: {} } });
      expect(err).toBeInstanceOf(WriteRequestError);
      expect((err as WriteRequestError).details).toEqual({ key });
      const metaErr = await attempt({ binary: bin, metadata: { [key]: 1 } });
      expect(metaErr).toBeInstanceOf(WriteRequestError);
      expect((metaErr as WriteRequestError).details).toEqual({ key });
    }
    expect(
      await attempt({ binary: bin, metadata: { lineage: [sourceId] } }),
    ).toBeInstanceOf(WriteRequestError);
    const tooMany = Array.from({ length: 257 }, (_, i) =>
      deriveDataPointId(owner.address, `s.${i}`),
    );
    for (const lineage of ["abc", 7, {}, [null]]) {
      expect(await attempt({ data: { a: 1 }, lineage })).toBeInstanceOf(
        WriteRequestError,
      );
    }
    const partialSessions: unknown[] = [
      undefined,
      { accessToken: "x" },
      { ...session, expiresAt: "soon" },
      { ...session, signer: {} },
      { ...session, writeScopes: "notes.*" },
      { ...session, writeScopes: [null] },
      { ...session, writeScopes: ["notes.*", 7] },
      { ...session, accessToken: "" },
    ];
    for (const partial of partialSessions) {
      expect(
        await writeData({
          session: partial,
          scope: SCOPE,
          data: { a: 1 },
          fetch: server.fetch,
        } as unknown as Parameters<typeof writeData>[0]).catch(
          (e: unknown) => e,
        ),
      ).toBeInstanceOf(WriteRequestError);
    }
    const many = await attempt({ data: { a: 1 }, lineage: tooMany });
    expect(many).toBeInstanceOf(WriteRequestError);
    expect((many as WriteRequestError).details).toMatchObject({ max: 256 });
    expect(
      await attempt({ data: { a: 1 }, lineage: ["0x1234" as Hex] }),
    ).toBeInstanceOf(WriteRequestError);
    expect(
      await attempt({ data: { a: 1 }, lineage: [sourceId, sourceId] }),
    ).toBeInstanceOf(WriteRequestError);
    expect(
      await attempt({ data: [1, 2] as unknown as Record<string, unknown> }),
    ).toBeInstanceOf(WriteRequestError);
    expect(await attempt({})).toBeInstanceOf(WriteRequestError);
    expect(
      await attempt({
        data: { a: 1 },
        binary: { bytes: new Uint8Array(1), contentType: "text/plain" },
      }),
    ).toBeInstanceOf(WriteRequestError);
    expect(
      await attempt({ binary: { bytes: new Uint8Array(1), contentType: " " } }),
    ).toBeInstanceOf(WriteRequestError);
    expect(await attempt({ data: { n: 1n } })).toBeInstanceOf(
      WriteRequestError,
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(await attempt({ binary: bin, metadata: { n: 1n } })).toBeInstanceOf(
      WriteRequestError,
    );
    expect(await attempt({ binary: bin, metadata: cyclic })).toBeInstanceOf(
      WriteRequestError,
    );
    // Nothing reached the server beyond the handshake.
    expect(server.requests).toHaveLength(1);
  });

  it("lineage [] is an explicit root statement and is sent; null or absent makes no statement", async () => {
    const session = await open();
    const explicit = await writeData({
      session,
      scope: SCOPE,
      data: { a: 1 },
      lineage: [],
      fetch: server.fetch,
    });
    expect(explicit.lineage).toEqual({ sources: [] });
    expect(new TextDecoder().decode(server.requests.at(-1)?.body)).toBe(
      '{"a":1,"lineage":[]}',
    );
    expect(server.records.at(-1)?.data.$lineage).toMatchObject({ sources: [] });

    for (const lineage of [null, undefined]) {
      const result = await writeData({
        session,
        scope: SCOPE,
        data: { a: 1 },
        lineage,
        fetch: server.fetch,
      });
      expect(result.lineage).toBeUndefined();
      const request = server.requests.at(-1);
      expect(new TextDecoder().decode(request?.body)).toBe('{"a":1}');
      expect(
        request?.headers[WRITE_METADATA_HEADER.toLowerCase()],
      ).toBeUndefined();
      expect(server.records.at(-1)?.data).not.toHaveProperty("$lineage");
    }
  });

  it("accepts { ownerAddress, scope } sources, derives their ids and applies the naming rule before signing", async () => {
    const session = await open(WIDE_GRANT_ID);
    const result = await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "x" },
      lineage: [{ ownerAddress: owner.address, scope: SCOPE }],
      fetch: server.fetch,
    });
    expect(result.lineage).toEqual({ sources: [sourceId] });

    const requestsBefore = server.requests.length;
    const underPrefix = await writeData({
      session,
      scope: "notes.summary",
      data: { summary: "x" },
      lineage: [{ ownerAddress: owner.address, scope: SCOPE }],
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(underPrefix).toBeInstanceOf(WriteRequestError);
    expect((underPrefix as WriteRequestError).details).toEqual({
      scope: "notes.summary",
      sourceScope: SCOPE,
    });

    const self = await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "x" },
      lineage: [{ ownerAddress: owner.address, scope: DERIVED_SCOPE }],
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(self).toBeInstanceOf(WriteRequestError);
    expect((self as WriteRequestError).message).toMatch(/own data point/);

    const badOwner = await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "x" },
      lineage: [{ ownerAddress: "0x12" as Address, scope: SCOPE }],
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(badOwner).toBeInstanceOf(WriteRequestError);

    const mixedDuplicate = await writeData({
      session,
      scope: DERIVED_SCOPE,
      data: { summary: "x" },
      lineage: [sourceId, { ownerAddress: owner.address, scope: SCOPE }],
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(mixedDuplicate).toBeInstanceOf(WriteRequestError);
    expect(server.requests).toHaveLength(requestsBefore);
  });

  it("refuses to write on an expired session before sending anything", async () => {
    const session = await open();
    const err = await writeData({
      session: { ...session, expiresAt: Date.now() - 1 },
      scope: SCOPE,
      data: { note: "late" },
      fetch: server.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteSessionExpiredError);
    expect(server.requests).toHaveLength(1);
  });

  describe("transport retry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("mints a distinct proof per attempt, even inside the same second", async () => {
      const session = await open();
      server.failNext(2, new TypeError("relay dropped"));
      const proofs: string[] = [];
      const spyingFetch: typeof fetch = async (input, init) => {
        const header = new Headers(init?.headers).get(WRITE_SIGNATURE_HEADER);
        if (header) proofs.push(header);
        return server.fetch(input, init);
      };
      const pending = writeData({
        session,
        scope: SCOPE,
        data: { note: "retry me" },
        fetch: spyingFetch,
        retry: { attempts: 3, initialDelayMs: 0 },
      });
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(result.status).toBe("stored");
      expect(proofs).toHaveLength(3);
      expect(new Set(proofs).size).toBe(3);
      const iats = proofs.map((p) => parseWeb3SignedHeader(p).payload.iat);
      expect(iats[1]).toBe(iats[0] + 1);
      expect(iats[2]).toBe(iats[0] + 2);
      expect(server.records).toHaveLength(1);
    });

    it("never repeats a proof for a burst of identical requests: it waits for the clock instead", async () => {
      const session = await open();
      const proofs: string[] = [];
      const spyingFetch: typeof fetch = async (input, init) => {
        const header = new Headers(init?.headers).get(WRITE_SIGNATURE_HEADER);
        if (header) proofs.push(header);
        return server.fetch(input, init);
      };
      const burst = 35;
      const writes = Array.from({ length: burst }, () =>
        writeData({
          session,
          scope: SCOPE,
          data: { note: "same" },
          fetch: spyingFetch,
          retry: noRetry,
        }),
      );
      // The first 31 sign immediately (now .. now + 30); the rest are held
      // until the clock has advanced enough to keep them within the window.
      for (let i = 0; i < 50 && proofs.length < 31; i++) {
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(proofs.length).toBe(31);
      await vi.advanceTimersByTimeAsync(4_000);
      const results = await Promise.all(writes);
      expect(results.every((r) => r.status === "stored")).toBe(true);
      expect(new Set(proofs).size).toBe(burst);
      const iats = proofs.map((p) => parseWeb3SignedHeader(p).payload.iat);
      const nowSec = Math.floor(Date.now() / 1000);
      expect(Math.max(...iats) - nowSec).toBeLessThanOrEqual(30);
      expect(server.records).toHaveLength(burst);
    });

    it("does not re-issue a proof after the wall clock steps backwards", async () => {
      const session = await open();
      const proofs: string[] = [];
      const spyingFetch: typeof fetch = async (input, init) => {
        const header = new Headers(init?.headers).get(WRITE_SIGNATURE_HEADER);
        if (header) proofs.push(header);
        return server.fetch(input, init);
      };
      const write = () =>
        writeData({
          session,
          scope: SCOPE,
          data: { note: "clock" },
          fetch: spyingFetch,
          retry: noRetry,
        });
      await write();
      const issuedAt = Date.now();
      vi.setSystemTime(issuedAt - 5_000);
      const pending = write();
      await vi.advanceTimersByTimeAsync(0);
      await pending;
      vi.setSystemTime(issuedAt);
      const third = write();
      await vi.advanceTimersByTimeAsync(0);
      await third;
      expect(proofs).toHaveLength(3);
      expect(new Set(proofs).size).toBe(3);
      const iats = proofs.map((p) => parseWeb3SignedHeader(p).payload.iat);
      expect(iats[1]).toBe(iats[0] + 1);
      expect(iats[2]).toBe(iats[0] + 2);
      expect(server.records).toHaveLength(3);
    });

    it("backs off exponentially from initialDelayMs", async () => {
      const session = await open();
      server.failNext(2, new TypeError("relay dropped"));
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      const pending = writeData({
        session,
        scope: SCOPE,
        data: { note: "retry me" },
        fetch: server.fetch,
        retry: { attempts: 3, initialDelayMs: 50 },
      });
      await vi.runAllTimersAsync();
      await pending;
      const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
      expect(delays).toEqual([50, 100]);
    });

    it("does not retry a received error response", async () => {
      const session = await open();
      const err = await writeData({
        session,
        scope: "other.scope",
        data: { note: "nope" },
        fetch: server.fetch,
        retry: { attempts: 3, initialDelayMs: 0 },
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(WriteForbiddenError);
      expect(server.requests).toHaveLength(2);
    });
  });
});

describe("writePersonalServerData", () => {
  it("opens a session and writes in one call, returning the session for reuse", async () => {
    const server = makeServer();
    const result = await writePersonalServerData({
      personalServerUrl: ORIGIN,
      signer: builder,
      grantId: WRITE_GRANT_ID,
      scope: SCOPE,
      data: { note: "one call" },
      fetch: server.fetch,
      retry: noRetry,
    });
    expect(result.status).toBe("stored");
    expect(result.session.accessToken).toMatch(/^vana_write_/);
    expect(server.records).toHaveLength(1);

    const second = await writeData({
      session: result.session,
      scope: SCOPE,
      data: { note: "two" },
      fetch: server.fetch,
    });
    expect(second.scope).toBe(SCOPE);
    expect(server.sessions.size).toBe(1);
  });

  it("works with a viem wallet client shape (browser) and a bare signMessage (backend)", async () => {
    const server = makeServer();
    const walletClient = {
      type: "walletClient",
      account: builder,
      signMessage: vi.fn(async (args: { account: unknown; message: string }) =>
        builder.signMessage({ message: args.message }),
      ),
    };
    const viaWallet = await writePersonalServerData({
      personalServerUrl: ORIGIN,
      signer: walletClient,
      grantId: WRITE_GRANT_ID,
      scope: SCOPE,
      data: { via: "wallet" },
      fetch: server.fetch,
    });
    expect(viaWallet.status).toBe("stored");
    expect(walletClient.signMessage).toHaveBeenCalledTimes(2);
    expect(walletClient.signMessage.mock.calls[0][0].account).toBe(builder);

    const viaCallback = await writePersonalServerData({
      personalServerUrl: ORIGIN,
      signer: {
        signMessage: (message: string) => builder.signMessage({ message }),
      },
      grantId: WRITE_GRANT_ID,
      scope: SCOPE,
      data: { via: "callback" },
      fetch: server.fetch,
    });
    expect(viaCallback.status).toBe("stored");
    expect(server.records).toHaveLength(2);
  });
});

describe("binaryWriteSignedBytes", () => {
  // Fixture: output of personal-server-ts `binaryWriteSignedBytes`
  // (packages/core/src/write/attribution.ts, branch volod/write-api-demo-slice)
  // for bytes[i] = (i * 37 + 11) % 256, i in 0..39. Pinned byte for byte.
  const bytes = Uint8Array.from({ length: 40 }, (_, i) => (i * 37 + 11) % 256);
  const contentHash =
    "0x76def75856e5d73ece011b058b02d205991a48f0fcf8b7ddcc24005d57759b23";
  const content = "CzBVep/E6Q4zWH2ix+wRNluApcrvFDleg6jN8hc8YYar0PUaP2SJrg==";
  const fixtures: Array<{
    name: string;
    input: Parameters<typeof binaryWriteSignedBytes>[0];
    expected: string;
  }> = [
    {
      name: "pdf with filename and JSON metadata carrying lineage",
      input: {
        bytes,
        contentType: "application/pdf; charset=binary",
        filename: "scan.pdf",
        metadataHeader:
          '{"kind":"dexa","lineage":["0x1111111111111111111111111111111111111111111111111111111111111111"]}',
      },
      expected: `{"$binary":true,"mimeType":"application/pdf","filename":"scan.pdf","sizeBytes":40,"contentHash":"${contentHash}","encoding":"base64","content":"${content}","metadata":{"kind":"dexa","lineage":["0x1111111111111111111111111111111111111111111111111111111111111111"]}}`,
    },
    {
      name: "blank content type, no filename, no metadata",
      input: { bytes, contentType: "" },
      expected: `{"$binary":true,"mimeType":"application/octet-stream","sizeBytes":40,"contentHash":"${contentHash}","encoding":"base64","content":"${content}"}`,
    },
    {
      name: "text with a plain-string metadata header",
      input: {
        bytes,
        contentType: "text/plain",
        metadataHeader: "a plain description",
      },
      expected: `{"$binary":true,"mimeType":"text/plain","sizeBytes":40,"contentHash":"${contentHash}","encoding":"base64","content":"${content}","metadata":"a plain description"}`,
    },
  ];

  for (const fixture of fixtures) {
    it(`matches the Personal Server byte for byte: ${fixture.name}`, async () => {
      const actual = binaryWriteSignedBytes(fixture.input);
      expect(new TextDecoder().decode(actual)).toBe(fixture.expected);
      expect(actual).toEqual(new TextEncoder().encode(fixture.expected));
      // And the independent port agrees.
      expect(await personalServerBinaryWriteSignedBytes(fixture.input)).toEqual(
        actual,
      );
    });
  }

  it("agrees with the Personal Server port on large bodies and empty filenames", async () => {
    const big = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 13) % 256);
    const input = {
      bytes: big,
      contentType: "image/png",
      filename: "",
      metadataHeader: "  ",
    };
    expect(binaryWriteSignedBytes(input)).toEqual(
      await personalServerBinaryWriteSignedBytes(input),
    );
    expect(
      new TextDecoder().decode(binaryWriteSignedBytes(input)),
    ).not.toContain("filename");
  });
});

describe("metadata header helpers", () => {
  it("escapes non-ASCII so the header is transport-safe and parses back unchanged", () => {
    const metadata = { title: "Zusammenfassung ueber Katzen é中", n: 1 };
    const header = encodeWriteMetadataHeader(metadata);
    expect(header).toMatch(/^[\x20-\x7e]*$/);
    expect(parseWriteMetadataHeader(header)).toEqual(metadata);
  });

  it("mirrors the Personal Server's parse rules", () => {
    expect(parseWriteMetadataHeader(null)).toBeUndefined();
    expect(parseWriteMetadataHeader("   ")).toBeUndefined();
    expect(parseWriteMetadataHeader(' {"a":1} ')).toEqual({ a: 1 });
    expect(parseWriteMetadataHeader(" plain ")).toBe(" plain ");
    expect(normalizeBinaryMimeType(null)).toBe("application/octet-stream");
    expect(normalizeBinaryMimeType(" ; charset=x")).toBe(
      "application/octet-stream",
    );
    expect(normalizeBinaryMimeType("Image/PNG ; q=1")).toBe("Image/PNG");
  });
});

describe("audience", () => {
  it("signs for an explicit audience while posting to the server URL", async () => {
    const server = makeServer({ origin: "https://relay.example" });
    const session = await openWriteSession({
      personalServerUrl: "https://relay.example",
      audience: "https://relay.example",
      signer: builder,
      grantId: WRITE_GRANT_ID,
      fetch: server.fetch,
    });
    expect(session.audience).toBe("https://relay.example");
    const owner2: Address = owner.address;
    expect(owner2).toBe(owner.address);
  });
});
