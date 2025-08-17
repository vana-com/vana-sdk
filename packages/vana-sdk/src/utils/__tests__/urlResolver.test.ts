/**
 * Tests for URL resolver utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchFromUrl, UrlResolutionError } from "../urlResolver";

// Mock the ipfs utility
vi.mock("../ipfs", () => ({
  convertIpfsUrl: vi.fn((url: string, gateway?: string) => {
    if (gateway) {
      return url.replace("ipfs://", `${gateway}/ipfs/`);
    }
    return url.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
  }),
  IPFS_GATEWAYS: [
    "https://gateway.pinata.cloud",
    "https://cloudflare-ipfs.com",
    "https://ipfs.io",
  ],
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("urlResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("UrlResolutionError", () => {
    it("should create error with correct properties", () => {
      const cause = new Error("Network error");
      const error = new UrlResolutionError(
        "Failed to resolve",
        "https://example.com",
        cause,
      );

      expect(error.message).toBe("Failed to resolve");
      expect(error.url).toBe("https://example.com");
      expect(error.cause).toBe(cause);
      expect(error.name).toBe("UrlResolutionError");
    });

    it("should create error without cause", () => {
      const error = new UrlResolutionError(
        "Failed to resolve",
        "https://example.com",
      );

      expect(error.message).toBe("Failed to resolve");
      expect(error.url).toBe("https://example.com");
      expect(error.cause).toBeUndefined();
    });
  });

  describe("fetchFromUrl", () => {
    describe("successful fetches", () => {
      it("should fetch from HTTPS URL", async () => {
        const testData = { message: "success" };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        });

        const result = await fetchFromUrl("https://example.com/data.json");

        expect(result).toEqual(testData);
        expect(mockFetch).toHaveBeenCalledWith("https://example.com/data.json");
      });

      it("should fetch from HTTP URL", async () => {
        const testData = { message: "success" };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        });

        const result = await fetchFromUrl("http://example.com/data.json");

        expect(result).toEqual(testData);
        expect(mockFetch).toHaveBeenCalledWith("http://example.com/data.json");
      });

      it("should fetch from IPFS URL", async () => {
        const testData = { message: "ipfs data" };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        });

        const result = await fetchFromUrl("ipfs://QmXxx123");

        expect(result).toEqual(testData);
        expect(mockFetch).toHaveBeenCalledWith(
          "https://gateway.pinata.cloud/ipfs/QmXxx123",
        );
      });

      it("should fetch from Arweave URL", async () => {
        const testData = { message: "arweave data" };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        });

        const result = await fetchFromUrl("ar://abc123def456");

        expect(result).toEqual(testData);
        expect(mockFetch).toHaveBeenCalledWith(
          "https://arweave.net/abc123def456",
        );
      });
    });

    describe("error handling", () => {
      it("should throw UrlResolutionError for unsupported protocol", async () => {
        await expect(fetchFromUrl("ftp://example.com/file")).rejects.toThrow(
          UrlResolutionError,
        );
        await expect(fetchFromUrl("ftp://example.com/file")).rejects.toThrow(
          "Unsupported protocol in URL",
        );
      });

      it("should throw UrlResolutionError for HTTP error responses", async () => {
        // First attempt gets non-ok response, then final retry gets same response
        const badResponse = {
          ok: false,
          status: 404,
          statusText: "Not Found",
        };
        mockFetch
          .mockResolvedValueOnce(badResponse)
          .mockResolvedValueOnce(badResponse);

        try {
          await fetchFromUrl("https://example.com/missing");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(UrlResolutionError);
          expect(error.message).toContain("HTTP 404: Not Found");
        }
      });

      it("should throw UrlResolutionError for JSON parsing errors", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.reject(new Error("Invalid JSON")),
        });

        try {
          await fetchFromUrl("https://example.com/invalid");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(UrlResolutionError);
          expect(error.message).toContain("Invalid JSON");
        }
      });

      it("should throw UrlResolutionError for network errors", async () => {
        // First attempt throws, then final retry throws again
        mockFetch
          .mockRejectedValueOnce(new Error("Network error"))
          .mockRejectedValueOnce(new Error("Network error"));

        try {
          await fetchFromUrl("https://example.com/unreachable");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(UrlResolutionError);
          expect(error.message).toContain("Network error");
        }
      });
    });

    describe("IPFS gateway retry logic", () => {
      it("should retry with alternative IPFS gateways on failure", async () => {
        // First gateway fails
        mockFetch
          .mockRejectedValueOnce(new Error("Gateway 1 failed"))
          // Second gateway succeeds
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ data: "success" }),
          });

        const result = await fetchFromUrl("ipfs://QmTest123");

        expect(result).toEqual({ data: "success" });
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(
          1,
          "https://gateway.pinata.cloud/ipfs/QmTest123",
        );
        expect(mockFetch).toHaveBeenNthCalledWith(
          2,
          "https://cloudflare-ipfs.com/ipfs/QmTest123",
        );
      });

      it("should try all gateways and final retry on all failures", async () => {
        // All attempts fail until the final one
        mockFetch
          .mockRejectedValueOnce(new Error("Gateway 1 failed"))
          .mockRejectedValueOnce(new Error("Gateway 2 failed"))
          .mockRejectedValueOnce(new Error("Gateway 3 failed"))
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ data: "final attempt" }),
          });

        const result = await fetchFromUrl("ipfs://QmTest456");

        expect(result).toEqual({ data: "final attempt" });
        expect(mockFetch).toHaveBeenCalledTimes(4);
      });

      it("should handle first gateway responding with non-ok status", async () => {
        // First gateway returns non-ok response
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
          })
          // Second gateway succeeds
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ data: "retry success" }),
          });

        const result = await fetchFromUrl("ipfs://QmTest789");

        expect(result).toEqual({ data: "retry success" });
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it("should not retry for non-IPFS URLs", async () => {
        mockFetch
          .mockRejectedValueOnce(new Error("HTTPS failed"))
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
          });

        await expect(fetchFromUrl("https://example.com/fail")).rejects.toThrow(
          UrlResolutionError,
        );
        expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + final retry
      });

      it("should skip already tried gateway URL", async () => {
        // Mock convertIpfsUrl to return the same URL for the first gateway
        const { convertIpfsUrl } = await import("../ipfs");
        vi.mocked(convertIpfsUrl)
          .mockReturnValueOnce("https://gateway.pinata.cloud/ipfs/QmTest")
          .mockReturnValueOnce("https://gateway.pinata.cloud/ipfs/QmTest") // Same URL, should skip
          .mockReturnValueOnce("https://cloudflare-ipfs.com/ipfs/QmTest");

        mockFetch
          .mockRejectedValueOnce(new Error("First failed"))
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ data: "success" }),
          });

        const result = await fetchFromUrl("ipfs://QmTest");

        expect(result).toEqual({ data: "success" });
        // Should only call fetch twice: initial attempt + one retry (skipped duplicate)
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    describe("edge cases", () => {
      it("should handle empty URLs", async () => {
        await expect(fetchFromUrl("")).rejects.toThrow(UrlResolutionError);
        await expect(fetchFromUrl("")).rejects.toThrow("Unsupported protocol");
      });

      it("should handle malformed URLs", async () => {
        await expect(fetchFromUrl("not-a-url")).rejects.toThrow(
          UrlResolutionError,
        );
        await expect(fetchFromUrl("://missing-protocol")).rejects.toThrow(
          UrlResolutionError,
        );
      });

      it("should handle URLs with query parameters", async () => {
        const testData = { message: "with params" };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        });

        const result = await fetchFromUrl(
          "https://example.com/api?param=value&other=test",
        );

        expect(result).toEqual(testData);
        expect(mockFetch).toHaveBeenCalledWith(
          "https://example.com/api?param=value&other=test",
        );
      });

      it("should handle URLs with fragments", async () => {
        const testData = { message: "with fragment" };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        });

        const result = await fetchFromUrl("https://example.com/page#section");

        expect(result).toEqual(testData);
        expect(mockFetch).toHaveBeenCalledWith(
          "https://example.com/page#section",
        );
      });
    });
  });
});
