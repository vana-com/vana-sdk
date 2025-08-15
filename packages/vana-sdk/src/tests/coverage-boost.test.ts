import { describe, it, expect } from "vitest";
import { RetryUtility } from "../core/generics";
import { createValidatedGrant } from "../utils/grants";
import type { GrantPermissionParams } from "../types/permissions";

describe("Coverage Boost Tests", () => {
  describe("RetryUtility Static Methods", () => {
    it("should handle retries with exponential backoff", async () => {
      let attempts = 0;

      const result = await RetryUtility.withRetry(
        async () => {
          attempts++;
          if (attempts < 2) throw new Error("Temporary failure");
          return "success";
        },
        { maxAttempts: 3, delayMs: 10 },
      );

      expect(result).toBe("success");
      expect(attempts).toBe(2);
    });

    it("should fail after max attempts", async () => {
      await expect(
        RetryUtility.withRetry(
          async () => {
            throw new Error("Permanent failure");
          },
          { maxAttempts: 2, delayMs: 1 },
        ),
      ).rejects.toThrow("Permanent failure");
    });

    it("should respect shouldRetry condition", async () => {
      let attempts = 0;

      await expect(
        RetryUtility.withRetry(
          async () => {
            attempts++;
            throw new Error("Non-retryable error");
          },
          {
            maxAttempts: 3,
            delayMs: 1,
            shouldRetry: (error) => !error.message.includes("Non-retryable"),
          },
        ),
      ).rejects.toThrow("Non-retryable error");

      expect(attempts).toBe(1); // Should not retry
    });
  });

  describe("Grant validation", () => {
    it("should handle grant creation with minimal params", () => {
      const mockParams: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test_operation",
        files: [1, 2, 3],
        parameters: { test: true },
      };

      const grant = createValidatedGrant(mockParams);
      expect(grant.grantee).toBe(mockParams.grantee);
      expect(grant.operation).toBe(mockParams.operation);
      expect(grant.parameters).toEqual(mockParams.parameters);
    });

    it("should handle grant with expiration", () => {
      const expirationTime = Date.now() + 3600000;
      const mockParams: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test_operation",
        files: [1],
        parameters: { test: true },
        expiresAt: expirationTime,
      };

      const grant = createValidatedGrant(mockParams);
      expect(grant.expires).toBe(expirationTime);
    });
  });
});
