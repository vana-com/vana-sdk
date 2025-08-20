import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import {
  createGrantFile,
  storeGrantFile,
  retrieveGrantFile,
  getGrantFileHash,
  validateGrantFile,
} from "../utils/grantFiles";
import { validateGrant, GrantValidationError } from "../utils/grantValidation";
import { NetworkError, SerializationError } from "../errors";

// Mock fetch globally
global.fetch = vi.fn();

// Mock the download module
vi.mock("../utils/download", () => ({
  fetchWithRelayer: vi.fn(),
}));

describe("Grant Files Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createGrantFile", () => {
    it("should create a grant file with correct structure", () => {
      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: {
          prompt: "Test prompt",
          maxTokens: 100,
        },
      };

      const grantFile = createGrantFile(params);

      expect(grantFile).toEqual({
        grantee: params.grantee,
        operation: params.operation,
        parameters: params.parameters,
      });
    });

    it("should handle empty files array", () => {
      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "data_query",
        files: [],
        parameters: {},
      };

      const grantFile = createGrantFile(params);

      expect(grantFile.parameters).toEqual({});
    });

    it("should handle complex parameters", () => {
      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "model_training",
        files: [10, 20, 30],
        parameters: {
          epochs: 100,
          learningRate: 0.001,
          batchSize: 32,
          modelConfig: {
            layers: [128, 64, 32],
            activation: "relu",
          },
        },
      };

      const grantFile = createGrantFile(params);

      expect(grantFile.parameters).toEqual(params.parameters);
    });

    it("should include expiration when provided", () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test" },
        expiresAt,
      };

      const grantFile = createGrantFile(params);

      expect(grantFile.expires).toBe(expiresAt);
    });

    it("should not include expiration when not provided", () => {
      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test" },
      };

      const grantFile = createGrantFile(params);

      expect(grantFile.expires).toBeUndefined();
    });
  });

  describe("getGrantFileHash", () => {
    it("should generate consistent hash for same grant file", () => {
      const grantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test" },
        expires: 1736467579,
      };

      const hash1 = getGrantFileHash(grantFile);
      const hash2 = getGrantFileHash(grantFile);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/); // Should be a hex hash
    });

    it("should generate different hashes for different grant files", () => {
      const grantFile1 = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test1" },
      };

      const grantFile2 = {
        ...grantFile1,
        parameters: { prompt: "test2" },
      };

      const hash1 = getGrantFileHash(grantFile1);
      const hash2 = getGrantFileHash(grantFile2);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle grant files without expiration", () => {
      const grantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test" },
      };

      const hash = getGrantFileHash(grantFile);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe("storeGrantFile", () => {
    const mockGrantFile = {
      grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      operation: "llm_inference",
      files: [1, 2, 3],
      parameters: { prompt: "test" },
    };

    it("should store grant file and return URL", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            url: "https://ipfs.io/ipfs/QmGrantFile123",
          }),
      });

      const result = await storeGrantFile(
        mockGrantFile,
        "https://relayer.test",
      );

      expect(result).toBe("https://ipfs.io/ipfs/QmGrantFile123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://relayer.test/api/ipfs/upload",
        {
          method: "POST",
          body: expect.any(FormData),
        },
      );
    });

    it("should handle storage failure", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(
        storeGrantFile(mockGrantFile, "https://relayer.test"),
      ).rejects.toThrow(NetworkError);
    });

    it("should handle network errors", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockRejectedValue(new Error("Network failed"));

      await expect(
        storeGrantFile(mockGrantFile, "https://relayer.test"),
      ).rejects.toThrow(NetworkError);
    });

    it("should handle malformed response", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: "Storage failed",
          }),
      });

      await expect(
        storeGrantFile(mockGrantFile, "https://relayer.test"),
      ).rejects.toThrow("Storage failed");
    });
  });

  describe("retrieveGrantFile", () => {
    const mockGrantFile = {
      grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      operation: "llm_inference",
      files: [1, 2, 3],
      parameters: { prompt: "test" },
    };

    it("should retrieve grant file from IPFS URL", async () => {
      const { fetchWithRelayer } = await import("../utils/download");
      const mockFetchWithRelayer = fetchWithRelayer as Mock;

      mockFetchWithRelayer.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockGrantFile)),
      });

      const result = await retrieveGrantFile("ipfs://QmGrantFile123");

      expect(result).toEqual(mockGrantFile);
      expect(mockFetchWithRelayer).toHaveBeenCalledWith(
        "ipfs://QmGrantFile123",
        undefined,
      );
    });

    it("should handle fetchWithRelayer failures gracefully", async () => {
      const { fetchWithRelayer } = await import("../utils/download");
      const mockFetchWithRelayer = fetchWithRelayer as Mock;

      // fetchWithRelayer handles retries internally, so we just test final failure
      mockFetchWithRelayer.mockRejectedValueOnce(
        new Error("All gateways failed"),
      );

      await expect(retrieveGrantFile("ipfs://QmGrantFile123")).rejects.toThrow(
        NetworkError,
      );
    });

    it("should handle 404 responses", async () => {
      const { fetchWithRelayer } = await import("../utils/download");
      const mockFetchWithRelayer = fetchWithRelayer as Mock;

      mockFetchWithRelayer.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(retrieveGrantFile("ipfs://QmMissing")).rejects.toThrow(
        NetworkError,
      );
    });

    it("should handle timeout", async () => {
      const { fetchWithRelayer } = await import("../utils/download");
      const mockFetchWithRelayer = fetchWithRelayer as Mock;

      mockFetchWithRelayer.mockRejectedValueOnce(new Error("Request timeout"));

      await expect(retrieveGrantFile("ipfs://QmTimeout")).rejects.toThrow(
        NetworkError,
      );
    });

    it("should handle malformed JSON", async () => {
      const { fetchWithRelayer } = await import("../utils/download");
      const mockFetchWithRelayer = fetchWithRelayer as Mock;

      mockFetchWithRelayer.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("invalid json {"),
      });

      await expect(retrieveGrantFile("ipfs://QmBadJSON")).rejects.toThrow(
        NetworkError,
      );
    });

    it("should retrieve grant file from regular HTTP URL", async () => {
      const { fetchWithRelayer } = await import("../utils/download");
      const mockFetchWithRelayer = fetchWithRelayer as Mock;

      mockFetchWithRelayer.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockGrantFile)),
      });

      const result = await retrieveGrantFile(
        "https://example.com/grants/grant123.json",
      );

      expect(result).toEqual(mockGrantFile);
      expect(mockFetchWithRelayer).toHaveBeenCalledWith(
        "https://example.com/grants/grant123.json",
        undefined,
      );
    });

    it("should pass downloadRelayer to fetchWithRelayer", async () => {
      const { fetchWithRelayer } = await import("../utils/download");
      const mockFetchWithRelayer = fetchWithRelayer as Mock;

      mockFetchWithRelayer.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockGrantFile)),
      });

      const mockDownloadRelayer = {
        proxyDownload: vi.fn(),
      };

      const result = await retrieveGrantFile(
        "https://example.com/grant.json",
        undefined,
        mockDownloadRelayer,
      );

      expect(result).toEqual(mockGrantFile);
      expect(mockFetchWithRelayer).toHaveBeenCalledWith(
        "https://example.com/grant.json",
        mockDownloadRelayer,
      );
    });

    it("should fail gracefully when fetchWithRelayer fails", async () => {
      const { fetchWithRelayer } = await import("../utils/download");
      const mockFetchWithRelayer = fetchWithRelayer as Mock;

      mockFetchWithRelayer.mockRejectedValueOnce(new Error("Server error"));

      await expect(
        retrieveGrantFile("https://example.com/grants/missing.json"),
      ).rejects.toThrow(NetworkError);
    });
  });

  describe("validateGrantFile", () => {
    it("should validate a correct grant file", () => {
      const validGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test" },
      };

      expect(validateGrantFile(validGrantFile)).toBe(true);
    });

    it("should validate a grant file with expiration", () => {
      const validGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test" },
        expires: 1736467579,
      };

      expect(validateGrantFile(validGrantFile)).toBe(true);
    });

    it("should reject invalid grant files", () => {
      // Missing grantee
      expect(
        validateGrantFile({
          operation: "test",
          files: [1, 2, 3],
          parameters: {},
        }),
      ).toBe(false);

      // Invalid grantee address
      expect(
        validateGrantFile({
          grantee: "invalid-address",
          operation: "test",
          parameters: {},
        }),
      ).toBe(false);

      // Missing operation
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          parameters: {},
        }),
      ).toBe(false);

      // Empty operation
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "",
          parameters: {},
        }),
      ).toBe(false);

      // Missing files (files are not required in grant files - they're tracked in contract)
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "test",
          parameters: {},
        }),
      ).toBe(true);

      // Invalid expires (negative)
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "test",
          parameters: {},
          expires: -1,
        }),
      ).toBe(false);

      // Invalid expires (non-integer)
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "test",
          parameters: {},
          expires: 123.5,
        }),
      ).toBe(false);

      // Missing parameters
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "test",
        }),
      ).toBe(false);

      // Parameters is null
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "test",
          parameters: null,
        }),
      ).toBe(false);

      // Parameters is not an object
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "test",
          parameters: "not an object",
        }),
      ).toBe(false);

      // Null data
      expect(validateGrantFile(null)).toBe(false);

      // Undefined data
      expect(validateGrantFile(undefined)).toBe(false);

      // Non-object data
      expect(validateGrantFile("not an object")).toBe(false);

      // Valid grant file with expires
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "test",
          parameters: { prompt: "test" },
          expires: 1736467579,
        }),
      ).toBe(true);

      // Valid grant file without expires
      expect(
        validateGrantFile({
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "test",
          parameters: { prompt: "test" },
        }),
      ).toBe(true);
    });
  });

  describe("ajv validation", () => {
    it("should validate valid grant file with ajv", () => {
      const validGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        parameters: { prompt: "test" },
        expires: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      expect(() => validateGrant(validGrantFile)).not.toThrow();
      const result = validateGrant(validGrantFile);
      expect(result).toEqual(validGrantFile);
    });

    it("should provide detailed error messages for invalid data", () => {
      const invalidGrantFile = {
        grantee: "invalid-address", // Invalid EVM address
        operation: "", // Empty operation
        parameters: null, // Should be object
        expires: -100, // Negative timestamp
      };

      expect(() => validateGrant(invalidGrantFile)).toThrow(
        GrantValidationError,
      );

      try {
        validateGrant(invalidGrantFile);
      } catch (error) {
        const grantError = error as GrantValidationError;
        expect(grantError.message).toContain("Invalid grant file schema");
        expect(grantError.details?.errors).toBeDefined();
        expect(Array.isArray(grantError.details?.errors)).toBe(true);
      }
    });

    it("should validate required fields", () => {
      const grantFileWithMissingOperation = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        // Missing operation field
        parameters: { prompt: "test" },
      };

      expect(() => validateGrant(grantFileWithMissingOperation)).toThrow(
        GrantValidationError,
      );
    });

    it("should reject additional properties", () => {
      const grantFileWithExtra = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        parameters: { prompt: "test" },
        unknownField: "should not be allowed", // Additional property
      };

      expect(() => validateGrant(grantFileWithExtra)).toThrow(
        GrantValidationError,
      );
    });
  });

  describe("getGrantFileHash edge cases", () => {
    it("should handle complex nested objects", () => {
      const grantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {
          z: "last",
          a: "first",
          nested: {
            y: "nested_last",
            x: "nested_first",
            deep: {
              c: "deep_last",
              a: "deep_first",
            },
          },
        },
      };

      const hash = getGrantFileHash(grantFile);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle arrays in parameters", () => {
      const grantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {
          arrayParam: [3, 1, 2],
          nestedArray: [
            { b: 2, a: 1 },
            { d: 4, c: 3 },
          ],
        },
      };

      const hash = getGrantFileHash(grantFile);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle null and primitive values", () => {
      const grantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: {
          nullValue: null,
          stringValue: "test",
          numberValue: 123,
          booleanValue: true,
        },
      };

      const hash = getGrantFileHash(grantFile);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should throw SerializationError for invalid data", () => {
      // Type for circular reference testing
      type CircularRef = { self?: CircularRef };

      const grantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        parameters: {
          circular: {} as CircularRef,
        },
      };

      // Create circular reference
      grantFile.parameters.circular.self = grantFile.parameters.circular;

      expect(() => getGrantFileHash(grantFile)).toThrow(SerializationError);
    });
  });
});
