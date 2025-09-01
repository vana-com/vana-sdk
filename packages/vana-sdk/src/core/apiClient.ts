/**
 * Provides a generic HTTP client with enterprise-grade resilience features.
 *
 * @remarks
 * This module implements a robust API client with automatic retry, rate limiting,
 * circuit breaker pattern, and middleware support. It's used internally by the SDK
 * for all HTTP operations and can be extended for custom API integrations.
 *
 * **Architecture:**
 * - Middleware pipeline for request/response transformation
 * - Exponential backoff retry with configurable policies
 * - Token bucket rate limiting to prevent API throttling
 * - Circuit breaker to fail fast when services are down
 *
 * @category Networking
 * @module apiClient
 */

import type {
  GenericRequest,
  GenericResponse,
  RetryConfig,
  RateLimiterConfig,
  Middleware,
} from "../types/generics";
import {
  RetryUtility,
  RateLimiter,
  MiddlewarePipeline,
  CircuitBreaker,
} from "./generics";

/**
 * Configures the API client's behavior and resilience features.
 *
 * @remarks
 * Provides fine-grained control over HTTP client behavior including
 * retry strategies, rate limiting, and circuit breaker thresholds.
 *
 * @category Networking
 */
export interface ApiClientConfig {
  /** Base URL for all requests */
  baseUrl?: string;
  /** Default headers */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Rate limiting configuration */
  rateLimit?: RateLimiterConfig;
  /** Circuit breaker configuration */
  circuitBreaker?: {
    failureThreshold: number;
    recoveryTimeout: number;
    halfOpenMaxAttempts?: number;
  };
}

/**
 * Represents supported HTTP methods for API operations.
 *
 * @category Networking
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * Configures individual HTTP request behavior.
 *
 * @remarks
 * Allows per-request overrides of client defaults including headers,
 * timeout, and resilience features. Use to customize specific requests
 * without affecting global configuration.
 *
 * @category Networking
 */
export interface RequestOptions {
  /** HTTP method */
  method?: HttpMethod;
  /** Request headers */
  headers?: Record<string, string>;
  /** Query parameters */
  params?: Record<string, unknown>;
  /** Request timeout */
  timeout?: number;
  /** Skip retry for this request */
  skipRetry?: boolean;
  /** Skip rate limiting for this request */
  skipRateLimit?: boolean;
}

/**
 * Provides resilient HTTP client functionality with enterprise features.
 *
 * @remarks
 * This client implements multiple resilience patterns to ensure reliable
 * API communication even under adverse conditions. It automatically handles
 * transient failures, rate limits, and service outages while providing
 * hooks for custom behavior through middleware.
 *
 * **Features:**
 * - Automatic retry with exponential backoff
 * - Rate limiting to prevent API throttling
 * - Circuit breaker for fast failure detection
 * - Middleware pipeline for request/response transformation
 * - Configurable timeouts and headers
 *
 * @example
 * ```typescript
 * // Create client with custom configuration
 * const client = new ApiClient({
 *   baseUrl: 'https://api.example.com',
 *   headers: { 'API-Key': 'secret' },
 *   retry: {
 *     maxAttempts: 5,
 *     baseDelay: 2000
 *   },
 *   rateLimit: {
 *     requestsPerWindow: 50,
 *     windowMs: 60000
 *   }
 * });
 *
 * // Add logging middleware
 * client.use(async (req, next) => {
 *   console.log(`Request: ${req.params.url}`);
 *   const res = await next(req);
 *   console.log(`Response: ${res.status}`);
 *   return res;
 * });
 *
 * // Make resilient API calls
 * const data = await client.get('/users');
 * ```
 *
 * @category Networking
 */
