import { describe, it, expect, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildPersonalServerDataReadRequest,
  dataPathForScope,
  parsePersonalServerPaymentRequired,
  readPersonalServerData,
} from "./personal-server-read";
import type { FetchResponseLike } from "./personal-server-read";
import type { EscrowPaymentConfig } from "./escrow-payment";
import { NATIVE_ASSET_ADDRESS } from "../protocol/escrow";
import { PaymentRequiredError } from "./errors";

const KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const account = privateKeyToAccount(KEY);
const signMessage = (message: string) => account.signMessage({ message });
const PAYER = account.address;
const GRANT_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const OTHER_GRANT_ID =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const DATA_POINT_ID =
  "0x3333333333333333333333333333333333333333333333333333333333333333";
const RECORD_ID =
  "0x4444444444444444444444444444444444444444444444444444444444444444";
const ACCESS_SIGNATURE = `0x${"55".repeat(65)}`;
const VALID_ACCESS_RECORD = {
  dataPointId: DATA_POINT_ID,
  version: "1",
  accessor: PAYER,
  recordId: RECORD_ID,
  signature: ACCESS_SIGNATURE,
};
const UINT256_MAX_DECIMAL = ((1n << 256n) - 1n).toString();

function dataAccessAccept(overrides: Record<string, unknown> = {}) {
  return {
    scheme: "vana-escrow-grant",
    network: "vana:14800",
    asset: NATIVE_ASSET_ADDRESS,
    amount: "12345",
    message: {
      payerAddress: PAYER,
      opType: "data_access",
      opId: RECORD_ID,
      asset: NATIVE_ASSET_ADDRESS,
      amount: "12345",
      paymentNonce: "9",
    },
    accessRecord: VALID_ACCESS_RECORD,
    ...overrides,
  };
}

function dataAccessChallenge(
  accepts: unknown[] = [dataAccessAccept()],
  overrides: Record<string, unknown> = {},
) {
  return {
    x402Version: 1,
    error: "PAYMENT_REQUIRED",
    accepts,
    ...overrides,
  };
}

