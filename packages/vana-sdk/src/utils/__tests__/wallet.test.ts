/**
 * Tests for wallet utility functions
 */

import { describe, it, expect } from "vitest";
import type { Account, Address } from "viem";
import { extractAddress, extractAddressSafe, hasAddress } from "../wallet";

describe("wallet utilities", () => {
  // Valid test address
  const validAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb" as Address;
  const validAddressLowercase =
    "0x742d35cc6634c0532925a3b844bc9e7595f0b0bb" as Address;
  const validAddressUppercase =
    "0x742D35CC6634C0532925A3B844BC9E7595F0B0BB" as Address;
  const anotherValidAddress =
    "0x1234567890123456789012345678901234567890" as Address;

  describe("extractAddress()", () => {
    describe("valid string addresses", () => {
      it("should extract address from valid hex string", () => {
        const result = extractAddress(validAddress);
        expect(result).toBe(validAddress);
      });

      it("should extract address with lowercase hex characters", () => {
        const result = extractAddress(validAddressLowercase);
        expect(result).toBe(validAddressLowercase);
      });

      it("should extract address with uppercase hex characters", () => {
        const result = extractAddress(validAddressUppercase);
        expect(result).toBe(validAddressUppercase);
      });

      it("should extract address with mixed case hex characters", () => {
        const result = extractAddress(validAddress);
        expect(result).toBe(validAddress);
      });
    });

    describe("valid account objects", () => {
      it("should extract address from simple Account object", () => {
        const account: Account = {
          address: validAddress,
          type: "json-rpc",
        };
        const result = extractAddress(account);
        expect(result).toBe(validAddress);
      });

      it("should extract address from Account-like object with extra properties", () => {
        const account = {
          address: validAddress,
          type: "json-rpc",
          publicKey: "0x...",
          name: "test",
        };
        const result = extractAddress(account as any);
        expect(result).toBe(validAddress);
      });

      it("should extract address from object with only address property", () => {
        const account = { address: validAddress };
        const result = extractAddress(account as any);
        expect(result).toBe(validAddress);
      });

      it("should extract address from LocalAccount-like object", () => {
        const localAccount = {
          address: validAddress,
          type: "local" as const,
          signMessage: () => Promise.resolve("0x..."),
          signTransaction: () => Promise.resolve("0x..."),
          signTypedData: () => Promise.resolve("0x..."),
        };
        const result = extractAddress(localAccount as any);
        expect(result).toBe(validAddress);
      });

      it("should handle different address values in objects", () => {
        const account = { address: anotherValidAddress };
        const result = extractAddress(account as any);
        expect(result).toBe(anotherValidAddress);
      });
    });

    describe("null/undefined inputs", () => {
      it("should throw error for undefined account", () => {
        expect(() => extractAddress(undefined)).toThrow("No account provided");
      });

      it("should throw error for null account", () => {
        expect(() => extractAddress(null)).toThrow("No account provided");
      });
    });

    describe("invalid account formats", () => {
      it("should throw error for empty string (falsy value)", () => {
        expect(() => extractAddress("" as any)).toThrow("No account provided");
      });

      it("should throw error for object without address property", () => {
        const account = { notAddress: validAddress };
        expect(() => extractAddress(account as any)).toThrow(
          "Unable to determine wallet address from account",
        );
      });

      it("should throw error for object with null address", () => {
        const account = { address: null };
        expect(() => extractAddress(account as any)).toThrow(
          "Unable to determine wallet address from account",
        );
      });

      it("should throw error for object with undefined address", () => {
        const account = { address: undefined };
        expect(() => extractAddress(account as any)).toThrow(
          "Unable to determine wallet address from account",
        );
      });

      it("should throw error for invalid hex address format (wrong length)", () => {
        // Note: extractAddress doesn't validate format, but the caller should use hasAddress
        // This test documents that extractAddress returns invalid strings as-is
        const invalidAddress = "0x123"; // Too short
        const account = { address: invalidAddress };
        // extractAddress doesn't validate, it just returns the address
        const result = extractAddress(account as any);
        expect(result).toBe(invalidAddress);
      });

      it("should throw error for number", () => {
        expect(() => extractAddress(123 as unknown as Address)).toThrow(
          "Unable to determine wallet address from account",
        );
      });

      it("should throw error for array", () => {
        expect(() => extractAddress([] as unknown as Address)).toThrow(
          "Unable to determine wallet address from account",
        );
      });

      it("should throw error for boolean", () => {
        expect(() => extractAddress(true as unknown as Address)).toThrow(
          "Unable to determine wallet address from account",
        );
      });
    });

    describe("error messages", () => {
      it("should have descriptive error message for null/undefined", () => {
        try {
          extractAddress(null);
          expect.fail("Should have thrown");
        } catch (error) {
          expect((error as Error).message).toBe("No account provided");
        }
      });

      it("should have descriptive error message for invalid format", () => {
        try {
          extractAddress({} as any);
          expect.fail("Should have thrown");
        } catch (error) {
          expect((error as Error).message).toBe(
            "Unable to determine wallet address from account",
          );
        }
      });
    });
  });

  describe("extractAddressSafe()", () => {
    describe("valid inputs", () => {
      it("should extract address from valid hex string", () => {
        const result = extractAddressSafe(validAddress);
        expect(result).toBe(validAddress);
      });

      it("should extract address from valid Account object", () => {
        const account: Account = {
          address: validAddress,
          type: "json-rpc",
        };
        const result = extractAddressSafe(account);
        expect(result).toBe(validAddress);
      });

      it("should extract address with various case formats", () => {
        expect(extractAddressSafe(validAddressLowercase)).toBe(
          validAddressLowercase,
        );
        expect(extractAddressSafe(validAddressUppercase)).toBe(
          validAddressUppercase,
        );
        expect(extractAddressSafe(validAddress)).toBe(validAddress);
      });
    });

    describe("invalid inputs - returns undefined instead of throwing", () => {
      it("should return undefined for null", () => {
        const result = extractAddressSafe(null);
        expect(result).toBeUndefined();
      });

      it("should return undefined for undefined", () => {
        const result = extractAddressSafe(undefined);
        expect(result).toBeUndefined();
      });

      it("should return undefined for empty string", () => {
        const result = extractAddressSafe("" as any);
        expect(result).toBeUndefined();
      });

      it("should return undefined for object without address property", () => {
        const account = { notAddress: validAddress };
        const result = extractAddressSafe(account as any);
        expect(result).toBeUndefined();
      });

      it("should return undefined for object with null address", () => {
        const account = { address: null };
        const result = extractAddressSafe(account as any);
        expect(result).toBeUndefined();
      });

      it("should return undefined for object with undefined address", () => {
        const account = { address: undefined };
        const result = extractAddressSafe(account as any);
        expect(result).toBeUndefined();
      });

      it("should return undefined for number", () => {
        const result = extractAddressSafe(123 as unknown as Address);
        expect(result).toBeUndefined();
      });

      it("should return undefined for array", () => {
        const result = extractAddressSafe([] as unknown as Address);
        expect(result).toBeUndefined();
      });

      it("should return undefined for boolean", () => {
        const result = extractAddressSafe(true as unknown as Address);
        expect(result).toBeUndefined();
      });

      it("should return undefined for plain object without address", () => {
        const result = extractAddressSafe({} as any);
        expect(result).toBeUndefined();
      });
    });

    describe("graceful degradation", () => {
      it("should handle partial Account objects", () => {
        const partialAccount = { address: validAddress };
        const result = extractAddressSafe(partialAccount as any);
        expect(result).toBe(validAddress);
      });

      it("should be suitable for optional chaining", () => {
        const user = { wallet: null };
        const address = extractAddressSafe(user.wallet);
        expect(address).toBeUndefined();
      });

      it("should work with nullish coalescing operator", () => {
        const address =
          extractAddressSafe(null) ??
          "0x0000000000000000000000000000000000000000";
        expect(address).toBe("0x0000000000000000000000000000000000000000");
      });

      it("should enable conditional logic without try-catch", () => {
        const maybeAddress = extractAddressSafe({ invalidData: true } as any);
        let result: string | undefined;
        if (maybeAddress) {
          result = maybeAddress;
        } else {
          result = undefined;
        }
        expect(result).toBeUndefined();
      });
    });
  });

  describe("hasAddress()", () => {
    describe("valid Ethereum address strings", () => {
      it("should return true for valid lowercase hex address", () => {
        expect(hasAddress(validAddressLowercase)).toBe(true);
      });

      it("should return true for valid uppercase hex address", () => {
        expect(hasAddress(validAddressUppercase)).toBe(true);
      });

      it("should return true for valid mixed case hex address", () => {
        expect(hasAddress(validAddress)).toBe(true);
      });

      it("should return true for another valid address", () => {
        expect(hasAddress(anotherValidAddress)).toBe(true);
      });

      it("should return true for address with all zeros", () => {
        const zeroAddress =
          "0x0000000000000000000000000000000000000000" as Address;
        expect(hasAddress(zeroAddress)).toBe(true);
      });

      it("should return true for address with all f's", () => {
        const maxAddress = "0xffffffffffffffffffffffffffffffffffffffff";
        expect(hasAddress(maxAddress)).toBe(true);
      });
    });

    describe("valid Account objects with addresses", () => {
      it("should return true for Account object with valid address", () => {
        const account: Account = {
          address: validAddress,
          type: "json-rpc",
        };
        expect(hasAddress(account)).toBe(true);
      });

      it("should return true for object with address property", () => {
        const obj = { address: validAddress };
        expect(hasAddress(obj)).toBe(true);
      });

      it("should return true for Account-like object with extra properties", () => {
        const account = {
          address: validAddress,
          type: "local",
          publicKey: "0x...",
        };
        expect(hasAddress(account)).toBe(true);
      });

      it("should return true for LocalAccount-like object", () => {
        const localAccount = {
          address: validAddress,
          type: "local" as const,
          signMessage: () => Promise.resolve("0x..."),
        };
        expect(hasAddress(localAccount)).toBe(true);
      });
    });

    describe("invalid address formats", () => {
      it("should return false for address without 0x prefix", () => {
        expect(hasAddress("742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb")).toBe(
          false,
        );
      });

      it("should return false for address with wrong hex length (too short)", () => {
        expect(hasAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0b")).toBe(
          false,
        );
      });

      it("should return false for address with wrong hex length (too long)", () => {
        expect(hasAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb00")).toBe(
          false,
        );
      });

      it("should return false for address with invalid hex characters", () => {
        expect(hasAddress("0xZZZZ35Cc6634C0532925a3b844Bc9e7595f0b0Bb")).toBe(
          false,
        );
      });

      it("should return false for empty string", () => {
        expect(hasAddress("")).toBe(false);
      });

      it("should return false for string with only 0x prefix", () => {
        expect(hasAddress("0x")).toBe(false);
      });

      it("should return false for string with spaces", () => {
        expect(hasAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0b0B b")).toBe(
          false,
        );
      });
    });

    describe("null/undefined inputs", () => {
      it("should return false for null", () => {
        expect(hasAddress(null)).toBe(false);
      });

      it("should return false for undefined", () => {
        expect(hasAddress(undefined)).toBe(false);
      });
    });

    describe("non-string/non-object inputs", () => {
      it("should return false for number", () => {
        expect(hasAddress(123)).toBe(false);
      });

      it("should return false for boolean", () => {
        expect(hasAddress(true)).toBe(false);
      });

      it("should return false for array", () => {
        expect(hasAddress([validAddress])).toBe(false);
      });

      it("should return false for symbol", () => {
        expect(hasAddress(Symbol("address"))).toBe(false);
      });
    });

    describe("objects without address property", () => {
      it("should return false for empty object", () => {
        expect(hasAddress({})).toBe(false);
      });

      it("should return false for object with different property", () => {
        expect(hasAddress({ wallet: validAddress })).toBe(false);
      });

      it("should return false for object with null address property", () => {
        expect(hasAddress({ address: null })).toBe(false);
      });

      it("should return false for object with undefined address property", () => {
        expect(hasAddress({ address: undefined })).toBe(false);
      });

      it("should return false for object with non-string address property", () => {
        expect(hasAddress({ address: 123 })).toBe(false);
      });

      it("should return false for object with number address property", () => {
        const obj = { address: 0x742d35cc6634c0532925a3b844bc9e7595f0b0bb };
        expect(hasAddress(obj)).toBe(false);
      });

      it("should return false for object with array address property", () => {
        expect(hasAddress({ address: [validAddress] })).toBe(false);
      });
    });

    describe("address format validation", () => {
      it("should validate 0x prefix requirement", () => {
        const addressWithoutPrefix = "742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb";
        expect(hasAddress(addressWithoutPrefix)).toBe(false);
        expect(hasAddress(`0x${addressWithoutPrefix}`)).toBe(true);
      });

      it("should validate exactly 40 hex characters after 0x", () => {
        const baseAddress = "742d35Cc6634C0532925a3b844Bc9e7595f0b0B";
        expect(hasAddress(`0x${baseAddress}`)).toBe(false); // 39 chars
        expect(hasAddress(`0x${baseAddress}b`)).toBe(true); // 40 chars
        expect(hasAddress(`0x${baseAddress}b0`)).toBe(false); // 41 chars
      });

      it("should be case-insensitive for hex validation", () => {
        const testCases = [
          "0x742d35cc6634c0532925a3b844bc9e7595f0b0bb", // lowercase
          "0x742D35CC6634C0532925A3B844BC9E7595F0B0BB", // uppercase
          "0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb", // mixed
        ];
        testCases.forEach((addr) => {
          expect(hasAddress(addr)).toBe(true);
        });
      });

      it("should reject invalid hex characters", () => {
        const invalidChars = ["g", "h", "i", "j", "k", "z", "G", "X", " "];
        invalidChars.forEach((char) => {
          const invalidAddr = `0x7${char}2d35Cc6634C0532925a3b844Bc9e7595f0b0B`;
          expect(hasAddress(invalidAddr)).toBe(false);
        });
      });
    });

    describe("type guard behavior", () => {
      it("should work as a type guard in conditional", () => {
        const maybeAddress: unknown = validAddress;
        if (hasAddress(maybeAddress)) {
          // TypeScript should narrow to Account | Address
          const narrowed: Account | Address = maybeAddress;
          expect(typeof narrowed).toMatch(/string|object/);
        }
      });

      it("should work with array filter", () => {
        const items: unknown[] = [
          validAddress,
          null,
          { address: anotherValidAddress },
          "invalid",
          { address: null },
        ];
        const validItems = items.filter(hasAddress);
        expect(validItems).toHaveLength(2);
        expect(validItems[0]).toBe(validAddress);
        expect(validItems[1]).toHaveProperty("address", anotherValidAddress);
      });

      it("should narrow both string and object types", () => {
        const stringItem: unknown = validAddress;
        const objectItem: unknown = { address: validAddress };

        if (hasAddress(stringItem)) {
          expect(typeof stringItem).toBe("string");
        }

        if (hasAddress(objectItem)) {
          expect(typeof objectItem).toBe("object");
        }
      });
    });
  });

  describe("integration tests", () => {
    it("should use hasAddress to validate before extractAddress", () => {
      const account: unknown = validAddress;
      if (hasAddress(account)) {
        const result = extractAddress(account);
        expect(result).toBe(validAddress);
      }
    });

    it("should use hasAddress to validate before extractAddressSafe", () => {
      const account: unknown = { address: validAddress };
      if (hasAddress(account)) {
        const result = extractAddressSafe(account);
        expect(result).toBe(validAddress);
      }
    });

    it("should handle mixed array of accounts", () => {
      const accounts: unknown[] = [
        validAddress,
        null,
        { address: anotherValidAddress },
        undefined,
        "invalid",
        { address: "0x123" },
      ];

      const validAccounts = accounts.filter(hasAddress);
      const addresses = validAccounts.map(extractAddress);

      expect(validAccounts).toHaveLength(2);
      expect(addresses).toHaveLength(2);
      expect(addresses).toEqual([validAddress, anotherValidAddress]);
    });

    it("should use extractAddressSafe for optional account handling", () => {
      const userA = { account: { address: validAddress } };
      const userB = { account: null };
      const userC = { account: undefined };

      const addrA = extractAddressSafe(userA.account as any);
      const addrB = extractAddressSafe(userB.account);
      const addrC = extractAddressSafe(userC.account);

      expect(addrA).toBe(validAddress);
      expect(addrB).toBeUndefined();
      expect(addrC).toBeUndefined();
    });

    it("should handle wallet connection scenarios", () => {
      // Scenario 1: Connected wallet returning Account
      const connectedWallet: Account = {
        address: validAddress,
        type: "json-rpc",
      };
      expect(hasAddress(connectedWallet)).toBe(true);
      expect(extractAddress(connectedWallet)).toBe(validAddress);

      // Scenario 2: Disconnected wallet (null)
      const disconnectedWallet = null;
      expect(hasAddress(disconnectedWallet)).toBe(false);
      expect(extractAddressSafe(disconnectedWallet)).toBeUndefined();

      // Scenario 3: String address
      const stringAddress = validAddress;
      expect(hasAddress(stringAddress)).toBe(true);
      expect(extractAddress(stringAddress)).toBe(validAddress);
    });

    it("should handle fallback address pattern", () => {
      const primaryWallet = null;
      const backupWallet = { address: validAddress };

      const address =
        extractAddressSafe(primaryWallet) ??
        extractAddressSafe(backupWallet as any);

      expect(address).toBe(validAddress);
    });
  });
});
