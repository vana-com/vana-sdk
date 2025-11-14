import { getContract } from "viem";
import { BaseController } from "./base";
import type {
  OperationInvoice,
  PaymentSettlementResult,
} from "../types/accessSettlement";
import { BlockchainError } from "../errors";
import { getContractAddress } from "../generated/addresses";
import { getAbi } from "../generated/abi";

/**
 * Controller for AccessSettlement contract
 *
 * @remarks
 * Manages payment settlement for runtime operations. Allows data consumers
 * to pay for completed operations using native VANA or ERC20 tokens.
 *
 * The AccessSettlement contract acts as an escrow system:
 * 1. Runtime completes an operation and logs the final price
 * 2. Consumer calls settlePaymentWithNative() or settlePaymentWithToken()
 * 3. Funds are transferred to the issuer (dataset owner)
 * 4. Runtime unlocks the operation artifacts for download
 *
 * @category Controllers
 * @example
 * ```typescript
 * // Consumer pays for a completed operation
 * const invoice = await sdk.accessSettlement.getOperationInvoice("op_123");
 *
 * if (!invoice.isSettled) {
 *   const result = await sdk.accessSettlement.settlePaymentWithNative(
 *     "op_123",
 *     invoice.price
 *   );
 *   console.log(`Payment settled: ${result.hash}`);
 * }
 * ```
 */
export class AccessSettlementController extends BaseController {
  /**
   * Get invoice details for an operation
   *
   * @remarks
   * Retrieves the payment invoice created by the runtime after an operation completes.
   * The invoice contains the final price, payment token, and settlement status.
   *
   * @param operationId - Operation identifier (from runtime API)
   * @returns Invoice details including price and settlement status
   * @throws {BlockchainError} When invoice retrieval fails
   *
   * @example
   * ```typescript
   * const invoice = await sdk.accessSettlement.getOperationInvoice("op_abc123");
   * console.log(`Price: ${invoice.price} wei`);
   * console.log(`Issuer: ${invoice.issuer}`);
   * console.log(`Settled: ${invoice.isSettled}`);
   *
   * // Convert price to VANA for display
   * const priceInVana = Number(invoice.price) / 10**18;
   * console.log(`Price: ${priceInVana} VANA`);
   * ```
   */
  async getOperationInvoice(operationId: string): Promise<OperationInvoice> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const contractAddress = getContractAddress(chainId, "AccessSettlement");
      const abi = getAbi("AccessSettlement");

      const contract = getContract({
        address: contractAddress,
        abi,
        client: this.context.publicClient,
      });

      // Convert operationId string to bytes
      const operationIdBytes = this.stringToBytes(operationId);

      const result = await contract.read.getOperationInvoice([
        operationIdBytes,
      ]);

