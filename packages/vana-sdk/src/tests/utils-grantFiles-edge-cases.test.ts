import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { retrieveGrantFile, validateGrantFile } from "../utils/grantFiles";
import { NetworkError } from "../errors";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Grant Files Edge Cases Coverage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("retrieveGrantFile edge cases", () => {
    it("should handle non-ipfs URLs (line 88)", async () => {
      const directUrl = "QmTestHashWithoutPrefix";

      // Mock successful response from the first gateway
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            grantee: "0x1234567890123456789012345678901234567890",
            operation: "llm_inference",
            parameters: { model: "gpt-4" },
          }),
      });

      const result = await retrieveGrantFile(directUrl);

      expect(result).toBeDefined();
      expect(result.grantee).toBe("0x1234567890123456789012345678901234567890");

      // Verify it called fetch with the direct hash (not ipfs:// prefixed)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(directUrl),
      );
    });

    it("should handle gateway failures gracefully", async () => {
      const grantUrl = "ipfs://QmTestHash";

      // Mock fetch to reject for all gateways
      mockFetch.mockRejectedValue(new Error("Gateway failed"));

      await expect(retrieveGrantFile(grantUrl)).rejects.toThrow(NetworkError);

      try {
        await retrieveGrantFile(grantUrl);
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).message).toContain(
          "Failed to retrieve grant file from any IPFS gateway",
        );
      }
    });
  });

  describe("validateGrantFile edge cases", () => {
    it("should return false for null input (line 196)", () => {
      const result = validateGrantFile(null);
      expect(result).toBe(false);
    });

    it("should return false for non-object primitive inputs (line 196-197)", () => {
      expect(validateGrantFile("string")).toBe(false);
      expect(validateGrantFile(123)).toBe(false);
      expect(validateGrantFile(true)).toBe(false);
      expect(validateGrantFile(false)).toBe(false);
      expect(validateGrantFile(undefined)).toBe(false);
    });

    it("should return false for arrays (line 196-197)", () => {
      const arrayInput = [
        {
          grantee: "0x1234567890123456789012345678901234567890",
          operation: "llm_inference",
          parameters: { model: "gpt-4" },
        },
      ];

      expect(validateGrantFile(arrayInput)).toBe(false);
    });

    it("should return false for function inputs (line 196-197)", () => {
      const functionInput = () => ({
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: { model: "gpt-4" },
      });

      expect(validateGrantFile(functionInput)).toBe(false);
    });

    it("should validate edge case with complex nested parameters", () => {
      const validComplexGrant = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "complex_operation",
        parameters: {
          level1: {
            level2: {
              level3: {
                deepValue: "test",
                array: [1, 2, 3],
                nullValue: null,
                undefinedValue: undefined,
              },
            },
          },
          functions: {
            toString: () => "custom toString",
            valueOf: () => 42,
          },
        },
        expires: 1640995200,
      };

      expect(validateGrantFile(validComplexGrant)).toBe(true);
    });
  });

  describe("IPFS URL processing", () => {
    it("should correctly process URLs that start with ipfs://", async () => {
      const ipfsUrl = "ipfs://QmTestHashWithPrefix";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            grantee: "0x1234567890123456789012345678901234567890",
            operation: "test_operation",
            parameters: { test: "value" },
          }),
      });

      await retrieveGrantFile(ipfsUrl);

      // Should call fetch with processed URL (without ipfs:// prefix)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("QmTestHashWithPrefix"),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringContaining("ipfs://"),
      );
    });

    it("should correctly process URLs that don't start with ipfs://", async () => {
      const hashOnly = "QmTestHashWithoutPrefix";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            grantee: "0x1234567890123456789012345678901234567890",
            operation: "test_operation",
            parameters: { test: "value" },
          }),
      });

      await retrieveGrantFile(hashOnly);

      // Should call fetch with the hash as-is
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining(hashOnly));
    });
  });
});
