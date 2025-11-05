/**
 * Tests for grant management utilities
 *
 * @remarks
 * Tests high-level grant creation, storage, retrieval, validation, and utility functions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createValidatedGrant,
  createAndStoreGrant,
  retrieveAndValidateGrant,
  checkGrantAccess,
  isGrantExpired,
  getGrantTimeRemaining,
  summarizeGrant,
} from "../grants";
import type { GrantFile, GrantPermissionParams } from "../../types/permissions";
import { GrantValidationError } from "../grantValidation";

// Mock dependencies
vi.mock("../grantFiles", () => ({
  createGrantFile: vi.fn((params) => ({
    grantee: params.grantee,
    operation: params.operation,
    parameters: params.parameters,
    ...(params.expiresAt && { expires: params.expiresAt }),
  })),
  storeGrantFile: vi.fn(async () => "ipfs://QmTestHash123"),
  retrieveGrantFile: vi.fn(async () => ({
    grantee: "0x1234567890123456789012345678901234567890",
    operation: "test_operation",
    parameters: {},
  })),
}));

vi.mock("../grantValidation", () => ({
  validateGrant: vi.fn(),
  GrantValidationError: class GrantValidationError extends Error {
    constructor(
      message: string,
      public details?: unknown,
    ) {
      super(message);
      this.name = "GrantValidationError";
    }
  },
}));

// Import mocked modules to access in tests
import * as grantFilesModule from "../grantFiles";
import * as grantValidationModule from "../grantValidation";

describe("grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createValidatedGrant", () => {
    const validParams: GrantPermissionParams = {
      grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      operation: "test_op",
      files: [1, 2, 3],
      parameters: { key: "value" },
    };

    it("should create and validate grant", () => {
      const result = createValidatedGrant(validParams);

      expect(result.grantee).toBe(validParams.grantee);
      expect(result.operation).toBe(validParams.operation);
      expect(result.parameters).toEqual(validParams.parameters);
    });

    it("should throw GrantValidationError on validation failure", () => {
      vi.mocked(grantValidationModule.validateGrant).mockImplementationOnce(
        () => {
          throw new Error("Validation failed");
        },
      );

      expect(() => createValidatedGrant(validParams)).toThrow(
        GrantValidationError,
      );
    });

    it("should include grant file in validation error details", () => {
      vi.mocked(grantValidationModule.validateGrant).mockImplementationOnce(
        () => {
          throw new Error("Invalid grant");
        },
      );

      try {
        createValidatedGrant(validParams);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GrantValidationError);
        expect((error as GrantValidationError).message).toContain(
          "Invalid grant",
        );
      }
    });

    it("should pass validation options to validateGrant", () => {
      createValidatedGrant(validParams);

      expect(grantValidationModule.validateGrant).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          schema: true,
          grantee: validParams.grantee,
          operation: validParams.operation,
        }),
      );
    });
  });

  describe("createAndStoreGrant", () => {
    const validParams: GrantPermissionParams = {
      grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      operation: "store_test",
      files: [],
      parameters: {},
    };

    it("should create and store grant", async () => {
      const result = await createAndStoreGrant(
        validParams,
        "https://relayer.test",
      );

      expect(result.grantFile).toBeDefined();
      expect(result.grantUrl).toBe("ipfs://QmTestHash123");
    });

    it("should return both grant file and URL", async () => {
      const result = await createAndStoreGrant(
        validParams,
        "https://relayer.test",
      );

      expect(result).toHaveProperty("grantFile");
      expect(result).toHaveProperty("grantUrl");
      expect(result.grantFile.grantee).toBe(validParams.grantee);
    });

    it("should propagate validation errors", async () => {
      vi.mocked(grantValidationModule.validateGrant).mockImplementationOnce(
        () => {
          throw new Error("Invalid");
        },
      );

      await expect(
        createAndStoreGrant(validParams, "https://relayer.test"),
      ).rejects.toThrow(GrantValidationError);
    });

    it("should propagate storage errors", async () => {
      vi.mocked(grantFilesModule.storeGrantFile).mockRejectedValueOnce(
        new Error("Storage failed"),
      );

      await expect(
        createAndStoreGrant(validParams, "https://relayer.test"),
      ).rejects.toThrow("Storage failed");
    });
  });

  describe("retrieveAndValidateGrant", () => {
    it("should retrieve grant from IPFS", async () => {
      const result = await retrieveAndValidateGrant("ipfs://QmTest");

      expect(result).toBeDefined();
      expect(result.grantee).toBeDefined();
      expect(result.operation).toBeDefined();
    });

    it("should pass relayer URL to retrieveGrantFile", async () => {
      await retrieveAndValidateGrant("ipfs://QmTest", "https://relayer.test");

      expect(grantFilesModule.retrieveGrantFile).toHaveBeenCalledWith(
        "ipfs://QmTest",
        "https://relayer.test",
      );
    });

    it("should work without relayer URL", async () => {
      const result = await retrieveAndValidateGrant("ipfs://QmTest");

      expect(result).toBeDefined();
    });

    it("should propagate retrieval errors", async () => {
      vi.mocked(grantFilesModule.retrieveGrantFile).mockRejectedValueOnce(
        new Error("Not found"),
      );

      await expect(retrieveAndValidateGrant("ipfs://QmTest")).rejects.toThrow(
        "Not found",
      );
    });
  });

  describe("checkGrantAccess", () => {
    const mockGrant: GrantFile = {
      grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      operation: "read",
      parameters: {},
    };

    beforeEach(() => {
      vi.mocked(grantFilesModule.retrieveGrantFile).mockResolvedValue(
        mockGrant,
      );
    });

    it("should return allowed=true for valid grant", async () => {
      const result = await checkGrantAccess(
        "ipfs://QmTest",
        mockGrant.grantee,
        "read",
        [1, 2],
      );

      expect(result.allowed).toBe(true);
      expect(result.grantFile).toBeDefined();
    });

    it("should return allowed=false for validation error", async () => {
      vi.mocked(grantValidationModule.validateGrant).mockImplementationOnce(
        () => {
          throw new GrantValidationError("Invalid grantee");
        },
      );

      const result = await checkGrantAccess(
        "ipfs://QmTest",
        "0x9999999999999999999999999999999999999999" as `0x${string}`,
        "read",
        [],
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Invalid grantee");
    });

    it("should return allowed=false for retrieval errors", async () => {
      vi.mocked(grantFilesModule.retrieveGrantFile).mockRejectedValueOnce(
        new Error("Network error"),
      );

      const result = await checkGrantAccess(
        "ipfs://QmTest",
        mockGrant.grantee,
        "read",
        [],
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Network error");
    });

    it("should include grant file in allowed response", async () => {
      const result = await checkGrantAccess(
        "ipfs://QmTest",
        mockGrant.grantee,
        "read",
        [],
      );

      expect(result.grantFile).toEqual(mockGrant);
    });
  });

  describe("isGrantExpired", () => {
    it("should return false for grant without expiration", () => {
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {},
      };

      expect(isGrantExpired(grant)).toBe(false);
    });

    it("should return true for expired grant", () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {},
        expires: pastTime,
      };

      expect(isGrantExpired(grant)).toBe(true);
    });

    it("should return false for future expiration", () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {},
        expires: futureTime,
      };

      expect(isGrantExpired(grant)).toBe(false);
    });

    it("should handle expiration at exact current time", () => {
      const now = Math.floor(Date.now() / 1000);
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {},
        expires: now,
      };

      // At exact time, should not be expired (now > expires)
      expect(isGrantExpired(grant)).toBe(false);
    });
  });

  describe("getGrantTimeRemaining", () => {
    it("should return null for grant without expiration", () => {
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {},
      };

      expect(getGrantTimeRemaining(grant)).toBeNull();
    });

    it("should return positive time for future expiration", () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {},
        expires: futureTime,
      };

      const remaining = getGrantTimeRemaining(grant);
      expect(remaining).toBeGreaterThan(3500); // ~1 hour (with some margin)
      expect(remaining).toBeLessThan(3700);
    });

    it("should return 0 for expired grant", () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {},
        expires: pastTime,
      };

      expect(getGrantTimeRemaining(grant)).toBe(0);
    });

    it("should never return negative time", () => {
      const pastTime = Math.floor(Date.now() / 1000) - 10000;
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {},
        expires: pastTime,
      };

      expect(getGrantTimeRemaining(grant)).toBe(0);
    });
  });

  describe("summarizeGrant", () => {
    it("should create summary for grant without expiration", () => {
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read_data",
        parameters: {},
      };

      const summary = summarizeGrant(grant);

      expect(summary).toContain(grant.grantee);
      expect(summary).toContain(grant.operation);
      expect(summary).toContain("No expiration");
    });

    it("should create summary with expiration", () => {
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "write_data",
        parameters: {},
        expires,
      };

      const summary = summarizeGrant(grant);

      expect(summary).toContain(grant.grantee);
      expect(summary).toContain(grant.operation);
      expect(summary).not.toContain("No expiration");
      // Should contain ISO date format
      expect(summary).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it("should format expiration as ISO string", () => {
      const expires = 1234567890; // Known timestamp
      const grant: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {},
        expires,
      };

      const summary = summarizeGrant(grant);
      const expectedDate = new Date(expires * 1000).toISOString();

      expect(summary).toContain(expectedDate);
    });
  });
});