      // Parse tuple result into OperationInvoice object
      // The contract returns a struct which viem converts to an array-like object
      const invoice = result as any;
      return {
        issuer: invoice.issuer ?? invoice[0],
        grantee: invoice.grantee ?? invoice[1],
        price: invoice.price ?? invoice[2],
        tokenAddress: invoice.tokenAddress ?? invoice[3],
        isSettled:
          invoice.isSettled !== undefined ? invoice.isSettled : invoice[4],
      } as OperationInvoice;
    } catch (error) {
      if (error instanceof Error) {
        throw new BlockchainError(
          `Failed to get operation invoice: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError(
        "Failed to get operation invoice with unknown error",
      );
    }
  }

  /**
   * Check if an operation's payment has been settled
   *
   * @remarks
   * Quick check to determine if payment has been completed for an operation.
   * Returns true if settlePaymentWithNative() or settlePaymentWithToken() was called.
   *
   * @param operationId - Operation identifier
   * @returns Whether the payment has been settled
   *
   * @example
   * ```typescript
   * const isSettled = await sdk.accessSettlement.isOperationSettled("op_123");
   * if (isSettled) {
   *   console.log("Payment already settled, artifacts should be available");
   * } else {
   *   console.log("Payment pending");
   * }
   * ```
   */
  async isOperationSettled(operationId: string): Promise<boolean> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const contractAddress = getContractAddress(chainId, "AccessSettlement");
      const abi = getAbi("AccessSettlement");

      const contract = getContract({
        address: contractAddress,
        abi,
        client: this.context.publicClient,
      });

      const operationIdBytes = this.stringToBytes(operationId);

      return (await contract.read.isOperationSettled([
        operationIdBytes,
      ])) as boolean;
    } catch (error) {
      if (error instanceof Error) {
        throw new BlockchainError(
          `Failed to check settlement status: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError(
        "Failed to check settlement status with unknown error",
      );
    }
  }

  /**
   * Settle payment for an operation using native VANA
   *
   * @remarks
   * Pays for a completed operation using native VANA tokens. The amount must match
   * the invoice price exactly. Upon successful payment:
   * - Funds are transferred to the issuer (dataset owner)
   * - PaymentSettled event is emitted
   * - Runtime unlocks operation artifacts for download
   *
   * IMPORTANT: You must send the exact value specified in the invoice.
   * Check the invoice first using getOperationInvoice().
   *
   * @param operationId - Operation identifier to settle payment for
   * @param value - Amount to pay in wei (must match invoice.price)
   * @returns Transaction hash and operation ID
   * @throws {BlockchainError} When payment settlement fails
   * @throws {Error} When wallet is not configured (read-only mode)
   *
   * @example
   * ```typescript
   * // Get invoice to find the exact price
   * const invoice = await sdk.accessSettlement.getOperationInvoice("op_123");
   *
   * // Settle with native VANA
   * const result = await sdk.accessSettlement.settlePaymentWithNative(
   *   "op_123",
   *   invoice.price  // Must match exactly
   * );
   *
   * // Wait for confirmation
   * await sdk.waitForTransactionReceipt(result.hash);
   * console.log("Payment confirmed, artifacts now available");
   * ```
   */
  async settlePaymentWithNative(
    operationId: string,
    value: bigint,
  ): Promise<PaymentSettlementResult> {
    this.assertWallet();

    try {
      const chainId = await this.context.publicClient.getChainId();
      const contractAddress = getContractAddress(chainId, "AccessSettlement");
      const abi = getAbi("AccessSettlement");

      const operationIdBytes = this.stringToBytes(operationId);

      const account =
        this.context.walletClient?.account ?? this.context.userAddress;

      const hash = await this.context.walletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "settlePaymentWithNative",
        args: [operationIdBytes],
        value,
        account,
        chain: this.context.walletClient?.chain ?? null,
      });

      return {
        hash,
        operationId,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new BlockchainError(
          `Failed to settle payment with native VANA: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError(
        "Failed to settle payment with native VANA with unknown error",
      );
    }
  }

  /**
   * Settle payment for an operation using an ERC20 token
   *
   * @remarks
   * Pays for a completed operation using an ERC20 token. Before calling this method:
   * 1. Check the invoice to get tokenAddress and price
   * 2. Approve the AccessSettlement contract to spend the token amount
   * 3. Call this method to complete the payment
   *
   * The token address and amount must match the invoice exactly.
   *
   * @param operationId - Operation identifier to settle payment for
   * @param tokenAddress - ERC20 token contract address (must match invoice)
   * @returns Transaction hash and operation ID
   * @throws {BlockchainError} When payment settlement fails
   * @throws {Error} When wallet is not configured (read-only mode)
   *
   * @example
   * ```typescript
   * // Get invoice
   * const invoice = await sdk.accessSettlement.getOperationInvoice("op_123");
   *
   * // Approve token spending (if not already approved)
   * const tokenContract = sdk.protocol.createContract("ERC20" as const);
   * await tokenContract.write.approve([
   *   accessSettlementAddress,
   *   invoice.price
   * ]);
   *
   * // Settle with token
   * const result = await sdk.accessSettlement.settlePaymentWithToken(
   *   "op_123",
   *   invoice.tokenAddress
   * );
   *
   * await sdk.waitForTransactionReceipt(result.hash);
   * ```
   */
  async settlePaymentWithToken(
    operationId: string,
    tokenAddress: `0x${string}`,
  ): Promise<PaymentSettlementResult> {
    this.assertWallet();

    try {
      const chainId = await this.context.publicClient.getChainId();
      const contractAddress = getContractAddress(chainId, "AccessSettlement");
      const abi = getAbi("AccessSettlement");

      const operationIdBytes = this.stringToBytes(operationId);

      const account =
        this.context.walletClient?.account ?? this.context.userAddress;

      const hash = await this.context.walletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "settlePaymentWithToken",
        args: [operationIdBytes, tokenAddress],
        account,
        chain: this.context.walletClient?.chain ?? null,
      });

      return {
        hash,
        operationId,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new BlockchainError(
          `Failed to settle payment with token: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError(
        "Failed to settle payment with token with unknown error",
      );
    }
  }

  /**
   * Helper method to convert operation ID string to bytes
   * @internal
   */
  private stringToBytes(str: string): `0x${string}` {
    // If already hex string, return as-is
    if (str.startsWith("0x")) {
      return str as `0x${string}`;
    }

    // Convert string to hex bytes
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const hexString = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `0x${hexString}` as `0x${string}`;
  }
}
