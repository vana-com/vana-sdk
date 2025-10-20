import { describe, it, expect } from "vitest";
import { determineDataSource } from "../chainQuery";

describe("chainQuery utils", () => {
  describe("determineDataSource", () => {
    it("should return 'subgraph' when explicitly specified", () => {
      const result = determineDataSource("subgraph", undefined, 1000n, 950);
      expect(result).toBe("subgraph");
    });

    it("should return 'chain' when explicitly specified", () => {
      const result = determineDataSource("chain", undefined, 1000n, 950);
      expect(result).toBe("chain");
    });

    it("should return 'subgraph' in auto mode when no minBlock specified", () => {
      const result = determineDataSource("auto", undefined, 1000n, 950);
      expect(result).toBe("subgraph");
    });

    it("should return 'subgraph' when source is undefined and no minBlock", () => {
      const result = determineDataSource(undefined, undefined, 1000n, 950);
      expect(result).toBe("subgraph");
    });

    it("should return 'chain' when subgraph is more than 100 blocks behind", () => {
      const result = determineDataSource("auto", 900, 1050n, 800);
      expect(result).toBe("chain");
    });

    it("should return 'chain' when subgraphBlock is undefined and minBlock is specified", () => {
      const result = determineDataSource("auto", 900, 1050n, undefined);
      expect(result).toBe("chain");
    });

    it("should return 'subgraph' when subgraph is less than 100 blocks behind", () => {
      const result = determineDataSource("auto", 900, 1000n, 950);
      expect(result).toBe("subgraph");
    });

    it("should return 'subgraph' when subgraph is caught up with minBlock", () => {
      const result = determineDataSource("auto", 950, 1000n, 950);
      expect(result).toBe("subgraph");
    });

    it("should handle zero subgraphBlock correctly", () => {
      const result = determineDataSource("auto", 50, 200n, 0);
      expect(result).toBe("chain");
    });

    it("should default to subgraph when staleness is exactly 100 blocks", () => {
      const result = determineDataSource("auto", 850, 1000n, 900);
      expect(result).toBe("subgraph");
    });

    it("should return subgraph when subgraph meets minBlock requirement", () => {
      const result = determineDataSource("auto", 800, 1000n, 850);
      expect(result).toBe("subgraph");
    });

    it("should prioritize subgraph when minBlock requirement is met", () => {
      const result = determineDataSource(undefined, 900, 1000n, 950);
      expect(result).toBe("subgraph");
    });
  });
});
