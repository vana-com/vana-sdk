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
    expect(required.asset).toBe("0xtoken");
    expect(required.amount).toBe("12345");
  });

  it("falls back to the read grantId, native asset, and 0 amount", async () => {
    const required = await parsePersonalServerPaymentRequired(
      jsonRes(null, { status: 402 }),
      GRANT_ID,
    );
    expect(required.grantId).toBe(GRANT_ID);
    expect(required.asset).toBe(NATIVE_ASSET_ADDRESS);
    expect(required.amount).toBe("0");
  });

  it("parses canonical payment fields from an x402 challenge", async () => {
    const required = await parsePersonalServerPaymentRequired(
      jsonRes(
        {
          amount: "0",
          accepts: [
            {
              message: {
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
                signature: "0xsig",
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
      asset: NATIVE_ASSET_ADDRESS,
      amount: "12345",
      paymentNonce: "9",
      accessRecord: {
        dataPointId: DATA_POINT_ID,
        version: "1",
        accessor: PAYER,
        recordId: RECORD_ID,
        signature: "0xsig",
      },
    });
  });

  it("rejects x402 challenges for a different grant", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          {
            accepts: [
              {
                message: {
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

  it("rejects unsupported x402 escrow op types", async () => {
    await expect(
      parsePersonalServerPaymentRequired(
        jsonRes(
          {
            accepts: [
              {
                message: {
                  opType: "data_access",
                  opId: GRANT_ID,
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
    ).rejects.toThrow(/unsupported escrow op type/);
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
