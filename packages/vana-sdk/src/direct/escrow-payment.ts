/**
 * Escrow-backed payment authorization for the Direct Data Controller.
 *
 * @remarks
 * Builds on the DPv2 escrow surface added in `protocol/escrow`. When a Personal
 * Server read returns `402 Payment Required`, the controller settles the
 * challenged operation through the escrow gateway:
 *
 *  1. Sign the challenge's `GenericPayment` EIP-712 message with the app key.
 *  2. POST it to the gateway's `/v1/escrow/pay` via {@link EscrowGatewayClient}.
 *  3. Map the gateway's {@link EscrowPayResult} into a typed
 *     {@link DirectPaymentReceipt} for the caller to inspect.
 *
 * This module supports legacy `"grant"` operations and receipt-bound
 * `"data_access"` operations. It adapts the escrow `payForOp` flow to the
 * direct-read use case; it does not define its own payment scheme.
 *
 * @category Direct
 * @module direct/escrow-payment
 */

import {
  GENERIC_PAYMENT_TYPES,
  NATIVE_ASSET_ADDRESS,
  genericPaymentDomain,
  type EscrowAccessRecord,
  type EscrowGatewayClient,
  type EscrowPayResult,
  type PaymentBreakdown,
} from "../protocol/escrow";
import type {
  DirectFeeBreakdown,
  DirectPaymentReceipt,
  DirectPaymentResponseMetadata,
  PersonalServerPaymentOperation,
  PersonalServerPaymentRequired,
} from "./types";

/** The escrow `GenericPayment.opType` used for grant-lifecycle payments. */
export const GRANT_OP_TYPE = "grant" as const;
/** The escrow `GenericPayment.opType` used for receipt-bound data access. */
export const DATA_ACCESS_OP_TYPE = "data_access" as const;

/**
 * EIP-712 typed-data signer (e.g. viem `account.signTypedData`).
 *
 * @remarks
 * Kept structurally minimal so any viem account/wallet client satisfies it
 * without the SDK depending on viem's exact `signTypedData` overload set.
 */
export type SignTypedDataFn = (args: {
  domain: ReturnType<typeof genericPaymentDomain>;
  types: typeof GENERIC_PAYMENT_TYPES;
  primaryType: "GenericPayment";
  message: {
    payerAddress: `0x${string}`;
    opType: string;
    opId: `0x${string}`;
    asset: `0x${string}`;
    amount: bigint;
    paymentNonce: bigint;
  };
}) => Promise<`0x${string}`>;

/** Supplies a monotonically-increasing payment nonce per payer. */
export type PaymentNonceSource = (
  payerAddress: string,
) => Promise<bigint> | bigint;

interface EscrowPaymentMessage {
  payerAddress: `0x${string}`;
  opType: typeof GRANT_OP_TYPE | typeof DATA_ACCESS_OP_TYPE;
  opId: `0x${string}`;
  asset: `0x${string}`;
  amount: string;
  paymentNonce: string;
}

interface SignedEscrowPayment {
  message: EscrowPaymentMessage;
  signature: `0x${string}`;
  accessRecord?: EscrowAccessRecord;
}

interface X402PaymentHeader {
  x402Version: 1;
  scheme: "vana-escrow-grant";
  network: string;
  payload: SignedEscrowPayment;
}

/** Configuration required to sign an escrow X-PAYMENT header. */
export interface EscrowPaymentHeaderConfig {
  /** Deployed `DataPortabilityEscrow` contract address. */
  escrowContract: `0x${string}`;
  /** Chain id for the EIP-712 domain (1480 mainnet, 14800 moksha). */
  chainId: number;
  /** App EIP-712 signer. */
  signTypedData: SignTypedDataFn;
  /**
   * Supplies the next payment nonce for a payer. Defaults to a process-local
   * monotonic counter seeded at 1. Provide a durable source in production so
   * nonces survive restarts (the gateway rejects reused (payer, nonce) pairs).
   */
  nonceSource?: PaymentNonceSource;
}

