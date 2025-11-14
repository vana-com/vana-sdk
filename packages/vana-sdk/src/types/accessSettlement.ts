import type { Address, Hash } from "viem";

/**
 * Operation invoice structure returned by the AccessSettlement contract
 *
 * @remarks
 * Represents the payment details for a runtime operation.
 * Created by the runtime after an operation completes with a finalPrice.
 *
 * @category Access Settlement
 * @example
 * ```typescript
 * const invoice = await sdk.accessSettlement.getOperationInvoice("op_123");
 * console.log(`Price: ${invoice.price} wei`);
 * console.log(`Settled: ${invoice.isSettled}`);
 * ```
 */
export interface OperationInvoice {
  /** Address of the issuer (runtime) who created the invoice */
  issuer: Address;

  /** Address of the grantee (consumer) who must pay */
  grantee: Address;

  /** Final price in wei for the operation */
  price: bigint;

  /** Token address for payment (0x0 for native VANA) */
  tokenAddress: Address;

  /** Whether the payment has been settled */
  isSettled: boolean;
}

/**
 * Result from settling a payment
 *
 * @remarks
 * Contains the transaction hash for tracking payment confirmation.
 *
 * @category Access Settlement
 */
export interface PaymentSettlementResult {
  /** Transaction hash of the settlement */
  hash: Hash;

  /** Operation ID that was settled */
  operationId: string;
}

/**
 * Parameters for settling a payment with native VANA
 *
 * @category Access Settlement
 */
export interface SettleWithNativeParams {
  /** Operation ID to settle payment for */
  operationId: string;

  /** Amount to pay in wei (must match invoice price) */
  value: bigint;
}

/**
 * Parameters for settling a payment with an ERC20 token
 *
 * @category Access Settlement
 */
export interface SettleWithTokenParams {
  /** Operation ID to settle payment for */
  operationId: string;

  /** ERC20 token contract address */
  tokenAddress: Address;

  /** Amount to pay (must match invoice price and have approval) */
  amount: bigint;
}
