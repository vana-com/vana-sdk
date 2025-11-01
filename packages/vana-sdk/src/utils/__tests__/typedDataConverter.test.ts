/**
 * Tests for typed data conversion utilities
 *
 * @remarks
 * Tests conversion between Vana's GenericTypedData and viem's TypedDataDefinition formats.
 */

import { describe, it, expect } from "vitest";
import { toViemTypedDataDefinition } from "../typedDataConverter";
import type { GenericTypedData } from "../../types/permissions";
import type { TypedDataDefinition } from "viem";

describe("typedDataConverter", () => {
  describe("toViemTypedDataDefinition", () => {
    it("should convert basic typed data structure", () => {
      const vanaTypedData: GenericTypedData = {
        domain: {
          name: "Vana",
          version: "1",
          chainId: 14800,
        },
        types: {
          Permission: [
            { name: "grantee", type: "address" },
            { name: "operation", type: "string" },
          ],
        },
        primaryType: "Permission",
        message: {
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "read",
        },
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.domain).toEqual(vanaTypedData.domain);
      expect(result.primaryType).toBe("Permission");
      expect(result.message).toEqual(vanaTypedData.message);
      expect(result.types.Permission).toBeDefined();
      expect(result.types.Permission).toHaveLength(2);
    });

    it("should preserve domain fields", () => {
      const vanaTypedData: GenericTypedData = {
        domain: {
          name: "TestDApp",
          version: "2.0",
          chainId: 1,
          verifyingContract: "0xabcdef1234567890abcdef1234567890abcdef12",
          salt: "0x1234",
        },
        types: {
          Test: [{ name: "value", type: "uint256" }],
        },
        primaryType: "Test",
        message: { value: "100" },
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.domain.name).toBe("TestDApp");
      expect(result.domain.version).toBe("2.0");
      expect(result.domain.chainId).toBe(1);
      expect(result.domain.verifyingContract).toBe(
        "0xabcdef1234567890abcdef1234567890abcdef12",
      );
      expect(result.domain.salt).toBe("0x1234");
    });

    it("should handle multiple type definitions", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana", version: "1" },
        types: {
          Person: [
            { name: "name", type: "string" },
            { name: "wallet", type: "address" },
          ],
          Mail: [
            { name: "from", type: "Person" },
            { name: "to", type: "Person" },
            { name: "contents", type: "string" },
          ],
        },
        primaryType: "Mail",
        message: {
          from: { name: "Alice", wallet: "0x1111..." },
          to: { name: "Bob", wallet: "0x2222..." },
          contents: "Hello",
        },
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.types.Person).toBeDefined();
      expect(result.types.Person).toHaveLength(2);
      expect(result.types.Mail).toBeDefined();
      expect(result.types.Mail).toHaveLength(3);
    });

    it("should convert all field types correctly", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana" },
        types: {
          AllTypes: [
            { name: "addressField", type: "address" },
            { name: "uint256Field", type: "uint256" },
            { name: "uint8Field", type: "uint8" },
            { name: "int256Field", type: "int256" },
            { name: "boolField", type: "bool" },
            { name: "bytes32Field", type: "bytes32" },
            { name: "bytesField", type: "bytes" },
            { name: "stringField", type: "string" },
          ],
        },
        primaryType: "AllTypes",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      const allTypes = result.types.AllTypes as readonly {
        name: string;
        type: string;
      }[];
      expect(allTypes[0]).toEqual({ name: "addressField", type: "address" });
      expect(allTypes[1]).toEqual({ name: "uint256Field", type: "uint256" });
      expect(allTypes[2]).toEqual({ name: "uint8Field", type: "uint8" });
      expect(allTypes[3]).toEqual({ name: "int256Field", type: "int256" });
      expect(allTypes[4]).toEqual({ name: "boolField", type: "bool" });
      expect(allTypes[5]).toEqual({ name: "bytes32Field", type: "bytes32" });
      expect(allTypes[6]).toEqual({ name: "bytesField", type: "bytes" });
      expect(allTypes[7]).toEqual({ name: "stringField", type: "string" });
    });

    it("should handle array types", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana" },
        types: {
          ArrayTest: [
            { name: "addresses", type: "address[]" },
            { name: "numbers", type: "uint256[]" },
            { name: "fixedArray", type: "bytes32[3]" },
          ],
        },
        primaryType: "ArrayTest",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      const arrayTypes = result.types.ArrayTest as readonly {
        name: string;
        type: string;
      }[];
      expect(arrayTypes[0].type).toBe("address[]");
      expect(arrayTypes[1].type).toBe("uint256[]");
      expect(arrayTypes[2].type).toBe("bytes32[3]");
    });

    it("should handle nested custom types", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana" },
        types: {
          Inner: [{ name: "value", type: "uint256" }],
          Outer: [
            { name: "inner", type: "Inner" },
            { name: "data", type: "string" },
          ],
        },
        primaryType: "Outer",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      const outerTypes = result.types.Outer as readonly {
        name: string;
        type: string;
      }[];
      expect(outerTypes[0].type).toBe("Inner");
      expect(result.types.Inner).toBeDefined();
    });

    it("should preserve message structure", () => {
      const complexMessage = {
        user: "0x1234567890123456789012345678901234567890",
        amount: "1000000000000000000",
        deadline: 1234567890,
        nested: {
          field1: "value1",
          field2: 42,
        },
        array: [1, 2, 3],
      };

      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana" },
        types: {
          Test: [{ name: "value", type: "string" }],
        },
        primaryType: "Test",
        message: complexMessage,
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.message).toEqual(complexMessage);
      // Note: The converter does not deep copy the message, it's passed by reference
      expect(result.message).toBe(complexMessage);
    });

    it("should handle empty types object", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana" },
        types: {},
        primaryType: "Empty",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.types).toEqual({});
    });

    it("should handle type with no fields", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana" },
        types: {
          Empty: [],
        },
        primaryType: "Empty",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.types.Empty).toBeDefined();
      expect(result.types.Empty).toHaveLength(0);
    });

    it("should handle minimal domain", () => {
      const vanaTypedData: GenericTypedData = {
        domain: {},
        types: {
          Test: [{ name: "value", type: "string" }],
        },
        primaryType: "Test",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.domain).toEqual({});
    });

    it("should create independent copies of type arrays", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana" },
        types: {
          Test: [
            { name: "field1", type: "string" },
            { name: "field2", type: "uint256" },
          ],
        },
        primaryType: "Test",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      // Modifying the original should not affect the result
      vanaTypedData.types.Test.push({ name: "field3", type: "address" });

      expect(result.types.Test).toHaveLength(2);
      expect(vanaTypedData.types.Test).toHaveLength(3);
    });

    it("should handle EIP-712 permission example", () => {
      const vanaTypedData: GenericTypedData = {
        domain: {
          name: "DataPortabilityPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract: "0x1234567890123456789012345678901234567890",
        },
        types: {
          PermissionGrant: [
            { name: "grantee", type: "address" },
            { name: "fileId", type: "uint256" },
            { name: "expiresAt", type: "uint256" },
            { name: "serverUrl", type: "string" },
          ],
        },
        primaryType: "PermissionGrant",
        message: {
          grantee: "0xabcdef1234567890abcdef1234567890abcdef12",
          fileId: "42",
          expiresAt: "1234567890",
          serverUrl: "https://example.com",
        },
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result).toMatchObject({
        domain: {
          name: "DataPortabilityPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract: "0x1234567890123456789012345678901234567890",
        },
        primaryType: "PermissionGrant",
        message: {
          grantee: "0xabcdef1234567890abcdef1234567890abcdef12",
          fileId: "42",
          expiresAt: "1234567890",
          serverUrl: "https://example.com",
        },
      });

      expect(result.types.PermissionGrant).toBeDefined();
      expect(result.types.PermissionGrant).toHaveLength(4);
    });

    it("should handle type names with special characters", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Test" },
        types: {
          "Type_With-Special.Chars": [{ name: "value", type: "uint256" }],
        },
        primaryType: "Type_With-Special.Chars",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.types["Type_With-Special.Chars"]).toBeDefined();
    });

    it("should handle field names with underscores", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Test" },
        types: {
          Test: [
            { name: "_privateField", type: "uint256" },
            { name: "public_field", type: "address" },
            { name: "__doubleUnderscore", type: "bool" },
          ],
        },
        primaryType: "Test",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      const testTypes = result.types.Test as readonly {
        name: string;
        type: string;
      }[];
      expect(testTypes[0].name).toBe("_privateField");
      expect(testTypes[1].name).toBe("public_field");
      expect(testTypes[2].name).toBe("__doubleUnderscore");
    });

    it("should be compatible with viem's TypedDataDefinition type", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana", version: "1", chainId: 14800 },
        types: {
          Test: [{ name: "value", type: "string" }],
        },
        primaryType: "Test",
        message: { value: "test" },
      };

      const result: TypedDataDefinition =
        toViemTypedDataDefinition(vanaTypedData);

      // If this compiles, type compatibility is verified
      expect(result).toBeDefined();
      expect(result.domain).toBeDefined();
      expect(result.types).toBeDefined();
      expect(result.message).toBeDefined();
    });

    it("should handle very long type definitions", () => {
      const fields = Array.from({ length: 50 }, (_, i) => ({
        name: `field${i}`,
        type: i % 2 === 0 ? "uint256" : "string",
      }));

      const vanaTypedData: GenericTypedData = {
        domain: { name: "Test" },
        types: {
          LargeType: fields,
        },
        primaryType: "LargeType",
        message: {},
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.types.LargeType).toHaveLength(50);
    });

    it("should handle unicode in string values", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Vana 🚀" },
        types: {
          Test: [{ name: "message", type: "string" }],
        },
        primaryType: "Test",
        message: { message: "Hello 世界! 🌍" },
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.domain.name).toBe("Vana 🚀");
      expect(result.message.message).toBe("Hello 世界! 🌍");
    });

    it("should preserve numeric types in message", () => {
      const vanaTypedData: GenericTypedData = {
        domain: { name: "Test" },
        types: {
          Numbers: [
            { name: "bigNumber", type: "uint256" },
            { name: "smallNumber", type: "uint8" },
          ],
        },
        primaryType: "Numbers",
        message: {
          bigNumber: 999999999999999999n,
          smallNumber: 255,
        },
      };

      const result = toViemTypedDataDefinition(vanaTypedData);

      expect(result.message.bigNumber).toBe(999999999999999999n);
      expect(result.message.smallNumber).toBe(255);
    });
  });
});
