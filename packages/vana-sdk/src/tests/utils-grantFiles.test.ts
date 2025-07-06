import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import {
  createGrantFile,
  storeGrantFile,
  retrieveGrantFile,
  getGrantFileHash,
  validateGrantFile,
} from "../utils/grantFiles";
import { NetworkError, SerializationError } from "../errors";

// Mock fetch globally
global.fetch = vi.fn();

describe("Grant Files Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createGrantFile", () => {
    it("should create a grant file with correct structure", () => {
      const params = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: {
          prompt: "Test prompt",
          maxTokens: 100,
        },
      };
      const userAddress = "0xuser123" as `0x${string}`;

      const grantFile = createGrantFile(params, userAddress);

      expect(grantFile).toEqual({
        operation: params.operation,
        files: params.files,
        parameters: params.parameters,
        metadata: {
          timestamp: expect.any(String),
          version: "1.0",
          userAddress,
        },
      });

      // Check timestamp is recent (ISO string format)
      const timestamp = new Date(grantFile.metadata.timestamp).getTime();
      expect(Date.now() - timestamp).toBeLessThan(1000);
    });

    it("should handle empty files array", () => {
      const params = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "data_query",
        files: [],
        parameters: {},
      };
      const userAddress = "0xuser456" as `0x${string}`;

      const grantFile = createGrantFile(params, userAddress);

      expect(grantFile.files).toEqual([]);
      expect(grantFile.parameters).toEqual({});
    });

    it("should handle complex parameters", () => {
      const params = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
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
      const userAddress = "0xuser789" as `0x${string}`;

      const grantFile = createGrantFile(params, userAddress);

      expect(grantFile.parameters).toEqual(params.parameters);
    });
  });

  describe("getGrantFileHash", () => {
    it("should generate consistent hash for same grant file", () => {
      const grantFile = {
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test" },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      const hash1 = getGrantFileHash(grantFile);
      const hash2 = getGrantFileHash(grantFile);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/); // Should be a hex hash
    });

    it("should generate different hashes for different grant files", () => {
      const grantFile1 = {
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test1" },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      const grantFile2 = {
        ...grantFile1,
        parameters: { prompt: "test2" },
      };

      const hash1 = getGrantFileHash(grantFile1);
      const hash2 = getGrantFileHash(grantFile2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("storeGrantFile", () => {
    const mockGrantFile = {
      operation: "llm_inference",
      files: [1, 2, 3],
      parameters: { prompt: "test" },
      metadata: {
        timestamp: "2023-01-01T00:00:00.000Z",
        version: "1.0",
        userAddress: "0xuser" as `0x${string}`,
      },
    };

    it("should store grant file and return URL", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            grantUrl: "https://ipfs.io/ipfs/QmGrantFile123",
          }),
      });

      const result = await storeGrantFile(
        mockGrantFile,
        "https://relayer.test",
      );

      expect(result).toBe("https://ipfs.io/ipfs/QmGrantFile123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://relayer.test/api/v1/parameters",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            parameters: JSON.stringify(mockGrantFile),
          }),
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
      operation: "llm_inference",
      files: [1, 2, 3],
      parameters: { prompt: "test" },
      metadata: {
        timestamp: "2023-01-01T00:00:00.000Z",
        version: "1.0",
        userAddress: "0xuser" as `0x${string}`,
      },
    };

    it("should retrieve grant file from IPFS URL", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGrantFile),
        text: () => Promise.resolve(JSON.stringify(mockGrantFile)),
      });

      const result = await retrieveGrantFile("ipfs://QmGrantFile123");

      expect(result).toEqual(mockGrantFile);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://gateway.pinata.cloud/ipfs/QmGrantFile123",
      );
    });

    it("should retrieve grant file from HTTP URL", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGrantFile),
        text: () => Promise.resolve(JSON.stringify(mockGrantFile)),
      });

      const result = await retrieveGrantFile("https://example.com/grant.json");

      expect(result).toEqual(mockGrantFile);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://gateway.pinata.cloud/ipfs/https://example.com/grant.json",
      );
    });

    it("should try multiple IPFS gateways on failure", async () => {
      const mockFetch = fetch as Mock;

      // First gateway fails
      mockFetch.mockRejectedValueOnce(new Error("Timeout"));

      // Second gateway succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGrantFile),
        text: () => Promise.resolve(JSON.stringify(mockGrantFile)),
      });

      const result = await retrieveGrantFile("ipfs://QmGrantFile123");

      expect(result).toEqual(mockGrantFile);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://gateway.pinata.cloud/ipfs/QmGrantFile123",
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://ipfs.io/ipfs/QmGrantFile123",
      );
    });

    it("should handle 404 responses", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(retrieveGrantFile("ipfs://QmMissing")).rejects.toThrow(
        "Failed to retrieve grant file from any IPFS gateway",
      );
    });

    it("should handle timeout", async () => {
      const mockFetch = fetch as Mock;
      // Mock all gateways to timeout
      mockFetch.mockRejectedValue(new Error("Request timeout"));

      await expect(retrieveGrantFile("ipfs://QmTimeout")).rejects.toThrow(
        "Failed to retrieve grant file from any IPFS gateway",
      );
    });

    it("should handle malformed JSON", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("invalid json {"),
      });

      await expect(retrieveGrantFile("ipfs://QmBadJSON")).rejects.toThrow(
        "Failed to retrieve grant file from any IPFS gateway",
      );
    });
  });

  describe("validateGrantFile", () => {
    it("should validate a correct grant file", () => {
      const validGrantFile = {
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "test" },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      expect(validateGrantFile(validGrantFile)).toBe(true);
    });

    it("should reject invalid grant files", () => {
      // Missing operation
      expect(
        validateGrantFile({
          files: [1, 2, 3],
          parameters: {},
          metadata: {
            timestamp: "2023-01-01T00:00:00.000Z",
            version: "1.0",
            userAddress: "0xuser",
          },
        }),
      ).toBe(false);

      // Missing files
      expect(
        validateGrantFile({
          operation: "test",
          parameters: {},
          metadata: {
            timestamp: "2023-01-01T00:00:00.000Z",
            version: "1.0",
            userAddress: "0xuser",
          },
        }),
      ).toBe(false);

      // Missing parameters
      expect(
        validateGrantFile({
          operation: "test",
          files: [1, 2, 3],
          metadata: {
            timestamp: "2023-01-01T00:00:00.000Z",
            version: "1.0",
            userAddress: "0xuser",
          },
        }),
      ).toBe(false);

      // Missing metadata
      expect(
        validateGrantFile({
          operation: "test",
          files: [1, 2, 3],
          parameters: {},
        }),
      ).toBe(false);

      // Invalid metadata fields
      expect(
        validateGrantFile({
          operation: "test",
          files: [1, 2, 3],
          parameters: {},
          metadata: {
            version: "1.0",
            userAddress: "0xuser",
          },
        }),
      ).toBe(false);

      // Null data
      expect(validateGrantFile(null)).toBe(false);

      // Undefined data
      expect(validateGrantFile(undefined)).toBe(false);

      // Non-object data
      expect(validateGrantFile("not an object")).toBe(false);

      // Files not an array
      expect(
        validateGrantFile({
          operation: "test",
          files: "not an array",
          parameters: {},
          metadata: {
            timestamp: "2023-01-01T00:00:00.000Z",
            version: "1.0",
            userAddress: "0xuser",
          },
        }),
      ).toBe(false);

      // Parameters not an object
      expect(
        validateGrantFile({
          operation: "test",
          files: [1, 2, 3],
          parameters: "not an object",
          metadata: {
            timestamp: "2023-01-01T00:00:00.000Z",
            version: "1.0",
            userAddress: "0xuser",
          },
        }),
      ).toBe(false);
    });
  });

  describe("getGrantFileHash edge cases", () => {
    it("should handle complex nested objects", () => {
      const grantFile = {
        operation: "test",
        files: [3, 1, 2], // Unsorted - should be sorted in hash
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
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      const hash = getGrantFileHash(grantFile);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle arrays in parameters", () => {
      const grantFile = {
        operation: "test",
        files: [1, 2, 3],
        parameters: {
          arrayParam: [3, 1, 2],
          nestedArray: [
            { b: 2, a: 1 },
            { d: 4, c: 3 },
          ],
        },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      const hash = getGrantFileHash(grantFile);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle null and primitive values", () => {
      const grantFile = {
        operation: "test",
        files: [1, 2, 3],
        parameters: {
          nullValue: null,
          stringValue: "test",
          numberValue: 123,
          booleanValue: true,
        },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      const hash = getGrantFileHash(grantFile);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should throw SerializationError for invalid data", () => {
      const grantFile = {
        operation: "test",
        files: [1, 2, 3],
        parameters: {
          circular: {} as any,
        },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      // Create circular reference
      grantFile.parameters.circular.self = grantFile.parameters.circular;

      expect(() => getGrantFileHash(grantFile)).toThrow(SerializationError);
    });
  });

  describe("retrieveGrantFile additional edge cases", () => {
    it("should handle invalid grant file validation", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              operation: "test",
              // Missing required fields like files, parameters, metadata
            }),
          ),
      });

      await expect(retrieveGrantFile("ipfs://QmInvalid")).rejects.toThrow(
        "Failed to retrieve grant file from any IPFS gateway",
      );
    });
  });

  describe("storeGrantFile error handling", () => {
    it("should handle non-Error exceptions in catch block", async () => {
      // Mock fetch to throw non-Error object
      const mockFetch = fetch as Mock;
      mockFetch.mockRejectedValue({ code: 500, message: "Server error" });

      const grantFile = {
        operation: "test",
        files: [1, 2, 3],
        parameters: { key: "value" },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      await expect(
        storeGrantFile(grantFile, "https://relayer.com"),
      ).rejects.toThrow(
        "Network error while storing grant file: Unknown error",
      );
    });

    it("should handle undefined exceptions in catch block", async () => {
      // Mock fetch to throw undefined
      const mockFetch = fetch as Mock;
      mockFetch.mockRejectedValue(undefined);

      const grantFile = {
        operation: "test",
        files: [1, 2, 3],
        parameters: { key: "value" },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      await expect(
        storeGrantFile(grantFile, "https://relayer.com"),
      ).rejects.toThrow(
        "Network error while storing grant file: Unknown error",
      );
    });
  });

  describe("retrieveGrantFile", () => {
    it("should handle non-NetworkError exceptions in catch block", async () => {
      // Mock fetch to throw a non-NetworkError
      const mockFetch = fetch as Mock;
      mockFetch.mockRejectedValue(new Error("Some other error"));

      await expect(
        retrieveGrantFile("https://example.com/grant.json"),
      ).rejects.toThrow("Failed to retrieve grant file from any IPFS gateway");
    });

    it("should re-throw NetworkError exceptions directly", async () => {
      // Mock fetch to throw a NetworkError
      const mockFetch = fetch as Mock;
      const networkError = new NetworkError(
        "Network failed",
        new Error("Base error"),
      );
      mockFetch.mockRejectedValue(networkError);

      await expect(
        retrieveGrantFile("https://example.com/grant.json"),
      ).rejects.toThrow(NetworkError);
    });

    it("should handle non-Error thrown during IPFS hash extraction from grant URL", async () => {
      // Mock String.prototype.startsWith to throw non-Error when checking for 'ipfs://'
      const originalStartsWith = String.prototype.startsWith;
      String.prototype.startsWith = function (searchString: string) {
        if (
          this.toString().includes("example.com") &&
          searchString === "ipfs://"
        ) {
          throw { code: "INVALID_URL", message: "URL parsing failed" }; // Non-Error object
        }
        return originalStartsWith.call(this, searchString);
      };

      try {
        await retrieveGrantFile("https://example.com/grant.json");
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).message).toBe(
          "Error retrieving grant file: Unknown error",
        );
      } finally {
        String.prototype.startsWith = originalStartsWith;
      }
    });

    it("should handle non-Error thrown during grant file parsing after retrieval", async () => {
      // This test targets the outer catch by making extracting the IPFS hash throw non-Error
      // We override String.prototype.startsWith in a way that will trigger early in the function
      const originalStartsWith = String.prototype.startsWith;
      String.prototype.startsWith = function (searchString: string) {
        if (
          this.toString() === "ipfs://QmTestHash" &&
          searchString === "ipfs://"
        ) {
          throw "Hash extraction failed"; // Non-Error string that won't be caught by inner try-catch
        }
        return originalStartsWith.call(this, searchString);
      };

      try {
        await retrieveGrantFile("ipfs://QmTestHash");
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).message).toBe(
          "Error retrieving grant file: Unknown error",
        );
      } finally {
        String.prototype.startsWith = originalStartsWith;
      }
    });

    it("should handle non-Error exceptions in grant file retrieval", async () => {
      // Mock fetch to throw a non-Error object that is NOT a NetworkError
      const mockFetch = fetch as Mock;
      mockFetch.mockImplementation(() => {
        throw { code: 500, message: "Server error" }; // Non-Error, non-NetworkError object
      });

      try {
        await retrieveGrantFile("https://example.com/grant.json");
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as Error).message).toContain(
          "Failed to retrieve grant file from any IPFS gateway",
        );
      }
    });

    it("should handle non-Error exceptions when data.error is falsy (line 61)", async () => {
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: null, // Falsy error to trigger || fallback
          }),
      });

      const grantFile = {
        operation: "test",
        files: [1, 2, 3],
        parameters: { key: "value" },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      await expect(
        storeGrantFile(grantFile, "https://relayer.com"),
      ).rejects.toThrow("Failed to store grant file");
    });
  });

  describe("getGrantFileHash error handling", () => {
    it("should handle non-Error exceptions in hash generation (line 164)", () => {
      // Mock JSON.stringify to throw non-Error during hash generation
      const originalStringify = JSON.stringify;
      JSON.stringify = function (value: any) {
        if (value && value.operation === "test-hash") {
          throw { code: "STRINGIFY_FAILED", reason: "Cannot serialize" }; // Non-Error object
        }
        return originalStringify.call(this, value);
      };

      const grantFile = {
        operation: "test-hash",
        files: [1, 2, 3],
        parameters: { key: "value" },
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xuser" as `0x${string}`,
        },
      };

      try {
        getGrantFileHash(grantFile);
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SerializationError);
        expect((error as SerializationError).message).toBe(
          "Failed to generate grant file hash: Unknown error",
        );
      } finally {
        JSON.stringify = originalStringify;
      }
    });
  });

  describe("retrieveGrantFile error handling", () => {
    it("should handle non-Error exceptions in outer catch with instanceof check (line 135)", async () => {
      // Mock String.prototype.replace to throw non-Error at the very start of the function
      const originalReplace = String.prototype.replace;
      String.prototype.replace = function (
        searchValue: any,
        replaceValue: any,
      ) {
        if (
          this.toString() === "ipfs://QmTestHash" &&
          searchValue === "ipfs://"
        ) {
          throw "URL processing failed"; // Non-Error string that will be caught in outer catch
        }
        return originalReplace.call(this, searchValue, replaceValue);
      };

      try {
        await retrieveGrantFile("ipfs://QmTestHash");
        expect.fail("Expected an error to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).message).toBe(
          "Error retrieving grant file: Unknown error",
        );
      } finally {
        String.prototype.replace = originalReplace;
      }
    });

    it("should handle synchronous non-Error exceptions to cover the Unknown error branch (line 135)", async () => {
      // Mock Symbol.iterator to throw during the for-loop setup to hit outer catch
      const grantUrl = "ipfs://QmTestHashForFailure";
      const errorMessage = "Iterator failed";

      // Mock the array iterator that the for-loop uses
      const originalIterator = Array.prototype[Symbol.iterator];
      Array.prototype[Symbol.iterator] = function* (this: any[]) {
        if (
          this.length === 3 &&
          this[0] &&
          this[0].includes("gateway.pinata.cloud")
        ) {
          throw errorMessage; // Throw during for-loop initialization
        }
        yield* originalIterator.call(this);
      };

      try {
        await expect(retrieveGrantFile(grantUrl)).rejects.toThrow(
          "Error retrieving grant file: Unknown error",
        );

        // Detailed check
        try {
          await retrieveGrantFile(grantUrl);
          expect.fail("Expected error");
        } catch (error) {
          expect(error).toBeInstanceOf(NetworkError);
          expect((error as NetworkError).message).toBe(
            "Error retrieving grant file: Unknown error",
          );
        }
      } finally {
        // Clean up
        Array.prototype[Symbol.iterator] = originalIterator;
      }
    });
  });
});
