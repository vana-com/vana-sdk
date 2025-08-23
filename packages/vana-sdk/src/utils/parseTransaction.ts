/**
 * Transaction parsing with NO heuristics.
 * 
 * @remarks
 * Principle: Explicit over implicit, guarantees over guesses.
 * This parser uses explicit contract→function→event mappings from a JSON file
 * and collects ALL events from transactions, not just expected ones.
 */

import { decodeEventLog, type Log, type TransactionReceipt } from 'viem';
import type { TransactionRequest } from '../types/blockchain';
import type { TypedTransactionResult } from '../generated/event-types';
import { EVENT_REGISTRY, TOPIC_TO_ABIS } from '../generated/eventRegistry';

/**
 * Represents a parsed blockchain event from a transaction log.
 */
export interface ParsedEvent {
  /** The contract address that emitted the event */
  contractAddress: string;
  /** The name of the event */
  eventName: string;
  /** The decoded event arguments */
  args: Record<string, unknown>;
  /** The index of this log in the transaction */
  logIndex: number;
}

/**
 * Complete transaction result with all parsed events.
 * This type is internal - SDK users get TypedTransactionResult.
 */
export interface CompleteTransactionResult {
  hash: `0x${string}`;
  from?: `0x${string}`;
  contract: string;
  fn: string;
  expectedEvents: Record<string, unknown>;
  allEvents: ParsedEvent[];
  hasExpectedEvents: boolean;
}

/**
 * Parses a transaction with ZERO heuristics.
 * 
 * @remarks
 * - If it's in the mapping file, we expect it
 * - If it's not in the mapping file, we have no expectations  
 * - We ALWAYS collect all events regardless
 * 
 * @param receipt - The transaction receipt from the blockchain
 * @param request - The transaction request with context information
 * @returns Complete transaction result with all parsed events
 */
export async function parseTransaction(
  receipt: TransactionReceipt,
  request: TransactionRequest
): Promise<CompleteTransactionResult> {
  const { contractName, functionName } = request;
  
  // Look up expected events from the function-specific registry
  const registryKey = `${contractName}.${functionName}`;
  const registry = EVENT_REGISTRY[registryKey];
  const expectedEventNames = registry?.eventNames || [];
  
  const result: CompleteTransactionResult = {
    hash: receipt.transactionHash,
    from: request.from,
    contract: contractName,
    fn: functionName,
    expectedEvents: {},
    allEvents: [],
    hasExpectedEvents: false
  };
  
  // Parse ALL events - we always do this
  for (const log of receipt.logs) {
    const parsedEvent = tryParseLog(log, expectedEventNames);
    if (parsedEvent) {
      result.allEvents.push(parsedEvent);
      
      // If this matches an expected event, record it
      if (expectedEventNames.includes(parsedEvent.eventName)) {
        result.expectedEvents[parsedEvent.eventName] = parsedEvent.args;
        result.hasExpectedEvents = true;
        
        // For convenience, merge to top level
        // This is the ONLY magic we do, and it's purely additive
        Object.assign(result, parsedEvent.args);
      }
    }
  }
  
  return result;
}

/**
 * Tries to parse a log by checking if it's a known event.
 * 
 * @remarks
 * Uses O(1) topic lookup to check if event is known,
 * then tries to decode with matching ABIs.
 * 
 * @param log - The log to parse
 * @param expectedEventNames - Names of events we expect for this function
 * @returns Parsed event or null if unable to decode
 */
function tryParseLog(log: Log, expectedEventNames: readonly string[]): ParsedEvent | null {
  // Get the event signature topic (first topic)
  const eventTopic = log.topics[0];
  if (!eventTopic) {
    // Anonymous event or malformed log
    return {
      contractAddress: log.address,
      eventName: 'Unknown',
      args: { 
        data: log.data 
      },
      logIndex: log.logIndex ?? 0
    };
  }
  
  // O(1) check if this is a known event topic
  if (!TOPIC_TO_ABIS.has(eventTopic as `0x${string}`)) {
    // Event not in our ABIs
    return {
      contractAddress: log.address,
      eventName: 'Unknown',
      args: { 
        topic0: eventTopic,
        data: log.data 
      },
      logIndex: log.logIndex ?? 0
    };
  }
  
  // Get all candidate ABIs for this exact topic signature
  const candidates = TOPIC_TO_ABIS.get(eventTopic as `0x${string}`) ?? [];
  
  // If we have expectations, try those first (by name), else try all candidates
  const orderedCandidates = expectedEventNames.length > 0
    ? candidates.filter((abi: any) => expectedEventNames.includes(abi.name))
        .concat(candidates.filter((abi: any) => !expectedEventNames.includes(abi.name)))
    : candidates;
  
  for (const abiEvent of orderedCandidates) {
    try {
      const decoded = decodeEventLog({
        abi: [abiEvent],
        data: log.data,
        topics: log.topics
      }) as { eventName: string; args: Record<string, unknown> };
      
      return {
        contractAddress: log.address,
        eventName: decoded.eventName,
        args: decoded.args,
        logIndex: log.logIndex ?? 0
      };
    } catch {
      // This ABI doesn't match, try next
      continue;
    }
  }
  
  // Couldn't decode with any known ABI
  return {
    contractAddress: log.address,
    eventName: 'Unknown',
    args: { 
      topic0: log.topics[0],
      data: log.data 
    },
    logIndex: log.logIndex ?? 0
  };
}

/**
 * The beauty of this system:
 * 
 * 1. NO HEURISTICS - everything is explicit
 * 2. O(1) lookups - topic-based event identification
 * 3. Complete parsing - we collect ALL events
 * 4. Type safety - TypeScript knows expected events
 * 5. Self-describing POJOs - full context preserved
 * 
 * This follows the principles:
 * - Rich Hickey: Simple, not easy. Data as data.
 * - Stripe: Explicit, maintainable, testable.
 */