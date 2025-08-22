import { parseEventLogs } from "viem";
import type { Hash, PublicClient } from "viem";
import {
  EVENT_MAPPINGS,
  type TransactionOperation,
} from "../config/eventMappings";
import { getAbi } from "../generated/abi";
import { BlockchainError, NetworkError } from "../errors";
import type { TransactionResultMap } from "../types/transactionResults";

/**
 * Base interface for all transaction results.
 * Contains the event data plus transaction metadata.
 */
export interface BaseTransactionResult {
  transactionHash: Hash;
  blockNumber: bigint;
  gasUsed: bigint;
}

/**
 * Parses blockchain events from confirmed transactions based on operation type.
 *
 * @remarks
 * This utility is the centralized event parser for all SDK operations. It uses the
 * `EVENT_MAPPINGS` configuration to determine which contract ABI and event to parse
 * based on the operation type. The function handles receipt fetching, log parsing,
 * and type-safe event extraction automatically.
 *
 * @param context - Minimal context object for transaction parsing
 * @param context.publicClient - Viem public client for blockchain queries
 * @param hash - Transaction hash to fetch and parse
 * @param operation - SDK operation type that determines which event to extract
 * @returns Type-safe event data specific to the operation
 * @throws {NetworkError} When transaction receipt cannot be fetched within timeout
 * @throws {BlockchainError} When expected event is not found in transaction logs
 *
 * @example
 * ```typescript
 * // Parse events from a permission grant transaction
 * const result = await parseTransactionResult(
 *   { publicClient },
 *   "0xabc123...",
 *   'addServerFilesAndPermissions'
 * );
 * console.log(`Permission ${result.permissionId} granted with ${result.fileIds.length} files`);
 * ```
 */
export async function parseTransactionResult<K extends TransactionOperation>(
  context: { publicClient: PublicClient },
  hash: Hash,
  operation: K,
): Promise<TransactionResultMap[K]> {
  const mapping = EVENT_MAPPINGS[operation];

  try {
    // Wait for transaction confirmation
    console.debug(`🔍 Parsing ${operation} transaction: ${hash}`);

    const receipt = await context.publicClient.waitForTransactionReceipt({
      hash,
      timeout: 30_000, // 30 second timeout
    });

    console.debug(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Get contract ABI for event parsing
    const abi = getAbi(mapping.contract);

    // Parse events using viem's parseEventLogs
    const events = parseEventLogs({
      logs: receipt.logs,
      abi,
      eventName: mapping.event,
      strict: true, // Only return logs that conform to the ABI
    });

    // Validate we found the expected event
    if (events.length === 0) {
      throw new BlockchainError(
        `No ${mapping.event} event found in transaction ${hash}. ` +
          `Transaction may have failed or reverted.`,
      );
    }

    if (events.length > 1) {
      console.warn(
        `⚠️  Multiple ${mapping.event} events found in transaction ${hash}. Using the first one.`,
      );
    }

    const event = events[0];
    console.debug(`🎉 Found ${mapping.event} event with args:`, event.args);

    // Return event args plus transaction metadata
    return {
      ...event.args,
      transactionHash: hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    } as TransactionResultMap[K];
  } catch (error) {
    // Re-throw known Vana errors directly
    if (error instanceof BlockchainError || error instanceof NetworkError) {
      throw error;
    }

    // Handle timeout errors specifically
    if (error instanceof Error && error.message.includes("timeout")) {
      throw new NetworkError(
        `Transaction ${hash} confirmation timeout after 30 seconds. ` +
          `The transaction may still be pending.`,
        error,
      );
    }

    // Wrap unknown errors
    throw new BlockchainError(
      `Failed to parse ${operation} transaction ${hash}: ${error instanceof Error ? error.message : "Unknown error"}`,
      error as Error,
    );
  }
}