function jsonRes(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): FetchResponseLike {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: {
      get: (name) =>
        init.headers?.[name] ?? init.headers?.[name.toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function payResultFixture(opId: string) {
  return {
    success: true as const,
    opType: "grant",
    opId,
    payerAddress: PAYER,
    asset: NATIVE_ASSET_ADDRESS,
    amount: "1000000000000000000",
    breakdown: {
      registrationFee: "100000000000000000",
      dataAccessFee: "900000000000000000",
      registrationPaid: true,
    },
    paymentNonce: "1",
    paidAt: "2026-01-01T00:00:00.000Z",
  };
}

function mockEscrow(payForOp = vi.fn()): EscrowPaymentConfig {
  return {
    client: {
      submitDeposit: vi.fn(),
      getEscrowBalance: vi.fn(),
      syncEscrowBalance: vi.fn(),
      payForOp,
    },
    escrowContract: "0x000000000000000000000000000000000000dEaD",
    chainId: 14800,
    signTypedData: vi.fn(async () => "0xsignature" as `0x${string}`),
  };
}

describe("dataPathForScope", () => {
  it("builds the /v1/data/{scope} path", () => {
    expect(dataPathForScope("icloud_notes.notes")).toBe(
      "/v1/data/icloud_notes.notes",
    );
  });
});

describe("buildPersonalServerDataReadRequest", () => {
  it("produces a signed GET with grantId-bearing Web3Signed header", async () => {
    const req = await buildPersonalServerDataReadRequest({
      personalServerUrl: "https://ps.example.com/",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      signMessage,
    });

    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://ps.example.com/v1/data/icloud_notes.notes");
    expect(req.path).toBe("/v1/data/icloud_notes.notes");
    expect(req.headers.Authorization).toMatch(/^Web3Signed /);
  });
});

describe("parsePersonalServerPaymentRequired", () => {
  it("parses grantId/asset/amount from the 402 body", async () => {
    const required = await parsePersonalServerPaymentRequired(
      jsonRes(
        {
          grantId: GRANT_ID,
          asset: "0xtoken",
          amount: "12345",
        },
        { status: 402 },
      ),
      GRANT_ID,
    );
    expect(required.grantId).toBe(GRANT_ID);
    expect(required.opType).toBe("grant");
    expect(required.opId).toBe(GRANT_ID);
    expect(required.asset).toBe("0xtoken");
    expect(required.amount).toBe("12345");
  });

  it("falls back to the read grantId, native asset, and 0 amount", async () => {
    const required = await parsePersonalServerPaymentRequired(
      jsonRes(null, { status: 402 }),
      GRANT_ID,
    );
    expect(required.grantId).toBe(GRANT_ID);
    expect(required.opType).toBe("grant");
    expect(required.opId).toBe(GRANT_ID);
    expect(required.asset).toBe(NATIVE_ASSET_ADDRESS);
    expect(required.amount).toBe("0");
  });

  it("parses canonical payment fields from an x402 challenge", async () => {
    const required = await parsePersonalServerPaymentRequired(
      jsonRes(
        {
          x402Version: 1,
          error: "PAYMENT_REQUIRED",
          amount: "0",
          accepts: [
            {
              scheme: "vana-escrow-grant",
              network: "vana:14800",
              asset: NATIVE_ASSET_ADDRESS,
              amount: "12345",
              message: {
                payerAddress: PAYER,
                opType: "grant",
                opId: GRANT_ID,
                asset: NATIVE_ASSET_ADDRESS,
                amount: "12345",
                paymentNonce: "9",
              },
              accessRecord: {
                dataPointId: DATA_POINT_ID,
                version: "1",
                accessor: PAYER,
                recordId: RECORD_ID,
                signature: ACCESS_SIGNATURE,
              },
            },
          ],
        },
        { status: 402 },
      ),
      GRANT_ID,
    );

    expect(required).toMatchObject({
      grantId: GRANT_ID,
      opType: "grant",
      opId: GRANT_ID,
      asset: NATIVE_ASSET_ADDRESS,
      amount: "12345",
      paymentNonce: "9",
      accessRecord: {
        dataPointId: DATA_POINT_ID,
        version: "1",
        accessor: PAYER,
        recordId: RECORD_ID,
        signature: ACCESS_SIGNATURE,
      },
    });
  });

  it("rejects x402 challenges for a different grant", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          {
            x402Version: 1,
            error: "PAYMENT_REQUIRED",
            accepts: [
              {
                scheme: "vana-escrow-grant",
                network: "vana:14800",
                asset: NATIVE_ASSET_ADDRESS,
                amount: "12345",
                message: {
                  payerAddress: PAYER,
                  opType: "grant",
                  opId: OTHER_GRANT_ID,
                  asset: NATIVE_ASSET_ADDRESS,
                  amount: "12345",
                  paymentNonce: "9",
                },
              },
            ],
          },
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/requested grant/);
  });

  it("parses a receipt-bound data-access challenge", async () => {
    const required = await parsePersonalServerPaymentRequired(
      jsonRes(dataAccessChallenge(), { status: 402 }),
      GRANT_ID,
    );

    expect(required).toMatchObject({
      grantId: GRANT_ID,
      opType: "data_access",
      opId: RECORD_ID,
      accessRecord: { recordId: RECORD_ID },
    });
  });

  it.each([
    ["missing access record", undefined],
    [
      "incomplete access record",
      {
        dataPointId: DATA_POINT_ID,
        version: "1",
        accessor: PAYER,
        recordId: RECORD_ID,
      },
    ],
    ["invalid dataPointId", { ...VALID_ACCESS_RECORD, dataPointId: "0xshort" }],
    ["invalid version", { ...VALID_ACCESS_RECORD, version: "0" }],
    ["invalid accessor", { ...VALID_ACCESS_RECORD, accessor: "0xinvalid" }],
    ["invalid recordId", { ...VALID_ACCESS_RECORD, recordId: "0xshort" }],
    ["invalid signature", { ...VALID_ACCESS_RECORD, signature: "0xsig" }],
  ])("rejects data_access with %s", async (_label, accessRecord) => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          dataAccessChallenge([
            dataAccessAccept({
              ...(accessRecord
                ? { accessRecord }
                : { accessRecord: undefined }),
            }),
          ]),
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/untrusted or incomplete/);
  });

  it("rejects data_access without an operation id", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          dataAccessChallenge([
            dataAccessAccept({
              message: {
                payerAddress: PAYER,
                opType: "data_access",
                asset: NATIVE_ASSET_ADDRESS,
                amount: "12345",
                paymentNonce: "9",
              },
            }),
          ]),
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/untrusted or incomplete/);
  });

  it("rejects data_access when opId does not match recordId", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          dataAccessChallenge([
            dataAccessAccept({
              message: {
                payerAddress: PAYER,
                opType: "data_access",
                opId: OTHER_GRANT_ID,
                asset: NATIVE_ASSET_ADDRESS,
                amount: "12345",
                paymentNonce: "9",
              },
            }),
          ]),
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/untrusted or incomplete/);
  });

  it("selects a later compatible data_access offer", async () => {
    const required = await parsePersonalServerPaymentRequired(
      jsonRes(
        dataAccessChallenge([
          dataAccessAccept({ scheme: "attacker-scheme" }),
          dataAccessAccept(),
        ]),
        { status: 402 },
      ),
      GRANT_ID,
    );

    expect(required).toMatchObject({
      opType: "data_access",
      opId: RECORD_ID,
      paymentNonce: "9",
    });
  });

  it.each([
    ["wrong x402 version", { x402Version: 2 }],
    ["wrong error semantics", { error: "INSUFFICIENT_BALANCE" }],
  ])("rejects data_access with %s", async (_label, overrides) => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(dataAccessChallenge(undefined, overrides), { status: 402 }),
        GRANT_ID,
      ),
    ).rejects.toThrow(/not a canonical x402 challenge/);
  });

  it("does not mix an attacker offer with top-level fallback fields", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          dataAccessChallenge(
            [
              dataAccessAccept({
                scheme: "attacker-scheme",
                accessRecord: undefined,
              }),
            ],
            {
              opId: RECORD_ID,
              asset: NATIVE_ASSET_ADDRESS,
              amount: "12345",
              paymentNonce: "9",
              accessRecord: VALID_ACCESS_RECORD,
            },
          ),
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/untrusted or incomplete/);
  });

  it("requires the access record on the same accepts entry", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          dataAccessChallenge([dataAccessAccept({ accessRecord: undefined })], {
            accessRecord: VALID_ACCESS_RECORD,
          }),
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/untrusted or incomplete/);
  });

  it("rejects a message payer that differs from the receipt accessor", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          dataAccessChallenge([
            dataAccessAccept({
              message: {
                payerAddress: "0x2222222222222222222222222222222222222222",
                opType: "data_access",
                opId: RECORD_ID,
                asset: NATIVE_ASSET_ADDRESS,
                amount: "12345",
                paymentNonce: "9",
              },
            }),
          ]),
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/untrusted or incomplete/);
  });

  it.each([
    ["missing", undefined],
    ["zero", "0"],
    ["leading zero", "09"],
    ["above uint256", (1n << 256n).toString()],
  ])("rejects a data_access %s payment nonce", async (_label, paymentNonce) => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          dataAccessChallenge([
            dataAccessAccept({
              message: {
                payerAddress: PAYER,
                opType: "data_access",
                opId: RECORD_ID,
                asset: NATIVE_ASSET_ADDRESS,
                amount: "12345",
                ...(paymentNonce === undefined ? {} : { paymentNonce }),
              },
            }),
          ]),
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/untrusted or incomplete/);
  });

  it("accepts uint256-max accessRecord.version and rejects overflow", async () => {
    const valid = await parsePersonalServerPaymentRequired(
      jsonRes(
        dataAccessChallenge([
          dataAccessAccept({
            accessRecord: {
              ...VALID_ACCESS_RECORD,
              version: UINT256_MAX_DECIMAL,
            },
          }),
        ]),
        { status: 402 },
      ),
      GRANT_ID,
    );
    expect(valid.accessRecord?.version).toBe(UINT256_MAX_DECIMAL);

    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          dataAccessChallenge([
            dataAccessAccept({
              accessRecord: {
                ...VALID_ACCESS_RECORD,
                version: (1n << 256n).toString(),
              },
            }),
          ]),
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/untrusted or incomplete/);
  });

  it("accepts amount zero only on a complete data_access offer", async () => {
    const required = await parsePersonalServerPaymentRequired(
      jsonRes(
        dataAccessChallenge([
          dataAccessAccept({
            amount: "0",
            message: {
              payerAddress: PAYER,
              opType: "data_access",
              opId: RECORD_ID,
              asset: NATIVE_ASSET_ADDRESS,
              amount: "0",
              paymentNonce: "9",
            },
          }),
        ]),
        { status: 402 },
      ),
      GRANT_ID,
    );
    expect(required).toMatchObject({ opType: "data_access", amount: "0" });
  });

  it("rejects an unsupported legacy grant accepts envelope", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          {
            x402Version: 999,
            error: "NOT_PAYMENT",
            accepts: [
              {
                scheme: "evil",
                network: "vana:14800",
                message: {
                  payerAddress: PAYER,
                  opType: "grant",
                  opId: GRANT_ID,
                  asset: NATIVE_ASSET_ADDRESS,
                  amount: "1",
                  paymentNonce: "9",
                },
              },
            ],
          },
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/not a canonical x402 challenge/);
  });

  it("never falls back to an unqualified legacy accepts offer", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          {
            x402Version: 1,
            error: "PAYMENT_REQUIRED",
            accepts: [
              {
                scheme: "evil",
                message: {
                  opType: "grant",
                  opId: GRANT_ID,
                  amount: "1",
                },
              },
            ],
          },
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/no compatible escrow offer/);
  });

  it("rejects unsupported x402 escrow op types", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          {
            opType: "subscription",
            opId: GRANT_ID,
          },
          { status: 402 },
        ),
        GRANT_ID,
      ),
    ).rejects.toThrow(/unsupported escrow op type/);
  });
});

