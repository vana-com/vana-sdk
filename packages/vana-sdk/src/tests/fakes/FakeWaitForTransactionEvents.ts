/**
 * Provides a controllable fake implementation of transaction event waiting for testing.
 *
 * @remarks
 * This test fake replaces complex mocking with a simple, predictable implementation
 * that allows tests to configure specific responses for transaction hashes.
 * Use this when testing controllers that depend on waitForTransactionEvents functionality.
 *
 * The fake maintains separate maps for responses and errors, allowing tests to
 * simulate both successful and failing transaction scenarios.
 *
 * @category Testing
 * @internal
 */

import type { Hash, Address } from "viem";

/**
 * Minimal TransactionResult interface to avoid circular dependencies.
 * Mirrors the actual TransactionResult from types/operations.
 */
interface TransactionResultLike {
  hash: Hash;
  from?: Address;
  contract?: string;
  fn?: string;
}

/**
 * Represents the result of waiting for transaction events.
 */
export interface TransactionEventResult {
  /** The transaction hash that was monitored */
  hash: Hash;
  /** The address that initiated the transaction */
  from: Address;
  /** The name of the contract that was called */
  contract: string;
  /** The function name that was invoked */
  fn: string;
  /** Map of expected events that were emitted, keyed by event name */
  expectedEvents: Record<string, unknown>;
  /** Array of all events emitted by the transaction */
  allEvents: unknown[];
  /** Whether all expected events were found in the transaction */
  hasExpectedEvents: boolean;
}

export class FakeWaitForTransactionEvents {
  private responses = new Map<string, TransactionEventResult>();
  private errors = new Map<string, Error>();
  private defaultResponse: TransactionEventResult = {
    hash: "0xdefaulthash" as Hash,
    from: "0xdefaultfrom",
    contract: "DefaultContract",
    fn: "defaultFunction",
    expectedEvents: {},
    allEvents: [],
    hasExpectedEvents: true,
  };

  /**
   * Configures a specific response for a given transaction hash.
   *
   * @param hash - The transaction hash to configure a response for
   * @param response - The response object to return when this hash is queried
   *
   * @example
   * ```typescript
   * const fake = new FakeWaitForTransactionEvents();
   * fake.setResponse("0xabc123", {
   *   hash: "0xabc123" as Hash,
   *   from: "0xuser",
   *   contract: "DataRegistry",
   *   fn: "addFile",
   *   expectedEvents: { FileAdded: { fileId: 1n } },
   *   allEvents: [],
   *   hasExpectedEvents: true
   * });
   * ```
   */
  setResponse(hash: string, response: TransactionEventResult): void {
    this.responses.set(hash, response);
  }

  /**
   * Configures an error to be thrown for a specific transaction hash.
   *
   * @param hash - The transaction hash that should trigger an error
   * @param error - The error to throw when this hash is queried
   *
   * @example
   * ```typescript
   * const fake = new FakeWaitForTransactionEvents();
   * fake.setError("0xfailed", new Error("Transaction timeout"));
   * ```
   */
  setError(hash: string, error: Error): void {
    this.errors.set(hash, error);
  }

  /**
   * Sets the default response returned for any unconfigured transaction hash.
   *
   * @param response - The default response object to use
   *
   * @example
   * ```typescript
   * const fake = new FakeWaitForTransactionEvents();
   * fake.setDefaultResponse({
   *   hash: "0xdefault" as Hash,
   *   from: "0xdefault",
   *   contract: "TestContract",
   *   fn: "testFunction",
   *   expectedEvents: {},
   *   allEvents: [],
   *   hasExpectedEvents: false
   * });
   * ```
   */
  setDefaultResponse(response: TransactionEventResult): void {
    this.defaultResponse = response;
  }

  /**
   * Simulates waiting for transaction events, returning configured responses or throwing configured errors.
   *
   * @param txOrHash - A TransactionResult-like object or raw transaction hash string
   * @returns A promise that resolves with the configured response for this hash
   * @throws The configured error for this hash, if one was set
   */
  async wait(
    txOrHash: TransactionResultLike | Hash | string,
  ): Promise<TransactionEventResult> {
    // Extract hash from TransactionResult if needed
    const hash = typeof txOrHash === "string" ? txOrHash : txOrHash.hash;

    // Check for configured errors first
    const error = this.errors.get(hash);
    if (error) {
      throw error;
    }

    // Return configured response or default
    const response = this.responses.get(hash);
    if (response) {
      return response;
    }
    return this.defaultResponse;
  }

  /**
   * Clears all configured responses and errors, resetting the fake to its initial state.
   */
  reset(): void {
    this.responses.clear();
    this.errors.clear();
  }

  /**
   * Gets all transaction hashes that have configured responses.
   *
   * @returns Array of transaction hash strings
   */
  getConfiguredHashes(): string[] {
    return Array.from(this.responses.keys());
  }

  /**
   * Creates a function that can be used as a mock implementation in vitest.
   *
   * @returns A function compatible with vi.fn().mockImplementation()
   *
   * @example
   * ```typescript
   * const fake = new FakeWaitForTransactionEvents();
   * const mockWaitForTransactionEvents = vi.fn()
   *   .mockImplementation(fake.asMockFunction());
   * ```
   */
  asMockFunction(): (
    txOrHash: TransactionResultLike | Hash | string,
  ) => Promise<TransactionEventResult> {
    return (txOrHash: TransactionResultLike | Hash | string) =>
      this.wait(txOrHash);
  }

  /**
   * Creates a pre-configured response object for a successful SchemaAdded event.
   *
   * @param schemaId - The ID of the schema that was added
   * @param name - The name of the schema
   * @param dialect - The dialect/format of the schema (e.g., "json", "jsonschema")
   * @param definitionUrl - The URL where the schema definition is stored
   * @param hash - The transaction hash (defaults to "0xtxhash")
   * @returns A complete TransactionEventResult object for a SchemaAdded event
   *
   * @example
   * ```typescript
   * const response = FakeWaitForTransactionEvents.createSchemaAddedResponse(
   *   123n,
   *   "UserProfile",
   *   "jsonschema",
   *   "https://ipfs.io/ipfs/QmHash"
   * );
   * fake.setResponse("0xtxhash", response);
   * ```
   */
  static createSchemaAddedResponse(
    schemaId: bigint,
    name: string,
    dialect: string,
    definitionUrl: string,
    hash: Hash = "0xtxhash" as Hash,
  ): TransactionEventResult {
    return {
      hash,
      from: "0xTestAddress",
      contract: "DataRefinerRegistry",
      fn: "addSchema",
      expectedEvents: {
        SchemaAdded: {
          schemaId,
          name,
          dialect,
          definitionUrl,
        },
      },
      allEvents: [],
      hasExpectedEvents: true,
    };
  }

  /**
   * Creates a response object representing a transaction with no expected events.
   *
   * @param hash - The transaction hash (defaults to "0xtxhash")
   * @returns A TransactionEventResult with hasExpectedEvents set to false
   *
   * @example
   * ```typescript
   * const emptyResponse = FakeWaitForTransactionEvents.createEmptyResponse();
   * fake.setResponse("0xempty", emptyResponse);
   * ```
   */
  static createEmptyResponse(
    hash: Hash = "0xtxhash" as Hash,
  ): TransactionEventResult {
    return {
      hash,
      from: "0xTestAddress",
      contract: "DataRefinerRegistry",
      fn: "addSchema",
      expectedEvents: {},
      allEvents: [],
      hasExpectedEvents: false,
    };
  }
}
