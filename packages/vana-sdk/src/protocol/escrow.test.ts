import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ESCROW_DEPOSIT_ABI,
  GENERIC_PAYMENT_TYPES,
  NATIVE_ASSET_ADDRESS,
  EscrowWithdrawalLifecycleError,
  EscrowWithdrawalRejectionError,
  createEscrowGatewayClient,
  genericPaymentDomain,
} from "./escrow";

const GATEWAY = "https://dp.example.com";
const ACCOUNT = "0xDeAdBeEf00000000000000000000000000000001" as const;
const SIG =
  "0xdeadbeef000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001" as const;
const TX_HASH =
  "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as const;
const LIFECYCLE_TX_HASH =
  "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const UINT256_MAX =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935" as const;
const UINT256_MAX_PLUS_ONE =
  "115792089237316195423570985008687907853269984665640564039457584007913129639936" as const;

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

      const result = await createEscrowGatewayClient(GATEWAY).submitDeposit({
        txHash: TX_HASH,
      });
      expect(result.status).toBe("finalized");
    });

    it("throws for 404 (tx not found in mempool/chain)", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { error: "tx not found" },
              { status: 404, statusText: "Not Found" },
            ),
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
          withdrawingAmount: "0",
          availableAmount: "500000000000000000",
          withdrawalMinimumAmount: "100000000000000000",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      deposits: { submitted: [], finalized: [], failed: [] },
    };

    it("GETs the balance and returns the parsed body", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(balanceBody));
      vi.stubGlobal("fetch", fetchMock);

      const result =
        await createEscrowGatewayClient(GATEWAY).getEscrowBalance(ACCOUNT);

      expect(result).toEqual(balanceBody);
      expect(result.balances[0]?.withdrawalMinimumAmount).toBe(
        "100000000000000000",
      );
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
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              {},
              { status: 503, statusText: "Service Unavailable" },
            ),
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
          withdrawingAmount: "0",
          availableAmount: "2000000000000000000",
          withdrawalMinimumAmount: null,
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
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(skippedBody)),
      );

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
        vi
          .fn()
          .mockResolvedValue(
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
        vi
          .fn()
          .mockResolvedValue(
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

  // ---- withdraw ------------------------------------------------------------

  describe("withdraw", () => {
    const withdrawParams = {
      account: ACCOUNT,
      asset: ZERO,
      amount: "1000000000000000000",
      withdrawNonce: "4",
      deadline: "1800000000",
      signature: SIG,
    };

    it("POSTs the signed deadline and explicit nonce without a recipient", async () => {
      const body = {
        success: true as const,
        status: "submitted" as const,
        account: ACCOUNT,
        asset: ZERO,
        amount: withdrawParams.amount,
        withdrawNonce: withdrawParams.withdrawNonce,
        txHash: TX_HASH,
        message: "Withdrawal submitted; confirmation pending.",
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(body, { status: 202 }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await createEscrowGatewayClient(`${GATEWAY}/`).withdraw(
        withdrawParams,
      );

      expect(result).toEqual(body);
      expect(fetchMock).toHaveBeenCalledWith(
        `${GATEWAY}/v1/escrow/withdraw`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Web3Signed ${SIG}`,
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            account: withdrawParams.account,
            asset: withdrawParams.asset,
            amount: withdrawParams.amount,
            withdrawNonce: withdrawParams.withdrawNonce,
            deadline: withdrawParams.deadline,
          }),
        }),
      );
    });

    it("lets callers reconcile with the exact same signed intent", async () => {
      const submitted = {
        success: true as const,
        status: "submitted" as const,
        txHash: TX_HASH,
        message: "Withdrawal submitted; confirmation pending.",
      };
      const confirmed = {
        success: true as const,
        status: "confirmed" as const,
        account: ACCOUNT,
        asset: ZERO,
        amount: withdrawParams.amount,
        withdrawNonce: withdrawParams.withdrawNonce,
        deadline: withdrawParams.deadline,
        txHash: TX_HASH,
        blockNumber: "123",
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(submitted, { status: 202 }))
        .mockResolvedValueOnce(jsonResponse(confirmed));
      vi.stubGlobal("fetch", fetchMock);

      const client = createEscrowGatewayClient(GATEWAY);
      expect(await client.withdraw(withdrawParams)).toEqual(submitted);
      expect(await client.withdraw(withdrawParams)).toEqual(confirmed);
      expect(confirmed.deadline).toBe(withdrawParams.deadline);

      const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
      const retryBody = (fetchMock.mock.calls[1]?.[1] as RequestInit).body;
      expect(retryBody).toBe(firstBody);
      expect(retryBody).toContain('"withdrawNonce":"4"');
      expect(retryBody).toContain('"deadline":"1800000000"');
    });

    it("models a gateway no-hash 202 as a persisted, unbroadcast authorization", async () => {
      const noHashSubmitted = {
        success: true as const,
        status: "submitted" as const,
        account: withdrawParams.account,
        asset: withdrawParams.asset,
        amount: withdrawParams.amount,
        withdrawNonce: withdrawParams.withdrawNonce,
        deadline: withdrawParams.deadline,
        txHash: null,
        message:
          "Withdrawal in progress (awaiting broadcast); confirmation pending.",
      };
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(jsonResponse(noHashSubmitted, { status: 202 })),
      );

      const result =
        await createEscrowGatewayClient(GATEWAY).withdraw(withdrawParams);

      expect(result.status).toBe("submitted");
      if (result.status === "submitted" && result.txHash === null) {
        expect(result.withdrawNonce).toBe(withdrawParams.withdrawNonce);
        expect(result.deadline).toBe(withdrawParams.deadline);
      } else {
        throw new Error("expected an unbroadcast submitted withdrawal");
      }
    });

    it("surfaces deadline validation errors without changing the nonce", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(
            {
              error: "Withdrawal authorization expired: deadline has passed",
            },
            { status: 401, statusText: "Unauthorized" },
          ),
        ),
      );

      await expect(
        createEscrowGatewayClient(GATEWAY).withdraw(withdrawParams),
      ).rejects.toThrow("deadline has passed");
    });

    it("preserves definite pre-acceptance rejection codes", async () => {
      const body = {
        success: false as const,
        status: "rejected" as const,
        code: "insufficient_available" as const,
        error: "Insufficient available balance for withdrawal",
        account: withdrawParams.account,
        asset: withdrawParams.asset,
        amount: withdrawParams.amount,
        withdrawNonce: withdrawParams.withdrawNonce,
        deadline: withdrawParams.deadline,
        balance: "500",
        authorizedAmount: "0",
        withdrawingAmount: "0",
        availableAmount: "500",
        requestedAmount: withdrawParams.amount,
      };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(body, {
            status: 400,
            statusText: "Bad Request",
          }),
        ),
      );

      try {
        await createEscrowGatewayClient(GATEWAY).withdraw(withdrawParams);
        throw new Error("expected a rejection error");
      } catch (error) {
        expect(error).toBeInstanceOf(EscrowWithdrawalRejectionError);
        expect(error).toMatchObject({
          name: "EscrowWithdrawalRejectionError",
          httpStatus: 400,
          result: body,
        });
      }
    });

    it.each([
      ["retryable", 503, null],
      ["reorged", 409, LIFECYCLE_TX_HASH],
      ["failed", 409, LIFECYCLE_TX_HASH],
    ] as const)(
      "preserves the %s lifecycle failure response",
      async (status, httpStatus, txHash) => {
        const body = {
          success: false as const,
          status,
          error: `withdrawal is ${status}`,
          account: withdrawParams.account,
          asset: withdrawParams.asset,
          amount: withdrawParams.amount,
          withdrawNonce: withdrawParams.withdrawNonce,
          deadline: withdrawParams.deadline,
          txHash,
          blockNumber: null,
        };
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            jsonResponse(body, {
              status: httpStatus,
              statusText: "Lifecycle",
            }),
          ),
        );

        try {
          await createEscrowGatewayClient(GATEWAY).withdraw(withdrawParams);
          throw new Error("expected a lifecycle error");
        } catch (error) {
          expect(error).toBeInstanceOf(EscrowWithdrawalLifecycleError);
          expect(error).toMatchObject({
            name: "EscrowWithdrawalLifecycleError",
            httpStatus,
            result: body,
          });
        }
      },
    );

    it.each(["amount", "withdrawNonce", "deadline"] as const)(
      "accepts the uint256 maximum for %s",
      async (field) => {
        const body = {
          success: false as const,
          status: "failed" as const,
          error: "withdrawal failed",
          account: withdrawParams.account,
          asset: withdrawParams.asset,
          amount: withdrawParams.amount,
          withdrawNonce: withdrawParams.withdrawNonce,
          deadline: withdrawParams.deadline,
          txHash: LIFECYCLE_TX_HASH,
          blockNumber: null,
          [field]: UINT256_MAX,
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockResolvedValue(
              jsonResponse(body, { status: 409, statusText: "Conflict" }),
            ),
        );

        await expect(
          createEscrowGatewayClient(GATEWAY).withdraw(withdrawParams),
        ).rejects.toBeInstanceOf(EscrowWithdrawalLifecycleError);
      },
    );

    it.each(["amount", "withdrawNonce", "deadline"] as const)(
      "rejects uint256 maximum plus one for %s",
      async (field) => {
        const body = {
          success: false as const,
          status: "failed" as const,
          error: "withdrawal failed",
          account: withdrawParams.account,
          asset: withdrawParams.asset,
          amount: withdrawParams.amount,
          withdrawNonce: withdrawParams.withdrawNonce,
          deadline: withdrawParams.deadline,
          txHash: LIFECYCLE_TX_HASH,
          blockNumber: null,
          [field]: UINT256_MAX_PLUS_ONE,
        };
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockResolvedValue(
              jsonResponse(body, { status: 409, statusText: "Conflict" }),
            ),
        );

        await expect(
          createEscrowGatewayClient(GATEWAY).withdraw(withdrawParams),
        ).rejects.not.toBeInstanceOf(EscrowWithdrawalLifecycleError);
      },
    );

    it.each([
      ["account", "not-an-address"],
      ["asset", "0x1234"],
      ["amount", "invalid"],
      ["withdrawNonce", "-1"],
      [
        "deadline",
        "0000000000000000000000000000000000000000000000000000000000000000000000000000000",
      ],
      ["txHash", "0x1234"],
      ["blockNumber", 123],
    ] as const)(
      "does not treat malformed %s as a typed lifecycle failure",
      async (field, value) => {
        const body = {
          success: false as const,
          status: "failed" as const,
          error: "withdrawal failed",
          account: withdrawParams.account,
          asset: withdrawParams.asset,
          amount: withdrawParams.amount,
          withdrawNonce: withdrawParams.withdrawNonce,
          deadline: withdrawParams.deadline,
          txHash: LIFECYCLE_TX_HASH,
          blockNumber: null,
          [field]: value,
        };
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            jsonResponse(body, {
              status: 409,
              statusText: "Conflict",
            }),
          ),
        );

        await expect(
          createEscrowGatewayClient(GATEWAY).withdraw(withdrawParams),
        ).rejects.not.toBeInstanceOf(EscrowWithdrawalLifecycleError);
      },
    );

    it.each([
      ["retryable", null],
      ["failed", LIFECYCLE_TX_HASH],
    ] as const)(
      "accepts %s lifecycle failures with nullable txHash %s",
      async (status, txHash) => {
        const body = {
          success: false as const,
          status,
          error: `withdrawal is ${status}`,
          account: withdrawParams.account,
          asset: withdrawParams.asset,
          amount: withdrawParams.amount,
          withdrawNonce: withdrawParams.withdrawNonce,
          deadline: withdrawParams.deadline,
          txHash,
          blockNumber: null,
        };
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            jsonResponse(body, {
              status: status === "retryable" ? 503 : 409,
              statusText: "Lifecycle",
            }),
          ),
        );

        await expect(
          createEscrowGatewayClient(GATEWAY).withdraw(withdrawParams),
        ).rejects.toMatchObject({
          name: "EscrowWithdrawalLifecycleError",
          result: body,
        });
      },
    );
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

describe("getWithdrawNonce", () => {
  const nonceBody = {
    success: true as const,
    account: ACCOUNT,
    chainId: "1480",
    lastWithdrawNonce: "3",
    nextWithdrawNonce: "4",
  };

  it("GETs the nonce and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(nonceBody));
    vi.stubGlobal("fetch", fetchMock);

    const result =
      await createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT);

    expect(result).toEqual(nonceBody);
    expect(fetchMock).toHaveBeenCalledWith(
      `${GATEWAY}/v1/escrow/withdraw/nonce?account=${encodeURIComponent(ACCOUNT)}`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("accepts null lastWithdrawNonce (first withdrawal for account)", async () => {
    const bodyWithNullLastNonce = {
      success: true as const,
      account: ACCOUNT,
      chainId: "1480",
      lastWithdrawNonce: null,
      nextWithdrawNonce: "1",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(bodyWithNullLastNonce));
    vi.stubGlobal("fetch", fetchMock);

    const result =
      await createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT);

    expect(result).toEqual(bodyWithNullLastNonce);
    expect(result.lastWithdrawNonce).toBeNull();
  });

  it("validates the response structure and rejects invalid responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        account: ACCOUNT,
        chainId: "1480",
        lastWithdrawNonce: "3",
        // missing nextWithdrawNonce
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("invalid response structure");
  });

  it("rejects non-uint256 decimal nonce values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          account: ACCOUNT,
          chainId: "1480",
          lastWithdrawNonce: "3",
          nextWithdrawNonce: UINT256_MAX_PLUS_ONE,
        }),
      ),
    );

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("invalid response structure");
  });

  it("rejects invalid account address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          account: "not-an-address",
          chainId: "1480",
          lastWithdrawNonce: "3",
          nextWithdrawNonce: "4",
        }),
      ),
    );

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("invalid response structure");
  });

  it("rejects non-numeric chainId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          account: ACCOUNT,
          chainId: "abc",
          lastWithdrawNonce: "3",
          nextWithdrawNonce: "4",
        }),
      ),
    );

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("invalid response structure");
  });

  it("throws on non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: "account not found" },
            { status: 404, statusText: "Not Found" },
          ),
        ),
    );

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("404");
  });

  it("includes the error message from the gateway body in the thrown error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: "gateway temporarily unavailable" },
            { status: 503, statusText: "Service Unavailable" },
          ),
        ),
    );

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("gateway temporarily unavailable");
  });

  it("rejects response with mismatched account (case-insensitive)", async () => {
    const wrongAccount = "0xdeadbeef00000000000000000000000000000002" as const;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          account: wrongAccount,
          chainId: "1480",
          lastWithdrawNonce: "3",
          nextWithdrawNonce: "4",
        }),
      ),
    );

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("invalid response structure");
  });

  it("rejects nonce pair inconsistency: nextWithdrawNonce not lastWithdrawNonce + 1", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          account: ACCOUNT,
          chainId: "1480",
          lastWithdrawNonce: "3",
          nextWithdrawNonce: "5", // Should be 4
        }),
      ),
    );

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("invalid response structure");
  });

  it("rejects when lastWithdrawNonce is null but nextWithdrawNonce is not 1", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          account: ACCOUNT,
          chainId: "1480",
          lastWithdrawNonce: null,
          nextWithdrawNonce: "2", // Should be 1
        }),
      ),
    );

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("invalid response structure");
  });

  it("sends fetch request with cache: 'no-store' directive", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        account: ACCOUNT,
        chainId: "1480",
        lastWithdrawNonce: "3",
        nextWithdrawNonce: "4",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("rejects response with success: false even if fields otherwise match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: false,
          account: ACCOUNT,
          chainId: "1480",
          lastWithdrawNonce: "3",
          nextWithdrawNonce: "4",
        }),
      ),
    );

    await expect(
      createEscrowGatewayClient(GATEWAY).getWithdrawNonce(ACCOUNT),
    ).rejects.toThrow("invalid response structure");
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
