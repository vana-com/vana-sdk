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

  describe("downloadArtifact", () => {
    beforeEach(() => {
      // Mock createSignature to return predictable signature
      vi.spyOn(controller as any, "createSignature").mockResolvedValue(
        "0xmocksignature123",
      );
    });

    it("should successfully download an artifact", async () => {
      const operationId = "test-op-123";
      const artifactPath = "report.json";
      const mockBlob = new Blob(['{"result": "data"}'], {
        type: "application/json",
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        blob: async () => mockBlob,
      });

      const result = await controller.downloadArtifact({
        operationId,
        artifactPath,
      });

      expect(result).toBe(mockBlob);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://personal-server.example.com/artifacts/download",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operation_id: operationId,
            artifact_path: artifactPath,
            signature: "0xmocksignature123",
          }),
        },
      );

      // Verify signature was created with simplified scheme (operation_id only)
      expect(controller["createSignature"]).toHaveBeenCalledWith(
        JSON.stringify({ operation_id: operationId }),
      );
    });

    it("should throw PersonalServerError when artifact not found (404)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Artifact not found",
      });

      await expect(
        controller.downloadArtifact({
          operationId: "test-op-123",
          artifactPath: "missing.json",
        }),
      ).rejects.toThrow(PersonalServerError);

      // Check the error message with a second mock
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Artifact not found",
      });

      await expect(
        controller.downloadArtifact({
          operationId: "test-op-123",
          artifactPath: "missing.json",
        }),
      ).rejects.toThrow("404 Not Found");
    });

    it("should throw PersonalServerError when signature verification fails (401)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Authentication failed",
      });

      await expect(
        controller.downloadArtifact({
          operationId: "test-op-123",
          artifactPath: "report.json",
        }),
      ).rejects.toThrow(PersonalServerError);
    });

    it("should throw PersonalServerError when access denied (403)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "Access denied - not authorized grantor or grantee",
      });

      await expect(
        controller.downloadArtifact({
          operationId: "test-op-123",
          artifactPath: "report.json",
        }),
      ).rejects.toThrow(PersonalServerError);

      // Check the error message with a second mock
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "Access denied - not authorized grantor or grantee",
      });

      await expect(
        controller.downloadArtifact({
          operationId: "test-op-123",
          artifactPath: "report.json",
        }),
      ).rejects.toThrow("403 Forbidden");
    });

    it("should handle network errors gracefully", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network failure"));

      await expect(
        controller.downloadArtifact({
          operationId: "test-op-123",
          artifactPath: "report.json",
        }),
      ).rejects.toThrow(PersonalServerError);
    });
  });

  describe("listArtifacts", () => {
    beforeEach(() => {
      // Mock createSignature to return predictable signature
      vi.spyOn(controller as any, "createSignature").mockResolvedValue(
        "0xmocksignature123",
      );
    });

    it("should successfully list artifacts", async () => {
      const operationId = "test-op-123";
      const mockArtifacts = [
        {
          path: "report.md",
          size: 5678,
          content_type: "text/markdown",
        },
        {
          path: "data.json",
          size: 12345,
          content_type: "application/json",
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          operation_id: operationId,
          artifacts: mockArtifacts,
        }),
      });

      const result = await controller.listArtifacts(operationId);

      expect(result).toEqual(mockArtifacts);
      expect(fetchMock).toHaveBeenCalledWith(
        `https://personal-server.example.com/artifacts/${operationId}/list`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operation_id: operationId,
            signature: "0xmocksignature123",
          }),
        },
      );

      // Verify signature was created with simplified scheme (operation_id only)
      expect(controller["createSignature"]).toHaveBeenCalledWith(
        JSON.stringify({ operation_id: operationId }),
      );
    });

    it("should return empty array when no artifacts exist", async () => {
      const operationId = "test-op-123";

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          operation_id: operationId,
          artifacts: [],
        }),
      });

      const result = await controller.listArtifacts(operationId);

      expect(result).toEqual([]);
    });

    it("should handle missing artifacts field in response", async () => {
      const operationId = "test-op-123";

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          operation_id: operationId,
          // Missing artifacts field
        }),
      });

      const result = await controller.listArtifacts(operationId);

      expect(result).toEqual([]);
    });

    it("should throw PersonalServerError when operation not found (404)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Operation not found",
      });

      await expect(controller.listArtifacts("test-op-123")).rejects.toThrow(
        PersonalServerError,
      );

      // Check the error message with a second mock
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Operation not found",
      });

      await expect(controller.listArtifacts("test-op-123")).rejects.toThrow(
        "404 Not Found",
      );
    });

    it("should throw PersonalServerError when signature verification fails (401)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Authentication failed",
      });

      await expect(controller.listArtifacts("test-op-123")).rejects.toThrow(
        PersonalServerError,
      );
    });

    it("should throw PersonalServerError when access denied (403)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "Access denied - not authorized grantor or grantee",
      });

      await expect(controller.listArtifacts("test-op-123")).rejects.toThrow(
        PersonalServerError,
      );

      // Check the error message with a second mock
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "Access denied - not authorized grantor or grantee",
      });

      await expect(controller.listArtifacts("test-op-123")).rejects.toThrow(
        "403 Forbidden",
      );
    });

    it("should handle network errors gracefully", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network failure"));

      await expect(controller.listArtifacts("test-op-123")).rejects.toThrow(
        PersonalServerError,
      );
    });

    it("should handle malformed JSON response gracefully", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      await expect(controller.listArtifacts("test-op-123")).rejects.toThrow();
    });
  });
});
