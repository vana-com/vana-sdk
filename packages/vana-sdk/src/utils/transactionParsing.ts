import { parseEventLogs } from "viem";
import type { Hash } from "viem";
import {
  EVENT_MAPPINGS,
  type TransactionOperation,
} from "../config/eventMappings";
import { getAbi } from "../abi/index";
import type { ControllerContext } from "../controllers/permissions";
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
 * Generic transaction result parser that extracts event data from transaction receipts.
 *
 * This utility provides a consistent way to parse blockchain events from completed
 * transactions across all SDK controllers. It handles receipt fetching, event parsing,
 * error handling, and result formatting automatically.
 *
 * @param context - Controller context containing blockchain clients
 * @param hash - Transaction hash to parse
 * @param operation - SDK operation name (maps to contract/event via EVENT_MAPPINGS)
 * @returns Promise resolving to event args plus transaction metadata
 * @throws {NetworkError} When transaction receipt cannot be fetched
 * @throws {BlockchainError} When expected event is not found in transaction
 *
 * @example
 * ```typescript
 * // Parse a permission grant transaction
 * const result = await parseTransactionResult(context, txHash, 'grant');
 * console.log(`Permission ${result.permissionId} granted to ${result.user}`);
 *
 * // Parse a file addition transaction
 * const result = await parseTransactionResult(context, txHash, 'addFile');
 * console.log(`File ${result.fileId} added at ${result.url}`);
 * ```
 */
export async function parseTransactionResult<K extends TransactionOperation>(
  context: ControllerContext,
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
