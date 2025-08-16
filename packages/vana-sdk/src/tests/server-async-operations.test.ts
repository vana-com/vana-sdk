import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ServerController } from "../controllers/server";
import { PersonalServerError } from "../errors";
import type { ControllerContext } from "../controllers/permissions";
import type {
  CreateOperationResponse,
  GetOperationResponse,
} from "../generated/server/server-exports";

// Mock fetch globally
global.fetch = vi.fn();

describe("ServerController Async Operations", () => {
  let serverController: ServerController;
  let mockContext: ControllerContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock context
    mockContext = {
      defaultPersonalServerUrl: "https://test-server.vana.org",
      walletClient: {
        account: { address: "0xtest" },
        signMessage: vi.fn().mockResolvedValue("0xsignature"),
      },
    } as unknown as ControllerContext;

    serverController = new ServerController(mockContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createOperationAndWait", () => {
    it("should create operation and wait for successful completion", async () => {
      const mockCreateResponse: CreateOperationResponse = {
        id: "operation-123",
        status: "starting",
      };

      const mockPendingResponse: GetOperationResponse = {
        id: "operation-123",
        status: "processing",
      };

      const mockSuccessResponse: GetOperationResponse = {
        id: "operation-123",
        status: "succeeded",
        output: { result: "test-result" },
      };

      // Mock fetch calls
      const fetchMock = vi.mocked(global.fetch);

      // First call: create operation
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreateResponse,
      } as Response);

      // Second call: poll - still processing
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPendingResponse,
      } as Response);

      // Third call: poll - succeeded
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      } as Response);

      const result = await serverController.createOperationAndWait(
        { permissionId: 123 },
        { pollingInterval: 10, timeout: 1000 },
      );

      expect(result).toEqual({ result: "test-result" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("should throw error when operation fails", async () => {
      const mockCreateResponse: CreateOperationResponse = {
        id: "operation-123",
        status: "starting",
      };

      const mockFailedResponse: GetOperationResponse = {
        id: "operation-123",
        status: "failed",
        error: "Operation failed due to invalid input",
      };

      const fetchMock = vi.mocked(global.fetch);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreateResponse,
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFailedResponse,
      } as Response);

      await expect(
        serverController.createOperationAndWait(
          { permissionId: 123 },
          { pollingInterval: 10 },
        ),
      ).rejects.toThrow(PersonalServerError);
    });

    it("should throw error on timeout", async () => {
      const mockCreateResponse: CreateOperationResponse = {
        id: "operation-123",
        status: "starting",
      };

      const mockPendingResponse: GetOperationResponse = {
        id: "operation-123",
        status: "processing",
      };

      const fetchMock = vi.mocked(global.fetch);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreateResponse,
      } as Response);

      // Always return processing status
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockPendingResponse,
      } as Response);

      await expect(
        serverController.createOperationAndWait(
          { permissionId: 123 },
          { pollingInterval: 10, timeout: 50 },
        ),
      ).rejects.toThrow("Operation timed out after 50ms");
    });
  });

  describe("createOperationHandle", () => {
    it("should return an OperationHandle", async () => {
      const mockCreateResponse: CreateOperationResponse = {
        id: "operation-123",
        status: "starting",
      };

      const fetchMock = vi.mocked(global.fetch);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreateResponse,
      } as Response);

      const handle = await serverController.createOperationHandle({
        permissionId: 123,
      });

      expect(handle.id).toBe("operation-123");
      expect(handle).toHaveProperty("waitForResult");
      expect(handle).toHaveProperty("getStatus");
      expect(handle).toHaveProperty("cancel");
    });

    it("should allow checking status via handle", async () => {
      const mockCreateResponse: CreateOperationResponse = {
        id: "operation-123",
        status: "starting",
      };

      const mockStatusResponse: GetOperationResponse = {
        id: "operation-123",
        status: "processing",
      };

      const fetchMock = vi.mocked(global.fetch);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreateResponse,
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatusResponse,
      } as Response);

      const handle = await serverController.createOperationHandle({
        permissionId: 123,
      });

      const status = await handle.getStatus();
      expect(status).toBe("processing");
    });

    it("should allow canceling via handle", async () => {
      const mockCreateResponse: CreateOperationResponse = {
        id: "operation-123",
        status: "starting",
      };

      const fetchMock = vi.mocked(global.fetch);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreateResponse,
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      } as Response);

      const handle = await serverController.createOperationHandle({
        permissionId: 123,
      });

      await handle.cancel();

      expect(fetchMock).toHaveBeenLastCalledWith(
        "https://test-server.vana.org/operations/operation-123/cancel",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("waitForOperation", () => {
    it("should wait for an existing operation to complete", async () => {
      const mockSuccessResponse: GetOperationResponse = {
        id: "existing-operation",
        status: "succeeded",
        output: { data: "result-data" },
      };

      const fetchMock = vi.mocked(global.fetch);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      } as Response);

      const result =
        await serverController.waitForOperation("existing-operation");

      expect(result).toEqual({ data: "result-data" });
    });

    it("should poll until operation completes", async () => {
      const mockPendingResponse: GetOperationResponse = {
        id: "existing-operation",
        status: "processing",
      };

      const mockSuccessResponse: GetOperationResponse = {
        id: "existing-operation",
        status: "succeeded",
        output: { data: "final-result" },
      };

      const fetchMock = vi.mocked(global.fetch);

      // First poll: still processing
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPendingResponse,
      } as Response);

      // Second poll: succeeded
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      } as Response);

      const result = await serverController.waitForOperation(
        "existing-operation",
        { pollingInterval: 10 },
      );

      expect(result).toEqual({ data: "final-result" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("Backward compatibility", () => {
    it("should still support old createOperation method", async () => {
      const mockCreateResponse: CreateOperationResponse = {
        id: "operation-123",
        status: "starting",
      };

      const fetchMock = vi.mocked(global.fetch);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreateResponse,
      } as Response);

      const response = await serverController.createOperation({
        permissionId: 123,
      });

      expect(response.id).toBe("operation-123");
      expect(response.status).toBe("starting");
    });

    it("should still support old getOperation method", async () => {
      const mockResponse: GetOperationResponse = {
        id: "operation-123",
        status: "processing",
      };

      const fetchMock = vi.mocked(global.fetch);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const response = await serverController.getOperation("operation-123");

      expect(response.id).toBe("operation-123");
      expect(response.status).toBe("processing");
    });
  });
});
