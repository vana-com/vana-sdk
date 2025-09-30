/**
 * @file Utilities for handling paginated subgraph queries
 * @module vana-sdk/utils/subgraphPagination
 */

import { print, type DocumentNode } from "graphql";
import type { PaginationOptions } from "../types/options";

/**
 * Generic subgraph response structure
 */
export interface SubgraphResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * Configuration for paginated subgraph queries
 */
export interface PaginatedQueryConfig<TData, TItem, TRawItem = any> {
  /** The GraphQL endpoint URL */
  endpoint: string;

  /** The GraphQL document to execute */
  document: DocumentNode;

  /** Base variables for the query (e.g., userId) */
  baseVariables: Record<string, any>;

  /** Pagination options from the user */
  options?: PaginationOptions;

  /** Function to extract items from the response */
  extractItems: (data: TData) => TRawItem[] | undefined;

  /** Function to transform items if needed */
  transformItem?: (item: TRawItem) => TItem;

  /** Maximum items per GraphQL query (default: 1000) */
  maxPerQuery?: number;
}

/**
 * Generic paginated query executor for subgraph queries
 *
 * @remarks
 * Handles pagination, fetchAll, and proper GraphQL query construction.
 * Abstracts the common pattern of paginated subgraph queries.
 *
 * @param config - Configuration for the paginated query
 * @returns Array of items from all pages
 *
 * @example
 * ```typescript
 * const files = await executePaginatedQuery({
 *   endpoint: subgraphUrl,
 *   document: GetUserFilesPaginatedDocument,
 *   baseVariables: { userId: owner.toLowerCase() },
 *   options: { limit: 50, orderBy: 'addedAtBlock' },
 *   extractItems: (data) => data?.user?.files,
 *   transformItem: (file) => ({
 *     id: parseInt(file.id),
 *     url: file.url,
 *     // ... transform to UserFile
 *   })
 * });
 * ```
 */
export async function executePaginatedQuery<TData, TItem, TRawItem = any>(
  config: PaginatedQueryConfig<TData, TItem, TRawItem>,
): Promise<TItem[]> {
  const {
    endpoint,
    document,
    baseVariables,
    options,
    extractItems,
    transformItem,
    maxPerQuery = 1000,
  } = config;

  // Set pagination defaults
  const limit = options?.fetchAll
    ? Number.MAX_SAFE_INTEGER
    : (options?.limit ?? 100);
  const offset = options?.offset ?? 0;
  const orderBy = options?.orderBy;
  const orderDirection = options?.orderDirection;

  const allItems: TItem[] = [];
  let currentOffset = offset;
  const pageSize = Math.min(limit, maxPerQuery);

  // Handle fetchAll by making multiple queries if needed
  while (true) {
    const currentLimit = options?.fetchAll
      ? pageSize
      : Math.min(pageSize, limit - allItems.length);

    // Build query variables
    const variables = {
      ...baseVariables,
      first: currentLimit,
      skip: currentOffset,
      ...(orderBy && { orderBy }),
      ...(orderDirection && { orderDirection }),
    };

    // Execute query
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: print(document),
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Subgraph request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as SubgraphResponse<TData>;

    if (result.errors) {
      throw new Error(
        `Subgraph errors: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    // Extract items from response
    const items = extractItems(result.data as TData);

    if (!items || items.length === 0) {
      // No more items
      break;
    }

    // Transform items if transformer provided
    const transformedItems: TItem[] = transformItem
      ? items.map(transformItem)
      : (items as unknown as TItem[]);

    allItems.push(...transformedItems);

    // Check if we have enough items or should continue
    if (!options?.fetchAll && allItems.length >= limit) {
      // We have enough items
      return allItems.slice(0, limit); // Trim to exact limit
    }

    if (items.length < currentLimit) {
      // No more items available
      break;
    }

    // Continue to next page
    currentOffset += items.length;
  }

  return allItems;
}

/**
 * Helper to map string orderBy values to GraphQL enums
 *
 * @param orderBy - String orderBy value from options
 * @param enumMap - Map of string values to GraphQL enum values
 * @returns The mapped enum value or undefined
 */
export function mapOrderByToEnum<T>(
  orderBy: string | undefined,
  enumMap: Record<string, T>,
  defaultValue?: T,
): T | undefined {
  if (!orderBy) return defaultValue;
  return enumMap[orderBy] ?? defaultValue;
}

/**
 * Helper to map string orderDirection to GraphQL enum
 *
 * @param direction - Direction string ('asc' or 'desc')
 * @param ascValue - The GraphQL enum value for ascending
 * @param descValue - The GraphQL enum value for descending
 * @returns The mapped enum value
 */
export function mapOrderDirection<T>(
  direction: "asc" | "desc" | undefined,
  ascValue: T,
  descValue: T,
  defaultValue?: T,
): T {
  if (!direction) return defaultValue ?? descValue;
  return direction === "asc" ? ascValue : descValue;
}
