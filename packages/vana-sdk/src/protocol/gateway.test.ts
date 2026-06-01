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
      "https://g/v1/files?user=0xowner&since=cursor-1",
    );
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
      4,
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
