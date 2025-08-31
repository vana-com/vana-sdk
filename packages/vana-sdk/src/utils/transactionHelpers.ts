/**
 * Helper functions for creating typed transaction POJOs
 */

import type { Hash, Address } from "viem";
import type { TransactionResult } from "../types/operations";
import type { Contract, Fn } from "../generated/event-types";

/**
 * Creates typed TransactionResult with validation.
 *
 * @remarks
 * Ensures type safety for transaction results.
 * Reduces boilerplate in transaction handling.
 *
 * @param input - Transaction details
 * @returns Typed TransactionResult POJO
 *
 * @example
 * ```typescript
 * return tx({
 *   hash,
 *   from: account.address,
 *   contract: "DataPortabilityPermissions",
 *   fn: "revokePermission"
 * });
 * ```
 */
export function tx<C extends Contract, F extends Fn<C>>(input: {
  hash: Hash;
  from: Address;
  contract: C;
  fn: F;
  chainId?: number;
  value?: bigint;
  nonce?: number;
  to?: Address;
}): TransactionResult<C, F> {
  // Create a new plain object to ensure independence and true POJO behavior
  return {
    hash: input.hash,
    from: input.from,
    contract: input.contract,
    fn: input.fn,
    ...(input.chainId !== undefined && { chainId: input.chainId }),
    ...(input.value !== undefined && { value: input.value }),
    ...(input.nonce !== undefined && { nonce: input.nonce }),
    ...(input.to !== undefined && { to: input.to }),
  };
}

/**
 * Creates a transaction result with literal type inference.
 * Use this when you need TypeScript to preserve exact string literals.
 *
 * @param input - Transaction details
 * @param input.hash - Transaction hash
 * @param input.from - Transaction sender address
 * @param input.contract - Contract name
 * @param input.fn - Function name
 * @param input.chainId - Optional chain ID
 * @param input.value - Optional transaction value
 * @param input.nonce - Optional nonce
 * @param input.to - Optional recipient address
 * @returns Typed TransactionResult
 *
 * @example
 * ```typescript
 * const transaction = txLiteral({
 *   hash: '0x...',
 *   from: '0x...',
 *   contract: "DataPortabilityPermissions",
 *   fn: "revokePermission",
 * });
 * // TypeScript knows exactly: DataPortabilityPermissions + revokePermission
 * ```
 */
export function txLiteral<
  const C extends Contract,
  const F extends Fn<C>,
>(input: {
  hash: Hash;
  from: Address;
  contract: C;
  fn: F;
  chainId?: number;
  value?: bigint;
  nonce?: number;
  to?: Address;
}): TransactionResult<C, F> {
  // Create a new plain object to ensure independence and true POJO behavior
  return {
    hash: input.hash,
    from: input.from,
    contract: input.contract,
    fn: input.fn,
    ...(input.chainId !== undefined && { chainId: input.chainId }),
    ...(input.value !== undefined && { value: input.value }),
    ...(input.nonce !== undefined && { nonce: input.nonce }),
    ...(input.to !== undefined && { to: input.to }),
  };
}
