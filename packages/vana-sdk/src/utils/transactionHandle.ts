import type { Hash, TransactionReceipt } from "viem";
import type { ControllerContext } from "../controllers/permissions";
import type { TransactionOperation } from "../config/eventMappings";
import type { TransactionOptions } from "../types/utils";
import { parseTransactionResult } from "./transactionParsing";

/**
 * Provides a unified interface for blockchain transaction results with lazy-loaded event parsing.
 *
 * @remarks
 * TransactionHandle enables immediate access to transaction hashes while providing optional
 * lazy-loaded access to receipts and parsed event data. All transaction-submitting methods
 * in the SDK return this handle, allowing developers to choose between immediate hash access
 * or waiting for event data. Results are memoized to prevent redundant network calls.
 *
 * @category Transactions
 * @example
 * ```typescript
 * // Immediate hash access
 * const tx = await sdk.permissions.submitSignedGrant(typedData, signature);
 * console.log(`Transaction submitted: ${tx.hash}`);
 *
 * // Wait for and parse events
 * const eventData = await tx.waitForEvents();
 * console.log(`Permission ID: ${eventData.permissionId}`);
 *
 * // Check receipt for gas usage
 * const receipt = await tx.waitForReceipt();
 * console.log(`Gas used: ${receipt.gasUsed}`);
 * ```
 */
export class TransactionHandle<TEventData = unknown> {
  private _receipt?: TransactionReceipt;
  private _eventData?: TEventData;
  private _receiptPromise?: Promise<TransactionReceipt>;
  private _eventPromise?: Promise<TEventData>;

  constructor(
    private readonly context: ControllerContext,
    public readonly hash: Hash,
    private readonly operation?: TransactionOperation,
  ) {}

  /**
   * Waits for transaction confirmation and returns the receipt.
   * Results are memoized - multiple calls return the same promise.
   *
   * @param options Optional transaction configuration (timeout, gas, etc.)
   * @returns Transaction receipt with gas usage, logs, and status
   */
  async waitForReceipt(
    options?: TransactionOptions,
  ): Promise<TransactionReceipt> {
    if (this._receipt) {
      return this._receipt;
    }

    if (!this._receiptPromise) {
      this._receiptPromise = this.context.publicClient
        .waitForTransactionReceipt({
          hash: this.hash,
          timeout: options?.timeout ?? 30_000,
        })
        .then((receipt) => {
          this._receipt = receipt;
          return receipt;
        });
    }

    return this._receiptPromise;
  }

  /**
   * Waits for transaction confirmation and parses emitted events.
   * Results are memoized - multiple calls return the same promise.
   *
   * @param options Optional transaction configuration (timeout, gas, etc.)
   * @returns Parsed event data with transaction metadata
   * @throws {Error} If no operation was specified for event parsing
   */
  async waitForEvents(options?: TransactionOptions): Promise<TEventData> {
    if (this._eventData) {
      return this._eventData;
    }

    if (!this._eventPromise) {
      if (!this.operation) {
        throw new Error(
          "Cannot parse events: no operation specified. " +
            "Use waitForReceipt() instead or ensure the operation is configured.",
        );
      }

      this._eventPromise = parseTransactionResult(
        this.context,
        this.hash,
        this.operation,
        options,
      ).then((eventData) => {
        this._eventData = eventData as TEventData;
        return eventData as TEventData;
      });
    }

    return this._eventPromise;
  }

  /**
   * Enables string coercion for backwards compatibility.
   * Allows TransactionHandle to be used anywhere a Hash is expected.
   *
   * @example
   * ```typescript
   * const hash: Hash = tx; // Works via toString()
   * console.log(`Transaction: ${tx}`); // Prints hash
   * ```
   * @returns The transaction hash as a string
   */
  toString(): string {
    return this.hash;
  }

  /**
   * JSON serialization support.
   * Returns the hash when serialized to JSON.
   *
   * @returns The transaction hash for JSON serialization
   */
  toJSON(): string {
    return this.hash;
  }

  /**
   * Custom inspect for Node.js console.log
   *
   * @returns Formatted string representation for debugging
   */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `TransactionHandle { hash: '${this.hash}', operation: '${this.operation ?? "none"}' }`;
  }
}
