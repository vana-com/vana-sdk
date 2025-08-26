import { describe, it, expect, vi, beforeEach } from "vitest";
import { StorageManager } from "../manager";
import type {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageProviderConfig,
} from "../index";
import { StorageError } from "../index";

// Mock storage provider for testing
class MockStorageProvider implements StorageProvider {
  public uploadMock = vi.fn();
  public downloadMock = vi.fn();
  public listMock = vi.fn();
  public deleteMock = vi.fn();
  public getConfigMock = vi.fn();

  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    return this.uploadMock(file, filename);
  }

  async download(url: string): Promise<Blob> {
    return this.downloadMock(url);
  }

  async list(options?: Record<string, unknown>): Promise<StorageFile[]> {
    return this.listMock(options);
  }

  async delete(url: string): Promise<boolean> {
    return this.deleteMock(url);
  }

  getConfig(): StorageProviderConfig {
    return this.getConfigMock();
  }
}

describe("StorageManager", () => {
  let storageManager: StorageManager;
  let mockProvider1: MockStorageProvider;
  let mockProvider2: MockStorageProvider;

  beforeEach(() => {
    storageManager = new StorageManager();
    mockProvider1 = new MockStorageProvider();
    mockProvider2 = new MockStorageProvider();

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe("Provider Registration", () => {
    it("should register a provider successfully", () => {
      storageManager.register("provider1", mockProvider1);

      expect(storageManager.listProviders()).toContain("provider1");
    });

    it("should set first registered provider as default", () => {
      storageManager.register("provider1", mockProvider1);

      expect(storageManager.getDefaultProvider()).toBe("provider1");
    });

    it("should set explicitly marked provider as default", () => {
      storageManager.register("provider1", mockProvider1);
      storageManager.register("provider2", mockProvider2, true);

      expect(storageManager.getDefaultProvider()).toBe("provider2");
    });

    it("should register multiple providers", () => {
      storageManager.register("provider1", mockProvider1);
      storageManager.register("provider2", mockProvider2);

      const providers = storageManager.listProviders();
      expect(providers).toContain("provider1");
      expect(providers).toContain("provider2");
      expect(providers).toHaveLength(2);
    });

    it("should replace existing provider with same name", () => {
      const newProvider = new MockStorageProvider();

      storageManager.register("provider1", mockProvider1);
      storageManager.register("provider1", newProvider);

      expect(storageManager.listProviders()).toHaveLength(1);
      // Should use the new provider
      expect(storageManager.getProvider("provider1")).toBe(newProvider);
    });
  });

  describe("Provider Retrieval", () => {
    beforeEach(() => {
      storageManager.register("provider1", mockProvider1, true);
      storageManager.register("provider2", mockProvider2);
    });

    it("should return correct provider by name", () => {
      expect(storageManager.getProvider("provider1")).toBe(mockProvider1);
      expect(storageManager.getProvider("provider2")).toBe(mockProvider2);
    });

    it("should return default provider when no name specified", () => {
      expect(storageManager.getProvider()).toBe(mockProvider1);
    });

    it("should throw error when no provider specified and no default set", () => {
      const emptyManager = new StorageManager();

      expect(() => emptyManager.getProvider()).toThrow(StorageError);
      expect(() => emptyManager.getProvider()).toThrow(
        "No storage provider specified and no default provider set",
      );
    });

    it("should throw error when provider not found", () => {
      expect(() => storageManager.getProvider("nonexistent")).toThrow(
        StorageError,
      );
      expect(() => storageManager.getProvider("nonexistent")).toThrow(
        "Storage provider 'nonexistent' not found",
      );
    });
  });

  describe("Default Provider Management", () => {
    it("should update default provider", () => {
      storageManager.register("provider1", mockProvider1);
      storageManager.register("provider2", mockProvider2);

      expect(storageManager.getDefaultProvider()).toBe("provider1");

      storageManager.setDefaultProvider("provider2");
      expect(storageManager.getDefaultProvider()).toBe("provider2");
    });

    it("should throw error when setting non-existent provider as default", () => {
      expect(() => storageManager.setDefaultProvider("nonexistent")).toThrow(
        StorageError,
      );
      expect(() => storageManager.setDefaultProvider("nonexistent")).toThrow(
        "Cannot set default provider 'nonexistent': provider not registered",
      );
    });

    it("should return null default provider when none set", () => {
      expect(storageManager.getDefaultProvider()).toBeNull();
    });
  });

  describe("Storage Operations", () => {
    beforeEach(() => {
      storageManager.register("provider1", mockProvider1, true);
      storageManager.register("provider2", mockProvider2);
    });

    describe("upload", () => {
      it("should upload using default provider", async () => {
        const mockBlob = new Blob(["test data"], { type: "text/plain" });
        const mockResult: StorageUploadResult = {
          url: "https://example.com/file.txt",
          size: 9,
          contentType: "text/plain",
        };

        mockProvider1.uploadMock.mockResolvedValue(mockResult);

        const result = await storageManager.upload(mockBlob, "test.txt");

        expect(mockProvider1.uploadMock).toHaveBeenCalledWith(
          mockBlob,
          "test.txt",
        );
        expect(result).toBe(mockResult);
      });

      it("should upload using specified provider", async () => {
        const mockBlob = new Blob(["test data"], { type: "text/plain" });
        const mockResult: StorageUploadResult = {
          url: "https://example.com/file.txt",
          size: 9,
          contentType: "text/plain",
        };

        mockProvider2.uploadMock.mockResolvedValue(mockResult);

        const result = await storageManager.upload(
          mockBlob,
          "test.txt",
          "provider2",
        );

        expect(mockProvider2.uploadMock).toHaveBeenCalledWith(
          mockBlob,
          "test.txt",
        );
        expect(mockProvider1.uploadMock).not.toHaveBeenCalled();
        expect(result).toBe(mockResult);
      });

      it("should handle upload errors properly", async () => {
        const mockBlob = new Blob(["test data"], { type: "text/plain" });
        const mockError = new StorageError(
          "Upload failed",
          "UPLOAD_ERROR",
          "provider1",
        );

        mockProvider1.uploadMock.mockRejectedValue(mockError);

        await expect(
          storageManager.upload(mockBlob, "test.txt"),
        ).rejects.toThrow(mockError);
      });
    });

    describe("download", () => {
      it("should download using default provider", async () => {
        const mockBlob = new Blob(["downloaded data"], { type: "text/plain" });
        mockProvider1.downloadMock.mockResolvedValue(mockBlob);

        const result = await storageManager.download(
          "https://example.com/file.txt",
        );

        expect(mockProvider1.downloadMock).toHaveBeenCalledWith(
          "https://example.com/file.txt",
        );
        expect(result).toBe(mockBlob);
      });

      it("should download using specified provider", async () => {
        const mockBlob = new Blob(["downloaded data"], { type: "text/plain" });
        mockProvider2.downloadMock.mockResolvedValue(mockBlob);

        const result = await storageManager.download(
          "https://example.com/file.txt",
          "provider2",
        );

        expect(mockProvider2.downloadMock).toHaveBeenCalledWith(
          "https://example.com/file.txt",
        );
        expect(mockProvider1.downloadMock).not.toHaveBeenCalled();
        expect(result).toBe(mockBlob);
      });

      it("should handle download errors properly", async () => {
        const mockError = new StorageError(
          "Download failed",
          "DOWNLOAD_ERROR",
          "provider1",
        );
        mockProvider1.downloadMock.mockRejectedValue(mockError);

        await expect(
          storageManager.download("https://example.com/file.txt"),
        ).rejects.toThrow(mockError);
      });
    });

    describe("list", () => {
      it("should list files using default provider", async () => {
        const mockFiles: StorageFile[] = [
          {
            id: "1",
            name: "file1.txt",
            url: "https://example.com/file1.txt",
            size: 100,
            contentType: "text/plain",
            createdAt: new Date(),
          },
        ];

        mockProvider1.listMock.mockResolvedValue(mockFiles);

        const result = await storageManager.list({ limit: 10 });

        expect(mockProvider1.listMock).toHaveBeenCalledWith({ limit: 10 });
        expect(result).toBe(mockFiles);
      });

      it("should list files using specified provider", async () => {
        const mockFiles: StorageFile[] = [];
        mockProvider2.listMock.mockResolvedValue(mockFiles);

        const result = await storageManager.list({ limit: 5 }, "provider2");

        expect(mockProvider2.listMock).toHaveBeenCalledWith({ limit: 5 });
        expect(mockProvider1.listMock).not.toHaveBeenCalled();
        expect(result).toBe(mockFiles);
      });

      it("should handle list errors properly", async () => {
        const mockError = new StorageError(
          "List failed",
          "LIST_ERROR",
          "provider1",
        );
        mockProvider1.listMock.mockRejectedValue(mockError);

        await expect(storageManager.list()).rejects.toThrow(mockError);
      });
    });

    describe("delete", () => {
      it("should delete using default provider", async () => {
        mockProvider1.deleteMock.mockResolvedValue(true);

        const result = await storageManager.delete(
          "https://example.com/file.txt",
        );

        expect(mockProvider1.deleteMock).toHaveBeenCalledWith(
          "https://example.com/file.txt",
        );
        expect(result).toBe(true);
      });

      it("should delete using specified provider", async () => {
        mockProvider2.deleteMock.mockResolvedValue(false);

        const result = await storageManager.delete(
          "https://example.com/file.txt",
          "provider2",
        );

        expect(mockProvider2.deleteMock).toHaveBeenCalledWith(
          "https://example.com/file.txt",
        );
        expect(mockProvider1.deleteMock).not.toHaveBeenCalled();
        expect(result).toBe(false);
      });

      it("should handle delete errors properly", async () => {
        const mockError = new StorageError(
          "Delete failed",
          "DELETE_ERROR",
          "provider1",
        );
        mockProvider1.deleteMock.mockRejectedValue(mockError);

        await expect(
          storageManager.delete("https://example.com/file.txt"),
        ).rejects.toThrow(mockError);
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle operations when no providers registered", () => {
      const emptyManager = new StorageManager();

      expect(() => emptyManager.getProvider()).toThrow(StorageError);
      expect(emptyManager.listProviders()).toHaveLength(0);
      expect(emptyManager.getDefaultProvider()).toBeNull();
    });

    it("should handle empty provider names gracefully", () => {
      expect(() => storageManager.register("", mockProvider1)).not.toThrow();
      expect(storageManager.listProviders()).toContain("");
    });

    it("should handle null/undefined parameters appropriately", async () => {
      storageManager.register("provider1", mockProvider1, true);

      // These should delegate to the provider to handle null/undefined
      const mockBlob = new Blob(["test"]);

      await storageManager.upload(mockBlob);
      expect(mockProvider1.uploadMock).toHaveBeenCalledWith(
        mockBlob,
        undefined,
      );

      await storageManager.list();
      expect(mockProvider1.listMock).toHaveBeenCalledWith(undefined);
    });
  });

  describe("Provider Configuration Access", () => {
    it("should access provider configurations through the manager", () => {
      const mockConfig = { name: "Test Provider", type: "mock" };
      mockProvider1.getConfigMock.mockReturnValue(mockConfig);

      storageManager.register("provider1", mockProvider1);
      const provider = storageManager.getProvider("provider1");

      expect(provider.getConfig()).toBe(mockConfig);
      expect(mockProvider1.getConfigMock).toHaveBeenCalled();
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent uploads to different providers", async () => {
      storageManager.register("provider1", mockProvider1);
      storageManager.register("provider2", mockProvider2);

      const blob1 = new Blob(["data1"]);
      const blob2 = new Blob(["data2"]);

      const result1 = { url: "url1", size: 5, contentType: "text/plain" };
      const result2 = { url: "url2", size: 5, contentType: "text/plain" };

      mockProvider1.uploadMock.mockResolvedValue(result1);
      mockProvider2.uploadMock.mockResolvedValue(result2);

      const [uploadResult1, uploadResult2] = await Promise.all([
        storageManager.upload(blob1, "file1.txt", "provider1"),
        storageManager.upload(blob2, "file2.txt", "provider2"),
      ]);

      expect(uploadResult1).toBe(result1);
      expect(uploadResult2).toBe(result2);
      expect(mockProvider1.uploadMock).toHaveBeenCalledWith(blob1, "file1.txt");
      expect(mockProvider2.uploadMock).toHaveBeenCalledWith(blob2, "file2.txt");
    });
  });

  describe("Provider Introspection", () => {
    it("should return list of registered storage providers", () => {
      storageManager.register("provider1", mockProvider1);
      storageManager.register("provider2", mockProvider2);

      const providers = storageManager.getStorageProviders();

      expect(providers).toEqual(["provider1", "provider2"]);
      expect(providers).toHaveLength(2);
    });

    it("should return empty array when no providers registered", () => {
      const providers = storageManager.getStorageProviders();

      expect(providers).toEqual([]);
      expect(providers).toHaveLength(0);
    });

    it("should return default storage provider name", () => {
      storageManager.register("provider1", mockProvider1);
      storageManager.setDefaultProvider("provider1");

      const defaultProvider = storageManager.getDefaultStorageProvider();

      expect(defaultProvider).toBe("provider1");
    });

    it("should return undefined when no default provider set", () => {
      const defaultProvider = storageManager.getDefaultStorageProvider();

      expect(defaultProvider).toBeUndefined();
    });

    it("should maintain consistency between listProviders and getStorageProviders", () => {
      storageManager.register("provider1", mockProvider1);
      storageManager.register("provider2", mockProvider2);

      const providers1 = storageManager.getStorageProviders();
      const providers2 = storageManager.listProviders();

      expect(providers1).toEqual(providers2);
      expect(providers1).toEqual(["provider1", "provider2"]);
    });

    it("should maintain consistency between getDefaultProvider and getDefaultStorageProvider", () => {
      storageManager.register("provider1", mockProvider1);
      storageManager.setDefaultProvider("provider1");

      const default1 = storageManager.getDefaultProvider();
      const default2 = storageManager.getDefaultStorageProvider();

      expect(default1).toBe("provider1");
      expect(default2).toBe("provider1");
    });

    it("should handle null vs undefined default provider edge case", () => {
      // When no default is set, getDefaultProvider returns null
      // but getDefaultStorageProvider returns undefined
      const default1 = storageManager.getDefaultProvider();
      const default2 = storageManager.getDefaultStorageProvider();

      expect(default1).toBeNull();
      expect(default2).toBeUndefined();
    });
  });
});
