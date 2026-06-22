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

function jsonRes(
  body: unknown,
  init: { status?: number } = {},
): FetchResponseLike {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: { get: () => null },
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
      grantId: "0xgrant",
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
          grantId: "0xgrantFromBody",
          asset: "0xtoken",
          amount: "12345",
        },
        { status: 402 },
      ),
      "0xfallbackGrant",
    );
    expect(required.grantId).toBe("0xgrantFromBody");
    expect(required.asset).toBe("0xtoken");
    expect(required.amount).toBe("12345");
  });

  it("falls back to the read grantId, native asset, and 0 amount", async () => {
    const required = await parsePersonalServerPaymentRequired(
      jsonRes(null, { status: 402 }),
      "0xfallbackGrant",
    );
    expect(required.grantId).toBe("0xfallbackGrant");
    expect(required.asset).toBe(NATIVE_ASSET_ADDRESS);
    expect(required.amount).toBe("0");
  });
});

describe("readPersonalServerData", () => {
  it("returns data without a payment receipt when no 402 occurs", async () => {
    const result = await readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: "0xgrant",
      payerAddress: PAYER,
      signMessage,
      fetchFn: async () => jsonRes({ items: [1, 2, 3] }),
    });
    expect(result.data).toEqual({ items: [1, 2, 3] });
    expect(result.payment).toBeUndefined();
  });

  it("settles a 402 via escrow and retries, attaching a payment receipt", async () => {
    let call = 0;
    const payForOp = vi.fn(async () => payResultFixture("0xgrant"));
    const result = await readPersonalServerData({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: "0xgrant",
      payerAddress: PAYER,
      signMessage,
      escrow: mockEscrow(payForOp),
      fetchFn: async () => {
        call += 1;
        if (call === 1) {
          return jsonRes(
            { grantId: "0xgrant", asset: NATIVE_ASSET_ADDRESS, amount: "1000" },
            { status: 402 },
          );
        }
        return jsonRes({ ok: true });
      },
    });

    expect(call).toBe(2);
    expect(payForOp).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ ok: true });
    expect(result.payment).toMatchObject({
      opType: "grant",
      opId: "0xgrant",
      amount: "1000000000000000000",
      breakdown: {
        registrationFee: "100000000000000000",
        dataAccessFee: "900000000000000000",
        registrationPaid: true,
      },
    });
  });

  it("throws PaymentRequiredError with amount/asset when escrow is not configured", async () => {
    let thrown: unknown;
    try {
      await readPersonalServerData({
        personalServerUrl: "https://ps.example.com",
        scope: "icloud_notes.notes",
        grantId: "0xgrant",
        payerAddress: PAYER,
        signMessage,
        fetchFn: async () =>
          jsonRes(
            { grantId: "0xgrant", asset: "0xtoken", amount: "777" },
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
      grantId: "0xgrant",
      payerAddress: PAYER,
      signMessage,
      escrow: mockEscrow(vi.fn(async () => payResultFixture("0xgrant"))),
      fetchFn: async () => jsonRes({ amount: "1000" }, { status: 402 }), // always 402
    });
    await expect(result).rejects.toThrow(PaymentRequiredError);
  });
});
