import type {
  Controller,
  ControllerContext,
  GenericRequest,
  GenericResponse,
  RetryConfig,
  RateLimiterConfig,
  Middleware,
  Cache,
  Observer,
  Observable,
} from "../types/generics";

/**
 * Base controller class with common functionality
 */
export abstract class BaseController<
  TContext extends ControllerContext = ControllerContext,
> implements Controller<TContext>
{
  public readonly context: TContext;

  constructor(context: TContext) {
    this.context = context;
  }

  /**
   * Execute a request with optional middleware pipeline
   * @param request - The generic request object containing parameters and metadata
   * @param handler - The function that processes the request parameters
   * @param middleware - Optional array of middleware functions to apply
   * @returns Promise resolving to a generic response object
   */
  protected async executeRequest<TParams, TResponse>(
    request: GenericRequest<TParams>,
    handler: (params: TParams) => Promise<TResponse>,
    middleware: Middleware[] = [],
  ): Promise<GenericResponse<TResponse>> {
    try {
      // Apply request middleware
      let processedRequest = request;
      for (const mw of middleware) {
        if (mw.request) {
          processedRequest = (await mw.request(
            processedRequest,
          )) as GenericRequest<TParams>;
        }
      }

      // Execute handler
      let response = await handler(processedRequest.params);

      // Apply response middleware
      for (const mw of middleware.reverse()) {
        if (mw.response) {
          response = (await mw.response(response)) as Awaited<TResponse>;
        }
      }

      return {
        data: response,
        success: true,
      };
    } catch (error) {
      // Handle errors with middleware
      for (const mw of middleware) {
        if (mw.error) {
          const handled = await mw.error(error as Error, request);
          if (handled) {
            return {
              data: handled as TResponse,
              success: true,
            };
          }
        }
      }

      return {
        data: undefined as unknown as TResponse,
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          details: error,
        },
      };
    }
  }

  /**
   * Validate parameters with optional custom validator
   * @param params - The parameters to validate
   * @param validator - Optional function to validate parameter types
   * @returns Void (throws if validation fails, asserts type if successful)
   */
  protected validateParams<T>(
    params: unknown,
    validator?: (params: unknown) => params is T,
  ): asserts params is T {
    if (validator && !validator(params)) {
      throw new Error("Invalid parameters");
    }
  }
}

/**
 * Generic retry utility with exponential backoff
 */
export class RetryUtility {
  private static async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async withRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry
        if (config.shouldRetry && !config.shouldRetry(lastError, attempt)) {
          throw lastError;
        }

        // Don't delay on the last attempt
        if (attempt === config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const baseDelay =
          config.baseDelay *
          Math.pow(config.backoffMultiplier || 2, attempt - 1);
        const maxDelay = config.maxDelay || 30000;
        const jitter = config.jitter || 0;

        let delay = Math.min(baseDelay, maxDelay);

        if (jitter > 0) {
          delay += Math.random() * jitter * delay;
        }

        await this.delay(delay);
      }
    }

    throw lastError || new Error("Operation failed after retries");
  }
}

/**
 * Generic rate limiter
 */
export class RateLimiter {
  private requests: number[] = [];

  constructor(private config: RateLimiterConfig) {}

  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Remove requests outside the window
    this.requests = this.requests.filter((time) => time > windowStart);

    // Check if we can make a request
    if (this.requests.length < this.config.requestsPerWindow) {
      this.requests.push(now);
      return true;
    }

    return false;
  }

  async waitForSlot(): Promise<void> {
    while (!(await this.checkLimit())) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  getRemainingRequests(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const activeRequests = this.requests.filter((time) => time > windowStart);
    return Math.max(0, this.config.requestsPerWindow - activeRequests.length);
  }

  getResetTime(): number {
    if (this.requests.length === 0) return 0;
    return Math.max(0, this.requests[0] + this.config.windowMs - Date.now());
  }
}

/**
 * Generic in-memory cache implementation
 */