describe("readPersonalServerData transport retry", () => {
  const fastRetry = { attempts: 3, initialDelayMs: 1, maxDelayMs: 2 };

  it("retries when fetch throws and succeeds on a later attempt", async () => {
    let call = 0;
    const result = await readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      payerAddress: PAYER,
      signMessage,
      transportRetry: fastRetry,
      fetchFn: async () => {
        call += 1;
        if (call < 3) {
          throw new TypeError("fetch failed: socket disconnected");
        }
        return jsonRes({ items: [1] });
      },
    });
    expect(call).toBe(3);
    expect(result.data).toEqual({ items: [1] });
  });

  it("rethrows the transport error once attempts are exhausted", async () => {
    let call = 0;
    await expect(
      readPersonalServerData({
        personalServerUrl: "https://ps.example.com",
        scope: "icloud_notes.notes",
        grantId: GRANT_ID,
        payerAddress: PAYER,
        signMessage,
        transportRetry: fastRetry,
        fetchFn: async () => {
          call += 1;
          throw new TypeError("fetch failed: ECONNRESET");
        },
      }),
    ).rejects.toThrow("ECONNRESET");
    expect(call).toBe(3);
  });

  it("does not retry an aborted request", async () => {
    let call = 0;
    await expect(
      readPersonalServerData({
        personalServerUrl: "https://ps.example.com",
        scope: "icloud_notes.notes",
        grantId: GRANT_ID,
        payerAddress: PAYER,
        signMessage,
        transportRetry: fastRetry,
        fetchFn: async () => {
          call += 1;
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        },
      }),
    ).rejects.toThrow("aborted");
    expect(call).toBe(1);
  });

  it("does not retry a received HTTP error response", async () => {
    let call = 0;
    await expect(
      readPersonalServerData({
        personalServerUrl: "https://ps.example.com",
        scope: "icloud_notes.notes",
        grantId: GRANT_ID,
        payerAddress: PAYER,
        signMessage,
        transportRetry: fastRetry,
        fetchFn: async () => {
          call += 1;
          return jsonRes({ error: "boom" }, { status: 500 });
        },
      }),
    ).rejects.toThrow("Personal Server read failed: 500");
    expect(call).toBe(1);
  });

  it("re-signs auth per attempt on a fresh Web3Signed header", async () => {
    let call = 0;
    const authHeaders: string[] = [];
    await readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      payerAddress: PAYER,
      signMessage,
      transportRetry: fastRetry,
      fetchFn: async (_input, init) => {
        call += 1;
        authHeaders.push(init.headers.Authorization);
        if (call === 1) {
          throw new TypeError("fetch failed");
        }
        return jsonRes({ ok: true });
      },
    });
    expect(authHeaders).toHaveLength(2);
    for (const header of authHeaders) {
      expect(header).toMatch(/^Web3Signed /);
    }
  });

  it("reuses the SAME X-PAYMENT header across paid-read transport retries (no double pay)", async () => {
    let call = 0;
    const escrow = mockEscrow();
    const paymentHeaders: Array<string | undefined> = [];
    const result = await readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      payerAddress: PAYER,
      signMessage,
      escrow,
      transportRetry: fastRetry,
      fetchFn: async (_input, init) => {
        call += 1;
        if (call === 1) {
          // paymentNonce pinned in the challenge so this test never consumes
          // the process-local per-payer nonce counter other tests rely on.
          return jsonRes(
            {
              grantId: GRANT_ID,
              asset: NATIVE_ASSET_ADDRESS,
              amount: "1000",
              paymentNonce: "7",
            },
            { status: 402 },
          );
        }
        paymentHeaders.push(init.headers["X-PAYMENT"]);
        if (call === 2) {
          // Tunnel dies while delivering the paid read.
          throw new TypeError("fetch failed: socket disconnected");
        }
        return jsonRes({ ok: true });
      },
    });
    expect(result.data).toEqual({ ok: true });
    // Exactly one payment authorization was signed...
    expect(escrow.signTypedData).toHaveBeenCalledTimes(1);
    // ...and both paid attempts carried the identical signed header.
    expect(paymentHeaders).toHaveLength(2);
    expect(paymentHeaders[0]).toBeDefined();
    expect(paymentHeaders[1]).toBe(paymentHeaders[0]);
  });
});

