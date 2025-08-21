/**
 * Tests for URL resolver utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchFromUrl, UrlResolutionError } from "../urlResolver";

// Mock the download module with fetchWithRelayer
vi.mock("../download", () => ({
  fetchWithRelayer: vi.fn(),
}));

import { fetchWithRelayer } from "../download";
const mockFetchWithRelayer = vi.mocked(fetchWithRelayer);

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

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("UrlResolutionError");
      expect(error.message).toBe("Failed to resolve");
      expect(error.url).toBe("https://example.com");
      expect(error.cause).toBe(cause);
    });

    it("should work without cause", () => {
      const error = new UrlResolutionError(
        "Failed to resolve",
        "https://example.com",
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Failed to resolve");
      expect(error.url).toBe("https://example.com");
      expect(error.cause).toBeUndefined();
    });
  });

  describe("fetchFromUrl", () => {
    describe("successful fetches", () => {
      it("should fetch from HTTPS URL", async () => {
        const testData = { message: "success" };
        mockFetchWithRelayer.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        } as Response);

        const result = await fetchFromUrl("https://example.com/data.json");

        expect(result).toEqual(testData);
        expect(mockFetchWithRelayer).toHaveBeenCalledWith(
          "https://example.com/data.json",
          undefined,
        );
      });

      it("should fetch from HTTP URL", async () => {
        const testData = { message: "success" };
        mockFetchWithRelayer.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        } as Response);

        const result = await fetchFromUrl("http://example.com/data.json");

        expect(result).toEqual(testData);
        expect(mockFetchWithRelayer).toHaveBeenCalledWith(
          "http://example.com/data.json",
          undefined,
        );
      });

      it("should fetch from IPFS URL", async () => {
        const testData = { message: "ipfs data" };
        mockFetchWithRelayer.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        } as Response);

        const result = await fetchFromUrl("ipfs://QmXxx123");

        expect(result).toEqual(testData);
        expect(mockFetchWithRelayer).toHaveBeenCalledWith(
          "ipfs://QmXxx123",
          undefined,
        );
      });

      it("should fetch from Arweave URL", async () => {
        const testData = { message: "arweave data" };
        mockFetchWithRelayer.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        } as Response);

        const result = await fetchFromUrl("ar://abc123def456");

        expect(result).toEqual(testData);
        expect(mockFetchWithRelayer).toHaveBeenCalledWith(
          "ar://abc123def456",
          undefined,
        );
      });
    });

    describe("error handling", () => {
      it("should throw UrlResolutionError for unsupported protocol", async () => {
        mockFetchWithRelayer.mockRejectedValueOnce(
          new Error("Unsupported protocol"),
        );

        await expect(fetchFromUrl("ftp://example.com/file")).rejects.toThrow(
          UrlResolutionError,
        );
      });

      it("should throw UrlResolutionError for HTTP error responses", async () => {
        mockFetchWithRelayer.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
        } as Response);

        try {
          await fetchFromUrl("https://example.com/notfound");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(UrlResolutionError);
          expect((error as UrlResolutionError).message).toContain(
            "HTTP 404: Not Found",
          );
        }
      });

      it("should throw UrlResolutionError for JSON parsing errors", async () => {
        mockFetchWithRelayer.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.reject(new Error("Invalid JSON")),
        } as Response);

        try {
          await fetchFromUrl("https://example.com/invalid");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(UrlResolutionError);
          expect((error as UrlResolutionError).message).toContain(
            "Invalid JSON",
          );
        }
      });

      it("should throw UrlResolutionError for network errors", async () => {
        mockFetchWithRelayer.mockRejectedValueOnce(new Error("Network error"));

        try {
          await fetchFromUrl("https://example.com/error");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(UrlResolutionError);
          expect((error as UrlResolutionError).message).toContain(
            "Network error",
          );
        }
      });
    });

    describe("edge cases", () => {
      it("should handle empty URLs", async () => {
        mockFetchWithRelayer.mockRejectedValueOnce(new Error("Invalid URL"));

        await expect(fetchFromUrl("")).rejects.toThrow(UrlResolutionError);
      });

      it("should handle invalid URLs", async () => {
        mockFetchWithRelayer.mockRejectedValueOnce(new Error("Invalid URL"));

        await expect(fetchFromUrl("not-a-url")).rejects.toThrow(
          UrlResolutionError,
        );
      });

      it("should handle URLs with query parameters", async () => {
        const testData = { message: "with params" };
        mockFetchWithRelayer.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        } as Response);

        const result = await fetchFromUrl(
          "https://example.com/api?param=value&other=test",
        );

        expect(result).toEqual(testData);
        expect(mockFetchWithRelayer).toHaveBeenCalledWith(
          "https://example.com/api?param=value&other=test",
          undefined,
        );
      });

      it("should handle URLs with fragments", async () => {
        const testData = { message: "with fragment" };
        mockFetchWithRelayer.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        } as Response);

        const result = await fetchFromUrl("https://example.com/page#section");

        expect(result).toEqual(testData);
        expect(mockFetchWithRelayer).toHaveBeenCalledWith(
          "https://example.com/page#section",
          undefined,
        );
      });
    });

    describe("with download relayer", () => {
      it("should pass download relayer to fetchWithRelayer", async () => {
        const testData = { message: "relayed" };
        const mockRelayer = {
          proxyDownload: vi.fn().mockResolvedValue(new Blob()),
        };

        mockFetchWithRelayer.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        } as Response);

        const result = await fetchFromUrl(
          "https://example.com/data.json",
          mockRelayer,
        );

        expect(result).toEqual(testData);
        expect(mockFetchWithRelayer).toHaveBeenCalledWith(
          "https://example.com/data.json",
          mockRelayer,
        );
      });
    });
  });
});
