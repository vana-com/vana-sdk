import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  ReplicateStatus,
  ReplicateAPIResponse,
  APIResponse,
} from "../types/external-apis";
import {
  isReplicateAPIResponse,
  isAPIResponse,
  safeParseJSON,
  parseReplicateOutput,
} from "../types/external-apis";

describe("External APIs Types", () => {
  // Mock console.debug to avoid noise in tests
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Type Definitions", () => {
    it("should define ReplicateStatus union correctly", () => {
      const statuses: ReplicateStatus[] = [
        "starting",
        "processing",
        "succeeded",
        "failed",
        "canceled",
      ];

      expect(statuses).toHaveLength(5);
    });

    it("should structure ReplicateAPIResponse correctly", () => {
      const response: ReplicateAPIResponse = {
        id: "test-id",
        version: "test-version",
        status: "succeeded",
        input: { prompt: "test" },
        output: "test output",
        created_at: "2023-01-01T00:00:00Z",
        urls: {
          get: "https://api.replicate.com/predictions/test",
          cancel: "https://api.replicate.com/predictions/test/cancel",
        },
      };

      expect(response.id).toBe("test-id");
      expect(response.status).toBe("succeeded");
      expect(response.input.prompt).toBe("test");
    });

    // Tests for server types removed - use generated types from server-exports.ts

    it("should structure APIResponse correctly", () => {
      const successResponse: APIResponse<string> = {
        success: true,
        data: "test data",
      };

      const errorResponse: APIResponse<never> = {
        success: false,
        error: "Test error message",
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.data).toBe("test data");
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBe("Test error message");
    });
  });

  describe("isReplicateAPIResponse", () => {
    it("should return true for valid ReplicateAPIResponse", () => {
      const validResponse = {
        id: "test-id",
        status: "succeeded",
        urls: {
          get: "https://api.replicate.com/predictions/test",
          cancel: "https://api.replicate.com/predictions/test/cancel",
        },
        version: "v1",
        input: {},
        created_at: "2023-01-01T00:00:00Z",
      };

      expect(isReplicateAPIResponse(validResponse)).toBe(true);
    });

    it("should return false for null or undefined", () => {
      expect(isReplicateAPIResponse(null)).toBe(false);
      expect(isReplicateAPIResponse(undefined)).toBe(false);
    });

    it("should return false for non-object values", () => {
      expect(isReplicateAPIResponse("string")).toBe(false);
      expect(isReplicateAPIResponse(123)).toBe(false);
    });

    it("should return false when id is missing", () => {
      const invalidResponse = {
        status: "succeeded",
        urls: { get: "test", cancel: "test" },
      };

      expect(isReplicateAPIResponse(invalidResponse)).toBe(false);
    });

    it("should return false when status is invalid", () => {
      const invalidResponse = {
        id: "test",
        status: "invalid-status",
        urls: { get: "test", cancel: "test" },
      };

      expect(isReplicateAPIResponse(invalidResponse)).toBe(false);
    });

    it("should return false when urls is missing", () => {
      const invalidResponse = {
        id: "test",
        status: "succeeded",
      };

      expect(isReplicateAPIResponse(invalidResponse)).toBe(false);
    });

    it("should accept all valid status values", () => {
      const statuses = [
        "starting",
        "processing",
        "succeeded",
        "failed",
        "canceled",
      ];

      statuses.forEach((status) => {
        const response = {
          id: "test",
          status,
          urls: { get: "test", cancel: "test" },
        };
        expect(isReplicateAPIResponse(response)).toBe(true);
      });
    });
  });

  // Tests for server type guards removed - use generated types from server-exports.ts

  describe("isAPIResponse", () => {
    it("should return true for valid APIResponse", () => {
      const validResponse = {
        success: true,
        data: "test data",
      };

      expect(isAPIResponse(validResponse)).toBe(true);
    });

    it("should return true for error APIResponse", () => {
      const errorResponse = {
        success: false,
        error: "Test error",
      };

      expect(isAPIResponse(errorResponse)).toBe(true);
    });

    it("should return false for null or undefined", () => {
      expect(isAPIResponse(null)).toBe(false);
      expect(isAPIResponse(undefined)).toBe(false);
    });

    it("should return false for non-object values", () => {
      expect(isAPIResponse("string")).toBe(false);
      expect(isAPIResponse(123)).toBe(false);
    });

    it("should return false when success field is missing", () => {
      const invalidResponse = {
        data: "test data",
      };

      expect(isAPIResponse(invalidResponse)).toBe(false);
    });

    it("should return false when success is not a boolean", () => {
      const invalidResponse = {
        success: "true", // string instead of boolean
        data: "test data",
      };

      expect(isAPIResponse(invalidResponse)).toBe(false);
    });
  });

  describe("safeParseJSON", () => {
    it("should parse valid JSON with type guard", () => {
      const jsonString = '{"success": true, "data": "test"}';
      const result = safeParseJSON(jsonString, isAPIResponse);

      expect(result).toEqual({ success: true, data: "test" });
    });

    it("should return null for invalid JSON", () => {
      const invalidJsonString = '{"invalid": json}';
      const result = safeParseJSON(invalidJsonString, isAPIResponse);

      expect(result).toBeNull();
    });

    it("should return null when type guard fails", () => {
      const jsonString = '{"notAnAPIResponse": true}';
      const result = safeParseJSON(jsonString, isAPIResponse);

      expect(result).toBeNull();
    });

    it("should work with complex API responses", () => {
      const complexJson =
        '{"success": true, "data": {"nested": {"value": "test"}}}';
      const result = safeParseJSON(complexJson, isAPIResponse);

      expect(result).toEqual({
        success: true,
        data: { nested: { value: "test" } },
      });
    });
  });

  describe("parseReplicateOutput", () => {
    it("should return null when response has no output", () => {
      const response: ReplicateAPIResponse = {
        id: "test",
        version: "v1",
        status: "processing",
        input: {},
        created_at: "2023-01-01T00:00:00Z",
        urls: {
          get: "https://test.com",
          cancel: "https://test.com/cancel",
        },
      };

      const result = parseReplicateOutput(response, isAPIResponse);
      expect(result).toBeNull();
    });

    it("should parse string output with JSON", () => {
      const response: ReplicateAPIResponse = {
        id: "test",
        version: "v1",
        status: "succeeded",
        input: {},
        output: '{"success": true, "data": "parsed"}',
        created_at: "2023-01-01T00:00:00Z",
        urls: {
          get: "https://test.com",
          cancel: "https://test.com/cancel",
        },
      };

      const result = parseReplicateOutput(response, isAPIResponse);
      expect(result).toEqual({ success: true, data: "parsed" });
    });

    it("should validate direct object output", () => {
      const response: ReplicateAPIResponse = {
        id: "test",
        version: "v1",
        status: "succeeded",
        input: {},
        output: { success: true, data: "direct object" },
        created_at: "2023-01-01T00:00:00Z",
        urls: {
          get: "https://test.com",
          cancel: "https://test.com/cancel",
        },
      };

      const result = parseReplicateOutput(response, isAPIResponse);
      expect(result).toEqual({ success: true, data: "direct object" });
    });

    it("should return null for invalid string JSON", () => {
      const response: ReplicateAPIResponse = {
        id: "test",
        version: "v1",
        status: "succeeded",
        input: {},
        output: '{"invalid": json}',
        created_at: "2023-01-01T00:00:00Z",
        urls: {
          get: "https://test.com",
          cancel: "https://test.com/cancel",
        },
      };

      const result = parseReplicateOutput(response, isAPIResponse);
      expect(result).toBeNull();
    });

    it("should return null when type guard fails on direct object", () => {
      const response: ReplicateAPIResponse = {
        id: "test",
        version: "v1",
        status: "succeeded",
        input: {},
        output: { notAnAPIResponse: true },
        created_at: "2023-01-01T00:00:00Z",
        urls: {
          get: "https://test.com",
          cancel: "https://test.com/cancel",
        },
      };

      const result = parseReplicateOutput(response, isAPIResponse);
      expect(result).toBeNull();
    });
  });
});
