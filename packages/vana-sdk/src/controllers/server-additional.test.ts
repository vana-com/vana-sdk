import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServerController } from "./server";
import type { ControllerContext } from "../types/controller-context";
import { PersonalServerError, NetworkError } from "../errors";
import { createMockControllerContext } from "../tests/factories/mockFactory";

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("ServerController - Additional Methods", () => {
  let controller: ServerController;
  let mockContext: ControllerContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = createMockControllerContext({
      defaultPersonalServerUrl: "https://personal-server.example.com",
    });

    controller = new ServerController(mockContext);
  });

  describe("personalServerBaseUrl getter", () => {
    it("should return the configured personal server URL", () => {
      // Access the private getter through the method that uses it
      const getBaseUrl = () => {
        // We'll trigger it by calling a method that uses it
        // Access private property for testing
        const serverInternal = controller as unknown as {
          personalServerBaseUrl: string;
        };
        return serverInternal.personalServerBaseUrl;
      };

      expect(getBaseUrl()).toBe("https://personal-server.example.com");
    });

    it("should throw PersonalServerError when URL is not configured", () => {
      // Create controller without personal server URL
      const contextWithoutUrl = {
        ...mockContext,
        defaultPersonalServerUrl: undefined,
      };
      const controllerWithoutUrl = new ServerController(contextWithoutUrl);

      // Try to access the getter through a method that uses it
      expect(() => {
        const serverInternal = controllerWithoutUrl as unknown as {
          personalServerBaseUrl: string;
        };
        void serverInternal.personalServerBaseUrl;
      }).toThrow(PersonalServerError);

      expect(() => {
        const serverInternal = controllerWithoutUrl as unknown as {
          personalServerBaseUrl: string;
        };
        void serverInternal.personalServerBaseUrl;
      }).toThrow(
        "Personal server URL is required for server operations. " +
          "Please configure defaultPersonalServerUrl in your VanaConfig.",
      );
    });
  });

  describe("cancelOperation", () => {
    it("should successfully cancel an operation", async () => {
      const operationId = "test-operation-123";

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "cancelled" }),
      });

      await expect(
        controller.cancelOperation(operationId),
      ).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://personal-server.example.com/operations/test-operation-123/cancel",
        {
          method: "POST",
        },
      );
    });

    it("should throw PersonalServerError when response is not ok", async () => {
      const operationId = "test-operation-123";

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Operation not found",
      });

      await expect(controller.cancelOperation(operationId)).rejects.toThrow(
        NetworkError,
      );

      // Check the error message with a second mock
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Operation not found",
      });

      await expect(controller.cancelOperation(operationId)).rejects.toThrow(
        "Failed to cancel operation: Failed to cancel operation: 404 Not Found - Operation not found",
      );
    });

    it("should handle network errors gracefully", async () => {
      const operationId = "test-operation-123";

      fetchMock.mockRejectedValueOnce(new Error("Network failure"));

      await expect(controller.cancelOperation(operationId)).rejects.toThrow(
        NetworkError,
      );
    });

    it("should handle operations that cannot be cancelled", async () => {
      const operationId = "test-operation-123";

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Operation cannot be cancelled in current state",
      });

      await expect(controller.cancelOperation(operationId)).rejects.toThrow(
        NetworkError,
      );

      // Check the error message with a second mock
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Operation cannot be cancelled in current state",
      });

      await expect(controller.cancelOperation(operationId)).rejects.toThrow(
        "Failed to cancel operation: Failed to cancel operation: 400 Bad Request - Operation cannot be cancelled in current state",
      );
    });
  });
});
