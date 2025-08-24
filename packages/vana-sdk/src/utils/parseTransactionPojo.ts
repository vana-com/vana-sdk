/**
 * Transaction parsing with POJO support and NO heuristics.
 * 
 * @remarks
 * This is the new POJO-based parser that works with TransactionResult objects.
 * Principle: Explicit over implicit, guarantees over guesses.
 */

import { decodeEventLog, type TransactionReceipt } from 'viem';
import type { TransactionResult } from '../types/operations';
import type { TypedTransactionResult, Contract, Fn, ExpectedEvents } from '../generated/event-types';
import { EVENT_REGISTRY, TOPIC_TO_ABIS } from '../generated/eventRegistry';

/**
 * Parses a transaction using TransactionResult POJO with ZERO heuristics.
 * 
 * @remarks
 * - Uses function-scoped event registry for O(1) lookups
 * - Only expects events explicitly mapped for this contract.function
 * - Returns typed events matching the exact TypedTransactionResult interface
 * 
 * @param transactionResult - The TransactionResult POJO with context
 * @param receipt - The transaction receipt from the blockchain
 * @returns Typed transaction result with parsed events
 */
export function parseTransaction<C extends Contract, F extends Fn<C>>(
  transactionResult: TransactionResult<C, F>,
  receipt: TransactionReceipt
): TypedTransactionResult<C, F> {
  const { contract: contractName, fn: functionName } = transactionResult;
  
  // Look up expected events from the function-specific registry
  const registryKey = `${contractName}.${functionName}`;
  const registry = EVENT_REGISTRY[registryKey as keyof typeof EVENT_REGISTRY];
  
  // Initialize the expected events object with proper types
  const expectedEvents: any = {};
  const allEvents: Array<{
    contractAddress: string;
    eventName: string;
    args: Record<string, unknown>;
    logIndex: number;
  }> = [];
  
  let hasExpectedEvents = false;
  
  if (receipt.logs) {
    // Parse logs using the function-scoped registry
    for (const log of receipt.logs) {
      if (!log.topics || log.topics.length === 0) {
        // Skip malformed logs
        continue;
      }
      
      const eventTopic = log.topics[0] as `0x${string}`;
      
      // Try to decode using TOPIC_TO_ABIS for O(1) lookup
      const abiCandidates = TOPIC_TO_ABIS.get(eventTopic);
      
      if (abiCandidates && abiCandidates.length > 0) {
        // Try each ABI variant (handles collisions)
        for (const abiEvent of abiCandidates) {
          try {
            const decoded = decodeEventLog({
              abi: [abiEvent],
              data: log.data,
              topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            });
            
            // Add to allEvents
            allEvents.push({
              contractAddress: log.address || '',
              eventName: decoded.eventName,
              args: decoded.args as Record<string, unknown>,
              logIndex: log.logIndex ?? 0,
            });
            
            // If this event is expected for this function, add to expectedEvents
            if (registry && registry.eventNames.includes(decoded.eventName)) {
              expectedEvents[decoded.eventName] = decoded.args;
              hasExpectedEvents = true;
            }
            
            break; // Successfully decoded, don't try other variants
          } catch {
            // Try next ABI variant
            continue;
          }
        }
      } else {
        // Event not decodable, add as unknown
        allEvents.push({
          contractAddress: log.address || '',
          eventName: 'Unknown',
          args: { topic0: eventTopic, data: log.data },
          logIndex: log.logIndex ?? 0,
        });
      }
    }
  }
  
  // Return a properly typed TypedTransactionResult
  return {
    hash: transactionResult.hash,
    from: transactionResult.from,
    contract: contractName as C,
    fn: functionName as F,
    expectedEvents: expectedEvents as ExpectedEvents<C, F>,
    allEvents,
    hasExpectedEvents,
  };
}