describe("readPersonalServerData", () => {
  it("returns data without a payment receipt when no 402 occurs", async () => {
    const result = await readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      payerAddress: PAYER,
      signMessage,
      fetchFn: async () => jsonRes({ items: [1, 2, 3] }),
    });
    expect(result.data).toEqual({ items: [1, 2, 3] });
    expect(result.payment).toBeUndefined();
  });

  it("retries a 402 with x402 payment proof and attaches a payment receipt", async () => {
    let call = 0;
    const payForOp = vi.fn(async () => payResultFixture(GRANT_ID));
    let retryPaymentHeader: string | undefined;
    const result = await readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      payerAddress: PAYER,
      signMessage,
      escrow: mockEscrow(payForOp),
      fetchFn: async (_input, init) => {
        call += 1;
        if (call === 1) {
          return jsonRes(
            { grantId: GRANT_ID, asset: NATIVE_ASSET_ADDRESS, amount: "1000" },
            { status: 402 },
          );
        }
        retryPaymentHeader = init.headers["X-PAYMENT"];
        return jsonRes(
          { ok: true },
          {
            headers: {
              "X-PAYMENT-RESPONSE": btoa(
                JSON.stringify(payResultFixture(GRANT_ID)),
              ),
            },
          },
        );
      },
    });

    expect(call).toBe(2);
    expect(payForOp).not.toHaveBeenCalled();
    expect(retryPaymentHeader).toBeDefined();
    expect(JSON.parse(atob(retryPaymentHeader!))).toMatchObject({
      x402Version: 1,
      scheme: "vana-escrow-grant",
      network: "vana:14800",
      payload: {
        message: {
          payerAddress: PAYER,
          opType: "grant",
          opId: GRANT_ID,
          asset: NATIVE_ASSET_ADDRESS,
          amount: "1000",
          paymentNonce: "1",
        },
        signature: "0xsignature",
      },
    });
    expect(result.data).toEqual({ ok: true });
    expect(result.payment).toMatchObject({
      opType: "grant",
      opId: GRANT_ID,
      amount: "1000000000000000000",
      breakdown: {
        registrationFee: "100000000000000000",
        dataAccessFee: "900000000000000000",
        registrationPaid: true,
      },
    });
  });

  it("does not sign a placeholder zero-amount 402 challenge", async () => {
    const payForOp = vi.fn(async () => payResultFixture(GRANT_ID));
    const result = readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      payerAddress: PAYER,
      signMessage,
      escrow: mockEscrow(payForOp),
      fetchFn: async () =>
        jsonRes(
          { grantId: GRANT_ID, asset: NATIVE_ASSET_ADDRESS, amount: "0" },
          { status: 402 },
        ),
    });

    await expect(result).rejects.toThrow(PaymentRequiredError);
    expect(payForOp).not.toHaveBeenCalled();
  });

  it("signs a current Personal Server zero-fee grant receipt acknowledgment", async () => {
    let call = 0;
    const escrow = mockEscrow();
    const result = await readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      payerAddress: PAYER,
      signMessage,
      escrow,
      fetchFn: async () => {
        call += 1;
        if (call === 1) {
          return jsonRes(
            {
              x402Version: 1,
              error: "PAYMENT_REQUIRED",
              accepts: [
                {
                  scheme: "vana-escrow-grant",
                  network: "vana:14800",
                  asset: NATIVE_ASSET_ADDRESS,
                  amount: "0",
                  message: {
                    payerAddress: PAYER,
                    opType: "grant",
                    opId: GRANT_ID,
                    asset: NATIVE_ASSET_ADDRESS,
                    amount: "0",
                    paymentNonce: "9",
                  },
                  accessRecord: VALID_ACCESS_RECORD,
                },
              ],
            },
            { status: 402 },
          );
        }
        return jsonRes({ ok: true });
      },
    });

    expect(result.data).toEqual({ ok: true });
    expect(escrow.signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          opType: "grant",
          opId: GRANT_ID,
          amount: 0n,
          paymentNonce: 9n,
        }),
      }),
    );
  });

  it("signs a zero-amount data_access receipt acknowledgment", async () => {
    let call = 0;
    const escrow = mockEscrow();
    const result = await readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      payerAddress: PAYER,
      signMessage,
      escrow,
      fetchFn: async () => {
        call += 1;
        if (call === 1) {
          return jsonRes(
            dataAccessChallenge([
              dataAccessAccept({
                amount: "0",
                message: {
                  payerAddress: PAYER,
                  opType: "data_access",
                  opId: RECORD_ID,
                  asset: NATIVE_ASSET_ADDRESS,
                  amount: "0",
                  paymentNonce: "9",
                },
              }),
            ]),
            { status: 402 },
          );
        }
        return jsonRes({ ok: true });
      },
    });

    expect(result.data).toEqual({ ok: true });
    expect(escrow.signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          opType: "data_access",
          opId: RECORD_ID,
          amount: 0n,
          paymentNonce: 9n,
        }),
      }),
    );
  });

  it("throws PaymentRequiredError with amount/asset when escrow is not configured", async () => {
    let thrown: unknown;
    try {
      await readPersonalServerData({
        personalServerUrl: "https://ps.example.com",
        scope: "icloud_notes.notes",
        grantId: GRANT_ID,
        payerAddress: PAYER,
        signMessage,
        fetchFn: async () =>
          jsonRes(
            { grantId: GRANT_ID, asset: "0xtoken", amount: "777" },
            { status: 402 },
          ),
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PaymentRequiredError);
    const details = (thrown as PaymentRequiredError).details;
    expect(details).toMatchObject({ asset: "0xtoken", amount: "777" });
  });

  it("throws PaymentRequiredError when the server still demands payment after settlement", async () => {
    const result = readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: GRANT_ID,
      payerAddress: PAYER,
      signMessage,
      escrow: mockEscrow(vi.fn(async () => payResultFixture(GRANT_ID))),
      fetchFn: async () => jsonRes({ amount: "1000" }, { status: 402 }), // always 402
    });
    await expect(result).rejects.toThrow(PaymentRequiredError);
  });
});