/**
 * Escrow settlement configuration for gateway authorization.
 *
 * @remarks
 * Extends the header-signing boundary with the gateway client used by
 * {@link authorizeEscrowPayment}. Existing controller and legacy wrapper
 * callers can continue to provide this full configuration.
 */
export interface EscrowPaymentConfig extends EscrowPaymentHeaderConfig {
  /** Client for the gateway escrow endpoints (`/v1/escrow/*`). */
  client: EscrowGatewayClient;
}

/** Map the gateway {@link PaymentBreakdown} into the public {@link DirectFeeBreakdown}. */
export function toDirectFeeBreakdown(
  breakdown: PaymentBreakdown,
): DirectFeeBreakdown {
  return {
    registrationFee: breakdown.registrationFee,
    dataAccessFee: breakdown.dataAccessFee,
    registrationPaid: breakdown.registrationPaid,
  };
}

/** Map a gateway {@link EscrowPayResult} into the public {@link DirectPaymentReceipt}. */
export function toDirectPaymentReceipt(
  result: EscrowPayResult,
): DirectPaymentReceipt {
  return {
    opType: result.opType,
    opId: result.opId,
    asset: result.asset,
    amount: result.amount,
    paymentNonce: result.paymentNonce,
    breakdown: toDirectFeeBreakdown(result.breakdown),
    paidAt: result.paidAt,
  };
}

/** Default in-process monotonic nonce counter (seeded at 1 per payer). */
export function createDefaultNonceSource(): PaymentNonceSource {
  const counters = new Map<string, bigint>();
  return (payerAddress: string): bigint => {
    const key = payerAddress.toLowerCase();
    const next = (counters.get(key) ?? 0n) + 1n;
    counters.set(key, next);
    return next;
  };
}

const processLocalNonceSource = createDefaultNonceSource();
const UINT256_MAX = (1n << 256n) - 1n;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;

function isUint256Decimal(value: string, allowZero: boolean): boolean {
  const pattern = allowZero ? /^(0|[1-9]\d*)$/ : /^[1-9]\d*$/;
  return (
    value.length <= UINT256_MAX.toString().length &&
    pattern.test(value) &&
    BigInt(value) <= UINT256_MAX
  );
}

function isValidAccessRecord(record: EscrowAccessRecord): boolean {
  return (
    BYTES32_RE.test(record.dataPointId) &&
    isUint256Decimal(record.version, false) &&
    ADDRESS_RE.test(record.accessor) &&
    BYTES32_RE.test(record.recordId) &&
    SIGNATURE_RE.test(record.signature)
  );
}

function validateSigningOperation(
  payerAddress: `0x${string}`,
  required: PersonalServerPaymentOperation,
): void {
  if (!ADDRESS_RE.test(payerAddress)) {
    throw new Error("Payment payer must be a 20-byte EVM address");
  }
  if (!BYTES32_RE.test(required.opId)) {
    throw new Error("Payment operation id must be a 32-byte hex value");
  }
  if (!ADDRESS_RE.test(required.asset || NATIVE_ASSET_ADDRESS)) {
    throw new Error("Payment asset must be a 20-byte EVM address");
  }
  if (!isUint256Decimal(required.amount, true)) {
    throw new Error("Payment amount must be a canonical uint256 decimal");
  }
  if (
    required.paymentNonce !== undefined &&
    !isUint256Decimal(required.paymentNonce, false)
  ) {
    throw new Error("Payment nonce must be a positive uint256 decimal");
  }

  const accessRecord = required.accessRecord;
  if (required.opType === DATA_ACCESS_OP_TYPE) {
    if (!accessRecord || !isValidAccessRecord(accessRecord)) {
      throw new Error("Data-access payment requires a valid access record");
    }
    if (required.opId.toLowerCase() !== accessRecord.recordId.toLowerCase()) {
      throw new Error(
        "Data-access payment operation id must equal the access record id",
      );
    }
    if (accessRecord.accessor.toLowerCase() !== payerAddress.toLowerCase()) {
      throw new Error(
        "Data-access payment accessor must equal the payment payer address",
      );
    }
    return;
  }

  if (required.amount === "0") {
    if (
      !accessRecord ||
      !isValidAccessRecord(accessRecord) ||
      accessRecord.accessor.toLowerCase() !== payerAddress.toLowerCase()
    ) {
      throw new Error(
        "Zero-amount grant payments require a valid access record for the payer",
      );
    }
  }
}

