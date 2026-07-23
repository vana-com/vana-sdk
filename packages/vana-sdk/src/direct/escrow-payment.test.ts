import { describe, it, expect, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  authorizeEscrowPayment,
  authorizeGrantPayment,
  buildEscrowPaymentHeader,
  buildGrantPaymentHeader,
  createDefaultNonceSource,
  DATA_ACCESS_OP_TYPE,
  paymentReceiptFromHeader,
  paymentResponseMetadataFromHeader,
  toDirectFeeBreakdown,
  toDirectPaymentReceipt,
  GRANT_OP_TYPE,
  type EscrowPaymentConfig,
  type EscrowPaymentHeaderConfig,
} from "./escrow-payment";
import { NATIVE_ASSET_ADDRESS } from "../protocol/escrow";
import type { EscrowPayResult } from "../protocol/escrow";

const account = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);
const PAYER = account.address;
const ESCROW = "0x000000000000000000000000000000000000dEaD" as `0x${string}`;
const GRANT_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const DATA_POINT_ID =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as `0x${string}`;
const RECORD_ID =
  "0x4444444444444444444444444444444444444444444444444444444444444444" as `0x${string}`;
const ACCESS_SIGNATURE = `0x${"55".repeat(65)}` as `0x${string}`;

function payResult(): EscrowPayResult {
  return {
    success: true,
    opType: "grant",
    opId: GRANT_ID,
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
      opId: GRANT_ID,
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

describe("payment response metadata", () => {
  it("shape-validates a complete Personal Server response header", () => {
    const header = btoa(JSON.stringify(payResult()));
    expect(paymentResponseMetadataFromHeader(header)).toEqual(
      toDirectPaymentReceipt(payResult()),
    );
    expect(paymentReceiptFromHeader(header)).toEqual(
      toDirectPaymentReceipt(payResult()),
    );
  });

  it("rejects forged or malformed response metadata", () => {
    const valid = payResult();
    const invalid = [
      { ...valid, success: false },
      { ...valid, opType: "" },
      { ...valid, opId: "not-bytes32" },
      { ...valid, payerAddress: "not-an-address" },
      { ...valid, asset: "not-an-address" },
      { ...valid, amount: "01" },
      { ...valid, paymentNonce: "0" },
      {
        ...valid,
        breakdown: { ...valid.breakdown, registrationFee: "-1" },
      },
      {
        ...valid,
        breakdown: { ...valid.breakdown, dataAccessFee: "0x1" },
      },
      {
        ...valid,
        breakdown: { ...valid.breakdown, registrationPaid: "yes" },
      },
      { ...valid, paidAt: "forged" },
    ];

    for (const value of invalid) {
      expect(
        paymentResponseMetadataFromHeader(btoa(JSON.stringify(value))),
      ).toBeUndefined();
    }
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
        grantId: GRANT_ID,
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
      opId: GRANT_ID,
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
        opId: GRANT_ID,
        amount: "1000000000000000000",
        paymentNonce: "1",
        signature: "0xsig",
      }),
    );

    expect(receipt.breakdown.dataAccessFee).toBe("900000000000000000");
  });

  it("uses challenge nonce and access record while keeping the grant op", async () => {
    const payForOp = vi.fn(async () => ({
      ...payResult(),
      opType: GRANT_OP_TYPE,
      opId: GRANT_ID,
      amount: "123",
    }));
    const { cfg, signTypedData } = config(payForOp);

    await authorizeGrantPayment({
      payerAddress: PAYER,
      required: {
        grantId: GRANT_ID,
        paymentNonce: "9",
        accessRecord: {
          dataPointId: DATA_POINT_ID,
          version: "1",
          accessor: PAYER,
          recordId: RECORD_ID,
          signature: "0xsig",
        },
        asset: NATIVE_ASSET_ADDRESS,
        amount: "123",
        raw: {},
      },
      config: cfg,
    });

    expect(signTypedData.mock.calls[0][0].message).toMatchObject({
      opType: GRANT_OP_TYPE,
      opId: GRANT_ID,
      amount: 123n,
      paymentNonce: 9n,
    });
    expect(payForOp).toHaveBeenCalledWith(
      expect.objectContaining({
        opType: GRANT_OP_TYPE,
        opId: GRANT_ID,
        amount: "123",
        paymentNonce: "9",
        accessRecord: expect.objectContaining({
          dataPointId: DATA_POINT_ID,
          recordId: RECORD_ID,
        }),
      }),
    );
  });

  it("defaults a missing asset to native VANA", async () => {
    const { cfg, signTypedData } = config();
    await authorizeGrantPayment({
      payerAddress: PAYER,
      required: { grantId: GRANT_ID, asset: "", amount: "1", raw: {} },
      config: cfg,
    });
    expect(signTypedData.mock.calls[0][0].message.asset).toBe(
      NATIVE_ASSET_ADDRESS,
    );
  });
});

