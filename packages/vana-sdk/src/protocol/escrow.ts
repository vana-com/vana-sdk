/**
 * DPv2 escrow payment helpers.
 *
 * Covers the three-phase flow used by builders to pay for data access:
 *
 *  1. **Deposit** — call `depositNative` or `depositToken` on the
 *     DataPortabilityEscrow contract, then notify the gateway.
 *  2. **Balance** — read or force-sync the gateway's off-chain credit view.
 *  3. **Pay** — sign a `GenericPayment` EIP-712 message and POST it to the
 *     gateway's `/v1/escrow/pay` endpoint.
 *
 * The gateway is the authority on balances; the on-chain contract is the
 * authority on what has been settled. Nothing in this module touches the
 * chain directly — signing is done by the caller's wallet.
 *
 * @category Protocol
 * @module escrow
 */

export {
  buildWithdrawAuthorizationTypedData,
  withdrawAuthorizationDomain,
  WITHDRAW_AUTHORIZATION_TYPES,
  type WithdrawAuthorizationMessage,
} from "./eip712";
import type { TypedDataDomain } from "viem";
import { isHex } from "viem";

// ---------------------------------------------------------------------------
// EIP-712 — GenericPayment
// ---------------------------------------------------------------------------

/**
 * EIP-712 typed-data types for a generic op payment.
 *
 * The gateway verifies that the recovered signer == `payerAddress` and that
 * the (payer, paymentNonce) pair has not been seen before. Use a
 * monotonically-increasing nonce; the first payment for any payer should
 * start at 1.
 */
export const GENERIC_PAYMENT_TYPES = {
  GenericPayment: [
    { name: "payerAddress", type: "address" },
    { name: "opType", type: "string" },
    { name: "opId", type: "bytes32" },
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "paymentNonce", type: "uint256" },
  ],
} as const;

/**
 * EIP-712 message payload for a generic op payment.
 *
 * - `opType` is `"grant"` for legacy grant lifecycle payments or
 *   `"data_access"` for a standalone receipt-bound read.
 * - `opId` is the bytes32 id of the operation being paid for: the grant id for
 *   `"grant"`, or `accessRecord.recordId` for `"data_access"`.
 * - `asset` is the ERC-20 token address, or the zero address for native VANA.
 * - `amount` is the total amount in base units (wei for VANA). Must match the
 *   sum the gateway expects for the current lifecycle of the op.
 * - `paymentNonce` must be a positive integer unique per `payerAddress`. Use 1
 *   for the first payment; increment by at least 1 for each subsequent call.
 */
export interface GenericPaymentMessage {
  payerAddress: `0x${string}`;
  opType: string;
  opId: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  paymentNonce: bigint;
}

/**
 * Returns the EIP-712 domain for signing a `GenericPayment` message.
 *
 * The verifying contract is the `DataPortabilityEscrow` contract; all gateway
 * deployments share the same domain name and version.
 *
 * @param chainId - Chain ID of the Vana network (e.g. 1480 mainnet, 14800 testnet).
 * @param escrowContract - Deployed address of DataPortabilityEscrow.
 */
export function genericPaymentDomain(
  chainId: number,
  escrowContract: `0x${string}`,
): TypedDataDomain {
  return {
    name: "Vana Data Portability",
    version: "1",
    chainId,
    verifyingContract: escrowContract,
  };
}

// ---------------------------------------------------------------------------
// On-chain deposit ABI fragments
// ---------------------------------------------------------------------------

/**
 * Minimal ABI for the two deposit entry points on `DataPortabilityEscrow`.
 *
 * - `depositNative(address account)` payable — credits native VANA.
 * - `depositToken(address account, address token, uint256 amount)` — credits
 *   an ERC-20 token (caller must have pre-approved the escrow contract).
 *
 * Pass this to viem's `writeContract` or encode it manually.
 */
