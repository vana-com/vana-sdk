import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BaseController,
  RetryUtility,
  RateLimiter,
  MemoryCache,
  EventEmitter,
  MiddlewarePipeline,
  AsyncQueue,
  CircuitBreaker,
} from "../generics";
import type {
  ControllerContext,
  GenericRequest,
  Middleware,
  Observer,
  RetryConfig,
  RateLimiterConfig,
} from "../../types/generics";

// Mock setTimeout for tests
const originalSetTimeout = global.setTimeout;
const mockSetTimeout = vi.fn().mockImplementation((callback) => {
  return originalSetTimeout(callback, 0); // Execute immediately for tests
});

beforeEach(() => {
  global.setTimeout = mockSetTimeout as unknown as typeof setTimeout;
});

afterEach(() => {
  global.setTimeout = originalSetTimeout;
  vi.clearAllMocks();
});

describe("BaseController", () => {
  class TestController extends BaseController<ControllerContext> {
    async testExecuteRequest<TParams, TResponse>(
      request: GenericRequest<TParams>,
      handler: (params: TParams) => Promise<TResponse>,
      middleware: Middleware[] = [],
    ) {
      return this.executeRequest(request, handler, middleware);
    }

    testValidateParams<T>(
      params: unknown,
      validator?: (params: unknown) => params is T,
    ) {
      this.validateParams(params, validator);
    }
  }

  let controller: TestController;
  let mockContext: ControllerContext;

  beforeEach(() => {
    mockContext = { client: "test-client", config: "test-config" };
    controller = new TestController(mockContext);
  });

  describe("constructor", () => {
    it("should set context correctly", () => {
      expect(controller.context).toBe(mockContext);
    });
  });

  describe("executeRequest", () => {
    it("should execute request without middleware", async () => {
      const request: GenericRequest<{ value: number }> = {
        params: { value: 42 },
      };
      const handler = vi.fn().mockResolvedValue("success");

      const result = await controller.testExecuteRequest(request, handler);

      expect(handler).toHaveBeenCalledWith({ value: 42 });
      expect(result).toEqual({
        data: "success",
        success: true,
      });
    });

    it("should process request through middleware", async () => {
      const middleware: Middleware = {
        name: "test-middleware",
        request: vi.fn().mockImplementation((req) => ({
          ...req,
          params: { ...req.params, modified: true },
        })),
      };

      const request: GenericRequest<{ value: number }> = {
        params: { value: 42 },
      };
      const handler = vi.fn().mockResolvedValue("success");

      await controller.testExecuteRequest(request, handler, [middleware]);

      expect(middleware.request).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith({ value: 42, modified: true });
    });

    it("should process response through middleware", async () => {
      const middleware: Middleware = {
        name: "test-middleware",
        response: vi.fn().mockImplementation((res) => `modified-${res}`),
      };

      const request: GenericRequest<{ value: number }> = {
        params: { value: 42 },
      };
      const handler = vi.fn().mockResolvedValue("success");

      const result = await controller.testExecuteRequest(request, handler, [
        middleware,
      ]);

      expect(middleware.response).toHaveBeenCalledWith("success");
      expect(result).toEqual({
        data: "modified-success",
        success: true,
      });
    });

    it("should handle errors", async () => {
      const request: GenericRequest<{ value: number }> = {
        params: { value: 42 },
      };
      const handler = vi.fn().mockRejectedValue(new Error("Test error"));

      const result = await controller.testExecuteRequest(request, handler);

      expect(result).toEqual({
        data: undefined,
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: "Test error",
          details: expect.any(Error),
        },
      });
    });

    it("should handle errors with middleware", async () => {
      const middleware: Middleware = {
        name: "error-middleware",
        error: vi.fn().mockResolvedValue("handled-error"),
      };

      const request: GenericRequest<{ value: number }> = {
        params: { value: 42 },
      };
      const handler = vi.fn().mockRejectedValue(new Error("Test error"));

      const result = await controller.testExecuteRequest(request, handler, [
        middleware,
      ]);

      expect(middleware.error).toHaveBeenCalled();
      expect(result).toEqual({
        data: "handled-error",
        success: true,
      });
    });

    it("should handle non-Error exceptions", async () => {
      const request: GenericRequest<{ value: number }> = {
        params: { value: 42 },
      };
      const handler = vi.fn().mockRejectedValue("string error");

      const result = await controller.testExecuteRequest(request, handler);

      expect(result.error?.message).toBe("Unknown error");
    });
  });

  describe("validateParams", () => {
    it("should validate parameters with custom validator", () => {
      const validator = (params: unknown): params is { id: number } => {
        return typeof params === "object" && params !== null && "id" in params;
      };

      const validParams = { id: 123 };
      expect(() => {
        controller.testValidateParams(validParams, validator);
      }).not.toThrow();

      const invalidParams = { name: "test" };
      expect(() => {
        controller.testValidateParams(invalidParams, validator);
      }).toThrow("Invalid parameters");
    });

    it("should pass validation without custom validator", () => {
      const params = { anything: "goes" };
      expect(() => {
        controller.testValidateParams(params);
      }).not.toThrow();
    });
  });
});

