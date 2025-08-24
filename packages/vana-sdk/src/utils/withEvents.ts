/**
 * Internal helper for controllers to wait for transaction events and extract data.
 * This keeps the POJO system internal while providing simple return values to developers.
 * 
 * @internal
 */

import type { Contract, Fn, TypedTransactionResult } from "../generated/event-types";
import type { TransactionResult } from "../types/operations";

/**
 * Waits for transaction events and transforms them into domain-specific results.
 * 
 * @internal
 * @param waitFor - The waitForTransactionEvents function from context
 * @param tx - The transaction result POJO
 * @param select - Function to extract domain data from typed events
 * @returns The domain-specific result
 */
export async function withEvents<
  C extends Contract,
  F extends Fn<C>,
  Out
>(
  waitFor: (tx: TransactionResult<C, F>) => Promise<TypedTransactionResult<C, F>>,
  tx: TransactionResult<C, F>,
  select: (result: TypedTransactionResult<C, F>) => Out
): Promise<Out> {
  const result = await waitFor(tx);
  return select(result);
}

/**
 * Creates a transaction result POJO and immediately waits for events.
 * Convenience wrapper that combines tx() + withEvents() for cleaner controller code.
 * 
 * @internal
 * @param waitFor - The waitForTransactionEvents function from context
 * @param input - Transaction details (hash, from, contract, fn)
 * @param select - Function to extract domain data from typed events
 * @returns The domain-specific result
 */
export async function txWithEvents<
  C extends Contract,
  F extends Fn<C>,
  Out
>(
  waitFor: (tx: TransactionResult<C, F>) => Promise<TypedTransactionResult<C, F>>,
  input: {
    hash: `0x${string}`;
    from: `0x${string}`;
    contract: C;
    fn: F;
  },
  select: (result: TypedTransactionResult<C, F>) => Out
): Promise<Out> {
  const { tx } = await import("./transactionHelpers");
  const txResult = tx(input);
  return withEvents(waitFor, txResult, select);
}

/**
 * Helper for methods that submit transactions via relayer.
 * Returns the TransactionResult POJO for two-step processing.
 * 
 * @internal
 * @param input - Transaction details
 * @returns TransactionResult POJO for external waiting
 */
export function txForRelayed<C extends Contract, F extends Fn<C>>(
  input: {
    hash: `0x${string}`;
    from: `0x${string}`;
    contract: C;
    fn: F;
  }
): TransactionResult<C, F> {
  // Dynamic import to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { tx } = require("./transactionHelpers");
  return tx(input);
}