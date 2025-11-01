/**
 * Tests for the universal download utility
 *
 * Covers:
 * - Arweave URL protocol conversion
 * - IPFS URL handling with gateway fallbacks
 * - Direct HTTP/HTTPS fetches
 * - Relayer fallback mechanisms
 * - Error scenarios and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { universalFetch } from "../download";

// Mock the IPFS utilities
vi.mock("../ipfs", () => ({
  extractIpfsHash: vi.fn(),
  fetchWithFallbacks: vi.fn(),
}));

import { extractIpfsHash, fetchWithFallbacks } from "../ipfs";
const mockExtractIpfsHash = vi.mocked(extractIpfsHash);
const mockFetchWithFallbacks = vi.mocked(fetchWithFallbacks);

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("universalFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    mockExtractIpfsHash.mockClear();
    mockFetchWithFallbacks.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Arweave URL handling", () => {
    it("should convert ar:// protocol to arweave.net HTTPS URL", async () => {
      const txId = "abc123defXYZ";
      const mockResponse = new Response("arweave content");
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(`ar://${txId}`);

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(`https://arweave.net/${txId}`);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("should preserve arweave.net URL when fetching", async () => {
      const mockResponse = new Response("arweave content");
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch("https://arweave.net/abc123");

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith("https://arweave.net/abc123");
    });

    it("should handle arweave URLs with long transaction IDs", async () => {
      const longTxId =
        "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const mockResponse = new Response("content");
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      await universalFetch(`ar://${longTxId}`);

      expect(mockFetch).toHaveBeenCalledWith(`https://arweave.net/${longTxId}`);
    });
  });

  describe("IPFS URL handling", () => {
    it("should use fetchWithFallbacks for IPFS URLs", async () => {
      const ipfsUrl = "ipfs://QmXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      const mockResponse = new Response("ipfs content");
      mockExtractIpfsHash.mockReturnValue("QmXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
      mockFetchWithFallbacks.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(ipfsUrl);

      expect(result).toBe(mockResponse);
      expect(mockFetchWithFallbacks).toHaveBeenCalledWith(ipfsUrl);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle gateway IPFS URLs (https://gateway.../ipfs/...)", async () => {
      const gatewayUrl = "https://gateway.pinata.cloud/ipfs/QmHash123";
      const hash = "QmHash123";
      const mockResponse = new Response("content from gateway");
      mockExtractIpfsHash.mockReturnValue(hash);
      mockFetchWithFallbacks.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(gatewayUrl);

      expect(result).toBe(mockResponse);
      expect(mockFetchWithFallbacks).toHaveBeenCalledWith(gatewayUrl);
    });

    it("should extract hash from various IPFS URL formats", async () => {
      const testCases = [
        "ipfs://QmHash123",
        "https://ipfs.io/ipfs/QmHash123",
        "https://dweb.link/ipfs/QmHash123",
        "QmHash123456789012345678901234567890123456",
      ];

      for (const url of testCases) {
        vi.clearAllMocks();
        const mockResponse = new Response("content");
        mockExtractIpfsHash.mockReturnValue("QmHash123");
        mockFetchWithFallbacks.mockResolvedValueOnce(mockResponse);

        await universalFetch(url);

        expect(mockFetchWithFallbacks).toHaveBeenCalled();
      }
    });
  });

  describe("Direct HTTP/HTTPS fetch", () => {
    it("should fetch direct HTTPS URLs without relayer", async () => {
      const url = "https://example.com/data.json";
      const mockResponse = new Response("https content");
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(url);

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(url);
      expect(mockFetchWithFallbacks).not.toHaveBeenCalled();
    });

    it("should fetch direct HTTP URLs without relayer", async () => {
      const url = "http://example.com/file.pdf";
      const mockResponse = new Response("http content");
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(url);

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(url);
    });

    it("should handle URLs with query parameters", async () => {
      const url = "https://example.com/data?key=value&format=json";
      const mockResponse = new Response("data with params");
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      await universalFetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
    });

    it("should handle URLs with fragments", async () => {
      const url = "https://example.com/page#section";
      const mockResponse = new Response("content with fragment");
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      await universalFetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
    });
  });

  describe("Relayer fallback for non-IPFS URLs", () => {
    it("should use relayer when direct fetch fails", async () => {
      const url = "https://example.com/file.json";
      const mockBlob = new Blob(["relayer content"]);
      const mockRelayer = {
        proxyDownload: vi.fn().mockResolvedValueOnce(mockBlob),
      };
      const mockError = new Error("Network error");

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(mockError);

      const result = await universalFetch(url, mockRelayer);

      expect(mockRelayer.proxyDownload).toHaveBeenCalledWith(url);
      expect(result.constructor.name).toBe("Response");
    });

    it("should convert relayer blob response to Response object", async () => {
      const url = "https://cors-protected.example.com/data";
      const mockBlob = new Blob(["blob data"]);
      const mockRelayer = {
        proxyDownload: vi.fn().mockResolvedValueOnce(mockBlob),
      };

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(new Error("CORS error"));

      const result = await universalFetch(url, mockRelayer);

      expect(result).toBeInstanceOf(Response);
    });

    it("should throw original error if relayer also fails", async () => {
      const url = "https://example.com/file.json";
      const originalError = new Error("Network timeout");
      const mockRelayer = {
        proxyDownload: vi.fn().mockRejectedValueOnce(new Error("Relayer down")),
      };

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(originalError);

      await expect(universalFetch(url, mockRelayer)).rejects.toThrow(
        originalError,
      );
      expect(mockRelayer.proxyDownload).toHaveBeenCalledWith(url);
    });

    it("should not use relayer if direct fetch succeeds", async () => {
      const url = "https://example.com/file.json";
      const mockResponse = new Response("success");
      const mockRelayer = {
        proxyDownload: vi.fn(),
      };

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(url, mockRelayer);

      expect(result).toBe(mockResponse);
      expect(mockRelayer.proxyDownload).not.toHaveBeenCalled();
    });
  });

  describe("IPFS relayer fallback", () => {
    it("should use relayer when all IPFS gateways fail", async () => {
      const ipfsUrl = "ipfs://QmHash123";
      const hash = "QmHash123";
      const mockBlob = new Blob(["relayer ipfs content"]);
      const mockRelayer = {
        proxyDownload: vi.fn().mockResolvedValueOnce(mockBlob),
      };
      const ipfsError = new Error("All IPFS gateways failed");

      mockExtractIpfsHash.mockReturnValue(hash);
      mockFetchWithFallbacks.mockRejectedValueOnce(ipfsError);

      const result = await universalFetch(ipfsUrl, mockRelayer);

      expect(mockRelayer.proxyDownload).toHaveBeenCalledWith(
        `https://gateway.pinata.cloud/ipfs/${hash}`,
      );
      expect(result).toBeInstanceOf(Response);
    });

    it("should throw IPFS error if relayer also fails for IPFS URLs", async () => {
      const ipfsUrl = "ipfs://QmHash123";
      const hash = "QmHash123";
      const ipfsError = new Error("All IPFS gateways failed");
      const mockRelayer = {
        proxyDownload: vi.fn().mockRejectedValueOnce(new Error("Relayer down")),
      };

      mockExtractIpfsHash.mockReturnValue(hash);
      mockFetchWithFallbacks.mockRejectedValueOnce(ipfsError);

      await expect(universalFetch(ipfsUrl, mockRelayer)).rejects.toThrow(
        ipfsError,
      );
    });

    it("should not use relayer if IPFS fetch succeeds", async () => {
      const ipfsUrl = "ipfs://QmHash123";
      const mockResponse = new Response("ipfs content");
      const mockRelayer = {
        proxyDownload: vi.fn(),
      };

      mockExtractIpfsHash.mockReturnValue("QmHash123");
      mockFetchWithFallbacks.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(ipfsUrl, mockRelayer);

      expect(result).toBe(mockResponse);
      expect(mockRelayer.proxyDownload).not.toHaveBeenCalled();
    });

    it("should use gateway.pinata.cloud for relayer fallback", async () => {
      const ipfsUrl = "ipfs://QmVeryLongHashHere";
      const hash = "QmVeryLongHashHere";
      const mockBlob = new Blob(["content"]);
      const mockRelayer = {
        proxyDownload: vi.fn().mockResolvedValueOnce(mockBlob),
      };

      mockExtractIpfsHash.mockReturnValue(hash);
      mockFetchWithFallbacks.mockRejectedValueOnce(
        new Error("All gateways failed"),
      );

      await universalFetch(ipfsUrl, mockRelayer);

      expect(mockRelayer.proxyDownload).toHaveBeenCalledWith(
        `https://gateway.pinata.cloud/ipfs/${hash}`,
      );
    });
  });

  describe("Error scenarios", () => {
    it("should throw error with formatted message for direct fetch failure", async () => {
      const url = "https://example.com/file.json";
      const errorMessage = "Connection refused";
      const mockError = new Error(errorMessage);

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(mockError);

      await expect(universalFetch(url)).rejects.toThrow(
        `Failed to fetch from ${url}: ${errorMessage}`,
      );
    });

    it("should format error message with non-Error objects", async () => {
      const url = "https://example.com/file.json";
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce("string error");

      await expect(universalFetch(url)).rejects.toThrow(
        `Failed to fetch from ${url}: Unknown error`,
      );
    });

    it("should format error message with null error object", async () => {
      const url = "https://example.com/file.json";
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(null);

      await expect(universalFetch(url)).rejects.toThrow(
        `Failed to fetch from ${url}: Unknown error`,
      );
    });

    it("should include processed URL in error (arweave)", async () => {
      const txId = "abc123";
      const processedUrl = `https://arweave.net/${txId}`;
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(new Error("Not found"));

      await expect(universalFetch(`ar://${txId}`)).rejects.toThrow(
        `Failed to fetch from ${processedUrl}`,
      );
    });
  });

  describe("Network timeout scenarios", () => {
    it("should handle fetch timeout errors", async () => {
      const url = "https://slow-server.example.com/file";
      const timeoutError = new Error("The operation timed out");
      timeoutError.name = "AbortError";

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(timeoutError);

      await expect(universalFetch(url)).rejects.toThrow();
    });

    it("should attempt relayer fallback on timeout", async () => {
      const url = "https://slow-server.example.com/file";
      const timeoutError = new Error("The operation timed out");
      const mockBlob = new Blob(["fallback content"]);
      const mockRelayer = {
        proxyDownload: vi.fn().mockResolvedValueOnce(mockBlob),
      };

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(timeoutError);

      const result = await universalFetch(url, mockRelayer);

      expect(mockRelayer.proxyDownload).toHaveBeenCalledWith(url);
      expect(result).toBeInstanceOf(Response);
    });
  });

  describe("CORS error scenarios", () => {
    it("should handle CORS errors with relayer bypass", async () => {
      const url = "https://cors-api.example.com/data";
      const corsError = new TypeError("Failed to fetch");
      const mockBlob = new Blob(["cors bypassed content"]);
      const mockRelayer = {
        proxyDownload: vi.fn().mockResolvedValueOnce(mockBlob),
      };

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(corsError);

      const result = await universalFetch(url, mockRelayer);

      expect(mockRelayer.proxyDownload).toHaveBeenCalledWith(url);
      expect(result).toBeInstanceOf(Response);
    });

    it("should throw original CORS error if relayer unavailable", async () => {
      const url = "https://cors-api.example.com/data";
      const corsError = new TypeError("Failed to fetch");

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(corsError);

      await expect(universalFetch(url)).rejects.toThrow(
        `Failed to fetch from ${url}: Failed to fetch`,
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle empty string URL", async () => {
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockRejectedValueOnce(new Error("Invalid URL"));

      await expect(universalFetch("")).rejects.toThrow();
    });

    it("should handle very long URLs", async () => {
      const longUrl =
        "https://example.com/" + "a".repeat(1000) + "?param=" + "b".repeat(500);
      const mockResponse = new Response("content");

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(longUrl);

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(longUrl);
    });

    it("should handle URLs with special characters", async () => {
      const url =
        "https://example.com/file%20with%20spaces.json?key=value&special=!@#$";
      const mockResponse = new Response("content");

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      await universalFetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
    });

    it("should handle URLs with international characters", async () => {
      const url = "https://example.com/файл.json";
      const mockResponse = new Response("content");

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      await universalFetch(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
    });

    it("should handle IPFS hash that looks like a URL", async () => {
      const fakeHashUrl = "QmAbcdEfghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRS";
      const mockResponse = new Response("content");

      mockExtractIpfsHash.mockReturnValue(fakeHashUrl);
      mockFetchWithFallbacks.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(fakeHashUrl);

      expect(mockFetchWithFallbacks).toHaveBeenCalled();
      expect(result).toBe(mockResponse);
    });

    it("should handle response objects with various status codes", async () => {
      const url = "https://example.com/file";
      const mockResponse = new Response("content", { status: 206 });

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(url);

      expect(result.status).toBe(206);
    });

    it("should handle response objects with custom headers", async () => {
      const url = "https://example.com/file";
      const headers = new Headers({
        "content-type": "application/json",
        "x-custom-header": "value",
      });
      const mockResponse = new Response("content", { headers });

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(url);

      expect(result.headers.get("x-custom-header")).toBe("value");
    });
  });

  describe("Integration scenarios", () => {
    it("should handle sequential calls with different URL types", async () => {
      const responses = [
        new Response("https content"),
        new Response("ipfs content"),
        new Response("arweave content"),
      ];

      // First call: HTTPS
      mockExtractIpfsHash.mockReturnValueOnce(null);
      mockFetch.mockResolvedValueOnce(responses[0]);
      let result = await universalFetch("https://example.com/file");
      expect(result).toBe(responses[0]);

      // Second call: IPFS
      mockExtractIpfsHash.mockReturnValueOnce("QmHash123");
      mockFetchWithFallbacks.mockResolvedValueOnce(responses[1]);
      result = await universalFetch("ipfs://QmHash123");
      expect(result).toBe(responses[1]);

      // Third call: Arweave
      mockExtractIpfsHash.mockReturnValueOnce(null);
      mockFetch.mockResolvedValueOnce(responses[2]);
      result = await universalFetch("ar://abc123");
      expect(result).toBe(responses[2]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetchWithFallbacks).toHaveBeenCalledTimes(1);
    });

    it("should handle mixed success and failure scenarios", async () => {
      const mockBlob = new Blob(["relayed content"]);
      const mockRelayer = {
        proxyDownload: vi.fn().mockResolvedValueOnce(mockBlob),
      };

      // First call succeeds directly
      mockExtractIpfsHash.mockReturnValueOnce(null);
      mockFetch.mockResolvedValueOnce(new Response("success"));
      let result = await universalFetch("https://example.com/1");
      expect(result.ok).toBeDefined();

      // Second call fails then relayer succeeds
      mockExtractIpfsHash.mockReturnValueOnce(null);
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      result = await universalFetch("https://example.com/2", mockRelayer);
      expect(result).toBeInstanceOf(Response);

      expect(mockRelayer.proxyDownload).toHaveBeenCalledOnce();
    });

    it("should preserve relayer across multiple calls", async () => {
      const mockBlob1 = new Blob(["content1"]);
      const mockBlob2 = new Blob(["content2"]);
      const mockRelayer = {
        proxyDownload: vi
          .fn()
          .mockResolvedValueOnce(mockBlob1)
          .mockResolvedValueOnce(mockBlob2),
      };

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch
        .mockRejectedValueOnce(new Error("Error 1"))
        .mockRejectedValueOnce(new Error("Error 2"));

      await universalFetch("https://example.com/1", mockRelayer);
      await universalFetch("https://example.com/2", mockRelayer);

      expect(mockRelayer.proxyDownload).toHaveBeenCalledTimes(2);
    });
  });

  describe("IPFS hash extraction behavior", () => {
    it("should not use IPFS fallback when extractIpfsHash returns null", async () => {
      const url = "https://notipfs.example.com/file";
      const mockResponse = new Response("content");

      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await universalFetch(url);

      expect(mockFetchWithFallbacks).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(url);
      expect(result).toBe(mockResponse);
    });

    it("should call extractIpfsHash before attempting fetch", async () => {
      const url = "https://example.com/file";
      mockExtractIpfsHash.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce(new Response("content"));

      await universalFetch(url);

      expect(mockExtractIpfsHash).toHaveBeenCalledWith(url);
      expect(mockExtractIpfsHash).toHaveBeenCalledBefore(mockFetch as any);
    });

    it("should extract IPFS hash from processed URLs (not original ar:// format)", async () => {
      const originalArweaveUrl = "ar://abc123";
      const processedUrl = "https://arweave.net/abc123";
      mockExtractIpfsHash.mockReturnValue(null); // Arweave URL won't have IPFS hash
      mockFetch.mockResolvedValueOnce(new Response("content"));

      await universalFetch(originalArweaveUrl);

      // extractIpfsHash is called with the processed URL (after ar:// conversion)
      expect(mockExtractIpfsHash).toHaveBeenCalledWith(processedUrl);
    });
  });
});
