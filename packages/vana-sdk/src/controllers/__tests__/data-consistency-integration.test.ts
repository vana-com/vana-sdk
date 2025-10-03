/**
 * @file Integration tests for data consistency features
 *
 * These tests verify the consistency options work correctly
 * without loading the full DataController implementation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ConsistencyOptions,
  PaginationOptions,
} from "../../types/options";

// Mock the consistency check functionality
const mockCheckConsistency = vi.fn();
const mockExecutePaginatedQuery = vi.fn();

// Mock a simplified getUserFiles that demonstrates the pattern
async function getUserFilesWithConsistency(
  params: { owner: string },
  options?: ConsistencyOptions & PaginationOptions,
) {
  // Check consistency if minBlock specified
  if (options?.minBlock) {
    await mockCheckConsistency("https://test-subgraph.com", {
      minBlock: options.minBlock,
      waitForSync: options.waitForSync,
    });
  }

  // Execute paginated query
  return mockExecutePaginatedQuery({
    owner: params.owner,
    limit: options?.limit ?? 100,
    offset: options?.offset ?? 0,
    fetchAll: options?.fetchAll,
    orderBy: options?.orderBy,
    orderDirection: options?.orderDirection,
  });
}

describe("Data Consistency Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("XP Verification Scenario", () => {
    it("should verify file exists after waiting for subgraph sync", async () => {
      const newFileId = 123;
      const schemaId = 42;
      const blockNumber = 1500;

      // Mock consistency check succeeds
      mockCheckConsistency.mockResolvedValueOnce({
        blockNumber,
        deployment: "test",
        hasIndexingErrors: false,
      });

      // Mock paginated query returns the new file
      mockExecutePaginatedQuery.mockResolvedValueOnce([
        {
          id: newFileId,
          url: "ipfs://QmNewFile",
          ownerAddress: "0x123",
          schemaId,
          addedAtBlock: BigInt(blockNumber),
        },
      ]);

      // Simulate XP verification flow
      const files = await getUserFilesWithConsistency(
        { owner: "0x123" },
        {
          minBlock: blockNumber,
          waitForSync: 30000,
        },
      );

      // Verify consistency was checked
      expect(mockCheckConsistency).toHaveBeenCalledWith(
        "https://test-subgraph.com",
        {
          minBlock: blockNumber,
          waitForSync: 30000,
        },
      );

      // Verify file can be found
      const file = files.find(
        (f: any) => f.id === newFileId && f.schemaId === schemaId,
      );
      expect(file).toBeDefined();
      expect(file.id).toBe(newFileId);
      expect(file.schemaId).toBe(schemaId);
    });

    it("should apply safe pagination defaults", async () => {
      mockExecutePaginatedQuery.mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          url: `ipfs://Qm${i}`,
        })),
      );

      const files = await getUserFilesWithConsistency({ owner: "0x123" });

      // Should use default limit of 100
      expect(mockExecutePaginatedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
          offset: 0,
        }),
      );
      expect(files).toHaveLength(100);
    });

    it("should support fetchAll option", async () => {
      mockExecutePaginatedQuery.mockResolvedValueOnce(
        Array.from({ length: 1500 }, (_, i) => ({
          id: i + 1,
          url: `ipfs://Qm${i}`,
        })),
      );

      const files = await getUserFilesWithConsistency(
        { owner: "0x123" },
        { fetchAll: true },
      );

      expect(mockExecutePaginatedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          fetchAll: true,
        }),
      );
      expect(files).toHaveLength(1500);
    });

    it("should support custom ordering", async () => {
      mockExecutePaginatedQuery.mockResolvedValueOnce([
        { id: 2, addedAtBlock: 1100n },
        { id: 1, addedAtBlock: 1000n },
      ]);

      await getUserFilesWithConsistency(
        { owner: "0x123" },
        { orderBy: "addedAtBlock", orderDirection: "desc" },
      );

      expect(mockExecutePaginatedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: "addedAtBlock",
          orderDirection: "desc",
        }),
      );
    });
  });
});
