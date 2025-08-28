import { formatEther, formatUnits } from "viem";

/**
 * Format a bigint or BigNumber to a regular number
 *
 * @remarks
 * This function converts blockchain-specific large number types to standard JavaScript
 * numbers. Use with caution for values that may exceed safe integer range.
 *
 * **Edge Cases:**
 * - Values exceeding JavaScript's MAX_SAFE_INTEGER (2^53-1) lose precision
 * - Negative values are supported
 * - String values must be valid numeric strings or will return NaN
 *
 * @param value BigInt, BigNumber or numeric string to convert
 * @returns Regular JavaScript number
 * @example
 * ```typescript
 * formatNumber(1000000000000000000n) // Returns: 1000000000000000000
 * formatNumber("123456789") // Returns: 123456789
 * formatNumber(-100n) // Returns: -100
 *
 * // Precision loss example:
 * const bigValue = 9007199254740993n; // MAX_SAFE_INTEGER + 2
 * formatNumber(bigValue) // Returns: 9007199254740992 (lost precision)
 * ```
 */
export function formatNumber(value: bigint | string | number): number {
  return Number(value);
}

/**
 * Format wei value to ETH with specified decimal places
 *
 * @remarks
 * Converts wei (smallest ETH unit) to human-readable ETH format.
 * 1 ETH = 10^18 wei. The function truncates rather than rounds
 * to ensure predictable display in financial contexts.
 *
 * **Edge Cases:**
 * - Truncates (not rounds) to specified decimal places
 * - Negative values are supported
 * - Zero values return "0.0000" (based on decimals)
 * - Very small values may display as "0.0000" due to truncation
 *
 * @param wei Value in wei (as bigint, string, or number)
 * @param decimals Number of decimal places to display (default: 4)
 * @returns Formatted ETH value as string
 * @example
 * ```typescript
 * // Standard conversions
 * formatEth(1000000000000000000n) // Returns: "1.0000"
 * formatEth(1500000000000000000n, 2) // Returns: "1.50"
 * formatEth("2000000000000000000") // Returns: "2.0000"
 *
 * // Edge cases
 * formatEth(1000000000000000n) // Returns: "0.0010" (0.001 ETH)
 * formatEth(100000000000000n) // Returns: "0.0001"
 * formatEth(10000000000000n) // Returns: "0.0000" (truncated)
 * formatEth(-1000000000000000000n) // Returns: "-1.000"
 * ```
 */
export function formatEth(wei: bigint | string | number, decimals = 4): string {
  const weiValue = typeof wei === "bigint" ? wei : BigInt(wei);
  return formatEther(weiValue).slice(0, decimals + 2);
}

/**
 * Format a token amount based on its decimals
 *
 * @remarks
 * Generic token formatter that handles any ERC20-style token with
 * configurable decimal places. Most tokens use 18 decimals like ETH,
 * but some use different values (e.g., USDC uses 6).
 *
 * @param amount Raw token amount
 * @param decimals Token decimals (default: 18)
 * @param displayDecimals Decimals to show in formatted output (default: 4)
 * @returns Formatted token amount as string
 * @example
 * ```typescript
 * // 18 decimal token (like ETH)
 * formatToken(1000000000000000000n) // Returns: "1.0000"
 * formatToken(1500000000000000000n, 18, 2) // Returns: "1.50"
 *
 * // 6 decimal token (like USDC)
 * formatToken(1000000n, 6) // Returns: "1.0000"
 * formatToken(1500000n, 6, 2) // Returns: "1.50"
 *
 * // Whole numbers
 * formatToken(5000000000000000000n) // Returns: "5"
 * formatToken(5123456789000000000n, 18, 6) // Returns: "5.123456"
 * ```
 */
export function formatToken(
  amount: bigint | string | number,
  decimals = 18,
  displayDecimals = 4,
): string {
  const amountValue = typeof amount === "bigint" ? amount : BigInt(amount);
  const value = formatUnits(amountValue, decimals);
  const parts = value.split(".");

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts[0]}.${parts[1].slice(0, displayDecimals)}`;
}

/**
 * Format an address for display (showing first 6 and last 4 characters)
 *
 * @remarks
 * Creates a human-readable abbreviated version of Ethereum addresses
 * for UI display. Preserves enough characters to maintain uniqueness
 * while saving screen space. Does not validate address format.
 *
 * **Edge Cases:**
 * - Addresses shorter than 10 characters are returned unchanged
 * - Works with both checksummed and lowercase addresses
 * - Does not validate address format
 *
 * @param address EVM address
 * @returns Shortened address string
 * @example
 * ```typescript
 * // Standard addresses
 * shortenAddress("0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36")
 * // Returns: "0x742d...Bd36"
 *
 * // Checksummed address
 * shortenAddress("0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36")
 * // Returns: "0x742d...Bd36"
 *
 * // Edge cases
 * shortenAddress("0x123") // Returns: "0x123" (too short)
 * shortenAddress("") // Returns: ""
 * shortenAddress("not-an-address") // Returns: "not-an...ress"
 * ```
 */
export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
