import type { ServerController } from "../controllers/server";
import type { GetOperationResponse } from "../generated/server/server-exports";
import { PersonalServerError } from "../errors";

/**
 * Configuration options for polling server operations.
 */
export interface PollingOptions {
  /** Polling interval in milliseconds (default: 500) */
  pollingInterval?: number;
  /** Maximum time to wait in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Provides a Promise-based interface for server operation lifecycle management.
 *
 * @remarks
 * OperationHandle enables immediate access to operation IDs while providing
 * Promise-based methods for waiting on results. This pattern matches
 * TransactionHandle for consistency across the SDK's async operations.
 *
 * @category Server Operations
 */
export class OperationHandle<T = unknown> {
  private _resultPromise?: Promise<T>;

  constructor(
    private readonly controller: ServerController,
    public readonly id: string,
  ) {}

  /**
   * Waits for the operation to complete and returns the result.
   *
   * @remarks
   * Results are memoized - multiple calls return the same promise.
   * The method polls the server at regular intervals until the operation
   * succeeds, fails, or times out.
   *
   * @param options - Optional polling configuration
   * @returns The operation result when completed
   * @throws {PersonalServerError} When the operation fails or times out
   * @example
   * ```typescript
   * const result = await handle.waitForResult({
   *   timeout: 60000,
   *   pollingInterval: 1000
   * });
   * ```
   */
  async waitForResult(options?: PollingOptions): Promise<T> {
    if (!this._resultPromise) {
      this._resultPromise = this.pollForCompletion(options);
    }
    return this._resultPromise;
  }

  private async pollForCompletion(options?: PollingOptions): Promise<T> {
    const startTime = Date.now();
    const timeout = options?.timeout ?? 30000;
    const interval = options?.pollingInterval ?? 500;

    while (true) {
      const result = await this.controller.getOperation(this.id);

      if (result.status === "succeeded") {
        if (result.result) {
          return JSON.parse(result.result) as T;
        }
        throw new PersonalServerError("Operation succeeded but returned no result");
      }

      if (result.status === "failed" || result.status === "canceled") {
        throw new PersonalServerError(
          `Operation ${result.status}: ${result.result || "Unknown error"}`
        );
      }

      if (Date.now() - startTime > timeout) {
        throw new PersonalServerError(`Operation timed out after ${timeout}ms`);
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
}