describe("RetryUtility", () => {
  describe("withRetry", () => {
    it("should succeed on first attempt", async () => {
      const operation = vi.fn().mockResolvedValue("success");
      const config: RetryConfig = {
        maxAttempts: 3,
        baseDelay: 100,
      };

      const result = await RetryUtility.withRetry(operation, config);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and eventually succeed", async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return Promise.resolve("success");
      });

      const config: RetryConfig = {
        maxAttempts: 5,
        baseDelay: 10,
      };

      const result = await RetryUtility.withRetry(operation, config);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("should fail after max attempts", async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("Persistent failure"));
      const config: RetryConfig = {
        maxAttempts: 3,
        baseDelay: 10,
      };

      await expect(RetryUtility.withRetry(operation, config)).rejects.toThrow(
        "Persistent failure",
      );
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("should respect shouldRetry condition", async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("Non-retryable error"));
      const config: RetryConfig = {
        maxAttempts: 3,
        baseDelay: 10,
        shouldRetry: (error) => !error.message.includes("Non-retryable"),
      };

      await expect(RetryUtility.withRetry(operation, config)).rejects.toThrow(
        "Non-retryable error",
      );
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should apply exponential backoff", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Always fails"));
      const config: RetryConfig = {
        maxAttempts: 3,
        baseDelay: 100,
        backoffMultiplier: 2,
      };

      await expect(RetryUtility.withRetry(operation, config)).rejects.toThrow();
      expect(mockSetTimeout).toHaveBeenCalledTimes(2); // Called for delays between attempts
    });

    it("should apply jitter to delay", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Always fails"));
      const config: RetryConfig = {
        maxAttempts: 2,
        baseDelay: 100,
        jitter: 0.1,
      };

      await expect(RetryUtility.withRetry(operation, config)).rejects.toThrow();
      expect(mockSetTimeout).toHaveBeenCalledTimes(1);
    });

    it("should respect max delay", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Always fails"));
      const config: RetryConfig = {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffMultiplier: 10,
        maxDelay: 500,
      };

      await expect(RetryUtility.withRetry(operation, config)).rejects.toThrow();
      expect(mockSetTimeout).toHaveBeenCalledTimes(2);
    });
  });
});

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = vi.fn().mockReturnValue(1000000);

    const config: RateLimiterConfig = {
      requestsPerWindow: 3,
      windowMs: 10000,
    };
    rateLimiter = new RateLimiter(config);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe("checkLimit", () => {
    it("should allow requests under the limit", async () => {
      expect(await rateLimiter.checkLimit()).toBe(true);
      expect(await rateLimiter.checkLimit()).toBe(true);
      expect(await rateLimiter.checkLimit()).toBe(true);
    });

    it("should deny requests over the limit", async () => {
      await rateLimiter.checkLimit();
      await rateLimiter.checkLimit();
      await rateLimiter.checkLimit();

      expect(await rateLimiter.checkLimit()).toBe(false);
    });

    it("should reset after window expires", async () => {
      await rateLimiter.checkLimit();
      await rateLimiter.checkLimit();
      await rateLimiter.checkLimit();

      // Move time forward past the window
      (Date.now as ReturnType<typeof vi.fn>).mockReturnValue(1000000 + 15000);

      expect(await rateLimiter.checkLimit()).toBe(true);
    });
  });

  describe("getRemainingRequests", () => {
    it("should return correct remaining count", () => {
      expect(rateLimiter.getRemainingRequests()).toBe(3);

      void rateLimiter.checkLimit();
      expect(rateLimiter.getRemainingRequests()).toBe(2);

      void rateLimiter.checkLimit();
      expect(rateLimiter.getRemainingRequests()).toBe(1);

      void rateLimiter.checkLimit();
      expect(rateLimiter.getRemainingRequests()).toBe(0);
    });
  });

  describe("getResetTime", () => {
    it("should return 0 when no requests made", () => {
      expect(rateLimiter.getResetTime()).toBe(0);
    });

    it("should return correct reset time", () => {
      void rateLimiter.checkLimit();
      expect(rateLimiter.getResetTime()).toBe(10000);
    });
  });

  describe("waitForSlot", () => {
    it("should wait for available slot", async () => {
      // Fill up the limit
      await rateLimiter.checkLimit();
      await rateLimiter.checkLimit();
      await rateLimiter.checkLimit();

      const waitPromise = rateLimiter.waitForSlot();

      // Advance time to clear window
      setTimeout(() => {
        vi.mocked(Date.now).mockReturnValue(1000000 + 15000);
      }, 0);

      await waitPromise;
      expect(rateLimiter.getRemainingRequests()).toBe(2); // One slot was used by waitForSlot
    });
  });
});

