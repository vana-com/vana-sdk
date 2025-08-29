import type { TransactionOptions } from "../types/utils";

/**
 * Utility functions for handling transaction options in a type-safe way.
 *
 * @remarks
 * These utilities help extract compatible options for viem's writeContract calls,
 * which have strict typing requirements that vary by function.
 */

/**
 * Extracts gas options that are compatible with viem's writeContract.
 *
 * @remarks
 * Viem uses 'gas' instead of 'gasLimit' and some functions don't support
 * legacy gasPrice (EIP-1559 only). This utility safely extracts the
 * compatible options and handles the naming differences.
 *
 * @param options - Transaction options to extract from
 * @param supportLegacyGas - Whether to include legacy gasPrice (default: false)
 * @returns Object with gas options that can be safely spread into writeContract
 *
 * @example
 * ```typescript
 * const gasOptions = extractViemGasOptions(options);
 * const hash = await walletClient.writeContract({
 *   address: contractAddress,
 *   abi: contractAbi,
 *   functionName: "myFunction",
 *   args: [...],
 *   ...gasOptions,
 * });
 * ```
 */
export function extractViemGasOptions(
  options?: TransactionOptions,
  supportLegacyGas: boolean = false,
): Record<string, unknown> {
  if (!options) return {};

  const gasOptions: Record<string, unknown> = {};

  // EIP-1559 gas options (supported by most modern functions)
  if (options.gasLimit) gasOptions.gas = options.gasLimit; // Note: viem uses 'gas' not 'gasLimit'
  if (options.maxFeePerGas) gasOptions.maxFeePerGas = options.maxFeePerGas;
  if (options.maxPriorityFeePerGas)
    gasOptions.maxPriorityFeePerGas = options.maxPriorityFeePerGas;

  // Legacy gas price (only if explicitly supported)
  if (supportLegacyGas && options.gasPrice) {
    gasOptions.gasPrice = options.gasPrice;
  }

  // Other transaction options
  if (options.nonce !== undefined) gasOptions.nonce = options.nonce;
  if (options.value !== undefined) gasOptions.value = options.value;

  return gasOptions;
}
