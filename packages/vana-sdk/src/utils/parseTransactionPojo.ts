/**
 * Transaction parsing with POJO support and NO heuristics.
 * 
 * @remarks
 * This is the new POJO-based parser that works with TransactionResult objects.
 * Principle: Explicit over implicit, guarantees over guesses.
 */

import { decodeEventLog, type Log, type TransactionReceipt } from 'viem';
import type { TransactionResult } from '../types/operations';
import { EVENT_REGISTRY } from '../generated/eventRegistry';

/**
 * Represents a parsed blockchain event from a transaction log.
 */
export interface ParsedEvent {
  /** The name of the event */
  name: string;
  /** The decoded event arguments */
  args: Record<string, unknown>;
  /** The contract address that emitted the event */
  address?: string;
  /** The index of this log in the transaction */
  logIndex?: number;
}

/**
 * Parses a transaction using TransactionResult POJO with ZERO heuristics.
 * 
 * @remarks
 * - Uses function-scoped event registry for O(1) lookups
 * - Only expects events explicitly mapped for this contract.function
 * - Returns all events but distinguishes expected from unexpected
 * 
 * @param transactionResult - The TransactionResult POJO with context
 * @param receipt - The transaction receipt from the blockchain
 * @returns Transaction result with parsed events
 */
export function parseTransaction<C extends string, F extends string>(
  transactionResult: TransactionResult<C, F>,
  receipt: TransactionReceipt
): TransactionResult<C, F> & {
  expectedEvents: ParsedEvent[];
  allEvents: ParsedEvent[];
  receipt: TransactionReceipt;
} {
  const { contract: contractName, fn: functionName } = transactionResult;
  
  // Look up expected events from the function-specific registry
  const registryKey = `${contractName}.${functionName}`;
  const registry = EVENT_REGISTRY[registryKey as keyof typeof EVENT_REGISTRY];
  
  const expectedEvents: ParsedEvent[] = [];
  const allEvents: ParsedEvent[] = [];
  
  if (!receipt.logs) {
    // No logs to parse
    return {
      ...transactionResult,
      expectedEvents,
      allEvents,
      receipt,
    };
  }
  
  // Parse logs using the function-scoped registry
  for (const log of receipt.logs) {
    if (!log.topics || log.topics.length === 0) {
      // Skip malformed logs
      continue;
    }
    
    const eventTopic = log.topics[0];
    
    // Try to decode using the function-specific registry
    if (registry && registry.topicToAbi && registry.topicToAbi[eventTopic]) {
      const abiEvent = registry.topicToAbi[eventTopic];
      
      try {
        const decoded = decodeEventLog({
          abi: [abiEvent],
          data: log.data,
          topics: log.topics as readonly `0x${string}`[],
        });
        
        const parsedEvent: ParsedEvent = {
          name: decoded.eventName,
          args: decoded.args as Record<string, unknown>,
          address: log.address,
          logIndex: log.logIndex ?? undefined,
        };
        
        expectedEvents.push(parsedEvent);
        allEvents.push(parsedEvent);
      } catch {
        // Failed to decode, treat as unknown event
        allEvents.push({
          name: 'Unknown',
          args: { topic0: eventTopic, data: log.data },
          address: log.address,
          logIndex: log.logIndex ?? undefined,
        });
      }
    } else {
      // Event not in function-specific registry
      allEvents.push({
        name: 'Unknown',
        args: { topic0: eventTopic, data: log.data },
        address: log.address,
        logIndex: log.logIndex ?? undefined,
      });
    }
  }
  
  // Return a new POJO with all the information
  return {
    ...transactionResult,
    expectedEvents,
    allEvents,
    receipt,
  };
}