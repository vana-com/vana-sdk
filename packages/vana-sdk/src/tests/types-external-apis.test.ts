import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ReplicateStatus,
  ReplicateAPIResponse,
  IdentityServerOutput,
  PersonalServerOutput,
  APIResponse,
  isReplicateAPIResponse,
  isIdentityServerOutput,
  isPersonalServerOutput,
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

    it("should structure IdentityServerOutput correctly", () => {
      const data: IdentityServerOutput = {
        user_address: "0x1234567890123456789012345678901234567890",
        personal_server: {
          address: "https://server.example.com",
          public_key: "0xpublickey123",
        },
      };

      expect(data.user_address).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(data.personal_server.address).toBe("https://server.example.com");
    });

    it("should structure PersonalServerOutput correctly", () => {
      const output: PersonalServerOutput = {
        user_address: "0x1234567890123456789012345678901234567890",
        identity: {
          metadata: { name: "Test User", verified: true },
          derivedAddress: "0x9876543210987654321098765432109876543210",
        },
      };

      expect(output.user_address).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(output.identity.metadata?.name).toBe("Test User");
      expect(output.identity.derivedAddress).toBe(
        "0x9876543210987654321098765432109876543210",
      );
    });

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

  describe("isIdentityServerOutput", () => {
    it("should return true for valid IdentityServerOutput", () => {
      const validData = {
        user_address: "0x1234567890123456789012345678901234567890",
        personal_server: {
          address: "https://server.example.com",
          public_key: "0xpublickey123",
        },
      };

      expect(isIdentityServerOutput(validData)).toBe(true);
      expect(console.debug).toHaveBeenCalled();
    });

    it("should return false for null or undefined", () => {
      expect(isIdentityServerOutput(null)).toBe(false);
      expect(isIdentityServerOutput(undefined)).toBe(false);
    });

    it("should return false for non-object values", () => {
      expect(isIdentityServerOutput("string")).toBe(false);
      expect(isIdentityServerOutput(123)).toBe(false);
      expect(isIdentityServerOutput(true)).toBe(false);
    });

    it("should return false when user_address is not a string", () => {
      const invalidData = {
        user_address: 123,
        personal_server: {
          address: "https://server.example.com",
          public_key: "0xpublickey123",
        },
      };

      expect(isIdentityServerOutput(invalidData)).toBe(false);
    });

    it("should return false when personal_server is null", () => {
      const invalidData = {
        user_address: "0x1234567890123456789012345678901234567890",
        personal_server: null,
      };

      expect(isIdentityServerOutput(invalidData)).toBe(false);
    });

    it("should return false when personal_server is not an object", () => {
      const invalidData = {
        user_address: "0x1234567890123456789012345678901234567890",
        personal_server: "not an object",
      };

      expect(isIdentityServerOutput(invalidData)).toBe(false);
    });

    it("should return false when personal_server lacks address", () => {
      const invalidData = {
        user_address: "0x1234567890123456789012345678901234567890",
        personal_server: {
          public_key: "0xpublickey123",
          // missing address
        },
      };

      expect(isIdentityServerOutput(invalidData)).toBe(false);
    });

    it("should return false when personal_server lacks public_key", () => {
      const invalidData = {
        user_address: "0x1234567890123456789012345678901234567890",
        personal_server: {
          address: "https://server.example.com",
          // missing public_key
        },
      };

      expect(isIdentityServerOutput(invalidData)).toBe(false);
    });
  });

  describe("isPersonalServerOutput", () => {
    it("should return true for valid PersonalServerOutput", () => {
      const validOutput = {
        user_address: "0x1234567890123456789012345678901234567890",
        identity: {
          metadata: { name: "Test User", verified: true },
        },
      };

      expect(isPersonalServerOutput(validOutput)).toBe(true);
    });

    it("should return false for null or undefined", () => {
      expect(isPersonalServerOutput(null)).toBe(false);
      expect(isPersonalServerOutput(undefined)).toBe(false);
    });

    it("should return false for non-object values", () => {
      expect(isPersonalServerOutput("string")).toBe(false);
      expect(isPersonalServerOutput(123)).toBe(false);
    });

    it("should return false when user_address is missing", () => {
      const invalidOutput = {
        identity: { metadata: { name: "Test User" } },
      };

      expect(isPersonalServerOutput(invalidOutput)).toBe(false);
    });

    it("should return false when identity is missing", () => {
      const invalidOutput = {
        user_address: "0x1234567890123456789012345678901234567890",
      };

      expect(isPersonalServerOutput(invalidOutput)).toBe(false);
    });

    it("should return false when user_address is not a string", () => {
      const invalidOutput = {
        user_address: 123,
        identity: { metadata: { name: "Test User" } },
      };

      expect(isPersonalServerOutput(invalidOutput)).toBe(false);
    });

    it("should return false when identity is not an object", () => {
      const invalidOutput = {
        user_address: "0x1234567890123456789012345678901234567890",
        identity: "not an object",
      };

      expect(isPersonalServerOutput(invalidOutput)).toBe(false);
    });
  });

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

    it("should work with different type guards", () => {
      const identityServerJson =
        '{"user_address": "0x123", "personal_server": {"address": "https://test.com", "public_key": "0xkey"}}';
      const result = safeParseJSON(identityServerJson, isIdentityServerOutput);

      expect(result).toEqual({
        user_address: "0x123",
        personal_server: {
          address: "https://test.com",
          public_key: "0xkey",
        },
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
