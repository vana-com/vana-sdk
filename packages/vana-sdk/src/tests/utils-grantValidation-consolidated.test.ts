import { describe, it, expect } from "vitest";
import {
  validateGrant,
  GrantSchemaError,
  GrantExpiredError,
  GranteeMismatchError,
  OperationNotAllowedError,
  FileAccessDeniedError,
} from "../utils/grantValidation";

describe("validateGrant (Consolidated Validation)", () => {
  const validGrantFile = {
    grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    operation: "llm_inference",
    files: [1, 2, 3],
    parameters: { prompt: "test" },
    expires: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  describe("Schema Validation", () => {
    it("should validate a correct grant file (default behavior)", () => {
      const result = validateGrant(validGrantFile);
      expect(result).toEqual(validGrantFile);
    });

    it("should throw GrantSchemaError for invalid schema", () => {
      const invalidGrant = {
        // Missing required 'grantee' field
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: {},
      };

      expect(() => validateGrant(invalidGrant)).toThrow(GrantSchemaError);
    });

    it("should return validation result when throwOnError is false", () => {
      const invalidGrant = { operation: "test" }; // Missing required fields

      const result = validateGrant(invalidGrant, { throwOnError: false });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("schema");
      expect(result.errors[0].error).toBeInstanceOf(GrantSchemaError);
    });

    it("should skip schema validation when schema: false", () => {
      const invalidGrant = { operation: "test" }; // Would fail schema validation

      const result = validateGrant(invalidGrant, {
        schema: false,
        throwOnError: false,
      });

      expect(result.valid).toBe(true);
      expect(result.grant).toEqual(invalidGrant);
    });
  });

  describe("Business Logic Validation", () => {
    it("should validate grantee access", () => {
      const result = validateGrant(validGrantFile, {
        grantee: "0x1234567890123456789012345678901234567890",
      });

      expect(result).toEqual(validGrantFile);
    });

    it("should throw GranteeMismatchError for wrong grantee", () => {
      expect(() =>
        validateGrant(validGrantFile, {
          grantee: "0x9999999999999999999999999999999999999999",
        }),
      ).toThrow(GranteeMismatchError);
    });

    it("should validate operation access", () => {
      const result = validateGrant(validGrantFile, {
        operation: "llm_inference",
      });

      expect(result).toEqual(validGrantFile);
    });

    it("should throw OperationNotAllowedError for wrong operation", () => {
      expect(() =>
        validateGrant(validGrantFile, {
          operation: "data_analysis",
        }),
      ).toThrow(OperationNotAllowedError);
    });

    it("should validate file access", () => {
      const result = validateGrant(validGrantFile, {
        files: [1, 2],
      });

      expect(result).toEqual(validGrantFile);
    });

    it("should throw FileAccessDeniedError for unauthorized files", () => {
      expect(() =>
        validateGrant(validGrantFile, {
          files: [1, 2, 4], // 4 is not in the grant
        }),
      ).toThrow(FileAccessDeniedError);
    });

    it("should validate expiry with current time", () => {
      const result = validateGrant(validGrantFile);
      expect(result).toEqual(validGrantFile);
    });

    it("should throw GrantExpiredError for expired grant", () => {
      const expiredGrant = {
        ...validGrantFile,
        expires: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      expect(() => validateGrant(expiredGrant)).toThrow(GrantExpiredError);
    });

    it("should allow custom currentTime for testing", () => {
      const futureTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now

      expect(() =>
        validateGrant(validGrantFile, {
          currentTime: futureTime, // This should make the grant appear expired
        }),
      ).toThrow(GrantExpiredError);
    });

    it("should handle grants without expiry", () => {
      const noExpiryGrant = { ...validGrantFile };
      delete (noExpiryGrant as any).expires;

      const result = validateGrant(noExpiryGrant);
      expect(result.expires).toBeUndefined();
    });
  });

  describe("Combined Validation", () => {
    it("should validate all business rules together", () => {
      const result = validateGrant(validGrantFile, {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        files: [1, 2],
      });

      expect(result).toEqual(validGrantFile);
    });

    it("should return multiple errors when throwOnError is false", () => {
      const result = validateGrant(validGrantFile, {
        grantee: "0x9999999999999999999999999999999999999999", // Wrong grantee
        operation: "wrong_operation", // Wrong operation
        files: [1, 2, 99], // Invalid file
        throwOnError: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);

      const errorTypes = result.errors.map((e) => e.error?.constructor.name);
      expect(errorTypes).toContain("GranteeMismatchError");
      expect(errorTypes).toContain("OperationNotAllowedError");
      expect(errorTypes).toContain("FileAccessDeniedError");
    });

    it("should throw first error encountered when throwOnError is true", () => {
      expect(() =>
        validateGrant(validGrantFile, {
          grantee: "0x9999999999999999999999999999999999999999", // This will be first error
          operation: "wrong_operation",
        }),
      ).toThrow(GranteeMismatchError);
    });
  });

  describe("TypeScript Overloads", () => {
    it("should return GrantFile when throwOnError is true (default)", () => {
      const result = validateGrant(validGrantFile);

      // TypeScript should infer this as GrantFile
      expect(result.grantee).toBe(validGrantFile.grantee);
      expect(result.operation).toBe(validGrantFile.operation);
    });

    it("should return GrantValidationResult when throwOnError is false", () => {
      const result = validateGrant(validGrantFile, { throwOnError: false });

      // TypeScript should infer this as GrantValidationResult
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.grant).toEqual(validGrantFile);
    });
  });

  describe("Error Details", () => {
    it("should provide detailed error information", () => {
      const expiredGrant = {
        ...validGrantFile,
        expires: 1000000, // Very old timestamp
      };

      try {
        validateGrant(expiredGrant);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GrantExpiredError);
        const grantExpiredError = error as GrantExpiredError;
        expect(grantExpiredError.expires).toBe(1000000);
        expect(grantExpiredError.currentTime).toBeGreaterThan(1000000);
      }
    });

    it("should provide field information in validation results", () => {
      const result = validateGrant(validGrantFile, {
        grantee: "0x9999999999999999999999999999999999999999",
        throwOnError: false,
      });

      expect(result.errors[0].field).toBe("grantee");
      expect(result.errors[0].type).toBe("business");
    });
  });

  describe("Performance Options", () => {
    it("should allow skipping schema validation for trusted data", () => {
      const trustedData = validGrantFile;

      const result = validateGrant(trustedData, {
        schema: false,
        grantee: "0x1234567890123456789012345678901234567890",
      });

      expect(result).toEqual(trustedData);
    });
  });
});
