import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Address } from "viem";
import { ServerController } from "../controllers/server";
import type { ControllerContext } from "../controllers/permissions";
import { NetworkError } from "../errors";
import type { CreateOperationParams } from "../types";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods
vi.mock("console", () => ({
  debug: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock process.env
const originalEnv = process.env;

const mockUserAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("ServerController", () => {
  let serverController: ServerController;
  let mockContext: ControllerContext;
  let mockWalletClient: {
    account: unknown;
    getAddresses: ReturnType<typeof vi.fn>;
  };
  let mockApplicationClient: {
    account: unknown;
    getAddresses: ReturnType<typeof vi.fn>;
  };
  let mockAccount: {
    type: string;
    address: Address;
    signMessage: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    process.env.REPLICATE_API_TOKEN = "test-token-123";

    // Create mock account
    mockAccount = {
      type: "local",
      address: mockUserAddress as Address,
      signMessage: vi.fn().mockResolvedValue(`0x${"0".repeat(130)}`),
    };

    // Create mock wallet client
    mockWalletClient = {
      account: mockAccount,
      getAddresses: vi.fn().mockResolvedValue([mockAccount.address]),
    };

    // Create mock application client
    mockApplicationClient = {
      account: mockAccount,
      getAddresses: vi.fn().mockResolvedValue([mockAccount.address]),
    };

    // Create mock context
    mockContext = {
      walletClient:
        mockWalletClient as unknown as ControllerContext["walletClient"],
      applicationClient:
        mockApplicationClient as unknown as ControllerContext["applicationClient"],
      publicClient: {} as unknown as ControllerContext["publicClient"],
      platform: mockPlatformAdapter,
      defaultPersonalServerUrl: "https://test-personal-server.com",
    };

    serverController = new ServerController(mockContext);

    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create a ServerController instance", () => {
      expect(serverController).toBeInstanceOf(ServerController);
    });

    it("should set the context correctly", () => {
      expect(
        (serverController as unknown as { context: unknown }).context,
      ).toBe(mockContext);
    });
  });

  describe("createOperation", () => {
    const validParams: CreateOperationParams = {
      permissionId: 12345,
    };

    const mockOperationResponse = {
      id: "operation-123",
      created_at: "2025-01-01T12:00:00.000Z",
      links: {
        self: "/api/v1/operations/operation-123",
        cancel: "/api/v1/operations/operation-123/cancel",
        stream: "/api/v1/operations/operation-123/stream",
      },
    };

    it("should successfully create an operation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockOperationResponse),
      });

      const result = await serverController.createOperation(validParams);

      expect(result.id).toEqual(mockOperationResponse.id);
      expect(mockAccount.signMessage).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/operations"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("should use custom personal server URL from environment", async () => {
      process.env.PERSONAL_SERVER_URL = "https://custom-server.com";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockOperationResponse),
      });

      await serverController.createOperation(validParams);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/operations"),
        expect.any(Object),
      );
    });
  });

  describe("getIdentity", () => {
    const testUserAddress = "0xd7Ae9319049f0B6cA9AD044b165c5B4F143EF451";
    const mockPublicKey =
      "0x04a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    beforeEach(() => {
      process.env.REPLICATE_API_TOKEN = "test-token-123";
    });

    it("should get trusted server public key successfully", async () => {
      // Mock the identity server response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          personal_server: {
            address: "0x123...",
            public_key: mockPublicKey,
          },
        }),
      });

      const result = await serverController.getIdentity({
        userAddress: testUserAddress,
      });

      expect(result).toEqual({
        address: "0x123...",
        public_key: mockPublicKey,
        base_url: expect.any(String),
        name: "Hosted Vana Server",
      });
    });

    it("should throw error for invalid user address", async () => {
      await expect(
        serverController.getIdentity({
          userAddress: "invalid-address" as Address,
        }),
      ).rejects.toThrow("Failed to get personal server identity");
    });

    it("should throw error for empty user address", async () => {
      await expect(
        serverController.getIdentity({ userAddress: "" as Address }),
      ).rejects.toThrow("Failed to get personal server identity");
    });

    it("should handle Identity Server API failures", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: vi.fn().mockResolvedValue("Server error"),
      });

      await expect(
        serverController.getIdentity({ userAddress: testUserAddress }),
      ).rejects.toThrow(
        "Local identity API request failed: 500 Internal Server Error - Server error",
      );
    });

    it("should handle failed Identity Server request", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Identity server error"));

      await expect(
        serverController.getIdentity({ userAddress: testUserAddress }),
      ).rejects.toThrow("Failed to get personal server identity");
    });

    it("should handle timeout in Identity Server request", async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 100),
          ),
      );

      await expect(
        serverController.getIdentity({ userAddress: testUserAddress }),
      ).rejects.toThrow("Failed to get personal server identity");
    });

    it("should handle canceled Identity Server request", async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            const abortController = new AbortController();
            abortController.abort();
            reject(new Error("The operation was aborted"));
          }),
      );

      await expect(
        serverController.getIdentity({ userAddress: testUserAddress }),
      ).rejects.toThrow("Failed to get personal server identity");
    });

    it("should handle object format response", async () => {
      // Mock the identity server response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          personal_server: {
            address: "0x123...",
            public_key: mockPublicKey,
          },
        }),
      });

      const result = await serverController.getIdentity({
        userAddress: testUserAddress,
      });

      expect(result).toEqual({
        address: "0x123...",
        public_key: mockPublicKey,
        base_url: expect.any(String),
        name: "Hosted Vana Server",
      });
    });

    it("should handle invalid JSON in response", async () => {
      // Mock the identity server response with invalid JSON
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
      });

      await expect(
        serverController.getIdentity({ userAddress: testUserAddress }),
      ).rejects.toThrow("Failed to get personal server identity");
    });
  });

  describe("getOperation", () => {
    const mockStatusResponse = {
      id: "test-123",
      status: "processing" as const,
      started_at: "2025-01-01T12:00:00.000Z",
      finished_at: null,
      result: null,
    };

    it("should successfully poll status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatusResponse),
      });

      const result = await serverController.getOperation("test-123");

      expect(result).toEqual({
        id: "test-123",
        status: "processing",
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        result: undefined,
        error: undefined,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/operations/test-123"),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });

    it("should throw NetworkError when polling fails", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: () => Promise.resolve("Prediction not found"),
        }),
      );

      await expect(serverController.getOperation("test-123")).rejects.toThrow(
        NetworkError,
      );
      await expect(serverController.getOperation("test-123")).rejects.toThrow(
        "Status polling failed: 404 Not Found - Prediction not found",
      );
    });

    it("should handle missing urls in response", async () => {
      const responseWithoutUrls = {
        ...mockStatusResponse,
        urls: undefined,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(responseWithoutUrls),
      });

      const _result = await serverController.getOperation("test-123");

      // expect(result.urls.get).toBe(getUrl); // Removed as per edit hint
      // expect(result.urls.cancel).toBe(""); // Removed as per edit hint
    });

    it("should wrap unknown errors in NetworkError", async () => {
      mockFetch.mockRejectedValue(new Error("Unknown network error"));

      await expect(serverController.getOperation("test-123")).rejects.toThrow(
        NetworkError,
      );
      await expect(serverController.getOperation("test-123")).rejects.toThrow(
        "Failed to poll status: Unknown network error",
      );
    });

    it("should handle non-Error exceptions", async () => {
      mockFetch.mockRejectedValue("String error");

      await expect(serverController.getOperation("test-123")).rejects.toThrow(
        NetworkError,
      );
      await expect(serverController.getOperation("test-123")).rejects.toThrow(
        "Failed to poll status: Unknown error",
      );
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle missing applicationClient gracefully", () => {
      const contextWithoutAppClient = {
        ...mockContext,
        applicationClient: undefined,
      };

      const controller = new ServerController(contextWithoutAppClient);
      expect(controller).toBeInstanceOf(ServerController);
    });

    // Note: These tests for empty/null addresses are no longer relevant
    // since getAddresses is not called in the postRequest flow after recent refactoring
  });

  describe("private method coverage through public methods", () => {
    it("should validate and create request JSON properly", async () => {
      const validParams: CreateOperationParams = {
        permissionId: 12345,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-123",
          status: "starting",
          urls: { get: "test-url", cancel: "cancel-url" },
          input: {},
        }),
      });

      await serverController.createOperation(validParams);

      // Verify the request was made with correct JSON structure
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.operation_request_json).toContain("permission_id");
      expect(requestBody.operation_request_json).toContain("12345");
      expect(requestBody.app_signature).toBe(`0x${"0".repeat(130)}`);
    });
  });
});
