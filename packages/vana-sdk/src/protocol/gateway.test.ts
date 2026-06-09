import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers: { "Content-Type": "application/json" },
  });
}

function envelope<T>(
  data: T,
  pagination?: { limit: number; hasMore: boolean; nextCursor: string | null },
) {
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
    ...(pagination ? { pagination } : {}),
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
        jsonResponse(
          envelope({
            files: [
              {
                id: "file-1",
                ownerAddress: "0xowner",
                url: "https://files.example/file-1",
                schemaId: "schema-1",
                addedAt: "2026-05-08T00:00:00.000Z",
              },
            ],
            cursor: null,
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(client.listGrantsByUser("0xuser")).resolves.toEqual([]);
    await expect(client.listFilesSince("0xowner", "cursor-1")).resolves.toEqual(
      {
        files: [
          {
            fileId: "file-1",
            owner: "0xowner",
            url: "https://files.example/file-1",
            schemaId: "schema-1",
            createdAt: "2026-05-08T00:00:00.000Z",
            deletedAt: null,
          },
        ],
        cursor: null,
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://g/v1/grants?user=0xuser",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://g/v1/files?user=0xowner&cursor=cursor-1",
    );
  });

  it("paginates files via pagination.nextCursor until hasMore is false", async () => {
    // Regression: the gateway returns the next-page cursor in the envelope's
    // `pagination` block (a sibling of `data`), and accepts it back as the
    // `cursor` query param. A previous implementation read `data.cursor` and
    // sent `?since=`, so it always stopped after the first page — silently
    // truncating an owner's files to a single page.
    const page = (id: string, nextCursor: string | null) =>
      jsonResponse(
        envelope(
          {
            files: [
              {
                id,
                ownerAddress: "0xowner",
                url: `https://files.example/${id}`,
                schemaId: "schema-1",
                addedAt: "2026-05-08T00:00:00.000Z",
              },
            ],
          },
          { limit: 1, hasMore: nextCursor !== null, nextCursor },
        ),
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page("file-1", "cursor-2"))
      .mockResolvedValueOnce(page("file-2", null));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    const all: string[] = [];
    let cursor: string | null = null;
    do {
      const result = await client.listFilesSince("0xowner", cursor);
      all.push(...result.files.map((f) => f.fileId));
      cursor = result.cursor;
    } while (cursor);

    expect(all).toEqual(["file-1", "file-2"]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://g/v1/files?user=0xowner",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://g/v1/files?user=0xowner&cursor=cursor-2",
    );
  });

  it("requests includeDeleted and surfaces deletedAt for reconciliation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        envelope({
          files: [
            {
              id: "file-active",
              ownerAddress: "0xowner",
              url: "https://files.example/active",
              schemaId: "schema-1",
              addedAt: "2026-05-08T00:00:00.000Z",
              deletedAt: null,
            },
            {
              id: "file-gone",
              ownerAddress: "0xowner",
              url: "https://files.example/gone",
              schemaId: "schema-1",
              addedAt: "2026-05-08T00:00:00.000Z",
              deletedAt: "2026-06-04T00:00:00.000Z",
            },
          ],
          cursor: null,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    const result = await client.listFilesSince("0xowner", null, {
      includeDeleted: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://g/v1/files?user=0xowner&includeDeleted=true",
    );
    expect(result.files.map((f) => f.deletedAt)).toEqual([
      null,
      "2026-06-04T00:00:00.000Z",
    ]);
  });

  it("posts server, file, grant, and revocation mutations with Web3Signed auth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ serverId: "server-1" }))
      .mockResolvedValueOnce(jsonResponse({ fileId: "file-1" }))
      .mockResolvedValueOnce(jsonResponse({ grantId: "grant-1" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.registerServer({
        ownerAddress: "0xowner",
        serverAddress: "0xserver",
        publicKey: "0xpub",
        serverUrl: "https://server.example",
        signature: "sig",
      }),
    ).resolves.toEqual({
      serverId: "server-1",
      alreadyRegistered: false,
    });
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
      "https://g/v1/servers",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Web3Signed sig",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://g/v1/files",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Web3Signed sig",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://g/v1/grants/grant-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("deletes a file via DELETE /v1/files/:id with Web3Signed auth and ownerAddress body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.deleteFile({
        fileId: "0xfile",
        ownerAddress: "0xowner",
        signature: "sig",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://g/v1/files/0xfile",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Web3Signed sig",
        }),
        body: JSON.stringify({ ownerAddress: "0xowner" }),
      }),
    );
  });

  it("treats a 409 file deletion as idempotent success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 409 })),
    );
    const client = createGatewayClient("https://g");

    await expect(
      client.deleteFile({
        fileId: "0xfile",
        ownerAddress: "0xowner",
        signature: "sig",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when file deletion fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );
    const client = createGatewayClient("https://g");

    await expect(
      client.deleteFile({
        fileId: "0xfile",
        ownerAddress: "0xowner",
        signature: "sig",
      }),
    ).rejects.toThrow(/Gateway error: 403/);
  });

  it("treats 409 mutation responses as idempotent success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "server-1" }, { status: 409 }))
      .mockResolvedValueOnce(jsonResponse({ id: "file-1" }, { status: 409 }))
      .mockResolvedValueOnce(jsonResponse({ id: "grant-1" }, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.registerServer({
        ownerAddress: "0xowner",
        serverAddress: "0xserver",
        publicKey: "0xpub",
        serverUrl: "https://server.example",
        signature: "sig",
      }),
    ).resolves.toEqual({
      serverId: "server-1",
      alreadyRegistered: true,
    });
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
