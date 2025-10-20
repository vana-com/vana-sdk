import type { Account, Address } from "viem";

/**
 * Extracts an Ethereum address from various account formats.
 *
 * @remarks
 * Handles viem's polymorphic Account type which can be a string address,
 * an object with an address property, or a LocalAccount. This utility
 * provides consistent address extraction across the SDK, eliminating
 * duplicate logic and potential inconsistencies.
 *
 * @param account - The account to extract address from.
 *   Can be a hex string address, Account object, or LocalAccount.
 * @returns The extracted Ethereum address as a `0x`-prefixed string
 *
 * @throws {Error} When account is undefined or null.
 *   Provide a valid account from wallet connection.
 * @throws {Error} When address cannot be determined from account structure.
 *   Ensure account has a valid address property.
 *
 * @example
 * ```typescript
 * // String address
 * const addr1 = extractAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb');
 *
 * // Account object
 * const addr2 = extractAddress({ address: '0x742d...' });
 *
 * // LocalAccount from viem
 * const account = privateKeyToAccount('0x...');
 * const addr3 = extractAddress(account);
 * ```
 *
 * @category Utilities
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
 * Safely extracts an address without throwing errors.
 *
 * @remarks
 * Non-throwing version of `extractAddress` for optional address resolution.
 * Use when address extraction failure is acceptable and should be handled
 * gracefully without exception handling.
 *
 * @param account - The account to extract address from.
 *   Can be a hex string address, Account object, LocalAccount, or nullish.
 * @returns The extracted Ethereum address or `undefined` if extraction fails
 *
 * @example
 * ```typescript
 * const address = extractAddressSafe(potentialAccount);
 *
 * if (address) {
 *   console.log(`Using address: ${address}`);
 * } else {
 *   console.log('No valid address available');
 * }
 *
 * // Useful in optional chaining
 * const userAddress = extractAddressSafe(user?.wallet) ?? DEFAULT_ADDRESS;
 * ```
 *
 * @category Utilities
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
 * Validates whether a value contains a valid Ethereum address.
 *
 * @remarks
 * Type guard that performs runtime validation of Ethereum address format.
 * Checks for proper `0x` prefix and 40 hexadecimal characters. Works with
 * string addresses, Account objects, and LocalAccount instances.
 *
 * @param account - The value to validate for address presence
 * @returns `true` if account contains a valid Ethereum address, `false` otherwise
 *
 * @example
 * ```typescript
 * const maybeAccount: unknown = getUserInput();
 *
 * if (hasAddress(maybeAccount)) {
 *   // TypeScript knows maybeAccount is Account | Address
 *   const address = extractAddress(maybeAccount);
 *   await vana.data.getUserFiles({ owner: address });
 * } else {
 *   console.error('Invalid address format');
 * }
 *
 * // Filter valid addresses from mixed array
 * const addresses = mixedArray.filter(hasAddress).map(extractAddress);
 * ```
 *
 * @category Utilities
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
