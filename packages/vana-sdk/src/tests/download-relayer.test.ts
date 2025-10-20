import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieveGrantFile } from "../utils/grantFiles";

// Mock fetch globally
global.fetch = vi.fn();
const mockFetch = vi.mocked(global.fetch);

// Mock the IPFS module
vi.mock("../utils/ipfs", () => ({
  extractIpfsHash: vi.fn((url: string) => {
    if (url.includes("/ipfs/")) {
      const match = url.match(/\/ipfs\/([a-zA-Z0-9]+)/);
      return match ? match[1] : null;
    }
    if (url.startsWith("ipfs://")) {
      return url.replace("ipfs://", "");
    }
    return null;
  }),
  getGatewayUrls: vi.fn((hash: string) => [
    `https://gateway.pinata.cloud/ipfs/${hash}`,
    `https://ipfs.io/ipfs/${hash}`,
    `https://dweb.link/ipfs/${hash}`,
  ]),
  fetchWithFallbacks: vi.fn(async () => {
    throw new Error("All gateways failed");
  }),
}));

describe("Download Relayer", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("retrieveGrantFile", () => {
    it("should use download relayer when direct fetch fails", async () => {
      const mockGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { model: "gpt-4" },
      };

      const mockRelayer = {
        proxyDownload: vi.fn().mockResolvedValue(
          new Blob([JSON.stringify(mockGrantFile)], {
            type: "application/json",
          }),
        ),
      };

      // Make direct fetch fail
      mockFetch.mockRejectedValue(new Error("CORS error"));

      const result = await retrieveGrantFile(
        "https://drive.google.com/uc?id=abc123",
        undefined,
        mockRelayer,
      );

      expect(mockRelayer.proxyDownload).toHaveBeenCalledWith(
        "https://drive.google.com/uc?id=abc123",
      );
      expect(result).toEqual(mockGrantFile);
    });

    it("should not use relayer when direct fetch succeeds", async () => {
      const mockGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        files: [1],
        parameters: {},
      };

      const mockRelayer = {
        proxyDownload: vi.fn(),
      };

      // Make direct fetch succeed
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(mockGrantFile),
      } as unknown as Response);

      const result = await retrieveGrantFile(
        "https://example.com/grant.json",
        undefined,
        mockRelayer,
      );

      expect(mockRelayer.proxyDownload).not.toHaveBeenCalled();
      expect(result).toEqual(mockGrantFile);
    });

    it("should fallback to IPFS gateways when relayer also fails", async () => {
      const mockGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        files: [1],
        parameters: {},
      };

      const mockRelayer = {
        proxyDownload: vi.fn().mockRejectedValue(new Error("Proxy failed")),
      };

      // Mock fetchWithFallbacks to succeed (simulating IPFS gateway success)
      const { fetchWithFallbacks } = await import("../utils/ipfs");
      vi.mocked(fetchWithFallbacks).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockGrantFile),
      } as unknown as Response);

      const result = await retrieveGrantFile(
        "https://gateway.pinata.cloud/ipfs/QmTest123",
        undefined,
        mockRelayer,
      );

      expect(fetchWithFallbacks).toHaveBeenCalled();
      expect(result).toEqual(mockGrantFile);
    });
  });
});
