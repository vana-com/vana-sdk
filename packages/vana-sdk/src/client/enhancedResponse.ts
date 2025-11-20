/**
 * Enhanced client-side response wrapper for relayer operations.
 *
 * @remarks
 * This module provides a fluent API for handling asynchronous relayer responses
 * by adding stateful behavior to the stateless response data. It enables the
 * `.wait()` pattern similar to ethers.js while maintaining clean separation
 * between server-side data transfer and client-side behavior.
 *
 * @module client/enhancedResponse
 */

import type { Hash, TransactionReceipt } from "viem";
import type {
  UnifiedRelayerResponse,
  TransactionContext,
} from "../types/relayer";
import { PollingManager } from "../core/pollingManager";
import type { OperationStatus } from "../types/options";
import type { EnhancedResponseSDK } from "../types/controller-context";

/**
 * Enhanced transaction response that provides a fluent API for waiting.
 *
 * @remarks
 * This class wraps a UnifiedRelayerResponse and provides a `.wait()` method
 * that intelligently handles both submitted transactions (via hash) and
 * pending operations (via operationId). It encapsulates the complexity of
 * polling and event parsing, providing a clean developer experience.
 *
 * @example
 * ```typescript
 * const response = await relayerClient.handleOperation(...);
 * const enhanced = vana.enhanceRelayerResponse(response);
 * if (enhanced) {
 *   const result = await enhanced.wait();
 *   console.log('Transaction confirmed:', result.hash);
 * }
 * ```
 *
 * @category Client
 */
export class EnhancedTransactionResponse {
  /** The underlying relayer response */
  public readonly response: UnifiedRelayerResponse;

  /** The hash if this is a submitted transaction */
  public readonly hash?: Hash;

  /** The operation ID if this is a pending operation */
  public readonly operationId?: string;

  /** Transaction context for event parsing */
  public readonly context?: TransactionContext;

  /** SDK instance providing blockchain and relayer functionality */
  private readonly sdk: EnhancedResponseSDK;

  constructor(response: UnifiedRelayerResponse, sdk: EnhancedResponseSDK) {
    this.response = response;
    this.sdk = sdk;

    // Extract key properties based on response type
    if (response.type === "submitted" || response.type === "signed") {
      this.hash = response.hash;
      this.context = response.context;
    } else if (response.type === "pending") {
      this.operationId = response.operationId;
    }
  }

