/**
 * @file Tests for subgraph pagination utilities
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { executePaginatedQuery } from "../subgraphPagination";
import type { DocumentNode } from "graphql";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock GraphQL print
vi.mock("graphql", () => ({
  print: vi.fn(() => "mocked-query"),
}));

describe("executePaginatedQuery", () => {
  const mockDocument: DocumentNode = {
    kind: "Document",
    definitions: [],
  } as any;
  const endpoint = "https://test-subgraph.com";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should apply default limit of 100 when not specified", async () => {
    // Mock fetch to return 100 items
    const mockItems = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { items: mockItems },
      }),
    });

    const result = await executePaginatedQuery({
      endpoint,
      document: mockDocument,
      baseVariables: { userId: "test" },
      extractItems: (data: any) => data?.items,
    });

    expect(result).toHaveLength(100);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("should respect custom limit", async () => {
    // Mock fetch to return 50 items
    const mockItems = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { items: mockItems },
      }),
    });

    const result = await executePaginatedQuery({
      endpoint,
      document: mockDocument,
      baseVariables: { userId: "test" },
      options: { limit: 50 },
      extractItems: (data: any) => data?.items,
    });

    expect(result).toHaveLength(50);
  });

  it("should handle pagination with fetchAll", async () => {
    // First page: 1000 items (full page)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { items: Array.from({ length: 1000 }, (_, i) => ({ id: i })) },
      }),
    });

    // Second page: 500 items (partial page - signals end)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: Array.from({ length: 500 }, (_, i) => ({ id: i + 1000 })),
        },
      }),
    });

    const result = await executePaginatedQuery({
      endpoint,
      document: mockDocument,
      baseVariables: { userId: "test" },
      options: { fetchAll: true },
      extractItems: (data: any) => data?.items,
    });

    expect(result).toHaveLength(1500);
    // Only 2 calls because second page returns less than page size, indicating end
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should transform items when transformer provided", async () => {
    const mockItems = [{ id: "1", name: "test" }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { items: mockItems },
      }),
    });

    const result = await executePaginatedQuery({
      endpoint,
      document: mockDocument,
      baseVariables: { userId: "test" },
      extractItems: (data: any) => data?.items,
      transformItem: (item: any) => ({
        ...item,
        id: parseInt(item.id),
        transformed: true,
      }),
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 1,
      name: "test",
      transformed: true,
    });
  });

  it("should handle errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [{ message: "Test error" }],
        data: null, // Ensure data is null when there are errors
      }),
    });

    await expect(
      executePaginatedQuery({
        endpoint,
        document: mockDocument,
        baseVariables: { userId: "test" },
        extractItems: (data: any) => data?.items,
      }),
    ).rejects.toThrow("Subgraph errors: Test error");
  });
});
