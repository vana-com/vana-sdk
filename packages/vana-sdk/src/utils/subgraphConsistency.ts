/**
 * @file Utilities for handling subgraph data consistency
 * @module vana-sdk/utils/subgraphConsistency
 */

import { print } from "graphql";
import type { ConsistencyOptions } from "../types/options";
import type { GetSubgraphMetaQuery } from "../generated/subgraph";
import { GetSubgraphMetaDocument } from "../generated/subgraph";
import { globalMetaCache } from "./subgraphMetaCache";

/**
 * Error thrown when subgraph data is stale relative to consistency requirements
 */
export class StaleDataError extends Error {
  constructor(
    public readonly requiredBlock: number,
    public readonly currentBlock: number,
    message?: string,
  ) {
    super(
      message ??
        `Subgraph data is stale. Required block: ${requiredBlock}, Current block: ${currentBlock}`,
    );
    this.name = "StaleDataError";
  }
}

/**
 * Subgraph metadata response structure
 */
export interface SubgraphMeta {
  blockNumber: number;
  blockTimestamp?: number;
  blockHash?: string;
  deployment: string;
  hasIndexingErrors: boolean;
}

/**
 * Response structure from subgraph queries
 */
interface SubgraphResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * Fetches the current metadata from a subgraph
 *
 * @param subgraphUrl - The GraphQL endpoint URL
 * @returns Current block information and indexing status
 */
export async function fetchSubgraphMeta(
  subgraphUrl: string,
  useCache = true,
): Promise<SubgraphMeta> {
  // Check cache first
  if (useCache) {
    const cached = globalMetaCache.get(subgraphUrl);
    if (cached) {
      return cached;
    }
  }

  const response = await fetch(subgraphUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: print(GetSubgraphMetaDocument),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch subgraph metadata: ${response.status} ${response.statusText}`,
    );
  }

  const result =
    (await response.json()) as SubgraphResponse<GetSubgraphMetaQuery>;

  if (result.errors) {
    throw new Error(
      `Subgraph query errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }

  if (!result.data?._meta) {
    throw new Error("No metadata returned from subgraph");
  }

  const meta = result.data._meta;
  const subgraphMeta: SubgraphMeta = {
    blockNumber: meta.block.number,
    blockTimestamp: meta.block.timestamp ?? undefined,
    blockHash: meta.block.hash ?? undefined,
    deployment: meta.deployment,
    hasIndexingErrors: meta.hasIndexingErrors,
  };

  // Cache the result
  if (useCache) {
    globalMetaCache.set(subgraphUrl, subgraphMeta);
  }

  return subgraphMeta;
}

/**
 * Checks if subgraph meets consistency requirements
 *
 * @param subgraphUrl - The GraphQL endpoint URL
 * @param options - Consistency requirements
 * @returns The subgraph metadata if requirements are met
 * @throws {StaleDataError} If subgraph is behind required block
 */
export async function checkSubgraphConsistency(
  subgraphUrl: string,
  options?: ConsistencyOptions,
): Promise<SubgraphMeta> {
  // Check if already aborted
  if (options?.signal?.aborted) {
    throw new Error("Operation aborted");
  }

  // If no consistency requirements, just return current metadata
  if (!options?.minBlock) {
    return fetchSubgraphMeta(subgraphUrl);
  }

  const meta = await fetchSubgraphMeta(subgraphUrl);

  // Check if subgraph has reached required block
  if (meta.blockNumber < options.minBlock) {
    // If waitForSync is specified, poll until caught up
    if (options.waitForSync && options.waitForSync > 0) {
      return waitForSubgraphSync(
        subgraphUrl,
        options.minBlock,
        options.waitForSync,
        2000, // pollInterval
        options.signal,
      );
    }

    // Otherwise throw immediately
    throw new StaleDataError(options.minBlock, meta.blockNumber);
  }

  return meta;
}

/**
 * Waits for subgraph to sync to a specific block
 *
 * @param subgraphUrl - The GraphQL endpoint URL
 * @param targetBlock - Block number to wait for
 * @param maxWait - Maximum milliseconds to wait
 * @param pollInterval - How often to check (default: 2000ms)
 * @returns The subgraph metadata when target is reached
 * @throws {StaleDataError} If timeout is reached before sync
 */
export async function waitForSubgraphSync(
  subgraphUrl: string,
  targetBlock: number,
  maxWait: number,
  pollInterval = 2000,
  signal?: AbortSignal,
): Promise<SubgraphMeta> {
  const startTime = Date.now();

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }

  // Set up abort handling
  const checkAbort = () => {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  };

  while (Date.now() - startTime < maxWait) {
    checkAbort();
    const meta = await fetchSubgraphMeta(subgraphUrl);

    // Check if we've reached the target
    if (meta.blockNumber >= targetBlock) {
      return meta;
    }

    // Wait before next check with abort support
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, pollInterval);

      if (signal) {
        const abortHandler = () => {
          clearTimeout(timer);
          reject(new Error("Operation aborted"));
        };

        if (signal.aborted) {
          abortHandler();
        } else {
          signal.addEventListener("abort", abortHandler, { once: true });
        }
      }
    });
  }

  // Timeout reached, check one more time
  checkAbort();
  const finalMeta = await fetchSubgraphMeta(subgraphUrl);
  if (finalMeta.blockNumber >= targetBlock) {
    return finalMeta;
  }

  throw new StaleDataError(
    targetBlock,
    finalMeta.blockNumber,
    `Subgraph did not sync to block ${targetBlock} within ${maxWait}ms. Current block: ${finalMeta.blockNumber}`,
  );
}

/**
 * Calculates staleness in seconds based on block timestamps
 *
 * @param meta - Subgraph metadata
 * @param currentTimestamp - Current chain timestamp
 * @returns Seconds behind the chain, or undefined if timestamps unavailable
 */
export function calculateStaleness(
  meta: SubgraphMeta,
  currentTimestamp: number,
): number | undefined {
  if (!meta.blockTimestamp) {
    return undefined;
  }

  return Math.max(0, currentTimestamp - meta.blockTimestamp);
}

/**
 * Builds a GraphQL query with _meta field included
 *
 * @param baseQuery - The original query string
 * @returns Query with _meta field added
 */
export function addMetaToQuery(baseQuery: string): string {
  // Simple approach: inject _meta at the root level
  // This is a basic implementation - could be enhanced with proper AST manipulation
  if (baseQuery.includes("_meta")) {
    return baseQuery; // Already has meta
  }

  // Find the first { after query name and inject _meta
  const queryMatch = baseQuery.match(/query\s+\w+[^{]*\{/);
  if (!queryMatch) {
    return baseQuery; // Can't parse, return as-is
  }

  const insertPoint = (() => {
    const index = queryMatch.index;
    if (index === undefined) {
      throw new Error(
        "Failed to calculate insertion point for query metadata - regex match index is undefined",
      );
    }
    return index + queryMatch[0].length;
  })();
  return (
    baseQuery.slice(0, insertPoint) +
    `
  _meta {
    block {
      number
      timestamp
    }
    hasIndexingErrors
  }
  ` +
    baseQuery.slice(insertPoint)
  );
}
