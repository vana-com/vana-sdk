import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DropboxStorage, type DropboxConfig } from "./dropbox";
import { StorageError } from "../index";

// Mock fetch globally
global.fetch = vi.fn();

describe("DropboxStorage", () => {
  let storage: DropboxStorage;
  let mockConfig: DropboxConfig;
  let mockFetch: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    if (!global.fetch) {
      global.fetch = vi.fn();
    }
    mockFetch = global.fetch as Mock;
    mockFetch.mockReset();

    mockConfig = {
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      rootPath: "/Vana Data",
    };

    storage = new DropboxStorage(mockConfig);
  });

  describe("constructor", () => {
    it("should create instance with valid config", () => {
      expect(storage).toBeInstanceOf(DropboxStorage);
    });

    it("should use default rootPath if not provided", () => {
      const configWithoutRoot = {
        accessToken: "test-token",
      };
      const storageWithDefaultRoot = new DropboxStorage(configWithoutRoot);
      expect(storageWithDefaultRoot).toBeInstanceOf(DropboxStorage);
    });

    it("should throw StorageError when accessToken is missing", () => {
      expect(() => {
        new DropboxStorage({} as DropboxConfig);
      }).toThrow(StorageError);
    });

    it("should throw StorageError with correct error details when accessToken is missing", () => {
      try {
        new DropboxStorage({} as DropboxConfig);
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe("MISSING_ACCESS_TOKEN");
        expect((error as StorageError).provider).toBe("dropbox");
      }
    });
  });

  describe("upload", () => {
    it("should successfully upload a file", async () => {
      const mockBlob = new Blob(["test content"], { type: "text/plain" });
      const mockUploadResponse = {
        name: "test-file.txt",
        path_lower: "/vana data/test-file.txt",
        path_display: "/Vana Data/test-file.txt",
        id: "id:test123",
        size: 12,
      };

      const mockSharedLinkResponse = {
        url: "https://www.dropbox.com/s/abc123/test-file.txt?dl=0",
      };

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUploadResponse),
      });

      // Mock shared link creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSharedLinkResponse),
      });

      const result = await storage.upload(mockBlob, "test-file.txt");

      expect(result).toEqual({
        url: "https://dl.dropboxusercontent.com/s/abc123/test-file.txt",
        size: mockBlob.size,
        contentType: "text/plain",
        metadata: {
          id: "id:test123",
          path: "/Vana Data/test-file.txt",
        },
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "https://content.dropboxapi.com/2/files/upload",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-access-token",
            "Content-Type": "application/octet-stream",
            "Dropbox-API-Arg": JSON.stringify({
              path: "/Vana Data/test-file.txt",
              mode: "add",
              autorename: true,
              mute: false,
            }),
          },
          body: mockBlob,
        }),
      );
    });

    it("should generate filename if not provided", async () => {
      const mockBlob = new Blob(["test content"]);
      const mockUploadResponse = {
        name: "vana-file-123.dat",
        path_lower: "/vana data/vana-file-123.dat",
        path_display: "/Vana Data/vana-file-123.dat",
        id: "id:test123",
        size: 12,
      };

      const mockSharedLinkResponse = {
        url: "https://www.dropbox.com/s/abc123/file.dat?dl=0",
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUploadResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSharedLinkResponse),
        });

      const result = await storage.upload(mockBlob);

      expect(result.url).toBeDefined();
      expect(result.contentType).toBe("application/octet-stream");
    });

    it("should throw StorageError when upload fails", async () => {
      const mockBlob = new Blob(["test content"]);

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve("Upload failed"),
        })
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve("Upload failed"),
        });

      await expect(storage.upload(mockBlob, "test.txt")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.upload(mockBlob, "test.txt")).rejects.toThrow(
        /Failed to upload to Dropbox/,
      );
    });

    it("should handle upload errors gracefully", async () => {
      const mockBlob = new Blob(["test content"]);

      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(storage.upload(mockBlob, "test.txt")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.upload(mockBlob, "test.txt")).rejects.toThrow(
        /Dropbox upload error/,
      );
    });

    it("should handle shared link creation error", async () => {
      const mockBlob = new Blob(["test content"]);
      const mockUploadResponse = {
        name: "test-file.txt",
        path_lower: "/vana data/test-file.txt",
        path_display: "/Vana Data/test-file.txt",
        id: "id:test123",
        size: 12,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUploadResponse),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: "Bad request" }),
        });

      await expect(storage.upload(mockBlob, "test.txt")).rejects.toThrow(
        StorageError,
      );
    });

    it("should handle existing shared link (409 conflict)", async () => {
      const mockBlob = new Blob(["test content"]);
      const mockUploadResponse = {
        name: "test-file.txt",
        path_lower: "/vana data/test-file.txt",
        path_display: "/Vana Data/test-file.txt",
        id: "id:test123",
        size: 12,
      };

      const existingLinkUrl =
        "https://www.dropbox.com/s/existing/test-file.txt?dl=1";

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUploadResponse),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              error: {
                shared_link_already_exists: {
                  metadata: {
                    url: existingLinkUrl,
                  },
                },
              },
            }),
        });

      const result = await storage.upload(mockBlob, "test.txt");

      expect(result.url).toBe(
        "https://dl.dropboxusercontent.com/s/existing/test-file.txt",
      );
    });
  });

  describe("download", () => {
    it("should successfully download a file", async () => {
      const mockBlobContent = new Blob(["downloaded content"]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlobContent),
      });

      const url = "https://www.dropbox.com/s/abc123/test-file.txt";
      const result = await storage.download(url);

      expect(result).toEqual(mockBlobContent);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://dl.dropboxusercontent.com/s/abc123/test-file.txt",
      );
    });

    it("should convert www.dropbox.com to dl.dropboxusercontent.com", async () => {
      const mockBlobContent = new Blob(["content"]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlobContent),
      });

      await storage.download("https://www.dropbox.com/s/test/file.txt");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://dl.dropboxusercontent.com/s/test/file.txt",
      );
    });

    it("should throw StorageError when download fails", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          statusText: "Not Found",
        })
        .mockResolvedValueOnce({
          ok: false,
          statusText: "Not Found",
        });

      await expect(
        storage.download("https://www.dropbox.com/s/abc123/test.txt"),
      ).rejects.toThrow(StorageError);
      await expect(
        storage.download("https://www.dropbox.com/s/abc123/test.txt"),
      ).rejects.toThrow(/Failed to download from Dropbox/);
    });

    it("should handle download errors gracefully", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(
        storage.download("https://www.dropbox.com/s/abc123/test.txt"),
      ).rejects.toThrow(StorageError);
      await expect(
        storage.download("https://www.dropbox.com/s/abc123/test.txt"),
      ).rejects.toThrow(/Dropbox download error/);
    });
  });

  describe("list", () => {
    it("should successfully list files", async () => {
      const mockListResponse = {
        entries: [
          {
            ".tag": "file" as const,
            name: "file1.txt",
            path_lower: "/vana data/file1.txt",
            id: "id:file1",
            server_modified: "2025-10-10T10:00:00Z",
            size: 100,
          },
          {
            ".tag": "file" as const,
            name: "file2.txt",
            path_lower: "/vana data/file2.txt",
            id: "id:file2",
            server_modified: "2025-10-10T11:00:00Z",
            size: 200,
          },
          {
            ".tag": "folder" as const,
            name: "subfolder",
            path_lower: "/vana data/subfolder",
            id: "id:folder1",
            server_modified: "2025-10-10T09:00:00Z",
            size: 0,
          },
        ],
        has_more: false,
        cursor: "cursor123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockListResponse),
      });

      const result = await storage.list();

      expect(result).toHaveLength(2); // Should exclude folder
      expect(result[0]).toEqual({
        id: "id:file1",
        name: "file1.txt",
        url: "dropbox:///vana data/file1.txt",
        size: 100,
        contentType: "application/octet-stream",
        createdAt: new Date("2025-10-10T10:00:00Z"),
      });
      expect(result[1]).toEqual({
        id: "id:file2",
        name: "file2.txt",
        url: "dropbox:///vana data/file2.txt",
        size: 200,
        contentType: "application/octet-stream",
        createdAt: new Date("2025-10-10T11:00:00Z"),
      });
    });

    it("should apply limit option", async () => {
      const mockListResponse = {
        entries: [],
        has_more: false,
        cursor: "cursor123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockListResponse),
      });

      await storage.list({ limit: 50 });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.dropboxapi.com/2/files/list_folder",
        expect.objectContaining({
          body: JSON.stringify({
            path: "/Vana Data",
            limit: 50,
            include_deleted: false,
          }),
        }),
      );
    });

    it("should use default limit if not provided", async () => {
      const mockListResponse = {
        entries: [],
        has_more: false,
        cursor: "cursor123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockListResponse),
      });

      await storage.list();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.dropboxapi.com/2/files/list_folder",
        expect.objectContaining({
          body: JSON.stringify({
            path: "/Vana Data",
            limit: 100,
            include_deleted: false,
          }),
        }),
      );
    });

    it("should throw StorageError when list fails", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve("List failed"),
        })
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve("List failed"),
        });

      await expect(storage.list()).rejects.toThrow(StorageError);
      await expect(storage.list()).rejects.toThrow(
        /Failed to list Dropbox files/,
      );
    });

    it("should handle list errors gracefully", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(storage.list()).rejects.toThrow(StorageError);
      await expect(storage.list()).rejects.toThrow(/Dropbox list error/);
    });
  });

  describe("delete", () => {
    it("should successfully delete a file", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const url = "https://dl.dropboxusercontent.com/vana-data/test-file.txt";
      const result = await storage.delete(url);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.dropboxapi.com/2/files/delete_v2",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-access-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: "/vana-data/test-file.txt" }),
        }),
      );
    });

    it("should return true for 404 (file not found)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not found"),
      });

      const url = "https://dl.dropboxusercontent.com/vana data/test-file.txt";
      const result = await storage.delete(url);

      expect(result).toBe(true);
    });

    it("should throw StorageError when delete fails (non-404)", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve("Bad request"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve("Bad request"),
        });

      await expect(
        storage.delete("https://dl.dropboxusercontent.com/path/file.txt"),
      ).rejects.toThrow(StorageError);
      await expect(
        storage.delete("https://dl.dropboxusercontent.com/path/file.txt"),
      ).rejects.toThrow(/Failed to delete from Dropbox/);
    });

    it("should handle delete errors gracefully", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(
        storage.delete("https://dl.dropboxusercontent.com/path/file.txt"),
      ).rejects.toThrow(StorageError);
      await expect(
        storage.delete("https://dl.dropboxusercontent.com/path/file.txt"),
      ).rejects.toThrow(/Dropbox delete error/);
    });
  });

  describe("getConfig", () => {
    it("should return provider configuration", () => {
      const config = storage.getConfig();

      expect(config).toEqual({
        name: "Dropbox",
        type: "dropbox",
        requiresAuth: true,
        features: {
          upload: true,
          download: true,
          list: true,
          delete: true,
        },
      });
    });
  });
});
