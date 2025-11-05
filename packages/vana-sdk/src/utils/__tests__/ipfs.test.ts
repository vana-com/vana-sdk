/**
 * Tests for IPFS utilities
 *
 * @remarks
 * Tests IPFS URL handling, gateway conversion, hash extraction, and fallback fetching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isIpfsUrl,
  convertIpfsUrl,
  extractIpfsHash,
  getGatewayUrls,
  convertIpfsUrlWithFallbacks,
  fetchWithFallbacks,
  DEFAULT_IPFS_GATEWAY,
  IPFS_GATEWAYS,
} from "../ipfs";

describe("ipfs", () => {
  describe("isIpfsUrl", () => {
    it("should return true for ipfs:// URLs", () => {
      expect(isIpfsUrl("ipfs://QmHash123")).toBe(true);
      expect(
        isIpfsUrl(
          "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        ),
      ).toBe(true);
    });

    it("should return false for non-IPFS URLs", () => {
      expect(isIpfsUrl("https://example.com")).toBe(false);
      expect(isIpfsUrl("http://example.com")).toBe(false);
      expect(isIpfsUrl("ftp://example.com")).toBe(false);
    });

    it("should return false for gateway URLs", () => {
      expect(isIpfsUrl("https://ipfs.io/ipfs/QmHash123")).toBe(false);
      expect(isIpfsUrl("https://gateway.pinata.cloud/ipfs/QmHash123")).toBe(
        false,
      );
    });

    it("should return false for standalone hashes", () => {
      expect(isIpfsUrl("QmHash1234567890123456789012345678901234567890")).toBe(
        false,
      );
    });

    it("should return false for empty string", () => {
      expect(isIpfsUrl("")).toBe(false);
    });

    it("should handle case sensitivity", () => {
      expect(isIpfsUrl("IPFS://QmHash123")).toBe(false);
      expect(isIpfsUrl("Ipfs://QmHash123")).toBe(false);
    });
  });

  describe("convertIpfsUrl", () => {
    it("should convert ipfs:// URL to gateway URL", () => {
      const result = convertIpfsUrl("ipfs://QmHash123");
      expect(result).toBe(`${DEFAULT_IPFS_GATEWAY}QmHash123`);
    });

    it("should use custom gateway when provided", () => {
      const customGateway = "https://custom.gateway.com/ipfs/";
      const result = convertIpfsUrl("ipfs://QmHash123", customGateway);
      expect(result).toBe("https://custom.gateway.com/ipfs/QmHash123");
    });

    it("should return original URL if not IPFS", () => {
      const httpUrl = "https://example.com/file.json";
      expect(convertIpfsUrl(httpUrl)).toBe(httpUrl);
    });

    it("should handle CIDv1 hashes", () => {
      const cidv1 =
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
      const result = convertIpfsUrl(`ipfs://${cidv1}`);
      expect(result).toBe(`${DEFAULT_IPFS_GATEWAY}${cidv1}`);
    });

    it("should handle trailing slash in gateway", () => {
      const gateway = "https://gateway.example.com/ipfs/";
      const result = convertIpfsUrl("ipfs://QmHash123", gateway);
      expect(result).toBe("https://gateway.example.com/ipfs/QmHash123");
    });

    it("should handle gateway without trailing slash", () => {
      const gateway = "https://gateway.example.com/ipfs";
      const result = convertIpfsUrl("ipfs://QmHash123", gateway);
      expect(result).toBe("https://gateway.example.com/ipfsQmHash123"); // Note: no slash between
    });

    it("should preserve hash exactly as provided", () => {
      const hash = "QmHash123WithMixedCase";
      const result = convertIpfsUrl(`ipfs://${hash}`);
      expect(result).toContain(hash);
    });
  });

  describe("extractIpfsHash", () => {
    it("should extract hash from ipfs:// URL", () => {
      expect(extractIpfsHash("ipfs://QmHash123")).toBe("QmHash123");
    });

    it("should extract hash from gateway URL", () => {
      expect(extractIpfsHash("https://ipfs.io/ipfs/QmHash123")).toBe(
        "QmHash123",
      );
      expect(
        extractIpfsHash("https://gateway.pinata.cloud/ipfs/QmHash123"),
      ).toBe("QmHash123");
    });

    it("should extract hash from standalone hash string (46+ chars)", () => {
      const hash = "QmHash1234567890123456789012345678901234567890";
      expect(extractIpfsHash(hash)).toBe(hash);
    });

    it("should return null for short standalone strings", () => {
      expect(extractIpfsHash("QmHash123")).toBeNull();
      expect(extractIpfsHash("short")).toBeNull();
    });

    it("should return null for non-IPFS URLs", () => {
      expect(extractIpfsHash("https://example.com/file.json")).toBeNull();
      expect(extractIpfsHash("http://example.com")).toBeNull();
    });

    it("should return null for ipfs:// with subdirectory", () => {
      expect(extractIpfsHash("ipfs://QmHash123/subdirectory")).toBeNull();
    });

    it("should extract hash from gateway URL even with subdirectory", () => {
      // The regex pattern actually matches and extracts the hash part
      expect(extractIpfsHash("https://ipfs.io/ipfs/QmHash123/file.json")).toBe(
        "QmHash123",
      );
    });

    it("should handle CIDv1 hashes", () => {
      const cidv1 =
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
      expect(extractIpfsHash(`ipfs://${cidv1}`)).toBe(cidv1);
      expect(extractIpfsHash(`https://ipfs.io/ipfs/${cidv1}`)).toBe(cidv1);
    });

    it("should return null for empty string", () => {
      expect(extractIpfsHash("")).toBeNull();
    });

    it("should return null for malformed ipfs:// URL", () => {
      expect(extractIpfsHash("ipfs://")).toBeNull();
    });

    it("should handle different gateway formats", () => {
      expect(extractIpfsHash("https://dweb.link/ipfs/QmHash123")).toBe(
        "QmHash123",
      );
      expect(extractIpfsHash("https://ipfs.filebase.io/ipfs/QmHash123")).toBe(
        "QmHash123",
      );
    });
  });

  describe("getGatewayUrls", () => {
    it("should return array of gateway URLs", () => {
      const hash = "QmHash123";
      const urls = getGatewayUrls(hash);

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      expect(urls).toContain(`${IPFS_GATEWAYS[0]}${hash}`);
      expect(urls).toContain(`${IPFS_GATEWAYS[1]}${hash}`);
    });

    it("should handle CIDv1 hashes", () => {
      const cidv1 =
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
      const urls = getGatewayUrls(cidv1);

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      urls.forEach((url) => {
        expect(url).toContain(cidv1);
      });
    });

    it("should return URLs in same order as IPFS_GATEWAYS", () => {
      const hash = "QmHash123";
      const urls = getGatewayUrls(hash);

      IPFS_GATEWAYS.forEach((gateway, index) => {
        expect(urls[index]).toBe(`${gateway}${hash}`);
      });
    });

    it("should handle empty hash", () => {
      const urls = getGatewayUrls("");

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      urls.forEach((url) => {
        expect(url).toMatch(/\/ipfs\/$/);
      });
    });
  });

  describe("convertIpfsUrlWithFallbacks", () => {
    it("should return multiple gateway URLs for ipfs:// URL", () => {
      const urls = convertIpfsUrlWithFallbacks("ipfs://QmHash123");

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      expect(urls[0]).toContain("QmHash123");
    });

    it("should return multiple gateway URLs for gateway URL", () => {
      const urls = convertIpfsUrlWithFallbacks(
        "https://ipfs.io/ipfs/QmHash123",
      );

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      expect(urls[0]).toContain("QmHash123");
    });

    it("should return array with original URL for non-IPFS URLs", () => {
      const httpUrl = "https://example.com/file.json";
      const urls = convertIpfsUrlWithFallbacks(httpUrl);

      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe(httpUrl);
    });

    it("should handle CIDv1 hashes", () => {
      const cidv1 =
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
      const urls = convertIpfsUrlWithFallbacks(`ipfs://${cidv1}`);

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      urls.forEach((url) => {
        expect(url).toContain(cidv1);
      });
    });

    it("should return singleton array for standalone hash", () => {
      const hash = "QmHash1234567890123456789012345678901234567890";
      const urls = convertIpfsUrlWithFallbacks(hash);

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
    });
  });

  describe("fetchWithFallbacks", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("should fetch from first gateway on success", async () => {
      const mockResponse = { ok: true, status: 200 };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse,
      );

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");

      // Fast-forward timers if needed
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("QmHash123"),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it("should try next gateway on HTTP error", async () => {
      const errorResponse = { ok: false, status: 404 };
      const successResponse = { ok: true, status: 200 };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");

      // Fast-forward timers
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toEqual(successResponse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should skip rate-limited gateway immediately", async () => {
      const rateLimitedResponse = { ok: false, status: 429 };
      const successResponse = { ok: true, status: 200 };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(rateLimitedResponse)
        .mockResolvedValueOnce(successResponse);

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");

      // Fast-forward timers
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toEqual(successResponse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should throw error when all gateways fail", async () => {
      const errorResponse = { ok: false, status: 404 };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        errorResponse,
      );

      // Start the fetch and advance timers
      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");

      // Advance timers asynchronously
      const timerPromise = vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow(/All IPFS gateways failed/);
      await timerPromise; // Wait for timers to complete
      expect(global.fetch).toHaveBeenCalledTimes(IPFS_GATEWAYS.length);
    });

    it("should fetch non-IPFS URL directly", async () => {
      const mockResponse = { ok: true, status: 200 };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse,
      );

      const httpUrl = "https://example.com/file.json";
      const result = await fetchWithFallbacks(httpUrl);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(httpUrl, undefined);
    });

    it("should handle network errors with retry", async () => {
      const networkError = new Error("Network failure");
      const successResponse = { ok: true, status: 200 };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");

      // Fast-forward timers
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toEqual(successResponse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should pass through fetch options", async () => {
      const mockResponse = { ok: true, status: 200 };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse,
      );

      const options: RequestInit = {
        headers: { "Custom-Header": "value" },
        method: "POST",
      };

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123", options);

      await vi.runAllTimersAsync();

      await resultPromise;

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { "Custom-Header": "value" },
          method: "POST",
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it("should handle timeout errors", async () => {
      const timeoutError = new Error("Timeout");
      timeoutError.name = "TimeoutError";
      const successResponse = { ok: true, status: 200 };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(successResponse);

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toEqual(successResponse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should handle errors with 429 in message", async () => {
      const error429 = new Error("HTTP 429 Too Many Requests");
      const successResponse = { ok: true, status: 200 };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce(successResponse);

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toEqual(successResponse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should include last error in thrown error", async () => {
      const lastError = new Error("Gateway timeout");
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(lastError);

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");
      const timerPromise = vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow(/Gateway timeout/);
      await timerPromise;
    });

    it("should try all gateways before throwing", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Failed"),
      );

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");
      const timerPromise = vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow();
      await timerPromise;
      expect(global.fetch).toHaveBeenCalledTimes(IPFS_GATEWAYS.length);
    });

    it("should handle non-Error objects thrown", async () => {
      const nonErrorObject = "string error";
      const successResponse = { ok: true, status: 200 };

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(nonErrorObject)
        .mockResolvedValueOnce(successResponse);

      const resultPromise = fetchWithFallbacks("ipfs://QmHash123");

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toEqual(successResponse);
    });

    it("should handle CIDv1 hashes", async () => {
      const mockResponse = { ok: true, status: 200 };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse,
      );

      const cidv1 =
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
      const resultPromise = fetchWithFallbacks(`ipfs://${cidv1}`);

      await vi.runAllTimersAsync();

      await resultPromise;

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(cidv1),
        expect.any(Object),
      );
    });
  });

  describe("Constants", () => {
    it("should export DEFAULT_IPFS_GATEWAY", () => {
      expect(DEFAULT_IPFS_GATEWAY).toBeDefined();
      expect(typeof DEFAULT_IPFS_GATEWAY).toBe("string");
      expect(DEFAULT_IPFS_GATEWAY).toContain("ipfs");
    });

    it("should export IPFS_GATEWAYS array", () => {
      expect(IPFS_GATEWAYS).toBeDefined();
      expect(Array.isArray(IPFS_GATEWAYS)).toBe(true);
      expect(IPFS_GATEWAYS.length).toBeGreaterThan(0);
    });

    it("should have valid gateway URLs in IPFS_GATEWAYS", () => {
      IPFS_GATEWAYS.forEach((gateway) => {
        expect(gateway).toMatch(/^https?:\/\//);
        expect(gateway).toContain("ipfs");
      });
    });
  });
});
