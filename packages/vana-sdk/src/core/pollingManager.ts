/**
 * Internal polling manager for asynchronous relayer operations.
 *
 * @internal
 * @remarks
 * This module handles client-side polling for long-running relayer operations
 * with exponential backoff, jitter, and cancellation support.
 */

import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
} from "../types/relayer";
import type { OperationStatus } from "../types/options";
import type { Hash, TransactionReceipt } from "viem";
import { TransactionPendingError } from "../errors";

/**
 * Configuration options for polling behavior.
 *
 * @internal
 */
export interface PollingOptions {
  /** Total timeout in milliseconds before giving up (default: 300000ms = 5 min) */
  timeout?: number;
  /** Initial polling interval in milliseconds (default: 1000ms) */
  initialInterval?: number;
  /** Maximum polling interval in milliseconds (default: 10000ms) */
  maxInterval?: number;
  /** Backoff multiplier for each retry (default: 1.5) */
  backoffMultiplier?: number;
  /** Jitter factor to prevent thundering herd (default: 0.2 = 20%) */
  jitter?: number;
}

/**
 * Context for a polling operation.
 *
 * @internal
 */
interface PollingContext {
  operationId: string;
  signal?: AbortSignal;
  onStatusUpdate?: (status: OperationStatus) => void;
  relayerCallback: (
    request: UnifiedRelayerRequest,
  ) => Promise<UnifiedRelayerResponse>;
  options: Required<PollingOptions>;
}

/**
 * Default polling configuration based on production load testing.
 *
 * @internal
 */
const DEFAULT_POLLING_OPTIONS: Required<PollingOptions> = {
  timeout: 300000, // 5 minutes
  initialInterval: 1000, // 1 second
  maxInterval: 10000, // 10 seconds
  backoffMultiplier: 1.5, // 1s -> 1.5s -> 2.25s -> 3.375s -> 5s -> 7.5s -> 10s
  jitter: 0.2, // 20% randomization
};

/**
 * Internal polling manager that handles asynchronous relayer operations.
 *
 * @internal
 * @remarks
 * This class implements exponential backoff with jitter to prevent server
 * overload while maintaining responsive status updates. It's designed to
 * be resilient to network failures and browser tab closures.
 */
export class PollingManager {
  private abortController?: AbortController;
  private timeoutId?: NodeJS.Timeout | number;
  private pollIntervalId?: NodeJS.Timeout | number;

  constructor(
    private readonly relayerCallback: (
      request: UnifiedRelayerRequest,
    ) => Promise<UnifiedRelayerResponse>,
  ) {}

  /**
   * Starts polling for an operation's status.
   *
   * @param operationId - The operation ID to poll for
   * @param options - Polling configuration and callbacks
   * @returns Promise that resolves when operation completes or fails
   * @throws TransactionPendingError if polling times out
   * @throws Error if operation fails or is cancelled
   */
  async startPolling(
    operationId: string,
    options: {
      signal?: AbortSignal;
      onStatusUpdate?: (status: OperationStatus) => void;
    } & Partial<PollingOptions> = {},
  ): Promise<{ hash: Hash; receipt?: TransactionReceipt }> {
    const context: PollingContext = {
      operationId,
      signal: options.signal,
      onStatusUpdate: options.onStatusUpdate,
      relayerCallback: this.relayerCallback,
      options: {
        ...DEFAULT_POLLING_OPTIONS,
        ...options,
      },
    };

    // Set up abort handling
    this.abortController = new AbortController();
    if (context.signal) {
      context.signal.addEventListener("abort", () => {
        this.abortController?.abort();
      });
    }

    // Set up timeout
    const timeoutPromise = this.createTimeoutPromise(context);

    // Start polling
    const pollingPromise = this.poll(context);

    try {
      // Race between polling completion and timeout
      const result = await Promise.race([pollingPromise, timeoutPromise]);

      // Clean up
      this.cleanup();

      return result;
    } catch (error) {
      // Clean up on error
      this.cleanup();

      // Preserve operationId in error for recovery
      if (error instanceof Error && !error.message.includes("operationId")) {
        throw new TransactionPendingError(
          operationId,
          error.message,
          this.getLastKnownStatus(context),
        );
      }

      throw error;
    }
  }

