import { describe, it, expect } from "vitest";
import { toViemTypedDataDefinition } from "../utils/typedDataConverter";
import type { GenericTypedData } from "../types/permissions";
import type { TypedDataDefinition } from "viem";

describe("typedDataConverter", () => {
  describe("toViemTypedDataDefinition", () => {
    it("should convert a simple typed data object", () => {
      const input: GenericTypedData = {
        domain: {
          name: "TestApp",
          version: "1",
          chainId: 1,
          verifyingContract: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        },
        types: {
          Person: [
            { name: "name", type: "string" },
            { name: "age", type: "uint256" },
          ],
        },
        primaryType: "Person",
        message: {
          name: "Alice",
          age: 30,
        },
      };

      const result = toViemTypedDataDefinition(input);

      expect(result).toEqual({
        domain: {
          name: "TestApp",
          version: "1",
          chainId: 1,
          verifyingContract: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        },
        types: {
          Person: [
            { name: "name", type: "string" },
            { name: "age", type: "uint256" },
          ],
        },
        primaryType: "Person",
        message: {
          name: "Alice",
          age: 30,
        },
      });
    });

    it("should handle multiple types", () => {
      const input: GenericTypedData = {
        domain: {
          name: "ComplexApp",
          version: "2",
          chainId: 137,
          verifyingContract: "0x1234567890123456789012345678901234567890",
        },
        types: {
          Permission: [
            { name: "grantee", type: "address" },
            { name: "operation", type: "string" },
            { name: "nonce", type: "uint256" },
          ],
          FileData: [
            { name: "fileId", type: "uint256" },
            { name: "hash", type: "bytes32" },
          ],
        },
        primaryType: "Permission",
        message: {
          grantee: "0xabcdef1234567890abcdef1234567890abcdef12",
          operation: "read",
          nonce: 42n,
        },
      };

      const result = toViemTypedDataDefinition(input);

      expect(result.types).toHaveProperty("Permission");
      expect(result.types).toHaveProperty("FileData");
      expect(result.types.Permission).toHaveLength(3);
      expect(result.types.FileData).toHaveLength(2);
      expect(result.primaryType).toBe("Permission");
    });

    it("should handle empty types object", () => {
      const input: GenericTypedData = {
        domain: {
          name: "EmptyApp",
          version: "1",
          chainId: 1,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
        types: {},
        primaryType: "Empty",
        message: {},
      };

      const result = toViemTypedDataDefinition(input);

      expect(result.types).toEqual({});
      expect(result.message).toEqual({});
    });

    it("should preserve complex message structures", () => {
      const input: GenericTypedData = {
        domain: {
          name: "NestedApp",
          version: "1",
          chainId: 1,
          verifyingContract: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        },
        types: {
          Data: [
            { name: "values", type: "uint256[]" },
            { name: "metadata", type: "string" },
          ],
        },
        primaryType: "Data",
        message: {
          values: [1n, 2n, 3n],
          metadata: JSON.stringify({ key: "value" }),
          extra: { nested: true },
        },
      };

      const result = toViemTypedDataDefinition(input);

      expect(result.message).toEqual({
        values: [1n, 2n, 3n],
        metadata: JSON.stringify({ key: "value" }),
        extra: { nested: true },
      });
    });

    it("should handle real-world permission typed data", () => {
      const input: GenericTypedData = {
        domain: {
          name: "DataPortabilityPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract: "0x5678000000000000000000000000000000000000",
        },
        types: {
          Permission: [
            { name: "nonce", type: "uint256" },
            { name: "granteeId", type: "uint256" },
            { name: "grant", type: "string" },
            { name: "fileIds", type: "uint256[]" },
          ],
        },
        primaryType: "Permission",
        message: {
          nonce: 123n,
          granteeId: 456n,
          grant: "ipfs://QmXyzABC123",
          fileIds: [1n, 2n, 3n],
        },
      };

      const result = toViemTypedDataDefinition(input);

      // Verify the structure is preserved
      expect(result.domain?.chainId).toBe(14800);
      expect(result.primaryType).toBe("Permission");
      expect(result.types.Permission).toHaveLength(4);
      expect(result.message).toHaveProperty("nonce", 123n);
      expect(result.message).toHaveProperty("fileIds", [1n, 2n, 3n]);
    });

    it("should create a proper TypedDataDefinition for viem", () => {
      const input: GenericTypedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 1,
          verifyingContract: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        },
        types: {
          Test: [{ name: "value", type: "string" }],
        },
        primaryType: "Test",
        message: { value: "test" },
      };

      const result = toViemTypedDataDefinition(input);

      // The result should be assignable to TypedDataDefinition
      const typeCheck: TypedDataDefinition = result;
      expect(typeCheck).toBeDefined();
    });

    it("should handle types with special prototype properties", () => {
      const input: GenericTypedData = {
        domain: {
          name: "SpecialApp",
          version: "1",
          chainId: 1,
          verifyingContract: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        },
        types: {
          constructor: [{ name: "value", type: "string" }],
          toString: [{ name: "data", type: "bytes" }],
          valueOf: [{ name: "amount", type: "uint256" }],
        },
        primaryType: "constructor",
        message: { value: "test" },
      };

      const result = toViemTypedDataDefinition(input);

      // Should only include own properties, not prototype methods
      expect(result.types).toHaveProperty("constructor");
      expect(result.types).toHaveProperty("toString");
      expect(result.types).toHaveProperty("valueOf");
      expect(Object.keys(result.types)).toHaveLength(3);
    });
  });
});
