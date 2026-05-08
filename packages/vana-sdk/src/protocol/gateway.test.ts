import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers: { "Content-Type": "application/json" },
  });
}

function envelope<T>(data: T) {
  return {
    data,
    proof: {
      signature: "0xsig",
      timestamp: "2026-05-08T00:00:00.000Z",
      gatewayAddress: "0xgateway",
      requestHash: "0xrequest",
      responseHash: "0xresponse",
      userSignature: "0xuser",
      status: "ok",
      chainBlockHeight: 1,
    },
  };
}

describe("createGatewayClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("trims the base URL and unwraps GET envelopes", async () => {
    const builder = {
      id: "builder-1",
      ownerAddress: "0xowner",
      granteeAddress: "0xgrantee",
      publicKey: "pub",
      appUrl: "https://app.example",
      addedAt: "2026-05-08T00:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(envelope(builder)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGatewayClient("https://gateway.example///").getBuilder("0xabc"),
    ).resolves.toEqual(builder);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/v1/builders/0xabc",
    );
  });

  it("returns null for missing GET resources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, { status: 404 })),
    );

    await expect(
      createGatewayClient("https://g").getServer("0xabc"),
    ).resolves.toBe(null);
  });

  it("throws for failed gateway responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({}, { status: 503, statusText: "Down" }),
        ),
    );

    await expect(
      createGatewayClient("https://g").getFile("file-1"),
    ).rejects.toThrow("Gateway error: 503 Down");
  });

  it("checks builder registration through getBuilder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          envelope({
            id: "builder-1",
            ownerAddress: "0xowner",
            granteeAddress: "0xgrantee",
            publicKey: "pub",
            appUrl: "https://app.example",
            addedAt: "2026-05-08T00:00:00.000Z",
          }),
        ),
      ),
    );

    await expect(
      createGatewayClient("https://g").isRegisteredBuilder("0xabc"),
    ).resolves.toBe(true);
  });

  it("lists grants and files with query parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(
        jsonResponse(envelope({ files: [], cursor: null })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(client.listGrantsByUser("0xuser")).resolves.toEqual([]);
    await expect(client.listFilesSince("0xowner", "cursor-1")).resolves.toEqual(
      {
        files: [],
        cursor: null,
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://g/v1/grants?user=0xuser",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://g/v1/files?owner=0xowner&since=cursor-1",
    );
  });

  it("posts file, grant, and revocation mutations with Web3Signed auth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ fileId: "file-1" }))
      .mockResolvedValueOnce(jsonResponse({ grantId: "grant-1" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.registerFile({
        ownerAddress: "0xowner",
        url: "https://files.example/file-1",
        schemaId: "schema-1",
        signature: "sig",
      }),
    ).resolves.toEqual({ fileId: "file-1" });
    await expect(
      client.createGrant({
        grantorAddress: "0xowner",
        granteeId: "builder-1",
        grant: "grant",
        fileIds: ["file-1"],
        signature: "sig",
      }),
    ).resolves.toEqual({ grantId: "grant-1" });
    await expect(
      client.revokeGrant({
        grantId: "grant-1",
        grantorAddress: "0xowner",
        signature: "sig",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://g/v1/files",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Web3Signed sig",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://g/v1/grants/grant-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("treats 409 mutation responses as idempotent success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ fileId: "file-1" }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ grantId: "grant-1" }, { status: 409 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.registerFile({
        ownerAddress: "0xowner",
        url: "https://files.example/file-1",
        schemaId: "schema-1",
        signature: "sig",
      }),
    ).resolves.toEqual({ fileId: "file-1" });
    await expect(
      client.createGrant({
        grantorAddress: "0xowner",
        granteeId: "builder-1",
        grant: "grant",
        fileIds: ["file-1"],
        signature: "sig",
      }),
    ).resolves.toEqual({ grantId: "grant-1" });
    await expect(
      client.revokeGrant({
        grantId: "grant-1",
        grantorAddress: "0xowner",
        signature: "sig",
      }),
    ).resolves.toBeUndefined();
  });
});
