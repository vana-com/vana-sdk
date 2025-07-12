import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient, ApiClientConfig } from "../apiClient";
import { Middleware } from "../../types/generics";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock AbortController
const mockAbortController = {
  signal: { aborted: false },
  abort: vi.fn(),
};

// Type the mock constructor properly
type AbortControllerConstructor = new () => AbortController;
global.AbortController = vi.fn(
  () => mockAbortController,
) as unknown as AbortControllerConstructor;

describe("ApiClient", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    mockAbortController.abort.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create ApiClient with default configuration", () => {
      apiClient = new ApiClient();

      expect(apiClient).toBeInstanceOf(ApiClient);
      const stats = apiClient.getStats();
      expect(stats.rateLimiter).toBeDefined();
      expect(stats.circuitBreaker).toBeDefined();
      expect(stats.middleware.count).toBe(0);
    });

    it("should create ApiClient with custom configuration", () => {
      const config: ApiClientConfig = {
        baseUrl: "https://api.example.com",
        headers: { "Custom-Header": "test" },
        timeout: 5000,
        retry: {
          maxAttempts: 5,
          baseDelay: 500,
          backoffMultiplier: 1.5,
          shouldRetry: (error) => error.message.includes("timeout"),
        },
        rateLimit: {
          requestsPerWindow: 50,
          windowMs: 30000,
        },
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTimeout: 30000,
          halfOpenMaxAttempts: 2,
        },
      };

      apiClient = new ApiClient(config);

      expect(apiClient).toBeInstanceOf(ApiClient);
      const stats = apiClient.getStats();
      expect(stats.rateLimiter).toBeDefined();
      expect(stats.circuitBreaker).toBeDefined();
    });

    it("should handle partial configuration", () => {
      const config: ApiClientConfig = {
        baseUrl: "https://partial.example.com",
        timeout: 10000,
      };

      apiClient = new ApiClient(config);

      expect(apiClient).toBeInstanceOf(ApiClient);
    });
  });

  describe("middleware", () => {
    beforeEach(() => {
      apiClient = new ApiClient();
    });

    it("should add middleware to pipeline", () => {
      const middleware: Middleware = {
        name: "test-middleware",
        request: vi.fn().mockImplementation((req) => Promise.resolve(req)),
        response: vi.fn().mockImplementation((res) => Promise.resolve(res)),
      };

      apiClient.use(middleware);

      const stats = apiClient.getStats();
      expect(stats.middleware.count).toBe(1);
    });
  });

  describe("HTTP methods", () => {
    beforeEach(() => {
      apiClient = new ApiClient({ baseUrl: "https://api.example.com" });

      // Mock successful response
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({ data: "test" }),
          headers: new Map([["content-type", "application/json"]]),
        }),
      );
    });

    it("should make GET request", async () => {
      const response = await apiClient.get("/users");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users",
        expect.objectContaining({
          method: "GET",
        }),
      );
      expect(response.success).toBe(true);
      expect(response.data).toEqual({ data: "test" });
    });

    it("should make POST request", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 201,
          statusText: "Created",
          json: () => Promise.resolve({ id: 1, name: "John" }),
          headers: new Map(),
        }),
      );

      const response = await apiClient.post("/users", { name: "John" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
      expect(response.success).toBe(true);
    });

    it("should make PUT request", async () => {
      const response = await apiClient.put("/users/1", { name: "Jane" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
      expect(response.success).toBe(true);
    });

    it("should make DELETE request", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: "No Content",
          json: () => Promise.resolve({}),
          headers: new Map(),
        }),
      );

      const response = await apiClient.delete("/users/1");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
      expect(response.success).toBe(true);
    });

    it("should make PATCH request", async () => {
      const response = await apiClient.patch("/users/1", { status: "active" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
      expect(response.success).toBe(true);
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      apiClient = new ApiClient();
    });

    it("should handle HTTP error responses", async () => {
      const errorResponse = {
        message: "User not found",
        details: { userId: 123 },
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () => Promise.resolve(errorResponse),
          headers: new Map(),
        }),
      );

      const response = await apiClient.get("/users/123");

      expect(response.success).toBe(false);
      expect(response.error).toEqual({
        code: "404",
        message: "User not found",
        details: errorResponse,
      });
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network connection failed"));

      const response = await apiClient.get("/users");

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("NETWORK_ERROR");
      expect(response.error?.message).toBe("Network connection failed");
    });

    it("should handle timeout errors", async () => {
      const abortError = new Error("Request aborted");
      abortError.name = "AbortError";

      mockFetch.mockRejectedValue(abortError);

      const response = await apiClient.get("/users");

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("TIMEOUT");
      expect(response.error?.message).toBe("Request timeout");
    });

    it("should handle unknown errors", async () => {
      mockFetch.mockRejectedValue("Unknown error string");

      const response = await apiClient.get("/users");

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("NETWORK_ERROR");
      expect(response.error?.message).toBe("Unknown error");
    });
  });

  describe("URL building", () => {
    it("should build URL with base URL", async () => {
      apiClient = new ApiClient({ baseUrl: "https://api.example.com" });

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({}),
          headers: new Map(),
        }),
      );

      await apiClient.get("/users");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users",
        expect.any(Object),
      );
    });

    it("should handle base URL with trailing slash", async () => {
      apiClient = new ApiClient({ baseUrl: "https://api.example.com/" });

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({}),
          headers: new Map(),
        }),
      );

      await apiClient.get("/users");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users",
        expect.any(Object),
      );
    });

    it("should handle absolute URLs", async () => {
      apiClient = new ApiClient({ baseUrl: "https://api.example.com" });

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({}),
          headers: new Map(),
        }),
      );

      await apiClient.get("https://external.api.com/data");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://external.api.com/data",
        expect.any(Object),
      );
    });

    it("should handle relative paths without leading slash", async () => {
      apiClient = new ApiClient({ baseUrl: "https://api.example.com" });

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({}),
          headers: new Map(),
        }),
      );

      await apiClient.get("users/profile");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/profile",
        expect.any(Object),
      );
    });
  });

  describe("request options", () => {
    beforeEach(() => {
      apiClient = new ApiClient({
        baseUrl: "https://api.example.com",
        headers: { "Default-Header": "default-value" },
      });

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({}),
          headers: new Map(),
        }),
      );
    });

    it("should merge headers correctly", async () => {
      await apiClient.get("/users", {
        headers: { "Custom-Header": "custom-value" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Default-Header": "default-value",
            "Custom-Header": "custom-value",
          }),
        }),
      );
    });

    it("should skip rate limiting when requested", async () => {
      await apiClient.get("/users", { skipRateLimit: true });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("statistics and management", () => {
    beforeEach(() => {
      apiClient = new ApiClient();
    });

    it("should provide client statistics", () => {
      const stats = apiClient.getStats();

      expect(stats).toHaveProperty("rateLimiter");
      expect(stats).toHaveProperty("circuitBreaker");
      expect(stats).toHaveProperty("middleware");
      expect(stats.middleware.count).toBe(0);
    });

    it("should reset client state", () => {
      const middleware: Middleware = {
        name: "test-middleware",
      };

      apiClient.use(middleware);

      let stats = apiClient.getStats();
      expect(stats.middleware.count).toBe(1);

      apiClient.reset();

      stats = apiClient.getStats();
      expect(stats.middleware.count).toBe(0);
    });
  });

  describe("response metadata", () => {
    beforeEach(() => {
      apiClient = new ApiClient();
    });

    it("should include response metadata", async () => {
      const mockHeaders = new Map([
        ["content-type", "application/json"],
        ["x-rate-limit", "100"],
      ]);

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({ data: "test" }),
          headers: mockHeaders,
        }),
      );

      const response = await apiClient.get("/users");

      expect(response.meta).toEqual({
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
          "x-rate-limit": "100",
        },
      });
    });
  });

  describe("abort controller", () => {
    beforeEach(() => {
      apiClient = new ApiClient();

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({}),
          headers: new Map(),
        }),
      );
    });

    it("should create abort controller for requests", async () => {
      await apiClient.get("/users");

      expect(global.AbortController).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: mockAbortController.signal,
        }),
      );
    });
  });
});