describe("MemoryCache", () => {
  let cache: MemoryCache<string, string>;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    cache = new MemoryCache();
    originalDateNow = Date.now;
    Date.now = vi.fn().mockReturnValue(1000000);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe("set and get", () => {
    it("should store and retrieve values", async () => {
      await cache.set("key1", "value1");
      expect(await cache.get("key1")).toBe("value1");
    });

    it("should return undefined for non-existent keys", async () => {
      expect(await cache.get("nonexistent")).toBeUndefined();
    });

    it("should handle TTL expiration", async () => {
      await cache.set("key1", "value1", 5000);
      expect(await cache.get("key1")).toBe("value1");

      // Advance time past TTL
      vi.mocked(Date.now).mockReturnValue(1000000 + 6000);
      expect(await cache.get("key1")).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("should delete existing keys", async () => {
      await cache.set("key1", "value1");
      expect(await cache.delete("key1")).toBe(true);
      expect(await cache.get("key1")).toBeUndefined();
    });

    it("should return false for non-existent keys", async () => {
      expect(await cache.delete("nonexistent")).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all cache entries", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      await cache.clear();

      expect(await cache.get("key1")).toBeUndefined();
      expect(await cache.get("key2")).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true for existing keys", async () => {
      await cache.set("key1", "value1");
      expect(await cache.has("key1")).toBe(true);
    });

    it("should return false for non-existent keys", async () => {
      expect(await cache.has("nonexistent")).toBe(false);
    });

    it("should return false for expired keys", async () => {
      await cache.set("key1", "value1", 5000);
      expect(await cache.has("key1")).toBe(true);

      vi.mocked(Date.now).mockReturnValue(1000000 + 6000);
      expect(await cache.has("key1")).toBe(false);
    });
  });

  describe("size and keys", () => {
    it("should return correct size", async () => {
      expect(cache.size()).toBe(0);

      await cache.set("key1", "value1");
      expect(cache.size()).toBe(1);

      await cache.set("key2", "value2");
      expect(cache.size()).toBe(2);
    });

    it("should return all keys", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      const keys = cache.keys();
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toHaveLength(2);
    });
  });
});

describe("EventEmitter", () => {
  let eventEmitter: EventEmitter<string>;

  beforeEach(() => {
    eventEmitter = new EventEmitter();
  });

  describe("subscribe and emit", () => {
    it("should notify observers when event is emitted", () => {
      const observer: Observer<string> = {
        notify: vi.fn(),
      };

      eventEmitter.subscribe(observer);
      eventEmitter.emit("test-event");

      expect(observer.notify).toHaveBeenCalledWith("test-event");
    });

    it("should handle multiple observers", () => {
      const observer1: Observer<string> = { notify: vi.fn() };
      const observer2: Observer<string> = { notify: vi.fn() };

      eventEmitter.subscribe(observer1);
      eventEmitter.subscribe(observer2);
      eventEmitter.emit("test-event");

      expect(observer1.notify).toHaveBeenCalledWith("test-event");
      expect(observer2.notify).toHaveBeenCalledWith("test-event");
    });

    it("should handle async observers", () => {
      const observer: Observer<string> = {
        notify: vi.fn().mockResolvedValue(undefined),
      };

      eventEmitter.subscribe(observer);
      eventEmitter.emit("test-event");

      expect(observer.notify).toHaveBeenCalledWith("test-event");
    });

    it("should handle observer errors gracefully", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const observer: Observer<string> = {
        notify: vi.fn().mockImplementation(() => {
          throw new Error("Observer error");
        }),
      };

      eventEmitter.subscribe(observer);
      eventEmitter.emit("test-event");

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("unsubscribe", () => {
    it("should remove observer", () => {
      const observer: Observer<string> = { notify: vi.fn() };

      eventEmitter.subscribe(observer);
      eventEmitter.unsubscribe(observer);
      eventEmitter.emit("test-event");

      expect(observer.notify).not.toHaveBeenCalled();
    });

    it("should return unsubscribe function from subscribe", () => {
      const observer: Observer<string> = { notify: vi.fn() };

      const unsubscribe = eventEmitter.subscribe(observer);
      unsubscribe();
      eventEmitter.emit("test-event");

      expect(observer.notify).not.toHaveBeenCalled();
    });
  });

  describe("utility methods", () => {
    it("should return correct observer count", () => {
      expect(eventEmitter.getObserverCount()).toBe(0);

      const observer1: Observer<string> = { notify: vi.fn() };
      const observer2: Observer<string> = { notify: vi.fn() };

      eventEmitter.subscribe(observer1);
      expect(eventEmitter.getObserverCount()).toBe(1);

      eventEmitter.subscribe(observer2);
      expect(eventEmitter.getObserverCount()).toBe(2);
    });

    it("should remove all observers", () => {
      const observer1: Observer<string> = { notify: vi.fn() };
      const observer2: Observer<string> = { notify: vi.fn() };

      eventEmitter.subscribe(observer1);
      eventEmitter.subscribe(observer2);

      eventEmitter.removeAllObservers();

      expect(eventEmitter.getObserverCount()).toBe(0);
    });
  });
});

describe("MiddlewarePipeline", () => {
  let pipeline: MiddlewarePipeline;

  beforeEach(() => {
    pipeline = new MiddlewarePipeline();
  });

  describe("middleware management", () => {
    it("should add middleware", () => {
      const middleware: Middleware = { name: "test" };

      pipeline.use(middleware);

      expect(pipeline.getMiddleware()).toContain(middleware);
    });

    it("should clear middleware", () => {
      const middleware: Middleware = { name: "test" };

      pipeline.use(middleware);
      expect(pipeline.getMiddleware()).toHaveLength(1);

      pipeline.clear();
      expect(pipeline.getMiddleware()).toHaveLength(0);
    });
  });

  describe("processRequest", () => {
    it("should process request through middleware", async () => {
      const middleware: Middleware = {
        name: "test",
        request: vi
          .fn()
          .mockImplementation((req) => ({ ...req, processed: true })),
      };

      pipeline.use(middleware);

      const request = { data: "test" };
      const result = await pipeline.processRequest(request);

      expect(middleware.request).toHaveBeenCalledWith(request);
      expect(result).toEqual({ data: "test", processed: true });
    });

    it("should process through multiple middleware in order", async () => {
      const middleware1: Middleware = {
        name: "first",
        request: vi.fn().mockImplementation((req) => ({ ...req, first: true })),
      };
      const middleware2: Middleware = {
        name: "second",
        request: vi
          .fn()
          .mockImplementation((req) => ({ ...req, second: true })),
      };

      pipeline.use(middleware1);
      pipeline.use(middleware2);

      const request = { data: "test" };
      const result = await pipeline.processRequest(request);

      expect(result).toEqual({ data: "test", first: true, second: true });
    });
  });

  describe("processResponse", () => {
    it("should process response through middleware in reverse order", async () => {
      const calls: string[] = [];

      const middleware1: Middleware = {
        name: "first",
        response: vi.fn().mockImplementation((res) => {
          calls.push("first");
          return res;
        }),
      };
      const middleware2: Middleware = {
        name: "second",
        response: vi.fn().mockImplementation((res) => {
          calls.push("second");
          return res;
        }),
      };

      pipeline.use(middleware1);
      pipeline.use(middleware2);

      await pipeline.processResponse("test");

      expect(calls).toEqual(["second", "first"]);
    });
  });

  describe("handleError", () => {
    it("should handle error with middleware", async () => {
      const middleware: Middleware = {
        name: "error-handler",
        error: vi.fn().mockResolvedValue("handled"),
      };

      pipeline.use(middleware);

      const error = new Error("test error");
      const request = { data: "test" };
      const result = await pipeline.handleError(error, request);

      expect(middleware.error).toHaveBeenCalledWith(error, request);
      expect(result).toBe("handled");
    });

    it("should return undefined if no middleware handles error", async () => {
      const middleware: Middleware = {
        name: "non-handler",
        error: vi.fn().mockResolvedValue(undefined),
      };

      pipeline.use(middleware);

      const error = new Error("test error");
      const request = { data: "test" };
      const result = await pipeline.handleError(error, request);

      expect(result).toBeUndefined();
    });
  });
});

describe("AsyncQueue", () => {
  let queue: AsyncQueue;

  beforeEach(() => {
    queue = new AsyncQueue(2); // Concurrency of 2
  });

  describe("basic operations", () => {
    it("should execute operations", async () => {
      const operation = vi.fn().mockResolvedValue("result");

      const result = await queue.add(operation);

      expect(result).toBe("result");
      expect(operation).toHaveBeenCalled();
    });

    it("should handle operation errors", async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("Operation failed"));

      await expect(queue.add(operation)).rejects.toThrow("Operation failed");
    });

    it("should respect concurrency limit", async () => {
      let running = 0;
      let maxConcurrent = 0;

      const operation = vi.fn().mockImplementation(async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((resolve) => setTimeout(resolve, 10));
        running--;
        return "done";
      });

      // Add more operations than concurrency limit
      const promises = [
        queue.add(operation),
        queue.add(operation),
        queue.add(operation),
        queue.add(operation),
      ];

      await Promise.all(promises);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe("queue management", () => {
    it("should track pending operations", () => {
      expect(queue.pending).toBe(0);

      // Add operations that will be queued
      const slowOperation = () =>
        new Promise((resolve) => setTimeout(resolve, 100));

      void queue.add(slowOperation);
      void queue.add(slowOperation);
      void queue.add(slowOperation); // This should be queued

      expect(queue.pending).toBeGreaterThan(0);
    });

    it("should track active operations", () => {
      expect(queue.active).toBe(0);

      const slowOperation = () =>
        new Promise((resolve) => setTimeout(resolve, 100));
      void queue.add(slowOperation);

      // Active count should increase immediately
      expect(queue.active).toBeGreaterThan(0);
    });

    it("should calculate total size", () => {
      expect(queue.size).toBe(0);

      const slowOperation = () =>
        new Promise((resolve) => setTimeout(resolve, 100));
      void queue.add(slowOperation);
      void queue.add(slowOperation);
      void queue.add(slowOperation);

      expect(queue.size).toBeGreaterThan(0);
    });

    it("should clear queue", () => {
      const operation = () =>
        new Promise((resolve) => setTimeout(resolve, 100));

      void queue.add(operation);
      void queue.add(operation);
      void queue.add(operation);

      queue.clear();

      expect(queue.pending).toBe(0);
    });
  });
});

describe("CircuitBreaker", () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 1000,
      halfOpenMaxAttempts: 2,
    });
  });

  describe("closed state", () => {
    it("should execute operations in closed state", async () => {
      const operation = vi.fn().mockResolvedValue("success");

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe("success");
      expect(circuitBreaker.getState()).toBe("closed");
    });

    it("should transition to open after failure threshold", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("failure"));

      // Fail enough times to open circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe("open");
    });
  });

  describe("open state", () => {
    beforeEach(async () => {
      const operation = vi.fn().mockRejectedValue(new Error("failure"));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      }
    });

    it("should reject operations immediately when open", async () => {
      const operation = vi.fn().mockResolvedValue("success");

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(
        "Circuit breaker is open",
      );
      expect(operation).not.toHaveBeenCalled();
    });

    it("should transition to half-open after recovery timeout", async () => {
      const operation = vi.fn().mockResolvedValue("success");

      // Mock time passage
      const originalDateNow = Date.now;
      Date.now = vi.fn().mockReturnValue(Date.now() + 2000);

      await circuitBreaker.execute(operation);

      expect(circuitBreaker.getState()).toBe("half-open");

      Date.now = originalDateNow;
    });
  });

  describe("half-open state", () => {
    beforeEach(async () => {
      // Open circuit
      const failOperation = vi.fn().mockRejectedValue(new Error("failure"));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failOperation)).rejects.toThrow();
      }

      // Wait for recovery timeout
      const originalDateNow = Date.now;
      Date.now = vi.fn().mockReturnValue(Date.now() + 2000);

      // Execute one operation to transition to half-open
      const successOperation = vi.fn().mockResolvedValue("success");
      await circuitBreaker.execute(successOperation);

      Date.now = originalDateNow;
    });

    it("should transition to closed after successful operations", async () => {
      const operation = vi.fn().mockResolvedValue("success");

      // One more success should close the circuit (halfOpenMaxAttempts = 2)
      await circuitBreaker.execute(operation);

      expect(circuitBreaker.getState()).toBe("closed");
    });
  });

  describe("utility methods", () => {
    it("should track failure count", async () => {
      expect(circuitBreaker.getFailures()).toBe(0);

      const operation = vi.fn().mockRejectedValue(new Error("failure"));
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();

      expect(circuitBreaker.getFailures()).toBe(1);
    });

    it("should reset state", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("failure"));
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();

      expect(circuitBreaker.getFailures()).toBe(1);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe("closed");
      expect(circuitBreaker.getFailures()).toBe(0);
    });
  });
});
