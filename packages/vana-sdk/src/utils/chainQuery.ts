/**
 * @file Utilities for querying data directly from the blockchain
 * @module vana-sdk/utils/chainQuery
 */

import type { Address, PublicClient } from "viem";
import { parseAbiItem } from "viem";
import type { UserFile } from "../types";

/**
 * Query user files directly from the blockchain using events
 *
 * @remarks
 * This bypasses the subgraph entirely and queries events directly from the chain.
 * Slower than subgraph but guarantees real-time consistency.
 *
 * @param publicClient - Viem public client for chain interaction
 * @param contractAddress - DataRegistry contract address
 * @param owner - Owner address to query files for
 * @param fromBlock - Starting block number (optional)
 * @param toBlock - Ending block number (optional)
 * @returns Array of UserFile objects
 */
export async function getUserFilesFromChain(
  publicClient: PublicClient,
  contractAddress: Address,
  owner: Address,
  fromBlock?: bigint,
  toBlock?: bigint,
): Promise<UserFile[]> {
  // Query FileAddedV2 events (has schema support)
  const fileAddedV2Events = await publicClient.getLogs({
    address: contractAddress,
    event: parseAbiItem(
      "event FileAddedV2(uint256 indexed fileId, address indexed ownerAddress, string url, uint256 schemaId)",
    ),
    args: {
      ownerAddress: owner,
    },
    fromBlock: fromBlock ?? "earliest",
    toBlock: toBlock ?? "latest",
  });

  // Also query older FileAdded events (no schema)
  const fileAddedEvents = await publicClient.getLogs({
    address: contractAddress,
    event: parseAbiItem(
      "event FileAdded(uint256 indexed fileId, address indexed ownerAddress, string url)",
    ),
    args: {
      ownerAddress: owner,
    },
    fromBlock: fromBlock ?? "earliest",
    toBlock: toBlock ?? "latest",
  });

  // Convert events to UserFile objects
  const filesFromV2 = fileAddedV2Events.map((event) => ({
    id: Number(event.args.fileId),
    url: event.args.url as string,
    ownerAddress: event.args.ownerAddress as Address,
    schemaId: Number(event.args.schemaId),
    addedAtBlock: event.blockNumber,
    addedAtTimestamp: BigInt(0), // Would need to fetch block for timestamp
    transactionHash: event.transactionHash,
  }));

  const filesFromV1 = fileAddedEvents.map((event) => ({
    id: Number(event.args.fileId),
    url: event.args.url as string,
    ownerAddress: event.args.ownerAddress as Address,
    schemaId: 0, // No schema in V1
    addedAtBlock: event.blockNumber,
    addedAtTimestamp: BigInt(0), // Would need to fetch block for timestamp
    transactionHash: event.transactionHash,
  }));

  // Combine and deduplicate (V2 takes precedence)
  const allFiles = [...filesFromV2];
  const v2FileIds = new Set(filesFromV2.map((f) => f.id));

  for (const v1File of filesFromV1) {
    if (!v2FileIds.has(v1File.id)) {
      allFiles.push(v1File);
    }
  }

  // Sort by block number descending (most recent first)
  allFiles.sort((a, b) => {
    if (a.addedAtBlock > b.addedAtBlock) return -1;
    if (a.addedAtBlock < b.addedAtBlock) return 1;
    return 0;
  });

  return allFiles;
}

/**
 * Determine optimal data source based on requirements
 *
 * @param source - Explicitly requested source
 * @param minBlock - Minimum required block
 * @param currentBlock - Current chain block
 * @param subgraphBlock - Current subgraph block
 * @returns The data source to use
 */
export function determineDataSource(
  source: "subgraph" | "chain" | "auto" | undefined,
  minBlock: number | undefined,
  currentBlock: bigint,
  subgraphBlock: number | undefined,
): "subgraph" | "chain" {
  // If explicitly specified, use that
  if (source === "subgraph" || source === "chain") {
    return source;
  }

  // Auto mode or unspecified
  if (source === "auto" || source === undefined) {
    // If no consistency requirement, use subgraph (faster)
    if (!minBlock) {
      return "subgraph";
    }

    // If subgraph is unknown or too far behind, use chain
    if (!subgraphBlock || subgraphBlock < minBlock) {
      // Calculate staleness
      const staleness = Number(currentBlock) - (subgraphBlock ?? 0);

      // If more than 100 blocks behind, use chain
      if (staleness > 100) {
        return "chain";
      }
    }

    // Default to subgraph
    return "subgraph";
  }

  // Default fallback
  return "subgraph";
}
