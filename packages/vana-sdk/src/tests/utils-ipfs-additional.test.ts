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
} from "../utils/ipfs";

// Mock global fetch
const originalFetch = globalThis.fetch;

describe("Additional IPFS Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("isIpfsUrl", () => {
    it("should identify IPFS URLs correctly", () => {
      expect(isIpfsUrl("ipfs://QmHash123")).toBe(true);
      expect(isIpfsUrl("ipfs://")).toBe(true);
      expect(isIpfsUrl("ipfs://Qm")).toBe(true);
    });

    it("should reject non-IPFS URLs", () => {
      expect(isIpfsUrl("https://example.com")).toBe(false);
      expect(isIpfsUrl("http://ipfs.io")).toBe(false);
      expect(isIpfsUrl("ftp://example.com")).toBe(false);
      expect(isIpfsUrl("")).toBe(false);
      expect(isIpfsUrl("just-a-string")).toBe(false);
    });
  });

  describe("convertIpfsUrl", () => {
    it("should convert IPFS URL with default gateway", () => {
      const url = "ipfs://QmHash123";
      const result = convertIpfsUrl(url);
      expect(result).toBe(`${DEFAULT_IPFS_GATEWAY}QmHash123`);
    });

    it("should convert IPFS URL with custom gateway", () => {
      const url = "ipfs://QmHash123";
      const gateway = "https://custom.gateway.com/ipfs/";
      const result = convertIpfsUrl(url, gateway);
      expect(result).toBe("https://custom.gateway.com/ipfs/QmHash123");
    });

    it("should return original URL if not IPFS", () => {
      const url = "https://example.com/file.json";
      const result = convertIpfsUrl(url);
      expect(result).toBe(url);
    });

    it("should handle empty IPFS hash", () => {
      const url = "ipfs://";
      const result = convertIpfsUrl(url);
      expect(result).toBe(`${DEFAULT_IPFS_GATEWAY}`);
    });
  });

  describe("extractIpfsHash", () => {
    it("should extract hash from ipfs:// URL", () => {
      expect(extractIpfsHash("ipfs://QmHash123")).toBe("QmHash123");
      expect(
        extractIpfsHash("ipfs://Qm1234567890abcdef1234567890abcdef123456"),
      ).toBe("Qm1234567890abcdef1234567890abcdef123456");
    });

    it("should extract hash from gateway URL", () => {
      expect(
        extractIpfsHash("https://gateway.pinata.cloud/ipfs/QmHash123"),
      ).toBe("QmHash123");
      expect(extractIpfsHash("https://ipfs.io/ipfs/QmAnotherHash456")).toBe(
        "QmAnotherHash456",
      );
      expect(extractIpfsHash("https://dweb.link/ipfs/QmLongHash789")).toBe(
        "QmLongHash789",
      );
    });

    it("should extract hash from direct hash string", () => {
      const longHash = "QmHash1234567890abcdef1234567890abcdef1234567890abc";
      expect(extractIpfsHash(longHash)).toBe(longHash);
    });

    it("should return null for invalid URLs", () => {
      expect(extractIpfsHash("https://example.com")).toBe(null);
      expect(extractIpfsHash("")).toBe(null);
      expect(extractIpfsHash("not-a-hash")).toBe(null);
      expect(extractIpfsHash("Qm123")).toBe(null); // Too short
      expect(extractIpfsHash("https://example.com/ipfs/")).toBe(null); // No hash
    });

    it("should handle various URL patterns", () => {
      expect(
        extractIpfsHash("https://cloudflare-ipfs.com/ipfs/QmTestHash"),
      ).toBe("QmTestHash");
      expect(
        extractIpfsHash("https://ipfs.filebase.io/ipfs/QmAnotherTest"),
      ).toBe("QmAnotherTest");
    });
  });

  describe("getGatewayUrls", () => {
    it("should generate gateway URLs for hash", () => {
      const hash = "QmTestHash123";
      const urls = getGatewayUrls(hash);

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      expect(urls[0]).toBe(`${IPFS_GATEWAYS[0]}${hash}`);
      expect(urls[1]).toBe(`${IPFS_GATEWAYS[1]}${hash}`);

      // Check all gateways are included
      IPFS_GATEWAYS.forEach((gateway, index) => {
        expect(urls[index]).toBe(`${gateway}${hash}`);
      });
    });

    it("should handle empty hash", () => {
      const urls = getGatewayUrls("");
      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      urls.forEach((url, index) => {
        expect(url).toBe(IPFS_GATEWAYS[index]);
      });
    });
  });

  describe("convertIpfsUrlWithFallbacks", () => {
    it("should convert IPFS URL to multiple gateway URLs", () => {
      const url = "ipfs://QmTestHash456";
      const urls = convertIpfsUrlWithFallbacks(url);

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      urls.forEach((url, index) => {
        expect(url).toBe(`${IPFS_GATEWAYS[index]}QmTestHash456`);
      });
    });

    it("should return original URL if not IPFS", () => {
      const url = "https://example.com/file.json";
      const urls = convertIpfsUrlWithFallbacks(url);

      expect(urls).toEqual([url]);
    });

    it("should handle gateway URLs", () => {
      const url = "https://gateway.pinata.cloud/ipfs/QmGatewayHash";
      const urls = convertIpfsUrlWithFallbacks(url);

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      urls.forEach((url, index) => {
        expect(url).toBe(`${IPFS_GATEWAYS[index]}QmGatewayHash`);
      });
    });

    it("should handle direct hash", () => {
      const hash = "QmDirectHash1234567890abcdef1234567890abcdef123456";
      const urls = convertIpfsUrlWithFallbacks(hash);

      expect(urls).toHaveLength(IPFS_GATEWAYS.length);
      urls.forEach((url, index) => {
        expect(url).toBe(`${IPFS_GATEWAYS[index]}${hash}`);
      });
    });
  });

  describe("fetchWithFallbacks", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should fetch non-IPFS URL directly", async () => {
      const url = "https://example.com/file.json";
      const mockResponse = new Response("test data", { status: 200 });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await fetchWithFallbacks(url);

      expect(result).toBe(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(url, undefined);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("should fetch IPFS URL successfully from first gateway", async () => {
      const url = "ipfs://QmTestHash789";
      const mockResponse = new Response("ipfs data", { status: 200 });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await fetchWithFallbacks(url);

      expect(result).toBe(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${IPFS_GATEWAYS[0]}QmTestHash789`,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("should try multiple gateways on failure", async () => {
      vi.useFakeTimers();
      const originalTimeout = AbortSignal.timeout;
      AbortSignal.timeout = vi.fn(() => {
        const controller = new AbortController();
        return controller.signal;
      });

      const url = "ipfs://QmFailingHash";
      const failResponse = new Response("Not found", { status: 404 });
      const successResponse = new Response("success data", { status: 200 });

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(failResponse) // First gateway fails
        .mockResolvedValueOnce(successResponse); // Second gateway succeeds

      const fetchPromise = fetchWithFallbacks(url);
      await vi.runAllTimersAsync();
      const result = await fetchPromise;

      expect(result).toBe(successResponse);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        1,
        `${IPFS_GATEWAYS[0]}QmFailingHash`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        2,
        `${IPFS_GATEWAYS[1]}QmFailingHash`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      AbortSignal.timeout = originalTimeout;
      vi.useRealTimers();
    });

    it("should handle rate limiting (429) and continue to next gateway", async () => {
      vi.useFakeTimers();
      const originalTimeout = AbortSignal.timeout;
      AbortSignal.timeout = vi.fn(() => {
        const controller = new AbortController();
        return controller.signal;
      });

      const url = "ipfs://QmRateLimitedHash";
      const rateLimitResponse = new Response("Rate limited", { status: 429 });
      const successResponse = new Response("success data", { status: 200 });

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse);

      const fetchPromise = fetchWithFallbacks(url);
      await vi.runAllTimersAsync();
      const result = await fetchPromise;

      expect(result).toBe(successResponse);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      AbortSignal.timeout = originalTimeout;
      vi.useRealTimers();
    });

    it("should handle network errors and continue to next gateway", async () => {
      vi.useFakeTimers();
      const originalTimeout = AbortSignal.timeout;
      AbortSignal.timeout = vi.fn(() => {
        const controller = new AbortController();
        return controller.signal;
      });

      const url = "ipfs://QmNetworkErrorHash";
      const networkError = new Error("Network error");
      const successResponse = new Response("success data", { status: 200 });

      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      const fetchPromise = fetchWithFallbacks(url);
      await vi.runAllTimersAsync();
      const result = await fetchPromise;

      expect(result).toBe(successResponse);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      AbortSignal.timeout = originalTimeout;
      vi.useRealTimers();
    });

    it("should handle timeout errors", async () => {
      vi.useFakeTimers();
      const originalTimeout = AbortSignal.timeout;
      AbortSignal.timeout = vi.fn(() => {
        const controller = new AbortController();
        return controller.signal;
      });

      const url = "ipfs://QmTimeoutHash";
      const timeoutError = new Error("TimeoutError");
      timeoutError.name = "TimeoutError";
      const successResponse = new Response("success data", { status: 200 });

      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(successResponse);

      const fetchPromise = fetchWithFallbacks(url);
      await vi.runAllTimersAsync();
      const result = await fetchPromise;

      expect(result).toBe(successResponse);

      AbortSignal.timeout = originalTimeout;
      vi.useRealTimers();
    });

    it("should handle non-Error exceptions", async () => {
      vi.useFakeTimers();
      const originalTimeout = AbortSignal.timeout;
      AbortSignal.timeout = vi.fn(() => {
        const controller = new AbortController();
        return controller.signal;
      });

      const url = "ipfs://QmStringErrorHash";
      const stringError = "String error message";
      const successResponse = new Response("success data", { status: 200 });

      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(stringError)
        .mockResolvedValueOnce(successResponse);

      const fetchPromise = fetchWithFallbacks(url);
      await vi.runAllTimersAsync();
      const result = await fetchPromise;

      expect(result).toBe(successResponse);

      AbortSignal.timeout = originalTimeout;
      vi.useRealTimers();
    });

    it("should throw error when all gateways fail", async () => {
      // Use fake timers to control the delays
      vi.useFakeTimers();

      // Store original AbortSignal.timeout
      const originalTimeout = AbortSignal.timeout;

      // Mock AbortSignal.timeout to return a non-aborting signal
      // This prevents the timeout from interfering with our test
      AbortSignal.timeout = vi.fn(() => {
        const controller = new AbortController();
        return controller.signal;
      });

      const url = "ipfs://QmAllFailHash";
      const errorResponse = new Response("Server error", { status: 500 });

      globalThis.fetch = vi
        .fn()
        .mockImplementation(() => Promise.resolve(errorResponse));

      let errorMessage: string | null = null;

      // Start the fetch operation with proper error handling
      const fetchPromise = fetchWithFallbacks(url).catch((e: Error) => {
        errorMessage = e.message;
      });

      // Advance all timers to handle the setTimeout delays
      await vi.runAllTimersAsync();

      // Wait for the promise to settle
      await fetchPromise;

      // Assert the error was thrown
      expect(errorMessage).toBeTruthy();
      expect(errorMessage).toContain(
        "All IPFS gateways failed for hash QmAllFailHash",
      );

      expect(globalThis.fetch).toHaveBeenCalledTimes(IPFS_GATEWAYS.length);

      // Restore original implementations
      AbortSignal.timeout = originalTimeout;
      vi.useRealTimers();
    });

    it("should pass through fetch options", async () => {
      const url = "https://example.com/api";
      const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "data" }),
      };
      const mockResponse = new Response("response", { status: 200 });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      await fetchWithFallbacks(url, options);

      expect(globalThis.fetch).toHaveBeenCalledWith(url, options);
    });

    it("should include timeout signal in IPFS requests", async () => {
      const url = "ipfs://QmTimeoutTestHash";
      const mockResponse = new Response("data", { status: 200 });
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      await fetchWithFallbacks(url, { method: "GET" });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("QmTimeoutTestHash"),
        expect.objectContaining({
          method: "GET",
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  describe("Constants", () => {
    it("should export expected gateway URLs", () => {
      expect(IPFS_GATEWAYS).toHaveLength(5);
      expect(IPFS_GATEWAYS[0]).toBe("https://dweb.link/ipfs/");
      expect(IPFS_GATEWAYS[1]).toBe("https://ipfs.io/ipfs/");
      expect(IPFS_GATEWAYS[2]).toBe("https://cloudflare-ipfs.com/ipfs/");
      expect(IPFS_GATEWAYS[3]).toBe("https://gateway.pinata.cloud/ipfs/");
      expect(IPFS_GATEWAYS[4]).toBe("https://ipfs.filebase.io/ipfs/");
    });

    it("should have correct default gateway", () => {
      expect(DEFAULT_IPFS_GATEWAY).toBe("https://dweb.link/ipfs/");
    });
  });
});
