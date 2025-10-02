/**
 * @file Tests for subgraph consistency utilities
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkSubgraphConsistency,
  fetchSubgraphMeta,
  waitForSubgraphSync,
  StaleDataError,
} from "../subgraphConsistency";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock GraphQL print
vi.mock("graphql", () => ({
  print: vi.fn(() => "mocked-meta-query"),
}));

// Mock the cache
vi.mock("../subgraphMetaCache", () => ({
  globalMetaCache: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("Subgraph Consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchSubgraphMeta", () => {
    it("should fetch metadata from subgraph", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            _meta: {
              block: {
                number: 1200,
                timestamp: 1700000000,
                hash: "0xabc",
              },
              deployment: "test-deployment",
              hasIndexingErrors: false,
            },
          },
        }),
      });

      const meta = await fetchSubgraphMeta("https://test-subgraph.com");

      expect(meta).toEqual({
        blockNumber: 1200,
        blockTimestamp: 1700000000,
        blockHash: "0xabc",
        deployment: "test-deployment",
        hasIndexingErrors: false,
      });
    });
  });

  describe("checkSubgraphConsistency", () => {
    it("should pass when subgraph is at or beyond minBlock", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            _meta: {
              block: { number: 1200, timestamp: 1700000000 },
              deployment: "test",
              hasIndexingErrors: false,
            },
          },
        }),
      });

      const meta = await checkSubgraphConsistency("https://test-subgraph.com", {
        minBlock: 1150,
      });

      expect(meta.blockNumber).toBe(1200);
    });

    it("should throw StaleDataError when subgraph is behind", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            _meta: {
              block: { number: 1100, timestamp: 1700000000 },
              deployment: "test",
              hasIndexingErrors: false,
            },
          },
        }),
      });

      await expect(
        checkSubgraphConsistency("https://test-subgraph.com", {
          minBlock: 1200,
        }),
      ).rejects.toThrow(StaleDataError);
    });

    it("should wait for sync when waitForSync is specified", async () => {
      // First call - behind
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            _meta: {
              block: { number: 1100 },
              deployment: "test",
              hasIndexingErrors: false,
            },
          },
        }),
      });

      // Second call - caught up
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            _meta: {
              block: { number: 1200 },
              deployment: "test",
              hasIndexingErrors: false,
            },
          },
        }),
      });

      const meta = await checkSubgraphConsistency("https://test-subgraph.com", {
        minBlock: 1200,
        waitForSync: 5000,
      });

      expect(meta.blockNumber).toBe(1200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("waitForSubgraphSync", () => {
    it("should poll until target block is reached", async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        const blockNumber = callCount === 1 ? 1100 : 1200;
        return {
          ok: true,
          json: async () => ({
            data: {
              _meta: {
                block: { number: blockNumber },
                deployment: "test",
                hasIndexingErrors: false,
              },
            },
          }),
        };
      });

      const meta = await waitForSubgraphSync(
        "https://test-subgraph.com",
        1200,
        5000,
        100, // Short poll interval for testing
      );

      expect(meta.blockNumber).toBe(1200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw if timeout is reached", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            _meta: {
              block: { number: 1100 },
              deployment: "test",
              hasIndexingErrors: false,
            },
          },
        }),
      });

      await expect(
        waitForSubgraphSync(
          "https://test-subgraph.com",
          1200,
          100, // Very short timeout
          50,
        ),
      ).rejects.toThrow(StaleDataError);
    });

    it("should handle AbortSignal", async () => {
      const controller = new AbortController();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            _meta: {
              block: { number: 1100 },
              deployment: "test",
              hasIndexingErrors: false,
            },
          },
        }),
      });

      // Abort after a short delay
      setTimeout(() => {
        controller.abort();
      }, 50);

      await expect(
        waitForSubgraphSync(
          "https://test-subgraph.com",
          1200,
          5000,
          100,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });
});
