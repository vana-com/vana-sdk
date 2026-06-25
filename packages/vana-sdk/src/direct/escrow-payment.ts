/**
 * Escrow-backed payment authorization for the Direct Data Controller.
 *
 * @remarks
 * Builds on the DPv2 escrow surface added in `protocol/escrow`. When a Personal
 * Server read returns `402 Payment Required`, the controller settles the
 * grant's data-access fee through the escrow gateway:
 *
 *  1. Sign a `GenericPayment` EIP-712 message (op `"grant"`, opId = grantId)
 *     with the app key.
 *  2. POST it to the gateway's `/v1/escrow/pay` via {@link EscrowGatewayClient}.
 *  3. Map the gateway's {@link EscrowPayResult} into a typed
 *     {@link DirectPaymentReceipt} for the caller to inspect.
 *
 * This module adapts the escrow `payForOp` flow to the direct-read use case; it
 * does not define its own payment scheme.
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
  PersonalServerPaymentRequired,
} from "./types";

/** The escrow `GenericPayment.opType` used for grant-lifecycle payments. */
export const GRANT_OP_TYPE = "grant" as const;

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

interface GrantPaymentMessage {
  payerAddress: `0x${string}`;
  opType: typeof GRANT_OP_TYPE;
  opId: `0x${string}`;
  asset: `0x${string}`;
  amount: string;
  paymentNonce: string;
}

interface SignedGrantPayment {
  message: GrantPaymentMessage;
  signature: `0x${string}`;
  accessRecord?: EscrowAccessRecord;
}

interface X402PaymentHeader {
  x402Version: 1;
  scheme: "vana-escrow-grant";
  network: string;
  payload: SignedGrantPayment;
}

/** Escrow settlement configuration for the controller. */
export interface EscrowPaymentConfig {
  /** Client for the gateway escrow endpoints (`/v1/escrow/*`). */
  client: EscrowGatewayClient;
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

async function signGrantPayment(params: {
  payerAddress: `0x${string}`;
  required: PersonalServerPaymentRequired;
  config: EscrowPaymentConfig;
}): Promise<SignedGrantPayment> {
  const { payerAddress, required, config } = params;
  const nonceSource = config.nonceSource ?? processLocalNonceSource;
  const paymentNonce = BigInt(
    required.paymentNonce ?? (await nonceSource(payerAddress)),
  );
  const asset = (required.asset || NATIVE_ASSET_ADDRESS) as `0x${string}`;
  const opId = required.grantId as `0x${string}`;
  const amount = BigInt(required.amount);

  const message = {
    payerAddress,
    opType: GRANT_OP_TYPE,
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

export async function buildGrantPaymentHeader(params: {
  payerAddress: `0x${string}`;
  required: PersonalServerPaymentRequired;
  config: EscrowPaymentConfig;
}): Promise<string> {
  const signed = await signGrantPayment(params);
  const payment: X402PaymentHeader = {
    x402Version: 1,
    scheme: "vana-escrow-grant",
    network: params.required.network ?? `vana:${params.config.chainId}`,
    payload: signed,
  };
  return base64EncodeJson(payment);
}

export function paymentReceiptFromHeader(
  header: string | null | undefined,
): DirectPaymentReceipt | undefined {
  if (!header) return undefined;
  try {
    return toDirectPaymentReceipt(base64DecodeJson(header) as EscrowPayResult);
  } catch {
    return undefined;
  }
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
  const { payerAddress, required, config } = params;
  const signed = await signGrantPayment(params);

  const result = await config.client.payForOp({
    payerAddress,
    opType: GRANT_OP_TYPE,
    opId: signed.message.opId,
    asset: signed.message.asset,
    amount: signed.message.amount,
    paymentNonce: signed.message.paymentNonce,
    signature: signed.signature,
    accessRecord: required.accessRecord,
  });

  return toDirectPaymentReceipt(result);
}