describe("generic escrow payment operations", () => {
  function config(payForOp = vi.fn(async () => payResult())) {
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

  it("builds a canonical data_access header without a gateway client", async () => {
    const signTypedData = vi.fn(async () => "0xsig" as `0x${string}`);
    const cfg = {
      escrowContract: ESCROW,
      chainId: 14800,
      signTypedData,
    } satisfies EscrowPaymentHeaderConfig;
    const accessRecord = {
      dataPointId: DATA_POINT_ID,
      version: "1",
      accessor: PAYER,
      recordId: RECORD_ID,
      signature: ACCESS_SIGNATURE,
    };
    const header = await buildEscrowPaymentHeader({
      payerAddress: PAYER,
      required: {
        grantId: GRANT_ID,
        opType: DATA_ACCESS_OP_TYPE,
        opId: RECORD_ID,
        accessRecord,
        asset: NATIVE_ASSET_ADDRESS,
        amount: "123",
        paymentNonce: "9",
        network: "vana:14800",
        raw: {},
      },
      config: cfg,
    });

    expect(signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          payerAddress: PAYER,
          opType: DATA_ACCESS_OP_TYPE,
          opId: RECORD_ID,
          amount: 123n,
          paymentNonce: 9n,
        }),
      }),
    );
    expect(JSON.parse(atob(header))).toEqual({
      x402Version: 1,
      scheme: "vana-escrow-grant",
      network: "vana:14800",
      payload: {
        message: {
          payerAddress: PAYER,
          opType: DATA_ACCESS_OP_TYPE,
          opId: RECORD_ID,
          asset: NATIVE_ASSET_ADDRESS,
          amount: "123",
          paymentNonce: "9",
        },
        signature: "0xsig",
        accessRecord,
      },
    });
  });

  it("rejects a challenge network that differs from the configured chain", async () => {
    const signTypedData = vi.fn(async () => "0xsig" as `0x${string}`);
    const cfg = {
      escrowContract: ESCROW,
      chainId: 14800,
      signTypedData,
    } satisfies EscrowPaymentHeaderConfig;

    await expect(
      buildEscrowPaymentHeader({
        payerAddress: PAYER,
        required: {
          grantId: GRANT_ID,
          opType: GRANT_OP_TYPE,
          opId: GRANT_ID,
          asset: NATIVE_ASSET_ADDRESS,
          amount: "1",
          paymentNonce: "9",
          network: "vana:14801",
          raw: {},
        },
        config: cfg,
      }),
    ).rejects.toThrow(/network must match the configured chain/);

    expect(signTypedData).not.toHaveBeenCalled();
  });

  it("authorizes data_access using the operation id and receipt", async () => {
    const payForOp = vi.fn(async () => ({
      ...payResult(),
      opType: DATA_ACCESS_OP_TYPE,
      opId: RECORD_ID,
    }));
    const { cfg } = config(payForOp);
    const accessRecord = {
      dataPointId: DATA_POINT_ID,
      version: "1",
      accessor: PAYER,
      recordId: RECORD_ID,
      signature: ACCESS_SIGNATURE,
    };

    await authorizeEscrowPayment({
      payerAddress: PAYER,
      required: {
        grantId: GRANT_ID,
        opType: DATA_ACCESS_OP_TYPE,
        opId: RECORD_ID,
        accessRecord,
        asset: NATIVE_ASSET_ADDRESS,
        amount: "123",
        paymentNonce: "9",
        raw: {},
      },
      config: cfg,
    });

    expect(payForOp).toHaveBeenCalledWith(
      expect.objectContaining({
        opType: DATA_ACCESS_OP_TYPE,
        opId: RECORD_ID,
        accessRecord,
      }),
    );
  });

  it("rejects an accessor mismatch before signing", async () => {
    const { cfg, signTypedData } = config();
    const nonceSource = vi.fn(() => 1n);
    cfg.nonceSource = nonceSource;

    await expect(
      buildEscrowPaymentHeader({
        payerAddress: PAYER,
        required: {
          grantId: GRANT_ID,
          opType: DATA_ACCESS_OP_TYPE,
          opId: RECORD_ID,
          accessRecord: {
            dataPointId: DATA_POINT_ID,
            version: "1",
            accessor: "0x2222222222222222222222222222222222222222",
            recordId: RECORD_ID,
            signature: ACCESS_SIGNATURE,
          },
          asset: NATIVE_ASSET_ADDRESS,
          amount: "0",
          paymentNonce: "9",
          raw: {},
        },
        config: cfg,
      }),
    ).rejects.toThrow(/accessor must equal the payment payer/);

    expect(nonceSource).not.toHaveBeenCalled();
    expect(signTypedData).not.toHaveBeenCalled();
  });

  it("rejects a mismatched or malformed data_access receipt before signing", async () => {
    const { cfg, signTypedData } = config();
    const baseRequired = {
      grantId: GRANT_ID,
      opType: DATA_ACCESS_OP_TYPE,
      opId: RECORD_ID,
      accessRecord: {
        dataPointId: DATA_POINT_ID,
        version: "1",
        accessor: PAYER,
        recordId: RECORD_ID,
        signature: ACCESS_SIGNATURE,
      },
      asset: NATIVE_ASSET_ADDRESS,
      amount: "0",
      paymentNonce: "9",
      raw: {},
    } as const;

    await expect(
      buildEscrowPaymentHeader({
        payerAddress: PAYER,
        required: { ...baseRequired, opId: GRANT_ID },
        config: cfg,
      }),
    ).rejects.toThrow(/operation id must equal the access record id/);
    await expect(
      buildEscrowPaymentHeader({
        payerAddress: PAYER,
        required: {
          ...baseRequired,
          accessRecord: { ...baseRequired.accessRecord, signature: "0xsig" },
        },
        config: cfg,
      }),
    ).rejects.toThrow(/requires a valid access record/);

    expect(signTypedData).not.toHaveBeenCalled();
  });

  it("rejects a zero-amount legacy grant without a valid receipt", async () => {
    const { cfg, signTypedData } = config();

    await expect(
      buildGrantPaymentHeader({
        payerAddress: PAYER,
        required: {
          grantId: GRANT_ID,
          asset: NATIVE_ASSET_ADDRESS,
          amount: "0",
          raw: {},
        },
        config: cfg,
      }),
    ).rejects.toThrow(/require a valid access record/);

    expect(signTypedData).not.toHaveBeenCalled();
  });

  it("signs a zero-amount legacy grant with a valid access receipt", async () => {
    const { cfg, signTypedData } = config();

    await expect(
      buildGrantPaymentHeader({
        payerAddress: PAYER,
        required: {
          grantId: GRANT_ID,
          accessRecord: {
            dataPointId: DATA_POINT_ID,
            version: "1",
            accessor: PAYER,
            recordId: RECORD_ID,
            signature: ACCESS_SIGNATURE,
          },
          asset: NATIVE_ASSET_ADDRESS,
          amount: "0",
          paymentNonce: "9",
          raw: {},
        },
        config: cfg,
      }),
    ).resolves.toEqual(expect.any(String));

    expect(signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          opType: GRANT_OP_TYPE,
          amount: 0n,
        }),
      }),
    );
  });
});
