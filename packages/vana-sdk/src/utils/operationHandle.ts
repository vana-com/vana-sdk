import type { ServerController } from "../controllers/server";
import type { GetOperationResponse } from "../generated/server/server-exports";
import { PersonalServerError } from "../errors";

export interface PollingOptions {
  pollingInterval?: number;
  timeout?: number;
}

export class OperationHandle<T = unknown> {
  private _resultPromise?: Promise<T>;

  constructor(
    private readonly controller: ServerController,
    public readonly id: string,
  ) {}

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