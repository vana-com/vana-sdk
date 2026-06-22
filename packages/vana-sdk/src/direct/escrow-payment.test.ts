import { describe, it, expect, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  authorizeGrantPayment,
  createDefaultNonceSource,
  toDirectFeeBreakdown,
  toDirectPaymentReceipt,
  GRANT_OP_TYPE,
  type EscrowPaymentConfig,
} from "./escrow-payment";
import { NATIVE_ASSET_ADDRESS } from "../protocol/escrow";
import type { EscrowPayResult } from "../protocol/escrow";

const account = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);
const PAYER = account.address;
const ESCROW = "0x000000000000000000000000000000000000dEaD" as `0x${string}`;

function payResult(): EscrowPayResult {
  return {
    success: true,
    opType: "grant",
    opId: "0xgrant",
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

describe("fee/payment mappers", () => {
  it("toDirectFeeBreakdown copies the gateway breakdown", () => {
    expect(toDirectFeeBreakdown(payResult().breakdown)).toEqual({
      registrationFee: "100000000000000000",
      dataAccessFee: "900000000000000000",
      registrationPaid: true,
    });
  });

  it("toDirectPaymentReceipt maps the full EscrowPayResult", () => {
    expect(toDirectPaymentReceipt(payResult())).toEqual({
      opType: "grant",
      opId: "0xgrant",
      asset: NATIVE_ASSET_ADDRESS,
      amount: "1000000000000000000",
      paymentNonce: "1",
      breakdown: {
        registrationFee: "100000000000000000",
        dataAccessFee: "900000000000000000",
        registrationPaid: true,
      },
      paidAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("createDefaultNonceSource", () => {
  it("increments per payer starting at 1", () => {
    const next = createDefaultNonceSource();
    expect(next("0xAAA")).toBe(1n);
    expect(next("0xAAA")).toBe(2n);
    // Case-insensitive per-payer counter.
    expect(next("0xaaa")).toBe(3n);
    expect(next("0xBBB")).toBe(1n);
  });
});

describe("authorizeGrantPayment", () => {
  function config(payForOp = vi.fn(async () => payResult())): {
    cfg: EscrowPaymentConfig;
    signTypedData: ReturnType<typeof vi.fn>;
    payForOp: ReturnType<typeof vi.fn>;
  } {
    const signTypedData = vi.fn(async () => "0xsig" as `0x${string}`);
    const cfg: EscrowPaymentConfig = {
      client: {
        submitDeposit: vi.fn(),
        getEscrowBalance: vi.fn(),
        syncEscrowBalance: vi.fn(),
        payForOp,
      },
      escrowContract: ESCROW,
      chainId: 14800,
      signTypedData,
    };
    return { cfg, signTypedData, payForOp };
  }

  it("signs a GenericPayment and calls payForOp, returning a receipt", async () => {
    const { cfg, signTypedData, payForOp } = config();
    const receipt = await authorizeGrantPayment({
      payerAddress: PAYER,
      required: {
        grantId: "0xgrant",
        asset: NATIVE_ASSET_ADDRESS,
        amount: "1000000000000000000",
        raw: {},
      },
      config: cfg,
    });

    // Signed the right typed-data shape.
    expect(signTypedData).toHaveBeenCalledTimes(1);
    const signArg = signTypedData.mock.calls[0][0];
    expect(signArg.primaryType).toBe("GenericPayment");
    expect(signArg.message).toMatchObject({
      payerAddress: PAYER,
      opType: GRANT_OP_TYPE,
      opId: "0xgrant",
      asset: NATIVE_ASSET_ADDRESS,
      amount: 1000000000000000000n,
      paymentNonce: 1n,
    });
    expect(signArg.domain).toMatchObject({
      chainId: 14800,
      verifyingContract: ESCROW,
    });

    // Forwarded string-encoded amount/nonce + signature to the gateway.
    expect(payForOp).toHaveBeenCalledWith(
      expect.objectContaining({
        payerAddress: PAYER,
        opType: GRANT_OP_TYPE,
        opId: "0xgrant",
        amount: "1000000000000000000",
        paymentNonce: "1",
        signature: "0xsig",
      }),
    );

    expect(receipt.breakdown.dataAccessFee).toBe("900000000000000000");
  });

  it("defaults a missing asset to native VANA", async () => {
    const { cfg, signTypedData } = config();
    await authorizeGrantPayment({
      payerAddress: PAYER,
      required: { grantId: "0xgrant", asset: "", amount: "1", raw: {} },
      config: cfg,
    });
    expect(signTypedData.mock.calls[0][0].message.asset).toBe(
      NATIVE_ASSET_ADDRESS,
    );
  });
});
