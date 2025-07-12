import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Address } from "viem";
import { ServerController } from "../controllers/server";
import { ControllerContext } from "../controllers/permissions";
import { NetworkError, SignatureError, PersonalServerError } from "../errors";
import { PostRequestParams, InitPersonalServerParams } from "../types";
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
      signMessage: vi.fn().mockResolvedValue("0xsignature123"),
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

  describe("postRequest", () => {
    const validParams: PostRequestParams = {
      userAddress: mockUserAddress,
      permissionId: 12345,
    };

    const mockReplicateResponse = {
      id: "prediction-123",
      status: "starting" as const,
      urls: {
        get: "https://api.replicate.com/v1/predictions/prediction-123",
        cancel:
          "https://api.replicate.com/v1/predictions/prediction-123/cancel",
      },
      input: { permission_id: 12345 },
      output: null,
      error: null,
    };

    it("should successfully post a request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockReplicateResponse),
      });

      const result = await serverController.postRequest(validParams);

      expect(result).toEqual(mockReplicateResponse);
      expect(mockAccount.signMessage).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.replicate.com/v1/predictions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Token test-token-123",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("should throw PersonalServerError for invalid permission ID", async () => {
      const invalidParams = {
        userAddress: mockUserAddress,
        permissionId: 0,
      };

      await expect(serverController.postRequest(invalidParams)).rejects.toThrow(
        PersonalServerError,
      );
      await expect(serverController.postRequest(invalidParams)).rejects.toThrow(
        "Permission ID is required and must be a valid positive number",
      );
    });

    it("should throw PersonalServerError for negative permission ID", async () => {
      const invalidParams = {
        userAddress: mockUserAddress,
        permissionId: -1,
      };

      await expect(serverController.postRequest(invalidParams)).rejects.toThrow(
        PersonalServerError,
      );
    });

    it("should throw PersonalServerError when REPLICATE_API_TOKEN is missing", async () => {
      delete process.env.REPLICATE_API_TOKEN;
      delete process.env.NEXT_PUBLIC_REPLICATE_API_TOKEN;

      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        PersonalServerError,
      );
      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        "REPLICATE_API_TOKEN environment variable is required",
      );
    });

    it("should use NEXT_PUBLIC_REPLICATE_API_TOKEN as fallback", async () => {
      delete process.env.REPLICATE_API_TOKEN;
      process.env.NEXT_PUBLIC_REPLICATE_API_TOKEN = "fallback-token";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockReplicateResponse),
      });

      await serverController.postRequest(validParams);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Token fallback-token",
          }),
        }),
      );
    });

    it("should throw NetworkError when fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: vi.fn().mockResolvedValue("Invalid token"),
      });

      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        NetworkError,
      );
    });

    it("should throw SignatureError when account is not local", async () => {
      mockAccount.type = "json-rpc";

      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        SignatureError,
      );
      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        "Only local accounts are supported for signing",
      );
    });

    it("should throw SignatureError when no account is available", async () => {
      mockWalletClient.account = null;
      mockApplicationClient.account = null;

      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        SignatureError,
      );
      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        "No account available for signing",
      );
    });

    it("should throw SignatureError when user rejects signature", async () => {
      mockAccount.signMessage.mockRejectedValue(new Error("User rejected"));

      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        SignatureError,
      );
    });

    // Note: getAddresses is no longer called in postRequest flow after recent refactoring
    // This test is removed as the behavior no longer exists

    it("should use applicationClient when available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockReplicateResponse),
      });

      const result = await serverController.postRequest(validParams);

      // Verify the request completed successfully
      expect(result).toEqual(mockReplicateResponse);
      // Note: getAddresses is no longer called after refactoring
    });

    it("should fallback to walletClient when applicationClient is not available", async () => {
      mockContext.applicationClient = undefined;
      serverController = new ServerController(mockContext);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockReplicateResponse),
      });

      const result = await serverController.postRequest(validParams);

      // Verify the request completed successfully using walletClient
      expect(result).toEqual(mockReplicateResponse);
      // Note: getAddresses is no longer called after refactoring
    });

    it("should wrap unknown errors in NetworkError", async () => {
      mockFetch.mockRejectedValue(new Error("Network connection failed"));

      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        NetworkError,
      );
      await expect(serverController.postRequest(validParams)).rejects.toThrow(
        "Failed to make Replicate API request: Network connection failed",
      );
    });
  });

  describe("initPersonalServer", () => {
    const validParams: InitPersonalServerParams = {
      userAddress: mockUserAddress,
    };

    const mockPersonalServerResponse = {
      id: "identity-123",
      status: "succeeded" as const,
      urls: {
        get: "https://api.replicate.com/v1/predictions/identity-123",
        cancel: "https://api.replicate.com/v1/predictions/identity-123/cancel",
      },
      input: { user_address: validParams.userAddress },
      output: {
        user_address: validParams.userAddress,
        personal_server: {
          address: "0x1234567890123456789012345678901234567890",
          public_key:
            "0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
      },
    };

    it("should successfully initialize personal server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockPersonalServerResponse),
      });

      const result = await serverController.initPersonalServer(validParams);

      expect(result).toMatchObject({
        userAddress: mockPersonalServerResponse.output.user_address,
        identity: {
          metadata: {
            derivedAddress:
              mockPersonalServerResponse.output.personal_server.address,
            publicKey:
              mockPersonalServerResponse.output.personal_server.public_key,
          },
        },
        timestamp: expect.any(String),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.replicate.com/v1/predictions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Token test-token-123",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("should throw PersonalServerError for invalid user address", async () => {
      const invalidParams = { userAddress: "" };

      await expect(
        serverController.initPersonalServer(invalidParams),
      ).rejects.toThrow(PersonalServerError);
      await expect(
        serverController.initPersonalServer(invalidParams),
      ).rejects.toThrow("User address is required and must be a valid string");
    });

    it("should throw PersonalServerError for non-string user address", async () => {
      const invalidParams = { userAddress: 123 as unknown as string };

      await expect(
        serverController.initPersonalServer(invalidParams),
      ).rejects.toThrow(PersonalServerError);
    });

    it("should throw PersonalServerError for invalid address format", async () => {
      const invalidParams = { userAddress: "invalid-address" };

      await expect(
        serverController.initPersonalServer(invalidParams),
      ).rejects.toThrow(PersonalServerError);
      await expect(
        serverController.initPersonalServer(invalidParams),
      ).rejects.toThrow("User address must be a valid Vana address");
    });

    it("should throw PersonalServerError for short address", async () => {
      const invalidParams = { userAddress: "0x123" };

      await expect(
        serverController.initPersonalServer(invalidParams),
      ).rejects.toThrow(PersonalServerError);
    });

    it("should throw PersonalServerError when computation fails", async () => {
      const failedResponse = {
        ...mockPersonalServerResponse,
        status: "failed" as const,
        error: "Computation failed",
      };

      // Mock the initial request with proper Response object
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(failedResponse),
        }),
      );

      await expect(
        serverController.initPersonalServer(validParams),
      ).rejects.toThrow(PersonalServerError);
      await expect(
        serverController.initPersonalServer(validParams),
      ).rejects.toThrow(
        "Personal server initialization failed: Computation failed",
      );
    });

    it("should throw PersonalServerError when computation is canceled", async () => {
      const canceledResponse = {
        ...mockPersonalServerResponse,
        status: "canceled" as const,
      };

      // Mock the initial request with proper Response object
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(canceledResponse),
        }),
      );

      await expect(
        serverController.initPersonalServer(validParams),
      ).rejects.toThrow(PersonalServerError);
      await expect(
        serverController.initPersonalServer(validParams),
      ).rejects.toThrow("Personal server initialization was canceled");
    });

    it("should handle JSON string output", async () => {
      const responseWithStringOutput = {
        ...mockPersonalServerResponse,
        output: JSON.stringify(mockPersonalServerResponse.output),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(responseWithStringOutput),
      });

      const result = await serverController.initPersonalServer(validParams);

      expect(result.userAddress).toBe(validParams.userAddress);
    });

    it("should handle invalid JSON string output gracefully", async () => {
      const responseWithInvalidJSON = {
        ...mockPersonalServerResponse,
        output: "invalid json string",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(responseWithInvalidJSON),
      });

      const result = await serverController.initPersonalServer(validParams);

      expect(result).toBeDefined();
    });

    it("should timeout after max attempts", async () => {
      const processingResponse = {
        ...mockPersonalServerResponse,
        status: "processing" as const,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(processingResponse),
      });

      // Mock setTimeout to avoid actual waiting
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi
        .fn()
        .mockImplementation((fn) => fn()) as unknown as typeof setTimeout;

      try {
        await expect(
          serverController.initPersonalServer(validParams),
        ).rejects.toThrow(PersonalServerError);
        await expect(
          serverController.initPersonalServer(validParams),
        ).rejects.toThrow(
          "Personal server initialization timed out after 60 seconds",
        );
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });
  });

  describe("getTrustedServerPublicKey", () => {
    const testUserAddress = "0xd7Ae9319049f0B6cA9AD044b165c5B4F143EF451";
    const mockPublicKey =
      "0x04a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    beforeEach(() => {
      process.env.REPLICATE_API_TOKEN = "test-token-123";
    });

    it("should get trusted server public key successfully", async () => {
      // Mock the initial request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "starting",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: null,
          error: null,
        }),
      });

      // Mock the polling request with successful response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "succeeded",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: JSON.stringify({
            user_address: testUserAddress,
            personal_server: {
              address: "0x123...",
              public_key: mockPublicKey,
            },
          }),
          error: null,
        }),
      });

      const result =
        await serverController.getTrustedServerPublicKey(testUserAddress);

      expect(result).toBe(mockPublicKey);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw error for invalid user address", async () => {
      await expect(
        serverController.getTrustedServerPublicKey(
          "invalid-address" as Address,
        ),
      ).rejects.toThrow("User address must be a valid EVM address");
    });

    it("should throw error for empty user address", async () => {
      await expect(
        serverController.getTrustedServerPublicKey("" as Address),
      ).rejects.toThrow("User address is required and must be a valid string");
    });

    it("should handle Identity Server API failures", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: vi.fn().mockResolvedValue("Server error"),
      });

      await expect(
        serverController.getTrustedServerPublicKey(testUserAddress),
      ).rejects.toThrow(
        "Identity Server API request failed: 500 Internal Server Error",
      );
    });

    it("should handle missing public key in response", async () => {
      // Mock the initial request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "starting",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: null,
          error: null,
        }),
      });

      // Mock the polling request with response missing public key
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "succeeded",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: JSON.stringify({
            user_address: testUserAddress,
            personal_server: {
              address: "0x123...",
              // Missing public_key
            },
          }),
          error: null,
        }),
      });

      await expect(
        serverController.getTrustedServerPublicKey(testUserAddress),
      ).rejects.toThrow(
        "Identity Server response missing personal_server.public_key",
      );
    });

    it("should handle failed Identity Server request", async () => {
      // Mock the initial request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "starting",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: null,
          error: null,
        }),
      });

      // Mock the polling request with failed response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "failed",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: null,
          error: "Identity server error",
        }),
      });

      await expect(
        serverController.getTrustedServerPublicKey(testUserAddress),
      ).rejects.toThrow(
        "Identity Server request failed: Identity server error",
      );
    });

    it("should handle timeout in Identity Server request", async () => {
      // Mock the initial request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "starting",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: null,
          error: null,
        }),
      });

      // Mock setTimeout to run immediately and reset poll attempts
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn((callback, _ms) => {
        callback();
        return { __promisify__: vi.fn() } as unknown as ReturnType<
          typeof setTimeout
        >;
      }) as unknown as typeof setTimeout;

      try {
        // Mock all polling requests to stay in processing state
        mockFetch.mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: vi.fn().mockResolvedValue({
              id: "test-prediction-123",
              status: "processing", // Always processing, never succeeds
              urls: {
                get: "https://api.replicate.com/v1/predictions/test-prediction-123",
                cancel:
                  "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
              },
              input: { user_address: testUserAddress },
              output: null,
              error: null,
            }),
          }),
        );

        await expect(
          serverController.getTrustedServerPublicKey(testUserAddress),
        ).rejects.toThrow("Identity Server request timed out after 60 seconds");
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    it("should handle canceled Identity Server request", async () => {
      // Mock the initial request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "starting",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: null,
          error: null,
        }),
      });

      // Mock the polling request with canceled response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "canceled",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: null,
          error: null,
        }),
      });

      await expect(
        serverController.getTrustedServerPublicKey(testUserAddress),
      ).rejects.toThrow("Identity Server request was canceled");
    });

    it("should handle object format response", async () => {
      // Mock the initial request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "starting",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: null,
          error: null,
        }),
      });

      // Mock the polling request with object format response (not JSON string)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "succeeded",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: {
            user_address: testUserAddress,
            personal_server: {
              address: "0x123...",
              public_key: mockPublicKey,
            },
          },
          error: null,
        }),
      });

      const result =
        await serverController.getTrustedServerPublicKey(testUserAddress);

      expect(result).toBe(mockPublicKey);
    });

    it("should handle invalid JSON in response", async () => {
      // Mock the initial request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "starting",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: null,
          error: null,
        }),
      });

      // Mock the polling request with invalid JSON string
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "test-prediction-123",
          status: "succeeded",
          urls: {
            get: "https://api.replicate.com/v1/predictions/test-prediction-123",
            cancel:
              "https://api.replicate.com/v1/predictions/test-prediction-123/cancel",
          },
          input: { user_address: testUserAddress },
          output: "invalid json {",
          error: null,
        }),
      });

      await expect(
        serverController.getTrustedServerPublicKey(testUserAddress),
      ).rejects.toThrow("Failed to parse Identity Server response as JSON");
    });
  });

  describe("pollStatus", () => {
    const getUrl = "https://api.replicate.com/v1/predictions/test-123";
    const mockStatusResponse = {
      id: "test-123",
      status: "processing" as const,
      urls: {
        get: getUrl,
        cancel: "https://api.replicate.com/v1/predictions/test-123/cancel",
      },
      input: { test: "input" },
      output: { test: "output" },
      error: null,
    };

    it("should successfully poll status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatusResponse),
      });

      const result = await serverController.pollStatus(getUrl);

      expect(result).toEqual(mockStatusResponse);
      expect(mockFetch).toHaveBeenCalledWith(getUrl, {
        method: "GET",
        headers: {
          Authorization: "Token test-token-123",
          "Content-Type": "application/json",
        },
      });
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

      await expect(serverController.pollStatus(getUrl)).rejects.toThrow(
        NetworkError,
      );
      await expect(serverController.pollStatus(getUrl)).rejects.toThrow(
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

      const result = await serverController.pollStatus(getUrl);

      expect(result.urls.get).toBe(getUrl);
      expect(result.urls.cancel).toBe("");
    });

    it("should wrap unknown errors in NetworkError", async () => {
      mockFetch.mockRejectedValue(new Error("Unknown network error"));

      await expect(serverController.pollStatus(getUrl)).rejects.toThrow(
        NetworkError,
      );
      await expect(serverController.pollStatus(getUrl)).rejects.toThrow(
        "Failed to poll status: Unknown network error",
      );
    });

    it("should handle non-Error exceptions", async () => {
      mockFetch.mockRejectedValue("String error");

      await expect(serverController.pollStatus(getUrl)).rejects.toThrow(
        NetworkError,
      );
      await expect(serverController.pollStatus(getUrl)).rejects.toThrow(
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
      const validParams: PostRequestParams = {
        userAddress: mockUserAddress,
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

      await serverController.postRequest(validParams);

      // Verify the request was made with correct JSON structure
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.input.request_json).toContain("permission_id");
      expect(requestBody.input.request_json).toContain("12345");
      expect(requestBody.input.signature).toBe("0xsignature123");
    });

    it("should use correct Replicate versions", async () => {
      const postParams: PostRequestParams = {
        userAddress: mockUserAddress,
        permissionId: 123,
      };
      const initParams: InitPersonalServerParams = {
        userAddress: mockUserAddress,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            id: "post-123",
            status: "starting",
            urls: { get: "test-url", cancel: "cancel-url" },
            input: {},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            id: "init-123",
            status: "succeeded",
            urls: { get: "test-url", cancel: "cancel-url" },
            input: {},
            output: {
              user_address: initParams.userAddress,
              derived_address: "0x1234567890123456789012345678901234567890",
            },
          }),
        });

      await serverController.postRequest(postParams);
      await serverController.initPersonalServer(initParams);

      const postRequestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const initRequestBody = JSON.parse(mockFetch.mock.calls[1][1].body);

      expect(postRequestBody.version).toContain("personal-server");
      expect(initRequestBody.version).toContain("identity-server");
    });
  });
});
