import { describe, it, expect } from "vitest";
import {
  findMatchingPermission,
  shouldCreateNewPermission,
} from "../permissions";
import type {
  GrantedPermission,
  GrantPermissionParams,
} from "@opendatalabs/vana-sdk/browser";

describe("permissions utilities", () => {
  const mockPermission: GrantedPermission = {
    id: 123n,
    operation: "llm_inference",
    files: [1, 2, 3],
    parameters: { prompt: "Test prompt" },
    grant: "ipfs://test",
    grantor: "0x123" as `0x${string}`,
    grantee: "0x456" as `0x${string}`,
    active: true,
    grantedAt: 1000,
    nonce: 1,
  };

  const mockParams: GrantPermissionParams = {
    to: "0x456" as `0x${string}`,
    operation: "llm_inference",
    files: [1, 2, 3],
    parameters: { prompt: "Test prompt" },
  };

  describe("findMatchingPermission", () => {
    it("should find matching permission with exact parameters", () => {
      const result = findMatchingPermission([mockPermission], mockParams);

      expect(result.found).toBe(true);
      expect(result.permission).toEqual(mockPermission);
      expect(result.reason).toContain("already exists");
    });

    it("should find matching permission with files in different order", () => {
      const paramsWithReorderedFiles = {
        ...mockParams,
        files: [3, 1, 2], // Different order
      };

      const result = findMatchingPermission(
        [mockPermission],
        paramsWithReorderedFiles,
      );

      expect(result.found).toBe(true);
      expect(result.permission).toEqual(mockPermission);
    });

    it("should not find match with different grantee", () => {
      const paramsWithDifferentGrantee = {
        ...mockParams,
        to: "0x789" as `0x${string}`,
      };

      const result = findMatchingPermission(
        [mockPermission],
        paramsWithDifferentGrantee,
      );

      expect(result.found).toBe(false);
    });

    it("should not find match with different operation", () => {
      const paramsWithDifferentOperation = {
        ...mockParams,
        operation: "data_access",
      };

      const result = findMatchingPermission(
        [mockPermission],
        paramsWithDifferentOperation,
      );

      expect(result.found).toBe(false);
    });

    it("should not find match with different files", () => {
      const paramsWithDifferentFiles = {
        ...mockParams,
        files: [1, 2, 4], // Different file
      };

      const result = findMatchingPermission(
        [mockPermission],
        paramsWithDifferentFiles,
      );

      expect(result.found).toBe(false);
    });

    it("should not find match with different parameters", () => {
      const paramsWithDifferentPrompt = {
        ...mockParams,
        parameters: { prompt: "Different prompt" },
      };

      const result = findMatchingPermission(
        [mockPermission],
        paramsWithDifferentPrompt,
      );

      expect(result.found).toBe(false);
    });

    it("should not find match with inactive permission", () => {
      const inactivePermission = {
        ...mockPermission,
        active: false,
      };

      const result = findMatchingPermission([inactivePermission], mockParams);

      expect(result.found).toBe(false);
    });

    it("should handle case-insensitive grantee comparison", () => {
      const paramsWithUppercaseGrantee = {
        ...mockParams,
        to: "0x456" as `0x${string}`, // Same address, different case
      };

      const permissionWithLowercaseGrantee = {
        ...mockPermission,
        grantee: "0x456" as `0x${string}`,
      };

      const result = findMatchingPermission(
        [permissionWithLowercaseGrantee],
        paramsWithUppercaseGrantee,
      );

      expect(result.found).toBe(true);
    });

    it("should handle missing parameters", () => {
      const permissionWithoutParams = {
        ...mockPermission,
        parameters: undefined,
      };

      const paramsWithoutParams = {
        ...mockParams,
        parameters: {},
      };

      const result = findMatchingPermission(
        [permissionWithoutParams],
        paramsWithoutParams,
      );

      expect(result.found).toBe(true);
    });
  });

  describe("shouldCreateNewPermission", () => {
    it("should return false when matching permission exists", () => {
      const result = shouldCreateNewPermission([mockPermission], mockParams);
      expect(result).toBe(false);
    });

    it("should return true when no matching permission exists", () => {
      const differentParams = {
        ...mockParams,
        operation: "data_access",
      };

      const result = shouldCreateNewPermission(
        [mockPermission],
        differentParams,
      );
      expect(result).toBe(true);
    });

    it("should return true when permissions list is empty", () => {
      const result = shouldCreateNewPermission([], mockParams);
      expect(result).toBe(true);
    });
  });
});
