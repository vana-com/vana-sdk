import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway";
import {
  DataPointDeletedError,
  DataPointNotFoundError,
  DataPointVersionConflictError,
} from "../errors";
import {
  TOMBSTONE_DATA_HASH,
  TOMBSTONE_METADATA_HASH,
} from "./data-point-deletion";
import { deriveDataPointId } from "./lineage";

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
      createGatewayClient("https://g").getDataPoint("0xdp"),
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

  it("attaches the derived permissions view to grants it reads back", async () => {
    const wireGrant = {
      id: "grant-1",
      grantorAddress: "0xowner",
      granteeId: "0xbuilder",
      scopes: ["write:notes.entries", "instagram.profile", "notes.entries"],
      status: "confirmed",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope(wireGrant)))
      .mockResolvedValueOnce(jsonResponse(envelope([wireGrant])));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    const expected = {
      ...wireGrant,
      permissions: [
        { scope: "instagram.profile", actions: ["read"] },
        { scope: "notes.entries", actions: ["read", "write"] },
      ],
    };
    const grant = await client.getGrant("grant-1");
    expect(grant).toEqual(expected);
    // The wire form is untouched: same entries, same order.
    expect(grant?.scopes).toEqual(wireGrant.scopes);
    await expect(client.listGrantsByUser("0xowner")).resolves.toEqual([
      expected,
    ]);
  });

  it("leaves permissions absent when a grant carries an operation it cannot interpret", async () => {
    const wireGrant = {
      id: "grant-2",
      grantorAddress: "0xowner",
      granteeId: "0xbuilder",
      scopes: ["notes.entries", "delete:notes.entries"],
      status: "confirmed",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(envelope(wireGrant))),
    );

    const grant = await createGatewayClient("https://g").getGrant("grant-2");
    expect(grant).toEqual(wireGrant);
    expect(grant).not.toHaveProperty("permissions");
  });

  it("leaves permissions absent when the gateway body has no usable scopes", async () => {
    const malformed = [
      { id: "grant-3", scopes: null },
      { id: "grant-4", scopes: ["notes.entries", 42] },
      { id: "grant-5" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(envelope(malformed))),
    );

    const grants =
      await createGatewayClient("https://g").listGrantsByUser("0xowner");
    expect(grants).toEqual(malformed);
    for (const grant of grants) {
      expect(grant).not.toHaveProperty("permissions");
    }
  });

  it("never trusts a permissions field supplied by the gateway body", async () => {
    const spoofed = {
      id: "grant-6",
      scopes: ["notes.entries"],
      permissions: [{ scope: "*", actions: ["read", "write"] }],
    };
    const undecidable = {
      id: "grant-7",
      scopes: ["delete:notes.entries"],
      permissions: [{ scope: "*", actions: ["read", "write"] }],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(envelope(spoofed)))
        .mockResolvedValueOnce(jsonResponse(envelope(undecidable))),
    );
    const client = createGatewayClient("https://g");

    // Derived from scopes, not from the body.
    await expect(client.getGrant("grant-6")).resolves.toEqual({
      id: "grant-6",
      scopes: ["notes.entries"],
      permissions: [{ scope: "notes.entries", actions: ["read"] }],
    });
    // Undecidable -> absent, never the body's value.
    const grant = await client.getGrant("grant-7");
    expect(grant).toEqual({
      id: "grant-7",
      scopes: ["delete:notes.entries"],
    });
    expect(grant).not.toHaveProperty("permissions");
  });

  it("lists grants and data points with query parameters", async () => {
    const dataPoint = {
      id: "0xdp1",
      ownerAddress: "0xowner",
      scope: "instagram.profile",
      dataHash: "0xdata",
      metadataHash: "0xmeta",
      expectedVersion: "1",
      addedAt: "2026-05-08T00:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope([])))
      .mockResolvedValueOnce(
        jsonResponse(envelope({ dataPoints: [dataPoint] })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(client.listGrantsByUser("0xuser")).resolves.toEqual([]);
    await expect(
      client.listDataPointsByOwner("0xowner", "cursor-1"),
    ).resolves.toEqual({
      dataPoints: [dataPoint],
      cursor: null,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://g/v1/grants?user=0xuser",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://g/v1/data?user=0xowner&cursor=cursor-1",
    );
  });

  it("paginates data points via pagination.nextCursor until hasMore is false", async () => {
    // Regression guard: the gateway returns the next-page cursor in the
    // envelope's `pagination` block (a sibling of `data`), and accepts it
    // back as the `cursor` query param. A prior implementation read
    // `data.cursor` and sent `?since=`, so it stopped after the first page.
    const page = (id: string, nextCursor: string | null) =>
      jsonResponse(
        envelope(
          {
            dataPoints: [
              {
                id,
                ownerAddress: "0xowner",
                scope: "instagram.profile",
                dataHash: "0xdata",
                metadataHash: "0xmeta",
                expectedVersion: "1",
                addedAt: "2026-05-08T00:00:00.000Z",
              },
            ],
          },
          { limit: 1, hasMore: nextCursor !== null, nextCursor },
        ),
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page("0xdp1", "cursor-2"))
      .mockResolvedValueOnce(page("0xdp2", null));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    const all: string[] = [];
    let cursor: string | null = null;
    do {
      const result = await client.listDataPointsByOwner("0xowner", cursor);
      all.push(...result.dataPoints.map((d) => d.id));
      cursor = result.cursor;
    } while (cursor);

    expect(all).toEqual(["0xdp1", "0xdp2"]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://g/v1/data?user=0xowner",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://g/v1/data?user=0xowner&cursor=cursor-2",
    );
  });

  it("threads `since` and `limit` into the data-points list query", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        envelope({
          dataPoints: [],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await client.listDataPointsByOwner("0xowner", null, {
      since: "2026-05-01T00:00:00.000Z",
      limit: 50,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://g/v1/data?user=0xowner&since=2026-05-01T00%3A00%3A00.000Z&limit=50",
    );
  });

  it("posts server, grant, and revocation mutations with Web3Signed auth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ serverId: "server-1" }))
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
      client.createGrant({
        grantorAddress: "0xowner",
        granteeId: "builder-1",
        scopes: ["instagram.profile"],
        grantVersion: "1",
        expiresAt: "0",
        signature: "sig",
      }),
    ).resolves.toEqual({ grantId: "grant-1" });
    await expect(
      client.revokeGrant({
        grantId: "grant-1",
        grantorAddress: "0xowner",
        grantVersion: "2",
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
      "https://g/v1/grants",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          grantorAddress: "0xowner",
          granteeId: "builder-1",
          scopes: ["instagram.profile"],
          grantVersion: "1",
          expiresAt: "0",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://g/v1/grants/grant-1",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({
          grantorAddress: "0xowner",
          grantVersion: "2",
        }),
      }),
    );
  });

  it("registers a builder with Web3Signed auth, returns the gateway-computed builderId", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { success: true, builderId: "0xbuilder" },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { success: false, error: "Builder already registered" },
          { status: 409 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.registerBuilder({
        ownerAddress: "0xowner",
        granteeAddress: "0xgrantee",
        publicKey: "0xpub",
        appUrl: "https://app.example",
        signature: "sig",
      }),
    ).resolves.toEqual({ builderId: "0xbuilder", alreadyRegistered: false });

    // 409 → alreadyRegistered:true, builderId stays undefined since the
    // gateway's current 409 body doesn't include the id.
    await expect(
      client.registerBuilder({
        ownerAddress: "0xowner",
        granteeAddress: "0xgrantee",
        publicKey: "0xpub",
        appUrl: "https://app.example",
        signature: "sig",
      }),
    ).resolves.toEqual({ builderId: undefined, alreadyRegistered: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://g/v1/builders",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Web3Signed sig",
        }),
        body: JSON.stringify({
          ownerAddress: "0xowner",
          granteeAddress: "0xgrantee",
          publicKey: "0xpub",
          appUrl: "https://app.example",
        }),
      }),
    );
  });

  it("registers a data point and surfaces the stale-version 409 as a thrown error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: true,
            dataPointId: "0xdatapoint",
            expectedVersion: "1",
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: false,
            error:
              "Stale expectedVersion 1: must be strictly greater than the stored value 3",
            currentExpectedVersion: "3",
          },
          { status: 409 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.registerDataPoint({
        ownerAddress: "0xowner",
        scope: "instagram.profile",
        dataHash:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        metadataHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        expectedVersion: "1",
        signature: "sig",
      }),
    ).resolves.toEqual({
      dataPointId: "0xdatapoint",
      expectedVersion: "1",
    });

    // Stale-CAS 409 is a real failure here, not an idempotent replay —
    // the SDK throws with the gateway's error string so callers can read
    // `currentExpectedVersion` out of the message.
    await expect(
      client.registerDataPoint({
        ownerAddress: "0xowner",
        scope: "instagram.profile",
        dataHash:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        metadataHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        expectedVersion: "1",
        signature: "sig",
      }),
    ).rejects.toThrow(/Gateway error: 409 Stale expectedVersion/);
  });

  it("drains pending ops via settle() and parses the full reconcile envelope", async () => {
    const settleBody = {
      success: true,
      scanned: 1,
      submitted: 0,
      confirmed: 1,
      skipped: 0,
      failed: 0,
      items: [
        {
          opType: "grant",
          opId: "0xgrant",
          status: "confirmed",
          settleTxHash: "0xtx",
          settleSubmittedAt: "2026-05-08T00:00:00.000Z",
          chainBlockHeight: "100",
          revocationTxHash: null,
          revocationSubmittedAt: null,
          placeholder: false,
        },
      ],
      promoted: { count: 0, items: [] },
      reconciled: {
        scanned: 0,
        finalized: 0,
        reorged: 0,
        unchanged: 0,
        items: [],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(settleBody));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGatewayClient("https://g").settle({ limit: 50 }),
    ).resolves.toMatchObject({
      scanned: 1,
      confirmed: 1,
      items: [{ opType: "grant", status: "confirmed" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://g/v1/settle",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ limit: 50 }),
      }),
    );
  });

  it("treats 409 mutation responses as idempotent success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "server-1" }, { status: 409 }))
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
      client.createGrant({
        grantorAddress: "0xowner",
        granteeId: "builder-1",
        scopes: ["instagram.profile"],
        grantVersion: "1",
        expiresAt: "0",
        signature: "sig",
      }),
    ).resolves.toEqual({ grantId: "grant-1" });
    await expect(
      client.revokeGrant({
        grantId: "grant-1",
        grantorAddress: "0xowner",
        grantVersion: "2",
        signature: "sig",
      }),
    ).resolves.toBeUndefined();
  });

  it("lists servers by owner without an envelope wrap, split into active + revoked", async () => {
    const body = {
      active: [
        {
          id: "3",
          ownerAddress: "0xowner",
          serverAddress: "0xserver3",
          publicKey: "0xpub3",
          serverUrl: "https://server3.example",
          status: "confirmed",
          chainBlockHeight: "100",
          addedAt: "2026-06-01T00:00:00.000Z",
          revokedAt: null,
        },
      ],
      revoked: [
        {
          id: "1",
          ownerAddress: "0xowner",
          serverAddress: "0xserver1",
          publicKey: "0xpub1",
          serverUrl: "https://server1.example",
          status: "finalized",
          chainBlockHeight: "50",
          addedAt: "2026-05-01T00:00:00.000Z",
          revokedAt: "2026-05-15T00:00:00.000Z",
        },
      ],
      count: 2,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGatewayClient("https://g").listServersByOwner("0xowner"),
    ).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://g/v1/servers?owner=0xowner",
    );
  });

  it("surfaces list-servers 400 for invalid owner as a thrown error", async () => {
    // Empty owner is 200 {active:[],revoked:[],count:0} on the gateway, not
    // 404 — so we don't return null here. Only genuine errors (like a
    // malformed address returning 400) should throw.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({}, { status: 400, statusText: "Bad Request" }),
        ),
    );
    await expect(
      createGatewayClient("https://g").listServersByOwner("not-an-address"),
    ).rejects.toThrow("Gateway error: 400 Bad Request");
  });

  it("URL-encodes the owner so a malformed value cannot inject extra query params", async () => {
    // Regression guard: an owner like "0xabc&foo=bar" must not smuggle a
    // `foo=bar` query param into the gateway request — the `&` has to be
    // percent-encoded. Naive template-string interpolation would let this
    // through; URLSearchParams doesn't.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ active: [], revoked: [], count: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await createGatewayClient("https://g").listServersByOwner("0xabc&foo=bar");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://g/v1/servers?owner=0xabc%26foo%3Dbar",
    );
  });

  it("reads escrow balance without an envelope wrap", async () => {
    const balanceBody = {
      account: "0xpayer",
      balances: [
        {
          asset: "0x0000000000000000000000000000000000000000",
          balance: "1000",
          pendingAmount: "200",
          authorizedAmount: "300",
          availableAmount: "700",
          updatedAt: "2026-05-08T00:00:00.000Z",
        },
      ],
      deposits: { submitted: [], finalized: [], failed: [] },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(balanceBody));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGatewayClient("https://g").getEscrowBalance("0xpayer"),
    ).resolves.toEqual(balanceBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://g/v1/escrow/balance?account=0xpayer",
    );
  });

  it("posts deposit submissions and accepts the 202 confirming-status response", async () => {
    const depositBody = {
      txHash: "0xtx",
      account: "0xpayer",
      status: "submitted",
      blockNumber: null,
      submittedAt: "2026-05-08T00:00:00.000Z",
      finalizedAt: null,
      lastError: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(depositBody, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGatewayClient("https://g").submitEscrowDeposit({ txHash: "0xtx" }),
    ).resolves.toEqual(depositBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://g/v1/escrow/deposit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ txHash: "0xtx" }),
      }),
    );
  });

  it("pays for an operation with a Web3Signed EIP-712 signature", async () => {
    const payBody = {
      opType: "grant",
      opId: "0xgrant",
      payerAddress: "0xpayer",
      asset: "0x0000000000000000000000000000000000000000",
      amount: "300",
      breakdown: {
        registrationFee: "200",
        dataAccessFee: "100",
        registrationPaid: true,
      },
      paymentNonce: "1",
      paidAt: "2026-05-08T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payBody));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGatewayClient("https://g").payForOperation({
        payerAddress: "0xpayer",
        opType: "grant",
        opId: "0xgrant",
        asset: "0x0000000000000000000000000000000000000000",
        amount: "300",
        paymentNonce: "1",
        signature: "sig",
      }),
    ).resolves.toEqual(payBody);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://g/v1/escrow/pay",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Web3Signed sig",
        }),
        body: JSON.stringify({
          payerAddress: "0xpayer",
          opType: "grant",
          opId: "0xgrant",
          asset: "0x0000000000000000000000000000000000000000",
          amount: "300",
          paymentNonce: "1",
        }),
      }),
    );
  });

  it("surfaces 402 insufficient-balance and 409 nonce-replay as thrown errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 402, statusText: "Payment Required" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 409, statusText: "Conflict" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.payForOperation({
        payerAddress: "0xpayer",
        opType: "grant",
        opId: "0xgrant",
        asset: "0x0000000000000000000000000000000000000000",
        amount: "300",
        paymentNonce: "1",
        signature: "sig",
      }),
    ).rejects.toThrow("Gateway error: 402 Payment Required");
    await expect(
      client.payForOperation({
        payerAddress: "0xpayer",
        opType: "grant",
        opId: "0xgrant",
        asset: "0x0000000000000000000000000000000000000000",
        amount: "100",
        paymentNonce: "1",
        signature: "sig",
      }),
    ).rejects.toThrow("Gateway error: 409 Conflict");
  });
});

