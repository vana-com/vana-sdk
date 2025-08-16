import type { ServerController } from "../controllers/server";
import type { GetOperationResponse } from "../generated/server/server-exports";
import { PersonalServerError } from "../errors";

/**
 * Options for polling server operations
 */
export interface PollingOptions {
  /** Polling interval in milliseconds (default: 1000) */
  pollingInterval?: number;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Provides a unified interface for server operation results with automatic polling.
 *
 * @remarks
 * OperationHandle enables immediate access to operation IDs while providing
 * Promise-based methods for waiting on results. This matches the pattern
 * established by TransactionHandle for blockchain operations, providing
 * consistency across the SDK's async operations.
 *
 * @category Server Operations
 * @example
 * ```typescript
 * // Create an operation and get a handle
 * const handle = await vana.server.createOperationHandle({
 *   permissionId: 123
 * });
 *
 * // Check status without waiting
 * const status = await handle.getStatus();
 * console.log(`Current status: ${status}`);
 *
 * // Wait for completion with custom timeout
 * const result = await handle.waitForResult({
 *   timeout: 60000,
 *   pollingInterval: 2000
 * });
 * console.log(`Result: ${result}`);
 *
 * // Cancel if needed
 * if (status === 'running') {
 *   await handle.cancel();
 * }
 * ```
 */
export class OperationHandle<T = unknown> {
  private _result?: GetOperationResponse;
  private _resultPromise?: Promise<T>;

  constructor(
    private readonly controller: ServerController,
    public readonly id: string,
  ) {}

  /**
   * Waits for the operation to complete and returns the result.
   * Results are memoized - multiple calls return the same promise.
   *
   * @param options Optional polling configuration
   * @returns The operation result when completed
   * @throws {PersonalServerError} If the operation fails or times out
   */
  async waitForResult(options?: PollingOptions): Promise<T> {
    if (this._result?.status === "succeeded" && this._result.result) {
      return JSON.parse(this._result.result) as T;
    }

    if (!this._resultPromise) {
      this._resultPromise = this.pollForCompletion(options);
    }

    return this._resultPromise;
  }

  /**
   * Gets the current status of the operation without waiting.
   *
   * @returns The current operation status
   */
  async getStatus(): Promise<string> {
    const result = await this.controller.getOperation(this.id);
    this._result = result;
    return result.status;
  }

  /**
   * Attempts to cancel the operation.
   *
   * @throws {PersonalServerError} If the operation cannot be canceled
   */
  async cancel(): Promise<void> {
    return this.controller.cancelOperation(this.id);
  }

  /**
   * Gets the full operation response without waiting for completion.
   *
   * @returns The current operation response
   */
  async getOperation(): Promise<GetOperationResponse> {
    const result = await this.controller.getOperation(this.id);
    this._result = result;
    return result;
  }

  private async pollForCompletion(options?: PollingOptions): Promise<T> {
    const startTime = Date.now();
    const timeout = options?.timeout ?? 30000;
    const interval = options?.pollingInterval ?? 1000;

    while (true) {
      const result = await this.controller.getOperation(this.id);
      this._result = result;

      if (result.status === "succeeded") {
        return result.result
          ? (JSON.parse(result.result) as T)
          : (undefined as T);
      }

      if (result.status === "failed") {
        throw new PersonalServerError(
          `Operation failed: ${result.result || "Unknown error"}`,
        );
      }

      if (result.status === "cancelled") {
        throw new PersonalServerError("Operation was cancelled");
      }

      if (Date.now() - startTime > timeout) {
        throw new PersonalServerError(`Operation timed out after ${timeout}ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}
