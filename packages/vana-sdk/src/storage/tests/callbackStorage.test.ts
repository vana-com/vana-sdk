import { describe, it, expect, vi } from "vitest";
import { CallbackStorage } from "../providers/callback-storage";
import { StorageError } from "../index";
import type { StorageCallbacks } from "../../types/config";

describe("CallbackStorage", () => {
  const mockCallbacks: StorageCallbacks = {
    upload: vi.fn(),
    download: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
    extractIdentifier: vi.fn((url) => url),
  };

  describe("constructor", () => {
    it("should require both upload and download callbacks", () => {
      expect(
        () =>
          new CallbackStorage({
            upload: vi.fn(),
          } as unknown as StorageCallbacks),
      ).toThrow("CallbackStorage requires both upload and download callbacks");

      expect(
        () =>
          new CallbackStorage({
            download: vi.fn(),
          } as unknown as StorageCallbacks),
      ).toThrow("CallbackStorage requires both upload and download callbacks");
    });

    it("should create instance with valid callbacks", () => {
      const storage = new CallbackStorage(mockCallbacks);
      expect(storage).toBeInstanceOf(CallbackStorage);
    });
  });

  describe("upload", () => {
    it("should call upload callback and return result", async () => {
      const mockResult = {
        url: "https://example.com/file.txt",
        size: 1024,
        contentType: "text/plain",
      };
      mockCallbacks.upload = vi.fn().mockResolvedValue(mockResult);

      const storage = new CallbackStorage(mockCallbacks);
      const blob = new Blob(["test"], { type: "text/plain" });
      const result = await storage.upload(blob, "test.txt");

      expect(mockCallbacks.upload).toHaveBeenCalledWith(blob, "test.txt");
      expect(result).toEqual(mockResult);
    });

    it("should throw error if upload returns invalid result", async () => {
      mockCallbacks.upload = vi.fn().mockResolvedValue({ url: "" });

      const storage = new CallbackStorage(mockCallbacks);
      const blob = new Blob(["test"]);

      await expect(storage.upload(blob)).rejects.toThrow(StorageError);
      await expect(storage.upload(blob)).rejects.toThrow(
        "Upload callback returned invalid result: missing or empty url",
      );
    });

    it("should wrap non-StorageError exceptions", async () => {
      mockCallbacks.upload = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));

      const storage = new CallbackStorage(mockCallbacks);
      const blob = new Blob(["test"]);

      await expect(storage.upload(blob)).rejects.toThrow(StorageError);
      await expect(storage.upload(blob)).rejects.toThrow(
        "Upload failed: Network error",
      );
    });
  });

  describe("download", () => {
    it("should call download callback with identifier", async () => {
      const mockBlob = new Blob(["content"]);
      mockCallbacks.download = vi.fn().mockResolvedValue(mockBlob);

      const storage = new CallbackStorage(mockCallbacks);
      const result = await storage.download("https://example.com/file.txt");

      expect(mockCallbacks.download).toHaveBeenCalledWith(
        "https://example.com/file.txt",
      );
      expect(result).toBe(mockBlob);
    });

    it("should use extractIdentifier if provided", async () => {
      const mockBlob = new Blob(["content"]);
      mockCallbacks.download = vi.fn().mockResolvedValue(mockBlob);
      mockCallbacks.extractIdentifier = vi.fn().mockReturnValue("file-id-123");

      const storage = new CallbackStorage(mockCallbacks);
      await storage.download("https://example.com/file.txt");

      expect(mockCallbacks.extractIdentifier).toHaveBeenCalledWith(
        "https://example.com/file.txt",
      );
      expect(mockCallbacks.download).toHaveBeenCalledWith("file-id-123");
    });

    it("should throw error if download returns non-Blob", async () => {
      mockCallbacks.download = vi.fn().mockResolvedValue("not a blob");

      const storage = new CallbackStorage(mockCallbacks);

      await expect(storage.download("url")).rejects.toThrow(StorageError);
      await expect(storage.download("url")).rejects.toThrow(
        "Download callback returned invalid result: expected Blob",
      );
    });

    it("should wrap non-StorageError exceptions", async () => {
      mockCallbacks.download = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));

      const storage = new CallbackStorage(mockCallbacks);

      await expect(storage.download("url")).rejects.toThrow(StorageError);
      await expect(storage.download("url")).rejects.toThrow(
        "Download failed: Network error",
      );
    });
  });

  describe("list", () => {
    it("should throw error if list callback not provided", async () => {
      const storage = new CallbackStorage({
        upload: vi.fn(),
        download: vi.fn(),
      });

      await expect(storage.list()).rejects.toThrow(StorageError);
      await expect(storage.list()).rejects.toThrow(
        "List operation not supported - no list callback provided",
      );
    });

    it("should call list callback and transform results", async () => {
      const mockListResult = {
        items: [
          {
            identifier: "file1.txt",
            size: 1024,
            lastModified: new Date("2024-01-01"),
            metadata: { custom: "data" },
          },
          {
            identifier: "path/to/file2.txt",
            size: 2048,
          },
        ],
      };
      mockCallbacks.list = vi.fn().mockResolvedValue(mockListResult);

      const storage = new CallbackStorage(mockCallbacks);
      const result = await storage.list({ namePattern: "*.txt", limit: 10 });

      expect(mockCallbacks.list).toHaveBeenCalledWith("*.txt", {
        namePattern: "*.txt",
        limit: 10,
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "file1.txt",
        name: "file1.txt",
        url: "file1.txt",
        size: 1024,
        contentType: "application/octet-stream",
        metadata: { custom: "data" },
      });
      expect(result[1].name).toBe("file2.txt");
    });

    it("should wrap list errors", async () => {
      mockCallbacks.list = vi.fn().mockRejectedValue(new Error("List failed"));

      const storage = new CallbackStorage(mockCallbacks);

      await expect(storage.list()).rejects.toThrow(StorageError);
      await expect(storage.list()).rejects.toThrow("List failed: List failed");
    });
  });

  describe("delete", () => {
    it("should throw error if delete callback not provided", async () => {
      const storage = new CallbackStorage({
        upload: vi.fn(),
        download: vi.fn(),
      });

      await expect(storage.delete("url")).rejects.toThrow(StorageError);
      await expect(storage.delete("url")).rejects.toThrow(
        "Delete operation not supported - no delete callback provided",
      );
    });

    it("should call delete callback with URL when no extractIdentifier", async () => {
      const callbacks = {
        upload: vi.fn(),
        download: vi.fn(),
        delete: vi.fn().mockResolvedValue(true),
      };

      const storage = new CallbackStorage(callbacks);
      const result = await storage.delete("https://example.com/file.txt");

      expect(callbacks.delete).toHaveBeenCalledWith(
        "https://example.com/file.txt",
      );
      expect(result).toBe(true);
    });

    it("should use extractIdentifier if provided", async () => {
      mockCallbacks.delete = vi.fn().mockResolvedValue(true);
      mockCallbacks.extractIdentifier = vi.fn().mockReturnValue("file-id-123");

      const storage = new CallbackStorage(mockCallbacks);
      await storage.delete("https://example.com/file.txt");

      expect(mockCallbacks.extractIdentifier).toHaveBeenCalledWith(
        "https://example.com/file.txt",
      );
      expect(mockCallbacks.delete).toHaveBeenCalledWith("file-id-123");
    });

    it("should wrap delete errors", async () => {
      const callbacks = {
        upload: vi.fn(),
        download: vi.fn(),
        delete: vi.fn().mockRejectedValue(new Error("Delete failed")),
      };

      const storage = new CallbackStorage(callbacks);

      await expect(storage.delete("url")).rejects.toThrow(StorageError);
      await expect(storage.delete("url")).rejects.toThrow(
        "Delete failed: Delete failed",
      );
    });
  });

  describe("getConfig", () => {
    it("should return correct configuration", () => {
      const storage = new CallbackStorage({
        upload: vi.fn(),
        download: vi.fn(),
      });

      const config = storage.getConfig();

      expect(config).toEqual({
        name: "callback-storage",
        type: "callback",
        requiresAuth: false,
        features: {
          upload: true,
          download: true,
          list: false,
          delete: false,
        },
      });
    });

    it("should reflect available callbacks in features", () => {
      const storage = new CallbackStorage(mockCallbacks);

      const config = storage.getConfig();

      expect(config.features).toEqual({
        upload: true,
        download: true,
        list: true,
        delete: true,
      });
    });
  });
});
