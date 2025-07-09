import { formatEther, formatUnits } from "viem";

/**
 * Format a bigint or BigNumber to a regular number
 * @param value BigInt, BigNumber or numeric string to convert
 * @returns Regular JavaScript number
 */
export function formatNumber(value: bigint | string | number): number {
  return Number(value);
}

/**
 * Format wei value to ETH with specified decimal places
 * @param wei Value in wei (as bigint, string, or number)
 * @param decimals Number of decimal places to display (default: 4)
 * @returns Formatted ETH value as string
 */
export function formatEth(wei: bigint | string | number, decimals = 4): string {
  return formatEther(BigInt(wei.toString())).slice(0, decimals + 2);
}

/**
 * Format a token amount based on its decimals
 * @param amount Raw token amount
 * @param decimals Token decimals (default: 18)
 * @param displayDecimals Decimals to show in formatted output (default: 4)
 * @returns Formatted token amount as string
 */
export function formatToken(
  amount: bigint | string | number,
  decimals = 18,
  displayDecimals = 4,
): string {
  const value = formatUnits(BigInt(amount.toString()), decimals);
  const parts = value.split(".");

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts[0]}.${parts[1].slice(0, displayDecimals)}`;
}

/**
 * Format an address for display (showing first 6 and last 4 characters)
 * @param address EVM address
 * @returns Shortened address string
 */
export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
