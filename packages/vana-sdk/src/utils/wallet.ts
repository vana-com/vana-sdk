import type { Account, Address } from "viem";

/**
 * Extracts an Ethereum address from various account formats.
 *
 * Viem's Account type can be:
 * - A string address directly
 * - An object with an address property
 * - A LocalAccount with address property
 *
 * This utility provides a single source of truth for address extraction,
 * eliminating duplicate logic throughout the codebase.
 *
 * @param account - The account to extract address from
 * @returns The extracted Ethereum address
 * @throws Error if account is undefined or address cannot be determined
 */
export function extractAddress(
  account: Account | Address | undefined | null,
): Address {
  if (!account) {
    throw new Error("No account provided");
  }

  // Handle string address directly
  if (typeof account === "string") {
    return account as Address;
  }

  // Handle object with address property
  if (typeof account === "object" && "address" in account && account.address) {
    return account.address;
  }

  throw new Error("Unable to determine wallet address from account");
}

/**
 * Safely extracts an address, returning undefined instead of throwing.
 * Useful for optional address resolution.
 *
 * @param account - The account to extract address from
 * @returns The extracted address or undefined
 */
export function extractAddressSafe(
  account: Account | Address | undefined | null,
): Address | undefined {
  try {
    return extractAddress(account);
  } catch {
    return undefined;
  }
}

/**
 * Type guard to check if an account has a valid address.
 *
 * @param account - The account to check
 * @returns True if account has a valid address
 */
export function hasAddress(account: unknown): account is Account | Address {
  if (!account) return false;

  if (typeof account === "string") {
    // Basic check for Ethereum address format
    return /^0x[a-fA-F0-9]{40}$/.test(account);
  }

  if (typeof account === "object" && "address" in account) {
    const accountWithAddress = account as { address: unknown };
    const addr = accountWithAddress.address;
    return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  return false;
}