export const ESCROW_DEPOSIT_ABI = [
  {
    type: "function",
    name: "depositNative",
    stateMutability: "payable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "depositToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/**
 * The zero address used by the DataPortabilityEscrow contract to represent
 * native VANA in `asset` fields of events and balance responses.
 */
export const NATIVE_ASSET_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

// ---------------------------------------------------------------------------
// Gateway API client
// ---------------------------------------------------------------------------

/**
 * Per-asset balance entry returned by the gateway's escrow balance endpoints.
 *
 * - `balance` — gross finalized credit (deposits credited so far).
 * - `pendingAmount` — sum of submitted deposits not yet confirmed.
 * - `authorizedAmount` — sum of all in-flight payments authorized by
 *   `/v1/escrow/pay` (soft-lock). May include payments not yet settled
 *   on-chain.
 * - `withdrawingAmount` — sum of in-flight withdrawal reservations.
 * - `availableAmount` — `max(balance − authorizedAmount − withdrawingAmount, 0)`.
 *   This is what the account can still authorize or withdraw.
 */
export interface EscrowBalanceEntry {
  asset: string;
  balance: string;
  pendingAmount: string;
  authorizedAmount: string;
  withdrawingAmount: string;
  availableAmount: string;
  /** Minimum withdrawal amount currently accepted for this asset, if configured. */
  withdrawalMinimumAmount: string | null;
  updatedAt: string | null;
}

export interface SubmittedDepositEntry {
  txHash: string;
  submittedAt: string;
  claimedAsset: string;
  claimedAmount: string;
}

export interface FinalizedDepositEntry {
  txHash: string;
  finalizedAt: string | null;
  blockNumber: string | null;
  claimedAsset: string;
  claimedAmount: string;
}

export interface FailedDepositEntry {
  txHash: string;
  submittedAt: string;
  claimedAsset: string;
  claimedAmount: string;
  lastError: string | null;
}

/** Full balance read response from `GET /v1/escrow/balance`. */
export interface EscrowBalanceResult {
  account: string;
  balances: EscrowBalanceEntry[];
  deposits: {
    submitted: SubmittedDepositEntry[];
    finalized: FinalizedDepositEntry[];
    failed: FailedDepositEntry[];
  };
}

/**
 * Response from `POST /v1/escrow/balance/sync`.
 *
 * Extends {@link EscrowBalanceResult} with a `sync` summary of what the
 * lazy-confirmation pass did.
 */
export interface EscrowBalanceSyncResult extends EscrowBalanceResult {
  sync:
    | {
        scanned: number;
        finalized: number;
        stillPending: number;
        failed: number;
      }
    | { skipped: true };
}

/** Response from `POST /v1/escrow/deposit`. */
export interface DepositSubmissionResult {
  success: true;
  txHash: string;
  account: string;
  status: "submitted" | "finalized" | "failed";
  blockNumber?: string | null;
  submittedAt: string;
  finalizedAt?: string | null;
  lastError?: string | null;
}

/** Breakdown returned by a successful `POST /v1/escrow/pay`. */
export interface PaymentBreakdown {
  registrationFee: string;
  dataAccessFee: string;
  /** True when this call settled the registration fee for the op. */
  registrationPaid: boolean;
}

/** Response from `POST /v1/escrow/pay`. */
export interface EscrowPayResult {
  success: true;
  opType: string;
  opId: string;
  payerAddress: string;
  asset: string;
  amount: string;
  breakdown: PaymentBreakdown;
  paymentNonce: string;
  paidAt: string;
}

interface EscrowWithdrawalResponseBase {
  account: `0x${string}`;
  asset: `0x${string}`;
  amount: string;
  withdrawNonce: string;
  deadline: string;
}

/** A persisted authorization whose transaction has not been broadcast yet. */
export interface EscrowWithdrawalSubmittedWithoutTransaction extends EscrowWithdrawalResponseBase {
  success: true;
  status: "submitted";
  txHash: null;
  message: string;
}

/** A withdrawal with a persisted transaction that is awaiting reconciliation. */
export interface EscrowWithdrawalSubmittedWithTransaction {
  success: true;
  status: "submitted";
  txHash: `0x${string}`;
  message: string;
  // A provisional-revert response contains only txHash, blockNumber, and
  // message. Ordinary submissions include the signed-intent fields.
  account?: `0x${string}`;
  asset?: `0x${string}`;
  amount?: string;
  withdrawNonce?: string;
  deadline?: string;
  blockNumber?: string;
}

/** A withdrawal that the gateway has accepted but not yet confirmed. */
export type EscrowWithdrawalSubmittedResult =
  | EscrowWithdrawalSubmittedWithoutTransaction
  | EscrowWithdrawalSubmittedWithTransaction;

/** A withdrawal whose on-chain debit has reached the named lifecycle state. */
export interface EscrowWithdrawalSettledResult extends EscrowWithdrawalResponseBase {
  success: true;
  status: "confirmed" | "finalized";
  txHash: `0x${string}`;
  blockNumber: string | null;
}

/** Successful lifecycle responses from `POST /v1/escrow/withdraw`. */
export type EscrowWithdrawalResult =
  | EscrowWithdrawalSubmittedResult
  | EscrowWithdrawalSettledResult;

/** Terminal or retryable withdrawal lifecycle state returned with a non-2xx status. */
export interface EscrowWithdrawalFailureResult extends EscrowWithdrawalResponseBase {
  success: false;
  status: "retryable" | "reorged" | "failed";
  error: string;
  txHash: `0x${string}` | null;
  blockNumber?: string | null;
}

export type EscrowWithdrawalRejectionCode =
  | "below_minimum"
  | "deadline_too_far"
  | "expired"
  | "insufficient_available"
  | "stale_nonce";

/** Definite pre-acceptance rejection. No durable withdrawal intent was created. */
export interface EscrowWithdrawalRejectedResult extends EscrowWithdrawalResponseBase {
  success: false;
  status: "rejected";
  code: EscrowWithdrawalRejectionCode;
  error: string;
  balance?: string;
  authorizedAmount?: string;
  withdrawingAmount?: string;
  availableAmount?: string;
  requestedAmount?: string;
  minimumAmount?: string;
}

/**
 * A typed non-2xx gateway lifecycle response.
 *
 * `retryable` means resend the exact signed intent. `reorged` and `failed`
 * require a newly signed authorization with a new nonce.
 */
export class EscrowWithdrawalLifecycleError extends Error {
  override readonly name = "EscrowWithdrawalLifecycleError";

  constructor(
    readonly httpStatus: number,
    readonly result: EscrowWithdrawalFailureResult,
  ) {
    super(result.error);
  }
}

/** A typed non-2xx gateway rejection before a withdrawal intent is accepted. */
export class EscrowWithdrawalRejectionError extends Error {
  override readonly name = "EscrowWithdrawalRejectionError";

  constructor(
    readonly httpStatus: number,
    readonly result: EscrowWithdrawalRejectedResult,
  ) {
    super(result.error);
  }
}

/**
 * Parameters for submitting a deposit tx hash to the gateway.
 *
 * The gateway will decode the `account` from the tx's calldata and
 * credit the identified account once the tx reaches the configured
 * confirmation depth.
 */
export interface SubmitDepositParams {
  /** 0x-prefixed 32-byte transaction hash. */
  txHash: `0x${string}`;
}

/**
 * Parameters for the generic op payment endpoint (`POST /v1/escrow/pay`).
 *
 * The `signature` is an EIP-712 signature over a `GenericPayment` message
 * (see {@link GENERIC_PAYMENT_TYPES} and {@link genericPaymentDomain}).
 * Build and sign the typed data with your wallet before calling
 * {@link EscrowGatewayClient.payForOp}.
 */
export interface PayForOpParams {
  payerAddress: `0x${string}`;
  opType: string;
  opId: `0x${string}`;
  asset: `0x${string}`;
  /** Decimal string representation of the uint256 amount. */
  amount: string;
  /** Decimal string representation of the uint256 nonce. */
  paymentNonce: string;
  /** 0x-prefixed 65-byte EIP-712 signature hex string. */
  signature: `0x${string}`;
  /**
   * Optional data-access receipt carried by x402 challenges.
   *
   * The gateway verifies its server signature; this type only describes the
   * wire shape.
   */
  accessRecord?: EscrowAccessRecord;
}

/**
 * Parameters for `POST /v1/escrow/withdraw`.
 *
 * `withdrawNonce` and `deadline` are caller-supplied decimal uint256 strings.
 * The SDK intentionally does not generate a nonce: retrying safely requires a
 * durable caller-owned nonce source and the exact same signed payload.
 */
export interface WithdrawFromEscrowParams {
  account: `0x${string}`;
  asset: `0x${string}`;
  amount: string;
  withdrawNonce: string;
  deadline: string;
  signature: `0x${string}`;
}

/** Wire shape of a receipt whose server signature the gateway verifies. */
export interface EscrowAccessRecord {
  dataPointId: `0x${string}`;
  version: string;
  accessor: `0x${string}`;
  recordId: `0x${string}`;
  signature: `0x${string}`;
}

/**
 * Minimal client for the gateway's escrow endpoints.
 *
 * Construct with {@link createEscrowGatewayClient}.
 */
export interface EscrowGatewayClient {
  /**
   * Notify the gateway of a submitted deposit transaction.
   *
   * The gateway decodes the credited account from the on-chain tx calldata
   * and starts tracking the deposit. Call this immediately after your
   * `depositNative` or `depositToken` tx is broadcast (it accepts pending
   * mempool txs). Returns `202` while the tx awaits confirmation.
   */
  submitDeposit(params: SubmitDepositParams): Promise<DepositSubmissionResult>;

  /**
   * Read the current escrow balance for an account.
   *
   * Pure read — no chain calls. To force a reconciliation pass first,
   * use {@link syncEscrowBalance}.
   */
  getEscrowBalance(account: `0x${string}`): Promise<EscrowBalanceResult>;

  /**
   * Force a reconciliation pass then return the updated balance.
   *
   * Triggers the gateway's lazy-confirmation worker for the account — any
   * submitted deposits that have reached the configured confirmation level
   * are credited before the balance is returned. Prefer this over
   * {@link getEscrowBalance} when you need a fresh view after a deposit.
   */
  syncEscrowBalance(account: `0x${string}`): Promise<EscrowBalanceSyncResult>;

  /**
   * Authorize a payment against the payer's escrow balance.
   *
   * The caller must:
   *  1. Assemble a {@link GenericPaymentMessage}.
   *  2. Sign it with `signTypedData` using {@link GENERIC_PAYMENT_TYPES} and
   *     the domain from {@link genericPaymentDomain}.
   *  3. Pass the message fields + signature here.
   *
   * The gateway verifies the signature, checks the soft-lock balance, and
   * records the payment. Returns 402 if the payer has insufficient balance.
   */
  payForOp(params: PayForOpParams): Promise<EscrowPayResult>;

  /**
   * Submit or reconcile a signed withdrawal authorization.
   *
   * Retry a `submitted` result with the exact same parameters. Do not replace
   * `withdrawNonce`, `deadline`, or signature unless starting a new intent.
   */
  withdraw(params: WithdrawFromEscrowParams): Promise<EscrowWithdrawalResult>;
}

/** The only gateway capability required by direct data-access payment flows. */
export type EscrowPaymentClient = Pick<EscrowGatewayClient, "payForOp">;

/**
 * Creates a client for the gateway escrow endpoints.
 *
 * @param baseUrl - Base URL of the DP RPC gateway
 *   (e.g. `"https://dp.vana.org"`). Trailing slashes are trimmed.
 *
 * @example
 * ```typescript
 * import {
 *   createEscrowGatewayClient,
 *   genericPaymentDomain,
 *   GENERIC_PAYMENT_TYPES,
 * } from "@opendatalabs/vana-sdk/node";
 *
 * const escrow = createEscrowGatewayClient("https://dp.vana.org");
 *
 * // 1. Submit your deposit tx hash after broadcasting depositNative on-chain
 * const deposit = await escrow.submitDeposit({ txHash: "0xabc…" });
 *
 * // 2. Force-sync and read the updated balance
 * const { balances } = await escrow.syncEscrowBalance("0xpayerAddress");
 *
 * // 3. Sign and authorize a grant payment
 * const sig = await walletClient.signTypedData({
 *   domain: genericPaymentDomain(1480, "0xEscrowContract"),
 *   types: GENERIC_PAYMENT_TYPES,
 *   primaryType: "GenericPayment",
 *   message: {
 *     payerAddress: "0xpayerAddress",
 *     opType: "grant",
 *     opId: "0xgrantId",
 *     asset: "0x0000000000000000000000000000000000000000",
 *     amount: 1000000000000000000n,
 *     paymentNonce: 1n,
 *   },
 * });
 * const result = await escrow.payForOp({
 *   payerAddress: "0xpayerAddress",
 *   opType: "grant",
 *   opId: "0xgrantId",
 *   asset: "0x0000000000000000000000000000000000000000",
 *   amount: "1000000000000000000",
 *   paymentNonce: "1",
 *   signature: sig,
 * });
 * ```
 */
export function createEscrowGatewayClient(
  baseUrl: string,
): EscrowGatewayClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function throwOnError(res: Response, context: string): Promise<void> {
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) detail = `: ${body.error}`;
      } catch {
        // Ignore JSON parse errors; use status text only.
      }
      throw new Error(
        `Escrow gateway error (${context}): ${res.status} ${res.statusText}${detail}`,
      );
    }
  }

  async function throwOnWithdrawError(res: Response): Promise<void> {
    if (res.ok) return;

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error(
        `Escrow gateway error (POST /v1/escrow/withdraw): ${res.status} ${res.statusText}`,
      );
    }

    if (isEscrowWithdrawalFailureResult(body)) {
      throw new EscrowWithdrawalLifecycleError(res.status, body);
    }
    if (isEscrowWithdrawalRejectedResult(body)) {
      throw new EscrowWithdrawalRejectionError(res.status, body);
    }

    const error = getGatewayErrorMessage(body);
    throw new Error(
      `Escrow gateway error (POST /v1/escrow/withdraw): ${res.status} ${res.statusText}${error ? `: ${error}` : ""}`,
    );
  }

  return {
    async submitDeposit({ txHash }) {
      const res = await fetch(`${base}/v1/escrow/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash }),
      });
      // 202 Accepted and 200 OK are both success states for deposit submission.
      if (res.status !== 200 && res.status !== 202) {
        await throwOnError(res, "POST /v1/escrow/deposit");
      }
      return res.json() as Promise<DepositSubmissionResult>;
    },

    async getEscrowBalance(account) {
      const res = await fetch(
        `${base}/v1/escrow/balance?account=${encodeURIComponent(account)}`,
      );
      await throwOnError(res, "GET /v1/escrow/balance");
      return res.json() as Promise<EscrowBalanceResult>;
    },

    async syncEscrowBalance(account) {
      const res = await fetch(
        `${base}/v1/escrow/balance/sync?account=${encodeURIComponent(account)}`,
        { method: "POST" },
      );
      await throwOnError(res, "POST /v1/escrow/balance/sync");
      return res.json() as Promise<EscrowBalanceSyncResult>;
    },

    async payForOp({
      payerAddress,
      opType,
      opId,
      asset,
      amount,
      paymentNonce,
      signature,
      accessRecord,
    }) {
      const res = await fetch(`${base}/v1/escrow/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${signature}`,
        },
        body: JSON.stringify({
          payerAddress,
          opType,
          opId,
          asset,
          amount,
          paymentNonce,
          ...(accessRecord ? { accessRecord } : {}),
        }),
      });
      await throwOnError(res, "POST /v1/escrow/pay");
      return res.json() as Promise<EscrowPayResult>;
    },

    async withdraw({
      account,
      asset,
      amount,
      withdrawNonce,
      deadline,
      signature,
    }) {
      const res = await fetch(`${base}/v1/escrow/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${signature}`,
        },
        body: JSON.stringify({
          account,
          asset,
          amount,
          withdrawNonce,
          deadline,
        }),
      });
      await throwOnWithdrawError(res);
      return res.json() as Promise<EscrowWithdrawalResult>;
    },
  };
}

function getGatewayErrorMessage(body: unknown): string | undefined {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return undefined;
}

function isEscrowWithdrawalFailureResult(
  body: unknown,
): body is EscrowWithdrawalFailureResult {
  if (typeof body !== "object" || body === null) return false;
  const value = body as Record<string, unknown>;
  return (
    value.success === false &&
    (value.status === "retryable" ||
      value.status === "reorged" ||
      value.status === "failed") &&
    typeof value.error === "string" &&
    isAddressHex(value.account) &&
    isAddressHex(value.asset) &&
    isUint256Decimal(value.amount) &&
    isUint256Decimal(value.withdrawNonce) &&
    isUint256Decimal(value.deadline) &&
    (isHash(value.txHash) || value.txHash === null) &&
    (!("blockNumber" in value) || isBlockNumber(value.blockNumber))
  );
}

function isEscrowWithdrawalRejectedResult(
  body: unknown,
): body is EscrowWithdrawalRejectedResult {
  if (typeof body !== "object" || body === null) return false;
  const value = body as Record<string, unknown>;
  return (
    value.success === false &&
    value.status === "rejected" &&
    isWithdrawalRejectionCode(value.code) &&
    typeof value.error === "string" &&
    isAddressHex(value.account) &&
    isAddressHex(value.asset) &&
    isUint256Decimal(value.amount) &&
    isUint256Decimal(value.withdrawNonce) &&
    isUint256Decimal(value.deadline) &&
    optionalUint256Decimal(value.balance) &&
    optionalUint256Decimal(value.authorizedAmount) &&
    optionalUint256Decimal(value.withdrawingAmount) &&
    optionalUint256Decimal(value.availableAmount) &&
    optionalUint256Decimal(value.requestedAmount) &&
    optionalUint256Decimal(value.minimumAmount)
  );
}

function isWithdrawalRejectionCode(
  value: unknown,
): value is EscrowWithdrawalRejectionCode {
  return (
    value === "below_minimum" ||
    value === "deadline_too_far" ||
    value === "expired" ||
    value === "insufficient_available" ||
    value === "stale_nonce"
  );
}

function optionalUint256Decimal(value: unknown): boolean {
  return value === undefined || isUint256Decimal(value);
}

function isAddressHex(value: unknown): value is `0x${string}` {
  return (
    typeof value === "string" &&
    isHex(value, { strict: true }) &&
    value.length === 42
  );
}

function isHash(value: unknown): value is `0x${string}` {
  return (
    typeof value === "string" &&
    isHex(value, { strict: true }) &&
    value.length === 66
  );
}

function isUint256Decimal(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 78) {
    return false;
  }
  if (!/^(0|[1-9]\d*)$/.test(value)) return false;
  return BigInt(value) <= 2n ** 256n - 1n;
}

function isBlockNumber(value: unknown): value is string | null {
  return value === null || isUint256Decimal(value);
}