  /**
   * Waits for the transaction or operation to complete.
   *
   * @remarks
   * This method provides intelligent handling based on the response type:
   * - For 'submitted' responses with context: Uses waitForTransactionEvents for full event parsing
   * - For 'submitted' responses without context: Waits for receipt only
   * - For 'pending' responses: Uses PollingManager to track async operations
   * - For 'confirmed' responses: Returns immediately with the receipt
   *
   * @param options - Optional configuration for polling behavior
   * @returns Promise resolving to event results or transaction receipt
   * @throws Error if the response type cannot be waited on
   *
   * @example
   * ```typescript
   * // With context for event parsing
   * const enhanced = new EnhancedTransactionResponse(response, vana);
   * const result = await enhanced.wait();
   * if (result.expectedEvents?.FileAdded) {
   *   console.log('File ID:', result.expectedEvents.FileAdded.fileId);
   * }
   *
   * // For pending operations
   * const result = await enhanced.wait({
   *   onStatusUpdate: (status) => console.log('Status:', status)
   * });
   * ```
   */
  async wait(options?: {
    /** Callback for status updates during polling */
    onStatusUpdate?: (status: OperationStatus) => void;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Timeout in milliseconds */
    timeout?: number;
  }): Promise<{
    hash: Hash;
    receipt?: TransactionReceipt;
    expectedEvents?: Record<string, unknown>;
    allEvents?: Array<{
      contractAddress: string;
      eventName: string;
      args: Record<string, unknown>;
      logIndex: number;
    }>;
  }> {
    // Handle 'confirmed' responses - already complete
    if (this.response.type === "confirmed") {
      return {
        hash: this.response.hash,
        receipt: this.response.receipt,
      };
    }

    // Handle 'submitted' or 'signed' responses with context - full event parsing
    if (
      (this.response.type === "submitted" || this.response.type === "signed") &&
      this.context
    ) {
      // Use the SDK's waitForTransactionEvents with the preserved context
      return await this.sdk.waitForTransactionEvents({
        hash: this.response.hash,
        from: this.context.from,
        contract: this.context.contract,
        fn: this.context.fn,
      });
    }

    // Handle 'submitted' or 'signed' responses without context - receipt only
    if (this.response.type === "submitted" || this.response.type === "signed") {
      // Just wait for the receipt without event parsing
      const receipt = await this.sdk.publicClient.waitForTransactionReceipt({
        hash: this.response.hash,
      });
      return {
        hash: this.response.hash,
        receipt: receipt as TransactionReceipt,
      };
    }

    // Handle 'pending' responses - use PollingManager
    if (this.response.type === "pending") {
      // Access the relayer callback from the SDK
      if (!this.sdk.relayer) {
        throw new Error("Relayer callback not configured for polling");
      }

      const pollingManager = new PollingManager(this.sdk.relayer);
      return await pollingManager.startPolling(this.response.operationId, {
        signal: options?.signal,
        onStatusUpdate: options?.onStatusUpdate,
        timeout: options?.timeout,
      });
    }

    // Response type cannot be waited on - use discriminated union exhaustiveness
    const unknownType = this.response.type;
    throw new Error(
      `Cannot wait on response type: ${unknownType}. ` +
        `Only 'submitted', 'signed', 'pending', and 'confirmed' responses can be waited on.`,
    );
  }

  /**
   * Checks if this response can be waited on.
   *
   * @returns true if the response supports the wait() method
   */
  canWait(): boolean {
    return (
      this.response.type === "submitted" ||
      this.response.type === "signed" ||
      this.response.type === "pending" ||
      this.response.type === "confirmed"
    );
  }

  /**
   * Gets a human-readable status description.
   *
   * @returns Status string describing the current state
   */
  getStatus(): string {
    switch (this.response.type) {
      case "pending":
        return `Operation pending (ID: ${this.operationId})`;
      case "submitted":
      case "signed":
        return `Transaction submitted (Hash: ${this.hash})`;
      case "confirmed":
        return `Transaction confirmed (Hash: ${this.response.hash})`;
      case "direct":
        return "Operation completed";
      case "error":
        return `Error: ${this.response.error}`;
      default:
        return "Unknown status";
    }
  }
}

/**
 * Type guard to check if a response can be enhanced.
 *
 * @param response - The unified relayer response to check
 * @returns true if the response can be wrapped in EnhancedTransactionResponse
 */
export function canEnhanceResponse(response: UnifiedRelayerResponse): boolean {
  return (
    response.type === "submitted" ||
    response.type === "signed" ||
    response.type === "pending" ||
    response.type === "confirmed"
  );
}

/**
 * Factory function to create an enhanced response if applicable.
 *
 * @param response - The unified relayer response
 * @param sdk - The Vana SDK instance (or minimal SDK interface)
 * @returns EnhancedTransactionResponse if enhanceable, null otherwise
 *
 * @example
 * ```typescript
 * const response = await handleRelayerOperation(vana, request);
 * const enhanced = enhanceResponse(response, vana);
 * if (enhanced) {
 *   await enhanced.wait();
 * }
 * ```
 */
export function enhanceResponse(
  response: UnifiedRelayerResponse,
  sdk: EnhancedResponseSDK,
): EnhancedTransactionResponse | null {
  if (canEnhanceResponse(response)) {
    return new EnhancedTransactionResponse(response, sdk);
  }
  return null;
}
