/**
 * Tests for grant validation utilities
 *
 * @remarks
 * Tests comprehensive validation of permission grant files including schema validation,
 * business rule checking, expiration verification, and access control.
 */

import { describe, it, expect, vi } from "vitest";
import {
  validateGrant,
  validateGranteeAccess,
  validateGrantExpiry,
  validateOperationAccess,
  GrantValidationError,
  GrantExpiredError,
  GranteeMismatchError,
  OperationNotAllowedError,
  GrantSchemaError,
} from "../grantValidation";
import type { GrantFile } from "../../types/permissions";

// Mock the grant file schema
vi.mock("../../schemas/grantFile.schema.json", () => ({
  default: {
    type: "object",
    required: ["grantee", "operation", "parameters"],
    properties: {
      grantee: { type: "string" },
      operation: { type: "string" },
      parameters: { type: "object" },
      expires: { type: "number" },
    },
  },
}));

describe("grantValidation", () => {
  const validGrantFile: GrantFile = {
    grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    operation: "llm_inference",
    parameters: { model: "gpt-4" },
    expires: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  describe("Error Classes", () => {
    describe("GrantValidationError", () => {
      it("should create error with message and details", () => {
        const details = { field: "test" };
        const error = new GrantValidationError("Test error", details);

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("GrantValidationError");
        expect(error.message).toBe("Test error");
        expect(error.details).toEqual(details);
      });

      it("should create error without details", () => {
        const error = new GrantValidationError("Test error");

        expect(error.details).toBeUndefined();
      });
    });

    describe("GrantExpiredError", () => {
      it("should create error with expiry details", () => {
        const expires = 1000;
        const currentTime = 2000;
        const error = new GrantExpiredError(
          "Grant expired",
          expires,
          currentTime,
        );

        expect(error).toBeInstanceOf(GrantValidationError);
        expect(error.name).toBe("GrantExpiredError");
        expect(error.message).toBe("Grant expired");
        expect(error.expires).toBe(expires);
        expect(error.currentTime).toBe(currentTime);
        expect(error.details).toEqual({ expires, currentTime });
      });
    });

    describe("GranteeMismatchError", () => {
      it("should create error with address details", () => {
        const grantee =
          "0x1111111111111111111111111111111111111111" as `0x${string}`;
        const requesting =
          "0x2222222222222222222222222222222222222222" as `0x${string}`;
        const error = new GranteeMismatchError(
          "Address mismatch",
          grantee,
          requesting,
        );

        expect(error).toBeInstanceOf(GrantValidationError);
        expect(error.name).toBe("GranteeMismatchError");
        expect(error.grantee).toBe(grantee);
        expect(error.requestingAddress).toBe(requesting);
        expect(error.details).toEqual({
          grantee,
          requestingAddress: requesting,
        });
      });
    });

    describe("OperationNotAllowedError", () => {
      it("should create error with operation details", () => {
        const granted = "read";
        const requested = "write";
        const error = new OperationNotAllowedError(
          "Operation not allowed",
          granted,
          requested,
        );

        expect(error).toBeInstanceOf(GrantValidationError);
        expect(error.name).toBe("OperationNotAllowedError");
        expect(error.grantedOperation).toBe(granted);
        expect(error.requestedOperation).toBe(requested);
        expect(error.details).toEqual({
          grantedOperation: granted,
          requestedOperation: requested,
        });
      });
    });

    describe("GrantSchemaError", () => {
      it("should create error with schema validation details", () => {
        const schemaErrors = [{ field: "grantee", message: "required" }];
        const invalidData = { operation: "test" };
        const error = new GrantSchemaError(
          "Schema error",
          schemaErrors,
          invalidData,
        );

        expect(error).toBeInstanceOf(GrantValidationError);
        expect(error.name).toBe("GrantSchemaError");
        expect(error.schemaErrors).toEqual(schemaErrors);
        expect(error.invalidData).toEqual(invalidData);
        expect(error.details).toEqual({
          errors: schemaErrors,
          data: invalidData,
        });
      });
    });
  });

  describe("validateGrant", () => {
    describe("Schema Validation", () => {
      it("should validate valid grant file", () => {
        const result = validateGrant(validGrantFile);

        expect(result).toEqual(validGrantFile);
      });

      it("should throw on missing required fields", () => {
        const invalidGrant = {
          operation: "test",
          parameters: {},
          // missing grantee
        };

        expect(() => validateGrant(invalidGrant)).toThrow(GrantValidationError);
      });

      it("should throw on invalid field types", () => {
        const invalidGrant = {
          grantee: 123, // should be string
          operation: "test",
          parameters: {},
        };

        expect(() => validateGrant(invalidGrant)).toThrow(GrantValidationError);
      });

      it("should skip schema validation when disabled", () => {
        const invalidGrant = { invalid: "data" };

        const result = validateGrant(invalidGrant, { schema: false });

        expect(result).toEqual(invalidGrant);
      });
    });

    describe("Business Rule Validation", () => {
      it("should validate grantee access", () => {
        const result = validateGrant(validGrantFile, {
          grantee: validGrantFile.grantee,
        });

        expect(result).toEqual(validGrantFile);
      });

      it("should throw on grantee mismatch", () => {
        const wrongAddress =
          "0x9999999999999999999999999999999999999999" as `0x${string}`;

        expect(() =>
          validateGrant(validGrantFile, { grantee: wrongAddress }),
        ).toThrow(GranteeMismatchError);
      });

      it("should validate grant expiry", () => {
        const futureTime = Math.floor(Date.now() / 1000) - 100;

        const result = validateGrant(validGrantFile, {
          currentTime: futureTime,
        });

        expect(result).toEqual(validGrantFile);
      });

      it("should throw on expired grant", () => {
        const pastGrant = {
          ...validGrantFile,
          expires: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        };

        expect(() => validateGrant(pastGrant)).toThrow(GrantExpiredError);
      });

      it("should validate operation access", () => {
        const result = validateGrant(validGrantFile, {
          operation: validGrantFile.operation,
        });

        expect(result).toEqual(validGrantFile);
      });

      it("should throw on operation mismatch", () => {
        expect(() =>
          validateGrant(validGrantFile, { operation: "different_operation" }),
        ).toThrow(OperationNotAllowedError);
      });

      it("should validate all business rules together", () => {
        const result = validateGrant(validGrantFile, {
          grantee: validGrantFile.grantee,
          operation: validGrantFile.operation,
          currentTime: Math.floor(Date.now() / 1000),
        });

        expect(result).toEqual(validGrantFile);
      });
    });

    describe("Throwing vs Non-Throwing Mode", () => {
      it("should throw error in throwing mode (default)", () => {
        const invalidGrant = { invalid: "data" };

        expect(() => validateGrant(invalidGrant)).toThrow();
      });

      it("should return result in non-throwing mode", () => {
        const invalidGrant = { invalid: "data" };

        const result = validateGrant(invalidGrant, { throwOnError: false });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe("schema");
      });

      it("should return valid result for valid grant", () => {
        const result = validateGrant(validGrantFile, { throwOnError: false });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.grant).toEqual(validGrantFile);
      });

      it("should include all validation errors in non-throwing mode", () => {
        const expiredGrant = {
          ...validGrantFile,
          expires: Math.floor(Date.now() / 1000) - 3600,
        };

        const result = validateGrant(expiredGrant, {
          grantee:
            "0x9999999999999999999999999999999999999999" as `0x${string}`,
          operation: "wrong_operation",
          throwOnError: false,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors.some((e) => e.field === "expires")).toBe(true);
        expect(result.errors.some((e) => e.field === "grantee")).toBe(true);
        expect(result.errors.some((e) => e.field === "operation")).toBe(true);
      });
    });

    describe("Edge Cases", () => {
      it("should handle grant without expiry", () => {
        const noExpiryGrant = {
          grantee: validGrantFile.grantee,
          operation: validGrantFile.operation,
          parameters: {},
        };

        const result = validateGrant(noExpiryGrant);

        expect(result).toEqual(noExpiryGrant);
      });

      it("should handle grant with zero expiry as no expiration", () => {
        const zeroExpiryGrant = {
          ...validGrantFile,
          expires: 0,
        };

        // expires: 0 is falsy, treated as no expiration
        expect(() => validateGrant(zeroExpiryGrant)).not.toThrow();
      });

      it("should handle grant expiring exactly now", () => {
        const now = Math.floor(Date.now() / 1000);
        const expiringNowGrant = {
          ...validGrantFile,
          expires: now,
        };

        // Should not throw because we check now > expires
        expect(() =>
          validateGrant(expiringNowGrant, { currentTime: now }),
        ).not.toThrow();
      });

      it("should handle grant expired by 1 second", () => {
        const now = Math.floor(Date.now() / 1000);
        const expiredGrant = {
          ...validGrantFile,
          expires: now - 1,
        };

        expect(() => validateGrant(expiredGrant, { currentTime: now })).toThrow(
          GrantExpiredError,
        );
      });

      it("should handle checksummed addresses", () => {
        const checksummedGrant = {
          ...validGrantFile,
          grantee:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        };

        // Pass same address in different case - should normalize and match
        const result = validateGrant(checksummedGrant, {
          grantee:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        });

        expect(result).toEqual(checksummedGrant);
      });

      it("should handle empty parameters object", () => {
        const emptyParamsGrant = {
          ...validGrantFile,
          parameters: {},
        };

        const result = validateGrant(emptyParamsGrant);

        expect(result).toEqual(emptyParamsGrant);
      });

      it("should handle complex parameters", () => {
        const complexGrant = {
          ...validGrantFile,
          parameters: {
            nested: {
              deep: {
                value: 42,
              },
            },
            array: [1, 2, 3],
            string: "test",
          },
        };

        const result = validateGrant(complexGrant);

        expect(result).toEqual(complexGrant);
      });
    });

    describe("Option Combinations", () => {
      it("should validate with all options", () => {
        const result = validateGrant(validGrantFile, {
          schema: true,
          grantee: validGrantFile.grantee,
          operation: validGrantFile.operation,
          currentTime: Math.floor(Date.now() / 1000),
          throwOnError: false,
        });

        expect(result.valid).toBe(true);
      });

      it("should skip schema but validate business rules", () => {
        const result = validateGrant(validGrantFile, {
          schema: false,
          grantee: validGrantFile.grantee,
          operation: validGrantFile.operation,
        });

        expect(result).toEqual(validGrantFile);
      });

      it("should validate schema but skip business rules", () => {
        const result = validateGrant(validGrantFile, {
          schema: true,
          // no grantee, operation, or currentTime
        });

        expect(result).toEqual(validGrantFile);
      });
    });
  });

  describe("validateGranteeAccess", () => {
    it("should pass for matching grantee", () => {
      expect(() => {
        validateGranteeAccess(validGrantFile, validGrantFile.grantee);
      }).not.toThrow();
    });

    it("should throw on mismatched grantee", () => {
      const wrongAddress =
        "0x9999999999999999999999999999999999999999" as `0x${string}`;

      expect(() => {
        validateGranteeAccess(validGrantFile, wrongAddress);
      }).toThrow(GranteeMismatchError);
    });

    it("should normalize addresses for comparison", () => {
      const lowercaseGrant = {
        ...validGrantFile,
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      };
      const sameAddress =
        "0x1234567890123456789012345678901234567890" as `0x${string}`;

      expect(() => {
        validateGranteeAccess(lowercaseGrant, sameAddress);
      }).not.toThrow();
    });

    it("should include addresses in error details", () => {
      const wrongAddress =
        "0x9999999999999999999999999999999999999999" as `0x${string}`;

      try {
        validateGranteeAccess(validGrantFile, wrongAddress);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GranteeMismatchError);
        expect((error as GranteeMismatchError).grantee).toBe(
          validGrantFile.grantee,
        );
        expect((error as GranteeMismatchError).requestingAddress).toBe(
          wrongAddress,
        );
      }
    });
  });

  describe("validateGrantExpiry", () => {
    it("should pass for non-expired grant", () => {
      expect(() => {
        validateGrantExpiry(validGrantFile);
      }).not.toThrow();
    });

    it("should pass for grant without expiry", () => {
      const noExpiryGrant = {
        ...validGrantFile,
        expires: undefined,
      };

      expect(() => {
        validateGrantExpiry(noExpiryGrant);
      }).not.toThrow();
    });

    it("should throw on expired grant", () => {
      const expiredGrant = {
        ...validGrantFile,
        expires: Math.floor(Date.now() / 1000) - 3600,
      };

      expect(() => {
        validateGrantExpiry(expiredGrant);
      }).toThrow(GrantExpiredError);
    });

    it("should use provided currentTime", () => {
      const futureTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now

      expect(() => {
        validateGrantExpiry(validGrantFile, futureTime);
      }).toThrow(GrantExpiredError);
    });

    it("should handle expiry at exact second", () => {
      const now = Math.floor(Date.now() / 1000);
      const expiringNowGrant = {
        ...validGrantFile,
        expires: now,
      };

      // Should not throw because now == expires (not >)
      expect(() => {
        validateGrantExpiry(expiringNowGrant, now);
      }).not.toThrow();
    });

    it("should include timestamps in error details", () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredGrant = {
        ...validGrantFile,
        expires: now - 100,
      };

      try {
        validateGrantExpiry(expiredGrant, now);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GrantExpiredError);
        expect((error as GrantExpiredError).expires).toBe(now - 100);
        expect((error as GrantExpiredError).currentTime).toBe(now);
      }
    });

    it("should use current time when not provided", () => {
      const expiredGrant = {
        ...validGrantFile,
        expires: 1, // Very old timestamp
      };

      expect(() => {
        validateGrantExpiry(expiredGrant);
      }).toThrow(GrantExpiredError);
    });
  });

  describe("validateOperationAccess", () => {
    it("should pass for matching operation", () => {
      expect(() => {
        validateOperationAccess(validGrantFile, validGrantFile.operation);
      }).not.toThrow();
    });

    it("should throw on mismatched operation", () => {
      expect(() => {
        validateOperationAccess(validGrantFile, "different_operation");
      }).toThrow(OperationNotAllowedError);
    });

    it("should be case-sensitive", () => {
      expect(() => {
        validateOperationAccess(validGrantFile, "LLM_INFERENCE");
      }).toThrow(OperationNotAllowedError);
    });

    it("should include operations in error details", () => {
      const requestedOp = "write";

      try {
        validateOperationAccess(validGrantFile, requestedOp);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(OperationNotAllowedError);
        expect((error as OperationNotAllowedError).grantedOperation).toBe(
          validGrantFile.operation,
        );
        expect((error as OperationNotAllowedError).requestedOperation).toBe(
          requestedOp,
        );
      }
    });

    it("should handle special characters in operations", () => {
      const specialOpGrant = {
        ...validGrantFile,
        operation: "llm:inference:v2",
      };

      expect(() => {
        validateOperationAccess(specialOpGrant, "llm:inference:v2");
      }).not.toThrow();
    });
  });

  describe("Integration Scenarios", () => {
    it("should validate complete grant lifecycle", () => {
      const now = Math.floor(Date.now() / 1000);
      const grantForAlice: GrantFile = {
        grantee: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        operation: "data_download",
        parameters: { fileId: "123" },
        expires: now + 86400, // 24 hours
      };

      // Alice validates her grant
      const result = validateGrant(grantForAlice, {
        grantee: grantForAlice.grantee,
        operation: "data_download",
        currentTime: now,
      });

      expect(result).toEqual(grantForAlice);
    });

    it("should reject invalid grant in complete workflow", () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredGrantForBob: GrantFile = {
        grantee: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        operation: "data_upload",
        parameters: {},
        expires: now - 100, // Expired
      };

      // Bob tries to use expired grant
      expect(() =>
        validateGrant(expiredGrantForBob, {
          grantee: expiredGrantForBob.grantee,
          operation: "data_upload",
          currentTime: now,
        }),
      ).toThrow(GrantExpiredError);
    });

    it("should handle grant with multiple validation failures", () => {
      const now = Math.floor(Date.now() / 1000);
      const badGrant: GrantFile = {
        grantee: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        operation: "read",
        parameters: {},
        expires: now - 100, // Expired
      };

      const result = validateGrant(badGrant, {
        grantee: "0x9999999999999999999999999999999999999999" as `0x${string}`, // Wrong
        operation: "write", // Wrong
        currentTime: now,
        throwOnError: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
