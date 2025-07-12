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
 * Configuration for the generic API client
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
 * HTTP method types
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * Request options for API calls
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
 * Generic API client with middleware, retry, rate limiting, and circuit breaker support
 */
export class ApiClient {
  private readonly config: Required<ApiClientConfig>;
  private readonly middleware: MiddlewarePipeline;
  private readonly rateLimiter?: RateLimiter;
  private readonly circuitBreaker?: CircuitBreaker;

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || "",
      headers: config.headers || {},
      timeout: config.timeout || 30000,
      retry: config.retry || {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffMultiplier: 2,
        shouldRetry: (error) => error.message.includes("network"),
      },
      rateLimit: config.rateLimit || {
        requestsPerWindow: 100,
        windowMs: 60000,
      },
      circuitBreaker: config.circuitBreaker || {
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
   * Add middleware to the request pipeline
   */
  use(middleware: Middleware): void {
    this.middleware.use(middleware);
  }

  /**
   * Make a generic HTTP request
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
   */
  async get<TData = unknown>(
    url: string,
    options: Omit<RequestOptions, "method"> = {},
  ): Promise<GenericResponse<TData>> {
    return this.request<TData>(url, { ...options, method: "GET" });
  }

  /**
   * Make a POST request
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
    });
  }

  /**
   * Make a PUT request
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
    });
  }

  /**
   * Make a DELETE request
   */
  async delete<TData = unknown>(
    url: string,
    options: Omit<RequestOptions, "method"> = {},
  ): Promise<GenericResponse<TData>> {
    return this.request<TData>(url, { ...options, method: "DELETE" });
  }

  /**
   * Make a PATCH request
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
    });
  }

  /**
   * Execute the actual HTTP request with middleware and retry
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
   */
  private async makeHttpRequest<TData>(
    url: string,
    options: RequestOptions,
  ): Promise<GenericResponse<TData>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, options.timeout || this.config.timeout);

    try {
      const response = await fetch(url, {
        method: options.method || "GET",
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
            message: data.message || response.statusText,
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