describe("createGatewayClient data point deletion", () => {
  const OWNER = "0x1111111111111111111111111111111111111111";
  const SCOPE = "instagram.profile";
  const DATA_POINT_ID = deriveDataPointId(OWNER, SCOPE);
  const SIGNATURE = `0x${"ab".repeat(65)}`;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends DELETE /v1/data/:dataPointId with the contract body and Web3Signed header", async () => {
    const tombstone = {
      dataPointId: DATA_POINT_ID,
      ownerAddress: OWNER,
      scope: SCOPE,
      dataHash: TOMBSTONE_DATA_HASH,
      metadataHash: TOMBSTONE_METADATA_HASH,
      expectedVersion: "4",
      deletedAt: "2026-08-25T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tombstone));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGatewayClient("https://g/").deleteDataPoint({
        ownerAddress: OWNER,
        scope: SCOPE,
        expectedVersion: "4",
        signature: SIGNATURE,
      }),
    ).resolves.toEqual(tombstone);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://g/v1/data/${DATA_POINT_ID}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${SIGNATURE}`,
        },
        body: JSON.stringify({
          ownerAddress: OWNER,
          scope: SCOPE,
          expectedVersion: "4",
          signature: SIGNATURE,
        }),
      },
    );
  });

  it("unwraps an enveloped tombstone record and fills in the derived id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          envelope({
            expectedVersion: "2",
            deletedAt: "2026-08-25T00:00:00Z",
          }),
        ),
      ),
    );

    await expect(
      createGatewayClient("https://g").deleteDataPoint({
        ownerAddress: OWNER,
        scope: SCOPE,
        expectedVersion: "2",
        signature: SIGNATURE,
      }),
    ).resolves.toEqual({
      dataPointId: DATA_POINT_ID,
      ownerAddress: undefined,
      scope: undefined,
      dataHash: undefined,
      metadataHash: undefined,
      expectedVersion: "2",
      deletedAt: "2026-08-25T00:00:00Z",
    });
  });

  it("maps 409 to DataPointVersionConflictError with the gateway's current version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: false,
            error:
              "Stale expectedVersion 2: must be strictly greater than the stored value 3",
            currentExpectedVersion: "3",
          },
          { status: 409, statusText: "Conflict" },
        ),
      ),
    );

    const error = await createGatewayClient("https://g")
      .deleteDataPoint({
        ownerAddress: OWNER,
        scope: SCOPE,
        expectedVersion: "2",
        signature: SIGNATURE,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataPointVersionConflictError);
    expect((error as DataPointVersionConflictError).details).toEqual({
      dataPointId: DATA_POINT_ID,
      scope: SCOPE,
      ownerAddress: OWNER,
      expectedVersion: "2",
      currentExpectedVersion: "3",
    });
    expect((error as Error).message).toContain("Stale expectedVersion 2");
  });

  it("maps 410 on DELETE to DataPointDeletedError and 404 to DataPointNotFoundError", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            { error: "deleted", deletedAt: "2026-08-20T00:00:00Z" },
            { status: 410, statusText: "Gone" },
          ),
        )
        .mockResolvedValueOnce(jsonResponse({}, { status: 404 })),
    );
    const client = createGatewayClient("https://g");
    const params = {
      ownerAddress: OWNER,
      scope: SCOPE,
      expectedVersion: "2",
      signature: SIGNATURE,
    };

    const gone = await client.deleteDataPoint(params).catch((e: unknown) => e);
    expect(gone).toBeInstanceOf(DataPointDeletedError);
    expect((gone as DataPointDeletedError).details.deletedAt).toBe(
      "2026-08-20T00:00:00Z",
    );

    await expect(client.deleteDataPoint(params)).rejects.toBeInstanceOf(
      DataPointNotFoundError,
    );
  });

  it("surfaces the 400 wrong-hash message verbatim", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: "signature does not match tombstone AddData" },
            { status: 400, statusText: "Bad Request" },
          ),
        ),
    );

    await expect(
      createGatewayClient("https://g").deleteDataPoint({
        ownerAddress: OWNER,
        scope: SCOPE,
        expectedVersion: "2",
        signature: SIGNATURE,
      }),
    ).rejects.toThrow(
      "Gateway error: 400 signature does not match tombstone AddData",
    );
  });

  it("maps 410 on GET /v1/data/:id to DataPointDeletedError", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: "deleted", deletedAt: "2026-08-20T00:00:00Z" },
            { status: 410, statusText: "Gone" },
          ),
        ),
    );

    const error = await createGatewayClient("https://g")
      .getDataPoint(DATA_POINT_ID)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataPointDeletedError);
    expect((error as DataPointDeletedError).code).toBe("DATA_POINT_DELETED");
    expect((error as DataPointDeletedError).details).toEqual({
      dataPointId: DATA_POINT_ID,
      deletedAt: "2026-08-20T00:00:00Z",
    });
  });

  it("returns the tombstone row with deletedAt when includeDeleted is set", async () => {
    const tombstone = {
      id: DATA_POINT_ID,
      ownerAddress: OWNER,
      scope: SCOPE,
      dataHash: TOMBSTONE_DATA_HASH,
      metadataHash: TOMBSTONE_METADATA_HASH,
      expectedVersion: "4",
      addedAt: "2026-08-25T00:00:00.000Z",
      deletedAt: "2026-08-25T00:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope(tombstone)))
      .mockResolvedValueOnce(jsonResponse(envelope(tombstone)));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.getDataPoint(DATA_POINT_ID, { includeDeleted: true }),
    ).resolves.toEqual(tombstone);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://g/v1/data/${DATA_POINT_ID}?includeDeleted=true`,
    );

    // A 200 tombstone on a plain read is still refused.
    await expect(client.getDataPoint(DATA_POINT_ID)).rejects.toBeInstanceOf(
      DataPointDeletedError,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://g/v1/data/${DATA_POINT_ID}`,
    );
  });

  it("passes includeDeleted on list and filters leaked tombstones otherwise", async () => {
    const live = {
      id: "0xlive",
      ownerAddress: OWNER,
      scope: "a.b",
      dataHash: "0xdata",
      metadataHash: "0xmeta",
      expectedVersion: "1",
      addedAt: "2026-08-25T00:00:00.000Z",
    };
    const dead = {
      ...live,
      id: "0xdead",
      scope: "c.d",
      expectedVersion: "2",
      deletedAt: "2026-08-25T00:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          envelope(
            { dataPoints: [live, dead] },
            { limit: 100, hasMore: false, nextCursor: null },
          ),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          envelope(
            { dataPoints: [live, dead] },
            { limit: 100, hasMore: false, nextCursor: null },
          ),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createGatewayClient("https://g");

    await expect(
      client.listDataPointsByOwner(OWNER, null, { includeDeleted: true }),
    ).resolves.toEqual({ dataPoints: [live, dead], cursor: null });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://g/v1/data?user=${OWNER}&includeDeleted=true`,
    );

    await expect(client.listDataPointsByOwner(OWNER, null)).resolves.toEqual({
      dataPoints: [live],
      cursor: null,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://g/v1/data?user=${OWNER}`,
    );
  });
});