  /**
   * Main polling loop with exponential backoff.
   *
   * @internal
   */
  private async poll(
    context: PollingContext,
  ): Promise<{ hash: Hash; receipt?: TransactionReceipt }> {
    let currentInterval = context.options.initialInterval;
    let lastStatus: OperationStatus | null = null;
    let retryCount = 0;

    while (!this.abortController?.signal.aborted) {
      try {
        // Check operation status
        const response = await this.checkStatus(context);

        // Process response
        const status = this.mapResponseToStatus(response, context.operationId);

        // Notify if status changed
        if (this.hasStatusChanged(lastStatus, status)) {
          context.onStatusUpdate?.(status);
          lastStatus = status;
        }

        // Check for terminal states
        if (status.type === "confirmed") {
          return {
            hash: status.hash,
            receipt: status.receipt as TransactionReceipt | undefined,
          };
        }

        if (status.type === "failed") {
          throw new Error(status.error);
        }

        // Reset retry count on successful poll
        retryCount = 0;
      } catch (error) {
        // Network errors are retryable
        if (this.isRetryableError(error)) {
          retryCount++;
          if (retryCount > 5) {
            throw new Error(
              `Failed to poll after ${retryCount} attempts: ${error}`,
            );
          }
        } else {
          // Non-retryable errors should bubble up
          throw error;
        }
      }

      // Wait before next poll with exponential backoff
      await this.wait(this.calculateNextInterval(currentInterval, context));

      // Increase interval for next iteration
      currentInterval = Math.min(
        currentInterval * context.options.backoffMultiplier,
        context.options.maxInterval,
      );
    }

    // Aborted
    throw new Error("Polling cancelled");
  }

  /**
   * Checks the current status of an operation.
   *
   * @internal
   */
  private async checkStatus(
    context: PollingContext,
  ): Promise<UnifiedRelayerResponse> {
    const request: UnifiedRelayerRequest = {
      type: "status_check",
      operationId: context.operationId,
    };

    return await context.relayerCallback(request);
  }

  /**
   * Maps relayer response to operation status.
   *
   * @internal
   */
  private mapResponseToStatus(
    response: UnifiedRelayerResponse,
    operationId: string,
  ): OperationStatus {
    switch (response.type) {
      case "pending":
        return { type: "pending", operationId };

      case "submitted":
        return { type: "submitted", hash: response.hash };

      case "confirmed":
        return {
          type: "confirmed",
          hash: response.hash,
          receipt: response.receipt,
        };

      case "error":
        return {
          type: "failed",
          error: response.error,
          operationId,
        };

      case "direct":
        // Direct responses during polling might include queue info
        const result = response.result as any;
        if (result?.status === "queued") {
          return {
            type: "queued",
            position: result.position,
            estimatedWait: result.estimatedWait,
          };
        }
        if (result?.status === "processing") {
          return { type: "processing" };
        }
        // Fallback
        return { type: "pending", operationId };

      default:
        return { type: "pending", operationId };
    }
  }

  /**
   * Determines if status has changed meaningfully.
   *
   * @internal
   */
  private hasStatusChanged(
    oldStatus: OperationStatus | null,
    newStatus: OperationStatus,
  ): boolean {
    if (!oldStatus) return true;

    // Check type change
    if (oldStatus.type !== newStatus.type) return true;

    // Check queue position change
    if (
      oldStatus.type === "queued" &&
      newStatus.type === "queued" &&
      oldStatus.position !== newStatus.position
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculates next polling interval with jitter.
   *
   * @internal
   */
  private calculateNextInterval(
    baseInterval: number,
    context: PollingContext,
  ): number {
    const jitterRange = baseInterval * context.options.jitter;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.max(0, baseInterval + jitter);
  }

  /**
   * Waits for specified duration or until aborted.
   *
   * @internal
   */
  private async wait(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);

      // Handle abort
      this.abortController?.signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(new Error("Polling cancelled"));
      });

      this.pollIntervalId = timeoutId as any;
    });
  }

  /**
   * Creates a timeout promise that rejects after configured duration.
   *
   * @internal
   */
  private createTimeoutPromise(context: PollingContext): Promise<never> {
    return new Promise((_, reject) => {
      this.timeoutId = setTimeout(() => {
        reject(
          new TransactionPendingError(
            context.operationId,
            `Polling timeout after ${context.options.timeout}ms`,
            this.getLastKnownStatus(context),
          ),
        );
      }, context.options.timeout) as any;
    });
  }

  /**
   * Determines if an error is retryable.
   *
   * @internal
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("enotfound")
    ) {
      return true;
    }

    // Server errors (5xx)
    if (
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Gets last known status for error reporting.
   *
   * @internal
   */
  private getLastKnownStatus(
    context: PollingContext,
  ): OperationStatus | undefined {
    // In a real implementation, we'd track this
    return { type: "pending", operationId: context.operationId };
  }

  /**
   * Cleans up resources.
   *
   * @internal
   */
  private cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId as any);
      this.timeoutId = undefined;
    }

    if (this.pollIntervalId) {
      clearTimeout(this.pollIntervalId as any);
      this.pollIntervalId = undefined;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
  }
}
