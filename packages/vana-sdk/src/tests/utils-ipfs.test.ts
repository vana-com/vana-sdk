/**
 * Test suite for IPFS utilities
 */

import { describe, it, expect } from "vitest";
import {
  isIpfsUrl,
  convertIpfsUrl,
  extractIpfsHash,
  DEFAULT_IPFS_GATEWAY,
  getGatewayUrls,
  convertIpfsUrlWithFallbacks,
} from "../utils/ipfs";

describe("IPFS Utilities", () => {
  describe("isIpfsUrl", () => {
    it("should identify IPFS URLs correctly", () => {
      expect(isIpfsUrl("ipfs://QmTestHash123")).toBe(true);
      expect(isIpfsUrl("ipfs://")).toBe(true);
      expect(isIpfsUrl("https://ipfs.io/ipfs/QmTestHash123")).toBe(false);
      expect(isIpfsUrl("https://example.com")).toBe(false);
      expect(isIpfsUrl("")).toBe(false);
    });
  });

  describe("convertIpfsUrl", () => {
    it("should convert IPFS URLs to gateway URLs", () => {
      const ipfsUrl = "ipfs://QmTestHash123";
      const result = convertIpfsUrl(ipfsUrl);
      expect(result).toBe("https://dweb.link/ipfs/QmTestHash123");
    });

    it("should use custom gateway when provided", () => {
      const ipfsUrl = "ipfs://QmTestHash123";
      const customGateway = "https://gateway.pinata.cloud/ipfs/";
      const result = convertIpfsUrl(ipfsUrl, customGateway);
      expect(result).toBe("https://gateway.pinata.cloud/ipfs/QmTestHash123");
    });

    it("should return non-IPFS URLs unchanged", () => {
      const httpUrl = "https://example.com/file.txt";
      const result = convertIpfsUrl(httpUrl);
      expect(result).toBe(httpUrl);
    });

    it("should handle empty IPFS URLs", () => {
      const emptyIpfsUrl = "ipfs://";
      const result = convertIpfsUrl(emptyIpfsUrl);
      expect(result).toBe("https://dweb.link/ipfs/");
    });
  });

  describe("extractIpfsHash", () => {
    it("should extract hash from IPFS protocol URLs", () => {
      expect(extractIpfsHash("ipfs://QmTestHash123")).toBe("QmTestHash123");
    });

    it("should extract hash from gateway URLs", () => {
      expect(
        extractIpfsHash("https://gateway.pinata.cloud/ipfs/QmTestHash123"),
      ).toBe("QmTestHash123");
      expect(extractIpfsHash("https://ipfs.io/ipfs/QmTestHash123")).toBe(
        "QmTestHash123",
      );
    });

    it("should extract hash from direct hash strings", () => {
      const longHash = "QmTestHash123456789012345678901234567890123456";
      expect(extractIpfsHash(longHash)).toBe(longHash);
    });

    it("should return null for invalid URLs", () => {
      expect(extractIpfsHash("https://example.com/not-ipfs")).toBeNull();
      expect(extractIpfsHash("ipfs://")).toBeNull();
      expect(extractIpfsHash("")).toBeNull();
      expect(extractIpfsHash("short")).toBeNull();
    });
  });

  describe("getGatewayUrls", () => {
    it("should return multiple gateway URLs for a hash", () => {
      const hash = "QmTestHash123";
      const urls = getGatewayUrls(hash);

      expect(urls).toHaveLength(4);
      expect(urls).toContain("https://gateway.pinata.cloud/ipfs/QmTestHash123");
      expect(urls).toContain("https://ipfs.io/ipfs/QmTestHash123");
      expect(urls).toContain("https://dweb.link/ipfs/QmTestHash123");
    });
  });

  describe("convertIpfsUrlWithFallbacks", () => {
    it("should return multiple gateway URLs for IPFS URLs", () => {
      const ipfsUrl = "ipfs://QmTestHash123";
      const urls = convertIpfsUrlWithFallbacks(ipfsUrl);

      expect(urls).toHaveLength(4);
      expect(urls).toContain("https://gateway.pinata.cloud/ipfs/QmTestHash123");
      expect(urls).toContain("https://ipfs.io/ipfs/QmTestHash123");
      expect(urls).toContain("https://dweb.link/ipfs/QmTestHash123");
    });

    it("should return original URL for non-IPFS URLs", () => {
      const httpUrl = "https://example.com/file.txt";
      const urls = convertIpfsUrlWithFallbacks(httpUrl);

      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe(httpUrl);
    });
  });

  describe("DEFAULT_IPFS_GATEWAY", () => {
    it("should be set to ipfs.io gateway", () => {
      expect(DEFAULT_IPFS_GATEWAY).toBe("https://dweb.link/ipfs/");
    });
  });
});
