/**
 * Tests for type guard utility functions
 */

import { describe, it, expect } from "vitest";
import {
  isDefined,
  assertDefined,
  isNonEmptyString,
  assertNonEmptyString,
  isObject,
  isArray,
  hasProperty,
  assertHasProperties,
  ensureError,
  safeGet,
  safeArrayAccess,
  ensureDefault,
} from "../typeGuards";

describe("typeGuards", () => {
  describe("isDefined", () => {
    it("should return true for non-null, non-undefined values", () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined("")).toBe(true);
      expect(isDefined("hello")).toBe(true);
      expect(isDefined(123)).toBe(true);
      expect(isDefined({})).toBe(true);
      expect(isDefined([])).toBe(true);
    });

    it("should return false for undefined", () => {
      expect(isDefined(undefined)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isDefined(null)).toBe(false);
    });

    it("should work with generic types", () => {
      const value: string | undefined = "test";
      if (isDefined(value)) {
        // TypeScript should narrow type to string
        expect(typeof value).toBe("string");
      }
    });

    it("should filter arrays correctly", () => {
      const values = [1, undefined, 3, null, 5, 0, false, ""];
      const defined = values.filter(isDefined);
      expect(defined).toEqual([1, 3, 5, 0, false, ""]);
    });
  });

  describe("assertDefined", () => {
    it("should not throw for defined values", () => {
      expect(() => {
        assertDefined(0, "Should be defined");
      }).not.toThrow();

      expect(() => {
        assertDefined(false, "Should be defined");
      }).not.toThrow();

      expect(() => {
        assertDefined("", "Should be defined");
      }).not.toThrow();

      expect(() => {
        assertDefined({}, "Should be defined");
      }).not.toThrow();
    });

    it("should throw for undefined with custom message", () => {
      expect(() => {
        assertDefined(undefined, "Value must be defined");
      }).toThrow("Value must be defined");
    });

    it("should throw for null with custom message", () => {
      expect(() => {
        assertDefined(null, "Value cannot be null");
      }).toThrow("Value cannot be null");
    });

    it("should throw Error instance", () => {
      expect(() => {
        assertDefined(undefined, "Test error");
      }).toThrow(Error);
    });

    it("should narrow type after assertion", () => {
      const value: string | undefined = "test";
      assertDefined(value, "Must be defined");
      // TypeScript should know this is safe now
      expect(value.length).toBe(4);
    });
  });

  describe("isNonEmptyString", () => {
    it("should return true for non-empty strings", () => {
      expect(isNonEmptyString("hello")).toBe(true);
      expect(isNonEmptyString("a")).toBe(true);
      expect(isNonEmptyString("test string")).toBe(true);
    });

    it("should return false for empty strings", () => {
      expect(isNonEmptyString("")).toBe(false);
    });

    it("should return false for whitespace-only strings", () => {
      expect(isNonEmptyString(" ")).toBe(false);
      expect(isNonEmptyString("  ")).toBe(false);
      expect(isNonEmptyString("\t")).toBe(false);
      expect(isNonEmptyString("\n")).toBe(false);
      expect(isNonEmptyString("  \t  ")).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString(0)).toBe(false);
      expect(isNonEmptyString(true)).toBe(false);
      expect(isNonEmptyString(false)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
    });

    it("should return true for strings with leading/trailing whitespace", () => {
      expect(isNonEmptyString("  hello  ")).toBe(true);
      expect(isNonEmptyString("\thello\n")).toBe(true);
    });
  });

  describe("assertNonEmptyString", () => {
    it("should not throw for non-empty strings", () => {
      expect(() => {
        assertNonEmptyString("hello", "Must be non-empty string");
      }).not.toThrow();

      expect(() => {
        assertNonEmptyString("a", "Must be non-empty string");
      }).not.toThrow();
    });

    it("should throw for empty strings", () => {
      expect(() => {
        assertNonEmptyString("", "Custom error message");
      }).toThrow("Custom error message");
    });

    it("should throw for whitespace-only strings", () => {
      expect(() => {
        assertNonEmptyString("  ", "Custom error message");
      }).toThrow("Custom error message");

      expect(() => {
        assertNonEmptyString("\t\n", "Custom error message");
      }).toThrow("Custom error message");
    });

    it("should throw for non-string values", () => {
      expect(() => {
        assertNonEmptyString(null, "Not a string");
      }).toThrow("Not a string");

      expect(() => {
        assertNonEmptyString(123, "Not a string");
      }).toThrow("Not a string");

      expect(() => {
        assertNonEmptyString({}, "Not a string");
      }).toThrow("Not a string");
    });

    it("should throw Error instance", () => {
      expect(() => {
        assertNonEmptyString(null, "Test error");
      }).toThrow(Error);
    });

    it("should narrow type after assertion", () => {
      const value: unknown = "test";
      assertNonEmptyString(value, "Must be non-empty string");
      // TypeScript should know this is safe now
      expect(value.length).toBe(4);
    });
  });

  describe("isObject", () => {
    it("should return true for plain objects", () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: "value" })).toBe(true);
      expect(isObject({ nested: { key: "value" } })).toBe(true);
    });

    it("should return true for object instances", () => {
      expect(isObject(new Object())).toBe(true);
      expect(isObject(new Date())).toBe(true);
      expect(isObject(new Error("test"))).toBe(true);
      expect(isObject(/regex/)).toBe(true);
    });

    it("should return true for arrays", () => {
      expect(isObject([])).toBe(true);
      expect(isObject([1, 2, 3])).toBe(true);
    });

    it("should return false for null", () => {
      expect(isObject(null)).toBe(false);
    });

    it("should return false for primitives", () => {
      expect(isObject(undefined)).toBe(false);
      expect(isObject("string")).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(false)).toBe(false);
    });

    it("should return false for functions", () => {
      expect(isObject(() => {})).toBe(false);
      expect(isObject(function () {})).toBe(false);
    });
  });

  describe("isArray", () => {
    it("should return true for arrays", () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(["a", "b", "c"])).toBe(true);
      expect(isArray([{ key: "value" }])).toBe(true);
    });

    it("should return false for non-arrays", () => {
      expect(isArray(null)).toBe(false);
      expect(isArray(undefined)).toBe(false);
      expect(isArray("string")).toBe(false);
      expect(isArray(123)).toBe(false);
      expect(isArray(true)).toBe(false);
      expect(isArray(false)).toBe(false);
      expect(isArray({})).toBe(false);
      expect(isArray(() => {})).toBe(false);
    });

    it("should work with generic type parameter", () => {
      const value: unknown = [1, 2, 3];
      if (isArray<number>(value)) {
        expect(value[0]).toBe(1);
      }
    });

    it("should distinguish arrays from array-like objects", () => {
      const arrayLike = { 0: "a", 1: "b", length: 2 };
      expect(isArray(arrayLike)).toBe(false);
    });
  });

  describe("hasProperty", () => {
    it("should return true for existing properties", () => {
      const obj = { key: "value", nested: { inner: "data" } };

      expect(hasProperty(obj, "key")).toBe(true);
      expect(hasProperty(obj, "nested")).toBe(true);
    });

    it("should return false for missing properties", () => {
      const obj = { key: "value" };

      expect(hasProperty(obj, "missing")).toBe(false);
      expect(hasProperty(obj, "other")).toBe(false);
    });

    it("should return false for non-objects", () => {
      expect(hasProperty(null, "prop")).toBe(false);
      expect(hasProperty(undefined, "prop")).toBe(false);
      expect(hasProperty("string", "prop")).toBe(false);
      expect(hasProperty(123, "prop")).toBe(false);
      expect(hasProperty([], "prop")).toBe(false);
    });

    it("should work with nested objects", () => {
      const obj = { user: { name: "John", address: { city: "NYC" } } };

      expect(hasProperty(obj, "user")).toBe(true);
      expect(hasProperty(obj.user, "name")).toBe(true);
      if (hasProperty(obj, "user") && hasProperty(obj.user, "address")) {
        expect(hasProperty(obj.user.address, "city")).toBe(true);
      }
    });

    it("should handle properties with falsy values", () => {
      const obj = { zero: 0, empty: "", falsy: false, nullVal: null };

      expect(hasProperty(obj, "zero")).toBe(true);
      expect(hasProperty(obj, "empty")).toBe(true);
      expect(hasProperty(obj, "falsy")).toBe(true);
      expect(hasProperty(obj, "nullVal")).toBe(true);
    });

    it("should distinguish between own and inherited properties", () => {
      const parent = { inherited: "value" };
      const child = Object.create(parent);
      child.own = "own value";

      expect(hasProperty(child, "own")).toBe(true);
      expect(hasProperty(child, "inherited")).toBe(true);
    });

    it("should narrow type after check", () => {
      const value: unknown = { error: "Something went wrong" };

      if (hasProperty(value, "error")) {
        // TypeScript should narrow type to { error: unknown }
        expect(value.error).toBe("Something went wrong");
      }
    });
  });

  describe("assertHasProperties", () => {
    it("should not throw when all properties exist", () => {
      const obj = { id: 1, name: "John", email: "john@example.com" };

      expect(() => {
        assertHasProperties(obj, ["id", "name", "email"], "Invalid object");
      }).not.toThrow();
    });

    it("should not throw for single property", () => {
      const obj = { id: 1 };

      expect(() => {
        assertHasProperties(obj, ["id"], "Missing id");
      }).not.toThrow();
    });

    it("should not throw for empty properties array", () => {
      const obj = { key: "value" };

      expect(() => {
        assertHasProperties(obj, [], "Invalid object");
      }).not.toThrow();
    });

    it("should throw when object is not an object", () => {
      expect(() => {
        assertHasProperties(null, ["prop"], "Must be object");
      }).toThrow("Must be object: Value is not an object");

      expect(() => {
        assertHasProperties("string", ["prop"], "Must be object");
      }).toThrow("Must be object: Value is not an object");

      expect(() => {
        assertHasProperties(123, ["prop"], "Must be object");
      }).toThrow("Must be object: Value is not an object");
    });

    it("should throw when required property is missing", () => {
      const obj = { id: 1, name: "John" };

      expect(() => {
        assertHasProperties(obj, ["id", "email"], "Invalid user");
      }).toThrow("Invalid user: Missing required property 'email'");
    });

    it("should throw for first missing property only", () => {
      const obj = { id: 1 };

      expect(() => {
        assertHasProperties(obj, ["name", "email"], "Invalid");
      }).toThrow("Invalid: Missing required property 'name'");
    });

    it("should handle properties with falsy values", () => {
      const obj = { zero: 0, empty: "", falsy: false };

      expect(() => {
        assertHasProperties(obj, ["zero", "empty", "falsy"], "Invalid");
      }).not.toThrow();
    });

    it("should throw Error instance", () => {
      expect(() => {
        assertHasProperties({}, ["prop"], "Error message");
      }).toThrow(Error);
    });

    it("should narrow type after assertion", () => {
      const value: unknown = { id: 1, name: "John" };
      assertHasProperties(value, ["id", "name"], "Invalid");
      // TypeScript should narrow to Record<string, unknown> with properties
      expect(value.id).toBe(1);
      expect(value.name).toBe("John");
    });
  });

  describe("ensureError", () => {
    it("should return Error objects as-is", () => {
      const error = new Error("Test error");
      const result = ensureError(error, "Fallback");

      expect(result).toBe(error);
      expect(result.message).toBe("Test error");
    });

    it("should convert strings to Error", () => {
      const result = ensureError("Error message", "Fallback");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Error message");
    });

    it("should extract message from error-like objects", () => {
      const errorLike = { message: "Extracted message" };
      const result = ensureError(errorLike, "Fallback");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Extracted message");
    });

    it("should use fallback for unknown error types", () => {
      const result = ensureError(42, "Fallback message");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Fallback message");
    });

    it("should use fallback for null", () => {
      const result = ensureError(null, "Null fallback");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Null fallback");
    });

    it("should use fallback for undefined", () => {
      const result = ensureError(undefined, "Undefined fallback");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Undefined fallback");
    });

    it("should use fallback for objects without message", () => {
      const result = ensureError({ data: "no message" }, "Fallback");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Fallback");
    });

    it("should use fallback for objects with non-string message", () => {
      const result = ensureError({ message: 123 }, "Fallback");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Fallback");
    });

    it("should work with TypeError", () => {
      const error = new TypeError("Type error");
      const result = ensureError(error, "Fallback");

      expect(result).toBe(error);
      expect(result.message).toBe("Type error");
    });

    it("should work with custom Error subclasses", () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "CustomError";
        }
      }

      const error = new CustomError("Custom message");
      const result = ensureError(error, "Fallback");

      expect(result).toBe(error);
      expect(result.message).toBe("Custom message");
    });

    it("should handle empty strings", () => {
      const result = ensureError("", "Fallback");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("");
    });

    it("should handle arrays as unknown type", () => {
      const result = ensureError([1, 2, 3], "Array fallback");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Array fallback");
    });
  });

  describe("safeGet", () => {
    it("should get existing properties from objects", () => {
      const obj = { id: 1, name: "John", email: "john@example.com" };

      expect(safeGet(obj, "id")).toBe(1);
      expect(safeGet(obj, "name")).toBe("John");
      expect(safeGet(obj, "email")).toBe("john@example.com");
    });

    it("should return undefined for missing properties", () => {
      const obj = { id: 1 };

      expect(safeGet(obj, "name" as keyof typeof obj)).toBeUndefined();
    });

    it("should return undefined for null objects", () => {
      expect(safeGet(null as any, "prop" as any)).toBeUndefined();
    });

    it("should return undefined for undefined objects", () => {
      expect(safeGet(undefined as any, "prop" as any)).toBeUndefined();
    });

    it("should work with falsy property values", () => {
      const obj = { zero: 0, empty: "", falsy: false, nullVal: null };

      expect(safeGet(obj, "zero")).toBe(0);
      expect(safeGet(obj, "empty")).toBe("");
      expect(safeGet(obj, "falsy")).toBe(false);
      expect(safeGet(obj, "nullVal")).toBeNull();
    });

    it("should handle nested object access", () => {
      const config = { wallet: { address: "0x123", balance: 100 } };

      expect(safeGet(config, "wallet")).toEqual({
        address: "0x123",
        balance: 100,
      });
    });

    it("should safely chain access with optional chaining", () => {
      const config = { wallet: { address: "0x123" } };

      const address = safeGet(config, "wallet")?.address;
      expect(address).toBe("0x123");
    });

    it("should handle undefined safe access", () => {
      const config: { wallet?: { address: string } } = {};

      const wallet = safeGet(config, "wallet");
      expect(wallet).toBeUndefined();
    });
  });

  describe("safeArrayAccess", () => {
    it("should access valid array indices", () => {
      const arr = [10, 20, 30, 40, 50];

      expect(safeArrayAccess(arr, 0)).toBe(10);
      expect(safeArrayAccess(arr, 2)).toBe(30);
      expect(safeArrayAccess(arr, 4)).toBe(50);
    });

    it("should return undefined for out-of-bounds indices", () => {
      const arr = [10, 20, 30];

      expect(safeArrayAccess(arr, 5)).toBeUndefined();
      expect(safeArrayAccess(arr, 100)).toBeUndefined();
    });

    it("should return undefined for negative indices", () => {
      const arr = [10, 20, 30];

      expect(safeArrayAccess(arr, -1)).toBeUndefined();
      expect(safeArrayAccess(arr, -10)).toBeUndefined();
    });

    it("should return undefined for null array", () => {
      expect(safeArrayAccess(null as any, 0)).toBeUndefined();
    });

    it("should return undefined for undefined array", () => {
      expect(safeArrayAccess(undefined as any, 0)).toBeUndefined();
    });

    it("should work with arrays containing falsy values", () => {
      const arr = [0, false, "", null, undefined];

      expect(safeArrayAccess(arr, 0)).toBe(0);
      expect(safeArrayAccess(arr, 1)).toBe(false);
      expect(safeArrayAccess(arr, 2)).toBe("");
      expect(safeArrayAccess(arr, 3)).toBeNull();
      expect(safeArrayAccess(arr, 4)).toBeUndefined();
    });

    it("should work with arrays of objects", () => {
      const items = [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 3, name: "Item 3" },
      ];

      expect(safeArrayAccess(items, 0)).toEqual({ id: 1, name: "Item 1" });
      expect(safeArrayAccess(items, 2)).toEqual({ id: 3, name: "Item 3" });
      expect(safeArrayAccess(items, 5)).toBeUndefined();
    });

    it("should handle empty arrays", () => {
      const arr: number[] = [];

      expect(safeArrayAccess(arr, 0)).toBeUndefined();
      expect(safeArrayAccess(arr, 1)).toBeUndefined();
    });

    it("should handle index 0 on non-empty array", () => {
      const arr = ["first"];

      expect(safeArrayAccess(arr, 0)).toBe("first");
    });

    it("should work with sparse arrays", () => {
      const arr: (number | undefined)[] = [];
      arr[5] = 100;

      expect(safeArrayAccess(arr, 5)).toBe(100);
      expect(safeArrayAccess(arr, 0)).toBeUndefined();
      expect(safeArrayAccess(arr, 3)).toBeUndefined();
    });
  });

  describe("ensureDefault", () => {
    it("should return value when defined", () => {
      expect(ensureDefault("hello", "default")).toBe("hello");
      expect(ensureDefault(123, 456)).toBe(123);
      expect(ensureDefault(true, false)).toBe(true);
      expect(ensureDefault({}, { default: "value" })).toEqual({});
    });

    it("should return default when value is undefined", () => {
      expect(ensureDefault(undefined, "default")).toBe("default");
      expect(ensureDefault(undefined, 999)).toBe(999);
    });

    it("should return default when value is null", () => {
      expect(ensureDefault(null, "default")).toBe("default");
      expect(ensureDefault(null, 0)).toBe(0);
    });

    it("should return value for falsy but defined values", () => {
      expect(ensureDefault(0, 99)).toBe(0);
      expect(ensureDefault(false, true)).toBe(false);
      expect(ensureDefault("", "default")).toBe("");
      expect(ensureDefault([], ["default"])).toEqual([]);
    });

    it("should work with objects as values", () => {
      const value = { id: 1, name: "Test" };
      const defaultValue = { id: 999 };

      expect(ensureDefault(value, defaultValue)).toBe(value);
      expect(ensureDefault(null, defaultValue)).toBe(defaultValue);
    });

    it("should handle timeout configuration", () => {
      const timeout = ensureDefault(undefined, 5000);
      expect(timeout).toBe(5000);

      const customTimeout = ensureDefault(3000, 5000);
      expect(customTimeout).toBe(3000);
    });

    it("should preserve undefined in arrays/objects", () => {
      const defaultArray = [1, 2, 3];
      expect(ensureDefault(null, defaultArray)).toEqual([1, 2, 3]);

      const defaultObj = { key: "value" };
      expect(ensureDefault(undefined, defaultObj)).toEqual({ key: "value" });
    });

    it("should work with function return values", () => {
      const getValue = (): string | undefined => undefined;
      const value = getValue();
      const result = ensureDefault(value, "fallback");
      expect(result).toBe("fallback");
    });

    it("should work with zero as default", () => {
      expect(ensureDefault(null, 0)).toBe(0);
      expect(ensureDefault(undefined, 0)).toBe(0);
    });

    it("should work with false as default", () => {
      expect(ensureDefault(null, false)).toBe(false);
      expect(ensureDefault(undefined, false)).toBe(false);
    });

    it("should work with empty string as default", () => {
      expect(ensureDefault(null, "")).toBe("");
      expect(ensureDefault(undefined, "")).toBe("");
    });
  });

  describe("integration tests", () => {
    it("should compose multiple guards for validation", () => {
      const validateUser = (user: unknown) => {
        if (!isObject(user)) return false;
        if (!hasProperty(user, "id")) return false;
        if (!hasProperty(user, "name")) return false;
        return true;
      };

      expect(validateUser({ id: 1, name: "John" })).toBe(true);
      expect(validateUser({ id: 1 })).toBe(false);
      expect(validateUser(null)).toBe(false);
    });

    it("should handle nullable configuration objects", () => {
      const getConfigValue = (
        config: { timeout?: number } | null | undefined,
      ) => {
        if (!isObject(config)) {
          return 5000;
        }
        const timeout = safeGet(config, "timeout");
        return ensureDefault(timeout, 5000);
      };

      expect(getConfigValue(null)).toBe(5000);
      expect(getConfigValue(undefined)).toBe(5000);
      expect(getConfigValue({ timeout: 3000 })).toBe(3000);
      expect(getConfigValue({})).toBe(5000);
    });

    it("should validate and extract error messages safely", () => {
      const handleError = (error: unknown) => {
        const errorObj = ensureError(error, "Unknown error");
        return isNonEmptyString(errorObj.message)
          ? errorObj.message
          : "No error message";
      };

      expect(handleError(new Error("Test"))).toBe("Test");
      expect(handleError("String error")).toBe("String error");
      expect(handleError({ message: "Object error" })).toBe("Object error");
      expect(handleError(null)).toBe("Unknown error");
      // Empty string message gets extracted but fails isNonEmptyString
      expect(handleError({ message: "" })).toBe("No error message");
    });

    it("should safely access nested array data", () => {
      const users = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Charlie" },
      ];

      const firstUser = safeArrayAccess(users, 0);
      if (isDefined(firstUser) && hasProperty(firstUser, "name")) {
        expect(firstUser.name).toBe("Alice");
      }

      expect(safeArrayAccess(users, 10)).toBeUndefined();
      expect(safeArrayAccess(null as any, 0)).toBeUndefined();
    });

    it("should build safe data access chains", () => {
      const response = {
        status: 200,
        data: {
          items: [
            { id: 1, value: "first" },
            { id: 2, value: "second" },
          ],
        },
      };

      const items = safeGet(response, "data")?.items;
      const firstItem = isDefined(items)
        ? safeArrayAccess(items, 0)
        : undefined;
      const firstValue = isDefined(firstItem)
        ? safeGet(firstItem, "value")
        : undefined;

      expect(firstValue).toBe("first");
    });
  });
});