function base64EncodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64DecodeJson(value: string): unknown {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function signEscrowPayment(params: {
  payerAddress: `0x${string}`;
  required: PersonalServerPaymentOperation;
  config: EscrowPaymentHeaderConfig;
}): Promise<SignedEscrowPayment> {
  const { payerAddress, required, config } = params;
  validateSigningOperation(payerAddress, required);
  const nonceSource = config.nonceSource ?? processLocalNonceSource;
  const paymentNonce = BigInt(
    required.paymentNonce ?? (await nonceSource(payerAddress)),
  );
  const asset = (required.asset || NATIVE_ASSET_ADDRESS) as `0x${string}`;
  const opId = required.opId as `0x${string}`;
  const amount = BigInt(required.amount);
  if (amount < 0n || amount > UINT256_MAX) {
    throw new Error("Payment amount must be a uint256");
  }
  if (paymentNonce <= 0n || paymentNonce > UINT256_MAX) {
    throw new Error("Payment nonce must be a positive uint256");
  }

  const message = {
    payerAddress,
    opType: required.opType,
    opId,
    asset,
    amount,
    paymentNonce,
  };

  const signature = await config.signTypedData({
    domain: genericPaymentDomain(config.chainId, config.escrowContract),
    types: GENERIC_PAYMENT_TYPES,
    primaryType: "GenericPayment",
    message,
  });

  return {
    message: {
      ...message,
      amount: amount.toString(),
      paymentNonce: paymentNonce.toString(),
    },
    signature,
    ...(required.accessRecord ? { accessRecord: required.accessRecord } : {}),
  };
}

/**
 * Build the canonical X-PAYMENT header for a validated escrow operation.
 *
 * @remarks
 * Supports both legacy grant payments and receipt-bound data-access payments.
 * Signing is injected through {@link EscrowPaymentHeaderConfig.signTypedData}.
 */
export async function buildEscrowPaymentHeader(params: {
  /** Address whose escrow balance pays for the operation. */
  payerAddress: `0x${string}`;
  /** Validated operation parsed from the Personal Server challenge. */
  required: PersonalServerPaymentOperation;
  /** Escrow contract, chain, signer, and nonce configuration. */
  config: EscrowPaymentHeaderConfig;
}): Promise<string> {
  const network = params.required.network ?? `vana:${params.config.chainId}`;
  if (network !== `vana:${params.config.chainId}`) {
    throw new Error("Payment network must match the configured chain");
  }

  const signed = await signEscrowPayment(params);
  const payment: X402PaymentHeader = {
    x402Version: 1,
    scheme: "vana-escrow-grant",
    network,
    payload: signed,
  };
  return base64EncodeJson(payment);
}

/** Build a legacy grant X-PAYMENT header. */
export async function buildGrantPaymentHeader(params: {
  payerAddress: `0x${string}`;
  required: PersonalServerPaymentRequired;
  config: EscrowPaymentConfig;
}): Promise<string> {
  return buildEscrowPaymentHeader({
    ...params,
    required: {
      ...params.required,
      opType: GRANT_OP_TYPE,
      opId: params.required.grantId,
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const field = value?.[key];
  return typeof field === "string" ? field : undefined;
}

function isCanonicalIsoTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

/**
 * Parse shape-validated payment response metadata echoed by a Personal Server.
 *
 * @remarks
 * This metadata is not authenticated by the gateway. It is suitable for
 * display and debugging, not as proof that a payment occurred.
 */
export function paymentResponseMetadataFromHeader(
  header: string | null | undefined,
): DirectPaymentResponseMetadata | undefined {
  if (!header) return undefined;
  try {
    const result = asRecord(base64DecodeJson(header));
    const breakdown = asRecord(result?.breakdown);
    const opType = stringField(result, "opType");
    const opId = stringField(result, "opId");
    const payerAddress = stringField(result, "payerAddress");
    const asset = stringField(result, "asset");
    const amount = stringField(result, "amount");
    const paymentNonce = stringField(result, "paymentNonce");
    const registrationFee = stringField(breakdown, "registrationFee");
    const dataAccessFee = stringField(breakdown, "dataAccessFee");
    const paidAt = stringField(result, "paidAt");
    if (
      result?.success !== true ||
      !opType ||
      !opId ||
      !BYTES32_RE.test(opId) ||
      !payerAddress ||
      !ADDRESS_RE.test(payerAddress) ||
      !asset ||
      !ADDRESS_RE.test(asset) ||
      !amount ||
      !isUint256Decimal(amount, true) ||
      !paymentNonce ||
      !isUint256Decimal(paymentNonce, false) ||
      !registrationFee ||
      !isUint256Decimal(registrationFee, true) ||
      !dataAccessFee ||
      !isUint256Decimal(dataAccessFee, true) ||
      typeof breakdown?.registrationPaid !== "boolean" ||
      !paidAt ||
      !isCanonicalIsoTimestamp(paidAt)
    ) {
      return undefined;
    }
    return {
      opType,
      opId,
      asset,
      amount,
      paymentNonce,
      breakdown: {
        registrationFee,
        dataAccessFee,
        registrationPaid: breakdown.registrationPaid,
      },
      paidAt,
    };
  } catch {
    return undefined;
  }
}

/**
 * @deprecated Use {@link paymentResponseMetadataFromHeader}. A Personal
 * Server response header is untrusted metadata, not a gateway-authenticated
 * receipt.
 */
export function paymentReceiptFromHeader(
  header: string | null | undefined,
): DirectPaymentResponseMetadata | undefined {
  return paymentResponseMetadataFromHeader(header);
}

/**
 * Authorize an escrow payment for a grant data-access fee.
 *
 * @param params - The payment requirement, the payer address, and escrow config.
 * @returns The gateway's {@link EscrowPayResult} as a typed
 * {@link DirectPaymentReceipt}.
 */
export async function authorizeGrantPayment(params: {
  payerAddress: `0x${string}`;
  required: PersonalServerPaymentRequired;
  config: EscrowPaymentConfig;
}): Promise<DirectPaymentReceipt> {
  return authorizeEscrowPayment({
    ...params,
    required: {
      ...params.required,
      opType: GRANT_OP_TYPE,
      opId: params.required.grantId,
    },
  });
}

/**
 * Authorize a validated grant or data-access operation through the escrow
 * gateway.
 */
export async function authorizeEscrowPayment(params: {
  /** Address whose escrow balance pays for the operation. */
  payerAddress: `0x${string}`;
  /** Validated operation to authorize. */
  required: PersonalServerPaymentOperation;
  /** Escrow gateway and signing configuration. */
  config: EscrowPaymentConfig;
}): Promise<DirectPaymentReceipt> {
  const { payerAddress, config } = params;
  const signed = await signEscrowPayment(params);

  const result = await config.client.payForOp({
    payerAddress,
    opType: signed.message.opType,
    opId: signed.message.opId,
    asset: signed.message.asset,
    amount: signed.message.amount,
    paymentNonce: signed.message.paymentNonce,
    signature: signed.signature,
    accessRecord: signed.accessRecord,
  });

  return toDirectPaymentReceipt(result);
}
