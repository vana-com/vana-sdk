import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { ServerProxyStorage } from "../providers/server-proxy";
import { StorageError } from "../index";

// Mock fetch globally
global.fetch = vi.fn();

describe("ServerProxyStorage", () => {
  let storage: ServerProxyStorage;
  let mockFetch: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure fetch mock exists and is properly reset
    if (!global.fetch) {
      global.fetch = vi.fn();
    }
    mockFetch = global.fetch as Mock;
    mockFetch.mockReset();

    storage = new ServerProxyStorage({
      uploadUrl: "/api/upload",
      downloadUrl: "/api/download",
    });
  });

  describe("Constructor", () => {
    it("should initialize with valid configuration", () => {
      expect(storage).toBeInstanceOf(ServerProxyStorage);
      expect(storage.getConfig()).toEqual({
        name: "Server Proxy",
        type: "server-proxy",
        requiresAuth: false,
        features: {
          upload: true,
          download: true,
          list: false,
          delete: false,
        },
      });
    });

    it("should throw error when uploadUrl is missing", () => {
      expect(
        () =>
          new ServerProxyStorage({
            uploadUrl: "",
            downloadUrl: "/api/download",
          }),
      ).toThrow(StorageError);
      expect(
        () =>
          new ServerProxyStorage({
            uploadUrl: "",
            downloadUrl: "/api/download",
          }),
      ).toThrow("Upload URL is required");
    });

    it("should throw error when downloadUrl is missing", () => {
      expect(
        () =>
          new ServerProxyStorage({
            uploadUrl: "/api/upload",
            downloadUrl: "",
          }),
      ).toThrow(StorageError);
      expect(
        () =>
          new ServerProxyStorage({
            uploadUrl: "/api/upload",
            downloadUrl: "",
          }),
      ).toThrow("Download URL is required");
    });
  });

  describe("Upload", () => {
    it("should successfully upload a file", async () => {
      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = {
        success: true,
        identifier: "file-123",
        url: "https://server.com/files/file-123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile);

      expect(result.url).toBe("https://server.com/files/file-123");
      expect(mockFetch).toHaveBeenCalledWith("/api/upload", {
        method: "POST",
        body: expect.any(FormData),
      });

      // Verify FormData content
      const formData = mockFetch.mock.calls[0][1].body as FormData;
      expect(formData.has("file")).toBe(true);
    });

    it("should upload file with custom name", async () => {
      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = {
        success: true,
        identifier: "custom-file-123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile, "custom.txt");

      expect(result.url).toBe("custom-file-123");

      const formData = mockFetch.mock.calls[0][1].body as FormData;
      expect(formData.get("name")).toBe("custom.txt");
    });

    it("should handle upload failures", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Server error"),
      });

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "Server upload failed: 500 Internal Server Error",
      );
    });

    it("should handle server error responses", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: "Invalid file type",
          }),
      });

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "Upload failed: Invalid file type",
      );
    });

    it("should handle network errors during upload", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockRejectedValue(new Error("Network connection failed"));

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "Server proxy upload error: Network connection failed",
      );
    });
  });

  describe("Download", () => {
    it("should successfully download a file", async () => {
      const expectedBlob = new Blob(["downloaded content"], {
        type: "text/plain",
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(expectedBlob),
      });

      const result = await storage.download("file-123");

      expect(result).toBe(expectedBlob);
      expect(mockFetch).toHaveBeenCalledWith("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier: "file-123" }),
      });
    });

    it("should handle download failures", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("File not found"),
      });

      await expect(storage.download("missing-file")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.download("missing-file")).rejects.toThrow(
        "Server download failed: 404 Not Found",
      );
    });

    it("should handle network errors during download", async () => {
      mockFetch.mockRejectedValue(new Error("Connection timeout"));

      await expect(storage.download("file-123")).rejects.toThrow(StorageError);
      await expect(storage.download("file-123")).rejects.toThrow(
        "Server proxy download error: Connection timeout",
      );
    });
  });

  describe("Unsupported Operations", () => {
    it("should not support list operation", () => {
      expect(storage.getConfig().features.list).toBe(false);
    });

    it("should throw error when list operation is called", async () => {
      await expect(storage.list()).rejects.toThrow(StorageError);
      await expect(storage.list()).rejects.toThrow(
        "List operation is not supported by server proxy storage",
      );
    });

    it("should not support delete operation", () => {
      expect(storage.getConfig().features.delete).toBe(false);
    });

    it("should throw error when delete operation is called", async () => {
      await expect(storage.delete("file-123")).rejects.toThrow(StorageError);
      await expect(storage.delete("file-123")).rejects.toThrow(
        "Delete operation is not supported by server proxy storage",
      );
    });
  });
});