export class ApiClient {
  private readonly config: Required<ApiClientConfig>;
  private readonly middleware: MiddlewarePipeline;
  private readonly rateLimiter?: RateLimiter;
  private readonly circuitBreaker?: CircuitBreaker;

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? "",
      headers: config.headers ?? {},
      timeout: config.timeout ?? 30000,
      retry: config.retry ?? {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffMultiplier: 2,
        shouldRetry: (error) => error.message.includes("network"),
      },
      rateLimit: config.rateLimit ?? {
        requestsPerWindow: 100,
        windowMs: 60000,
      },
      circuitBreaker: config.circuitBreaker ?? {
        failureThreshold: 5,
        recoveryTimeout: 60000,
        halfOpenMaxAttempts: 3,
      },
    };

    this.middleware = new MiddlewarePipeline();
    this.rateLimiter = new RateLimiter(this.config.rateLimit);
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
  }

  /**
   * Adds middleware to the request processing pipeline.
   *
   * @remarks
   * Middleware functions execute in order of registration and can transform
   * requests, responses, or implement cross-cutting concerns like logging,
   * authentication, or caching.
   *
   * @param middleware - The middleware function to add to the pipeline
   *
   * @example
   * ```typescript
   * // Add authentication middleware
   * client.use(async (req, next) => {
   *   req.options.headers = {
   *     ...req.options.headers,
   *     'Authorization': `Bearer ${getToken()}`
   *   };
   *   return next(req);
   * });
   *
   * // Add response caching
   * client.use(async (req, next) => {
   *   const cached = cache.get(req.params.url);
   *   if (cached) return cached;
   *
   *   const res = await next(req);
   *   if (res.status === 'success') {
   *     cache.set(req.params.url, res);
   *   }
   *   return res;
   * });
   * ```
   */
  use(middleware: Middleware): void {
    this.middleware.use(middleware);
  }

  /**
   * Executes an HTTP request with full resilience features.
   *
   * @remarks
   * This is the core request method that applies all configured resilience
   * patterns including retry, rate limiting, and circuit breaking. It processes
   * the request through the middleware pipeline before execution.
   *
   * @param url - The URL to make the request to.
   *   Can be relative (uses baseUrl) or absolute.
   * @param options - Request options including method, headers, body, etc.
   * @returns Promise resolving to the response data
   *
   * @throws {Error} When request fails after all retry attempts.
   *   Check error message for details.
   * @throws {Error} When circuit breaker is open.
   *   Wait for recovery timeout before retrying.
   *
   * @example
   * ```typescript
   * const response = await client.request('/api/data', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   params: { name: 'John', age: 30 },
   *   timeout: 5000
   * });
   * ```
   */
  async request<TData = unknown>(
    url: string,
    options: RequestOptions = {},
  ): Promise<GenericResponse<TData>> {
    const fullUrl = this.buildUrl(url);
    const requestOptions = this.buildRequestOptions(options);

    const request: GenericRequest<{
      url: string;
      options: RequestOptions;
    }> = {
      params: {
        url: fullUrl,
        options: requestOptions,
      },
      options: requestOptions,
    };

    // Apply rate limiting
    if (!options.skipRateLimit && this.rateLimiter) {
      await this.rateLimiter.waitForSlot();
    }

    // Execute with circuit breaker
    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(() =>
        this.executeRequest<TData>(request),
      );
    }

    return this.executeRequest<TData>(request);
  }

  /**
   * Make a GET request
   *
   * @param url - The URL to make the GET request to
   * @param options - Request options (excluding method)
   * @returns Promise resolving to the response data
   */
  async get<TData = unknown>(
    url: string,
    options: Omit<RequestOptions, "method"> = {},
  ): Promise<GenericResponse<TData>> {
    return this.request<TData>(url, { ...options, method: "GET" });
  }

  /**
   * Make a POST request
   *
   * @param url - The URL to make the POST request to
   * @param data - The data to send in the request body
   * @param options - Request options (excluding method)
   * @returns Promise resolving to the response data
   */
  async post<TData = unknown>(
    url: string,
    data?: unknown,
    options: Omit<RequestOptions, "method"> = {},
  ): Promise<GenericResponse<TData>> {
    return this.request<TData>(url, {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      params: data as Record<string, unknown>,
    });
  }

  /**
   * Make a PUT request
   *
   * @param url - The URL to make the PUT request to
   * @param data - The data to send in the request body
   * @param options - Request options (excluding method)
   * @returns Promise resolving to the response data
   */
  async put<TData = unknown>(
    url: string,
    data?: unknown,
    options: Omit<RequestOptions, "method"> = {},
  ): Promise<GenericResponse<TData>> {
    return this.request<TData>(url, {
      ...options,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      params: data as Record<string, unknown>,
    });
  }

  /**
   * Make a DELETE request
   *
   * @param url - The URL to make the DELETE request to
   * @param options - Request options (excluding method)
   * @returns Promise resolving to the response data
   */
  async delete<TData = unknown>(
    url: string,
    options: Omit<RequestOptions, "method"> = {},
  ): Promise<GenericResponse<TData>> {
    return this.request<TData>(url, { ...options, method: "DELETE" });
  }

  /**
   * Make a PATCH request
   *
   * @param url - The URL to make the PATCH request to
   * @param data - The data to send in the request body
   * @param options - Request options (excluding method)
   * @returns Promise resolving to the response data
   */
  async patch<TData = unknown>(
    url: string,
    data?: unknown,
    options: Omit<RequestOptions, "method"> = {},
  ): Promise<GenericResponse<TData>> {
    return this.request<TData>(url, {
      ...options,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      params: data as Record<string, unknown>,
    });
  }

  /**
   * Execute the actual HTTP request with middleware and retry
   *
   * @param request - The generic request object containing URL and options
   * @returns Promise resolving to the generic response with data
   */
  private async executeRequest<TData>(
    request: GenericRequest<{ url: string; options: RequestOptions }>,
  ): Promise<GenericResponse<TData>> {
    const executeWithRetry = async (): Promise<GenericResponse<TData>> => {
      try {
        // Process request through middleware
        const processedRequest = await this.middleware.processRequest(request);

        // Make the actual HTTP request
        const response = await this.makeHttpRequest<TData>(
          (
            processedRequest as GenericRequest<{
              url: string;
              options: RequestOptions;
            }>
          ).params.url,
          (
            processedRequest as GenericRequest<{
              url: string;
              options: RequestOptions;
            }>
          ).params.options,
        );

        // Process response through middleware
        const processedResponse =
          await this.middleware.processResponse(response);

        return processedResponse;
      } catch (error) {
        // Try to handle error with middleware
        const handledResponse = await this.middleware.handleError<
          typeof request,
          GenericResponse<TData>
        >(error as Error, request);

        if (handledResponse) {
          return handledResponse;
        }

        throw error;
      }
    };

    // Apply retry logic if not skipped
    if (!request.params.options.skipRetry) {
      return RetryUtility.withRetry(executeWithRetry, this.config.retry);
    }

    return executeWithRetry();
  }

  /**
   * Make the actual HTTP request using fetch API
   *
   * @param url - The URL to make the request to
   * @param options - The request options including method, headers, body, etc.
   * @returns Promise resolving to the generic response with data
   */
  private async makeHttpRequest<TData>(
    url: string,
    options: RequestOptions,
  ): Promise<GenericResponse<TData>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, options.timeout ?? this.config.timeout);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          ...this.config.headers,
          ...options.headers,
        },
        signal: controller.signal,
        // Add body for POST/PUT/PATCH requests
        ...(options.method &&
          ["POST", "PUT", "PATCH"].includes(options.method) && {
            body: JSON.stringify(options.params),
          }),
      });

      clearTimeout(timeoutId);

      const responseData: unknown = await response.json();
      const data = responseData as { message?: string; [key: string]: unknown };

      if (!response.ok) {
        return {
          data: null as unknown as TData,
          success: false,
          error: {
            code: response.status.toString(),
            message: data.message ?? response.statusText,
            details: data,
          },
        };
      }

      return {
        data: responseData as TData,
        success: true,
        meta: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return {
          data: null as unknown as TData,
          success: false,
          error: {
            code: "TIMEOUT",
            message: "Request timeout",
            details: error,
          },
        };
      }

      return {
        data: null as unknown as TData,
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          details: error,
        },
      };
    }
  }

  /**
   * Build the full URL
   *
   * @param url - The URL or path to build the full URL from
   * @returns The complete URL string
   */
  private buildUrl(url: string): string {
    if (url.startsWith("http")) {
      return url;
    }

    const baseUrl = this.config.baseUrl.endsWith("/")
      ? this.config.baseUrl.slice(0, -1)
      : this.config.baseUrl;
    const path = url.startsWith("/") ? url : `/${url}`;

    return `${baseUrl}${path}`;
  }

  /**
   * Build request options with defaults
   *
   * @param options - The request options to merge with defaults
   * @returns The merged request options with defaults applied
   */
  private buildRequestOptions(options: RequestOptions): RequestOptions {
    return {
      method: "GET",
      headers: {},
      timeout: this.config.timeout,
      ...options,
    };
  }

  /**
   * Get client statistics
   *
   * @returns Object containing client statistics and performance metrics
   */
  getStats() {
    return {
      rateLimiter: this.rateLimiter
        ? {
            remaining: this.rateLimiter.getRemainingRequests(),
            resetTime: this.rateLimiter.getResetTime(),
          }
        : null,
      circuitBreaker: this.circuitBreaker
        ? {
            state: this.circuitBreaker.getState(),
            failures: this.circuitBreaker.getFailures(),
          }
        : null,
      middleware: {
        count: this.middleware.getMiddleware().length,
      },
    };
  }

  /**
   * Reset client state
   */
  reset(): void {
    this.circuitBreaker?.reset();
    this.middleware.clear();
  }
}