export class MemoryCache<TKey = string, TValue = unknown>
  implements Cache<TKey, TValue>
{
  private cache = new Map<TKey, { value: TValue; expiry?: number }>();

  async get(key: TKey): Promise<TValue | undefined> {
    const item = this.cache.get(key);

    if (!item) return undefined;

    // Check if expired
    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  async set(key: TKey, value: TValue, ttl?: number): Promise<void> {
    const expiry = ttl ? Date.now() + ttl : undefined;
    this.cache.set(key, { value, expiry });
  }

  async delete(key: TKey): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async has(key: TKey): Promise<boolean> {
    const exists = this.cache.has(key);
    if (!exists) return false;

    // Check expiry
    const item = this.cache.get(key);
    if (item?.expiry && Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  size(): number {
    return this.cache.size;
  }

  keys(): TKey[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Generic event emitter implementation
 */
export class EventEmitter<TEvent = unknown> implements Observable<TEvent> {
  private observers: Observer<TEvent>[] = [];

  subscribe(observer: Observer<TEvent>): () => void {
    this.observers.push(observer);

    return () => this.unsubscribe(observer);
  }

  unsubscribe(observer: Observer<TEvent>): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  emit(event: TEvent): void {
    for (const observer of this.observers) {
      try {
        const result = observer.notify(event);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error("Observer error:", error);
          });
        }
      } catch (error) {
        console.error("Observer error:", error);
      }
    }
  }

  getObserverCount(): number {
    return this.observers.length;
  }

  removeAllObservers(): void {
    this.observers = [];
  }
}

/**
 * Generic middleware pipeline
 */
export class MiddlewarePipeline {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private middleware: Middleware<any, any>[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  use(middleware: Middleware<any, any>): void {
    this.middleware.push(middleware);
  }

  async processRequest<TRequest>(request: TRequest): Promise<TRequest> {
    let processed = request;

    for (const mw of this.middleware) {
      if (mw.request) {
        processed = await mw.request(processed);
      }
    }

    return processed;
  }

  async processResponse<TResponse>(response: TResponse): Promise<TResponse> {
    let processed = response;

    // Process in reverse order
    for (const mw of this.middleware.slice().reverse()) {
      if (mw.response) {
        processed = await mw.response(processed);
      }
    }

    return processed;
  }

  async handleError<TRequest, TResponse>(
    error: Error,
    request: TRequest,
  ): Promise<TResponse | void> {
    for (const mw of this.middleware) {
      if (mw.error) {
        const result = await mw.error(error, request);
        if (result) {
          return result;
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMiddleware(): Middleware<any, any>[] {
    return [...this.middleware];
  }

  clear(): void {
    this.middleware = [];
  }
}

/**
 * Generic async queue for managing concurrent operations
 */
export class AsyncQueue<T = unknown> {
  private queue: Array<() => Promise<T>> = [];
  private running = 0;

  constructor(private concurrency = 1) {}

  async add<R>(operation: () => Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await operation();
          resolve(result as unknown as R);
          return result as unknown as T;
        } catch (error) {
          reject(error);
          throw error;
        } finally {
          this.running--;
          this.processQueue();
        }
      });

      this.processQueue();
    });
  }

  private processQueue(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const operation = this.queue.shift();
      if (operation) {
        this.running++;
        operation().catch(() => {
          // Error already handled in add method
        });
      }
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.running;
  }

  get size(): number {
    return this.queue.length + this.running;
  }

  clear(): void {
    this.queue = [];
  }
}

/**
 * Generic circuit breaker pattern
 */
export class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failures = 0;
  private lastFailureTime = 0;
  private successes = 0;

  constructor(
    private config: {
      failureThreshold: number;
      recoveryTimeout: number;
      halfOpenMaxAttempts?: number;
    },
  ) {}

  async execute<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = "half-open";
        this.successes = 0;
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= (this.config.halfOpenMaxAttempts || 1)) {
        this.state = "closed";
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = "open";
    }
  }

  getState(): string {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }
}
