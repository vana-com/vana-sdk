import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ESCROW_DEPOSIT_ABI,
  GENERIC_PAYMENT_TYPES,
  NATIVE_ASSET_ADDRESS,
  createEscrowGatewayClient,
  genericPaymentDomain,
} from "./escrow";

const GATEWAY = "https://dp.example.com";
const ACCOUNT = "0xDeAdBeEf00000000000000000000000000000001" as const;
const SIG =
  "0xdeadbeef000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001" as const;
const TX_HASH =
  "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab" as const;
const ZERO =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? "OK",
    headers: { "Content-Type": "application/json" },
  });
}

describe("createEscrowGatewayClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---- submitDeposit -------------------------------------------------------

  describe("submitDeposit", () => {
    it("POSTs the txHash and returns the result for 202 Accepted", async () => {
      const body = {
        success: true,
        txHash: TX_HASH,
        account: ACCOUNT,
        status: "submitted",
        submittedAt: "2026-01-01T00:00:00.000Z",
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(body, { status: 202 }));
      vi.stubGlobal("fetch", fetchMock);

      const client = createEscrowGatewayClient(GATEWAY);
      const result = await client.submitDeposit({ txHash: TX_HASH });

      expect(result).toEqual(body);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        `${GATEWAY}/v1/escrow/deposit`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ txHash: TX_HASH }),
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("accepts 200 OK for replay of an already-submitted deposit", async () => {
      const body = {
        success: true,
        txHash: TX_HASH,
        account: ACCOUNT,
        status: "finalized",
        submittedAt: "2026-01-01T00:00:00.000Z",
        finalizedAt: "2026-01-01T00:01:00.000Z",
      };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(body, { status: 200 })),
      );

      const result =
        await createEscrowGatewayClient(GATEWAY).submitDeposit({ txHash: TX_HASH });
      expect(result.status).toBe("finalized");
    });

    it("throws for 404 (tx not found in mempool/chain)", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: "tx not found" }, { status: 404, statusText: "Not Found" }),
          ),
      );

      await expect(
        createEscrowGatewayClient(GATEWAY).submitDeposit({ txHash: TX_HASH }),
      ).rejects.toThrow("404");
    });

    it("throws for 400 (not a deposit calldata)", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { error: "not a deposit" },
              { status: 400, statusText: "Bad Request" },
            ),
          ),
      );

      await expect(
        createEscrowGatewayClient(GATEWAY).submitDeposit({ txHash: TX_HASH }),
      ).rejects.toThrow("400");
    });

    it("includes the error message from the gateway body in the thrown error", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { error: "wrong contract address" },
              { status: 400, statusText: "Bad Request" },
            ),
          ),
      );

      await expect(
        createEscrowGatewayClient(GATEWAY).submitDeposit({ txHash: TX_HASH }),
      ).rejects.toThrow("wrong contract address");
    });
  });

  // ---- getEscrowBalance ----------------------------------------------------

  describe("getEscrowBalance", () => {
    const balanceBody = {
      account: ACCOUNT,
      balances: [
        {
          asset: ZERO,
          balance: "1000000000000000000",
          pendingAmount: "0",
          authorizedAmount: "500000000000000000",
          availableAmount: "500000000000000000",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      deposits: { submitted: [], finalized: [], failed: [] },
    };

    it("GETs the balance and returns the parsed body", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(balanceBody));
      vi.stubGlobal("fetch", fetchMock);

      const result = await createEscrowGatewayClient(GATEWAY).getEscrowBalance(ACCOUNT);

      expect(result).toEqual(balanceBody);
      expect(fetchMock).toHaveBeenCalledWith(
        `${GATEWAY}/v1/escrow/balance?account=${encodeURIComponent(ACCOUNT)}`,
      );
    });

    it("strips a trailing slash from the base URL", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(balanceBody));
      vi.stubGlobal("fetch", fetchMock);

      await createEscrowGatewayClient(`${GATEWAY}/`).getEscrowBalance(ACCOUNT);

      expect(fetchMock).toHaveBeenCalledWith(
        `${GATEWAY}/v1/escrow/balance?account=${encodeURIComponent(ACCOUNT)}`,
      );
    });

    it("throws on non-2xx responses", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({}, { status: 503, statusText: "Service Unavailable" }),
        ),
      );

      await expect(
        createEscrowGatewayClient(GATEWAY).getEscrowBalance(ACCOUNT),
      ).rejects.toThrow("503");
    });
  });

  // ---- syncEscrowBalance ---------------------------------------------------

  describe("syncEscrowBalance", () => {
    const syncBody = {
      account: ACCOUNT,
      balances: [
        {
          asset: ZERO,
          balance: "2000000000000000000",
          pendingAmount: "0",
          authorizedAmount: "0",
          availableAmount: "2000000000000000000",
          updatedAt: "2026-01-01T00:02:00.000Z",
        },
      ],
      deposits: { submitted: [], finalized: [], failed: [] },
      sync: { scanned: 3, finalized: 1, stillPending: 0, failed: 0 },
    };

    it("POSTs to the sync endpoint and returns sync metadata", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(syncBody));
      vi.stubGlobal("fetch", fetchMock);

      const result =
        await createEscrowGatewayClient(GATEWAY).syncEscrowBalance(ACCOUNT);

      expect(result.sync).toEqual({
        scanned: 3,
        finalized: 1,
        stillPending: 0,
        failed: 0,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        `${GATEWAY}/v1/escrow/balance/sync?account=${encodeURIComponent(ACCOUNT)}`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("handles skipped sync (no pending deposits)", async () => {
      const skippedBody = { ...syncBody, sync: { skipped: true } };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(skippedBody)));

      const result =
        await createEscrowGatewayClient(GATEWAY).syncEscrowBalance(ACCOUNT);
      expect(result.sync).toEqual({ skipped: true });
    });
  });

  // ---- payForOp ------------------------------------------------------------

  describe("payForOp", () => {
    const payParams = {
      payerAddress: ACCOUNT,
      opType: "grant",
      opId: "0x1234000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
      asset: ZERO,
      amount: "1000000000000000000",
      paymentNonce: "1",
      signature: SIG,
    };
    const payResult = {
      success: true as const,
      opType: "grant",
      opId: payParams.opId,
      payerAddress: ACCOUNT,
      asset: ZERO,
      amount: "1000000000000000000",
      breakdown: {
        registrationFee: "100000000000000000",
        dataAccessFee: "900000000000000000",
        registrationPaid: true,
      },
      paymentNonce: "1",
      paidAt: "2026-01-01T00:00:00.000Z",
    };

    it("POSTs with Web3Signed Authorization header and returns payment result", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payResult));
      vi.stubGlobal("fetch", fetchMock);

      const result =
        await createEscrowGatewayClient(GATEWAY).payForOp(payParams);

      expect(result).toEqual(payResult);
      expect(fetchMock).toHaveBeenCalledWith(
        `${GATEWAY}/v1/escrow/pay`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Web3Signed ${SIG}`,
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            payerAddress: payParams.payerAddress,
            opType: payParams.opType,
            opId: payParams.opId,
            asset: payParams.asset,
            amount: payParams.amount,
            paymentNonce: payParams.paymentNonce,
          }),
        }),
      );
    });

    it("throws on 402 Insufficient Balance", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(
            { error: "insufficient balance" },
            { status: 402, statusText: "Payment Required" },
          ),
        ),
      );

      await expect(
        createEscrowGatewayClient(GATEWAY).payForOp(payParams),
      ).rejects.toThrow("402");
    });

    it("throws on 409 nonce replay", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(
            { error: "nonce already used" },
            { status: 409, statusText: "Conflict" },
          ),
        ),
      );

      await expect(
        createEscrowGatewayClient(GATEWAY).payForOp(payParams),
      ).rejects.toThrow("409");
    });
  });
});

// ---------------------------------------------------------------------------
// EIP-712 helpers
// ---------------------------------------------------------------------------

describe("genericPaymentDomain", () => {
  it("uses the Vana Data Portability domain name and version", () => {
    const domain = genericPaymentDomain(
      1480,
      "0xEscrowContractAddr00000000000000000000" as `0x${string}`,
    );
    expect(domain.name).toBe("Vana Data Portability");
    expect(domain.version).toBe("1");
    expect(domain.chainId).toBe(1480);
    expect(domain.verifyingContract).toBe(
      "0xEscrowContractAddr00000000000000000000",
    );
  });
});

describe("GENERIC_PAYMENT_TYPES", () => {
  it("defines all required EIP-712 fields in the correct order", () => {
    const fields = GENERIC_PAYMENT_TYPES.GenericPayment.map((f) => f.name);
    expect(fields).toEqual([
      "payerAddress",
      "opType",
      "opId",
      "asset",
      "amount",
      "paymentNonce",
    ]);
  });
});

describe("NATIVE_ASSET_ADDRESS", () => {
  it("is the Ethereum zero address", () => {
    expect(NATIVE_ASSET_ADDRESS).toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });
});

describe("ESCROW_DEPOSIT_ABI", () => {
  it("exposes depositNative as payable", () => {
    const fn = ESCROW_DEPOSIT_ABI.find((f) => f.name === "depositNative");
    expect(fn).toBeDefined();
    expect(fn?.stateMutability).toBe("payable");
    expect(fn?.inputs.map((i) => i.name)).toEqual(["account"]);
  });

  it("exposes depositToken as nonpayable with three inputs", () => {
    const fn = ESCROW_DEPOSIT_ABI.find((f) => f.name === "depositToken");
    expect(fn).toBeDefined();
    expect(fn?.stateMutability).toBe("nonpayable");
    expect(fn?.inputs.map((i) => i.name)).toEqual([
      "account",
      "token",
      "amount",
    ]);
  });
});
