import { describe, it, expect } from "vitest";
import { tx } from "../transactionHelpers";
import type { TransactionResult } from "../../types/operations";

describe("transactionHelpers", () => {
  describe("tx()", () => {
    it("creates a valid TransactionResult POJO", () => {
      const result = tx({
        hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`,
        from: "0xabcdef1234567890abcdef1234567890abcdef12" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "addPermission",
      });

      expect(result).toEqual({
        hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        from: "0xabcdef1234567890abcdef1234567890abcdef12",
        contract: "DataPortabilityPermissions",
        fn: "addPermission",
      });
    });

    it("returns a plain object (not a class instance)", () => {
      const result = tx({
        hash: "0xabc" as `0x${string}`,
        from: "0xdef" as `0x${string}`,
        contract: "DataRegistry",
        fn: "addFile",
      });

      // Should be a plain object
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(result.constructor).toBe(Object);
    });

    it("creates a JSON-serializable object", () => {
      const result = tx({
        hash: "0xhash" as `0x${string}`,
        from: "0xfrom" as `0x${string}`,
        contract: "DataPortabilityServers",
        fn: "trustServer",
      });

      const serialized = JSON.stringify(result);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(result);
      expect(deserialized.hash).toBe("0xhash");
      expect(deserialized.from).toBe("0xfrom");
      expect(deserialized.contract).toBe("DataPortabilityServers");
      expect(deserialized.fn).toBe("trustServer");
    });

    it("preserves type information for TypeScript", () => {
      const result = tx({
        hash: "0x123" as `0x${string}`,
        from: "0x456" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "revokePermission",
      });

      // TypeScript should infer the correct types
      type ExpectedResult = TransactionResult<
        "DataPortabilityPermissions",
        "revokePermission"
      >;

      // This is a compile-time check - if it compiles, the types are correct
      const typed: ExpectedResult = result;
      expect(typed).toBe(result);
    });

    it("works with all contract types", () => {
      const contracts = [
        "DataPortabilityPermissions",
        "DataPortabilityServers",
        "DataPortabilityGrantees",
        "DataRegistry",
        "ComputeInstructionRegistry",
      ] as const;

      for (const contract of contracts) {
        const result = tx({
          hash: "0xtest" as `0x${string}`,
          from: "0xaddr" as `0x${string}`,
          contract,
          fn: "initialize", // All contracts have initialize
        });

        expect(result.contract).toBe(contract);
        expect(result.fn).toBe("initialize");
      }
    });

    it("handles different function names correctly", () => {
      const functions = [
        { contract: "DataPortabilityPermissions", fn: "addPermission" },
        { contract: "DataPortabilityPermissions", fn: "revokePermission" },
        { contract: "DataPortabilityServers", fn: "trustServer" },
        { contract: "DataPortabilityServers", fn: "untrustServer" },
        { contract: "DataRegistry", fn: "addFile" },
        { contract: "DataRegistry", fn: "addFile" },
      ] as const;

      for (const { contract, fn } of functions) {
        const result = tx({
          hash: "0xtest" as `0x${string}`,
          from: "0xaddr" as `0x${string}`,
          contract,
          fn,
        });

        expect(result.contract).toBe(contract);
        expect(result.fn).toBe(fn);
      }
    });

    it("maintains referential transparency", () => {
      const input = {
        hash: "0xabc" as `0x${string}`,
        from: "0xdef" as `0x${string}`,
        contract: "DataRegistry" as const,
        fn: "addFile" as const,
      };

      const result1 = tx(input);
      const result2 = tx(input);

      // Should create new objects each time
      expect(result1).not.toBe(result2);
      // But with the same values
      expect(result1).toEqual(result2);
    });

    it("does not mutate the input", () => {
      const input = {
        hash: "0xabc" as `0x${string}`,
        from: "0xdef" as `0x${string}`,
        contract: "DataRegistry" as const,
        fn: "addFile" as const,
      };

      const inputCopy = { ...input };
      const result = tx(input);

      expect(input).toEqual(inputCopy);
      expect(result).not.toBe(input);
    });
  });
});
