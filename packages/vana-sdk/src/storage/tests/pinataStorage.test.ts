import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PinataStorage } from "../providers/pinata";
import { StorageError } from "../index";

// Mock fetch globally
global.fetch = vi.fn();

// Define interfaces for testing
interface PinataListQuery {
  limit?: number;
  offset?: number;
  namePattern?: string;
}

describe("PinataStorage", () => {
  let storage: PinataStorage;
  let mockFetch: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure fetch mock exists and is properly reset
    if (!global.fetch) {
      global.fetch = vi.fn();
    }
    mockFetch = global.fetch as Mock;
    mockFetch.mockReset();

    storage = new PinataStorage({
      jwt: "test-jwt-token",
    });
  });

  describe("Configuration", () => {
    it("should initialize with valid configuration", () => {
      expect(storage).toBeInstanceOf(PinataStorage);
      expect(storage.getConfig()).toEqual({
        name: "Pinata IPFS",
        type: "pinata",
        requiresAuth: true,
        features: {
          upload: true,
          download: true,
          list: true,
          delete: true,
        },
      });
    });

    it("should throw error when JWT token is missing", () => {
      expect(() => new PinataStorage({ jwt: "" })).toThrow(StorageError);
      expect(() => new PinataStorage({ jwt: "" })).toThrow(
        "Pinata JWT token is required",
      );
    });
  });

  describe("Upload", () => {
    it("should successfully upload a file and return CID", async () => {
      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = {
        IpfsHash: "QmTestHash123",
        PinSize: 12,
        Timestamp: "2023-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile);

      expect(result.url).toContain("QmTestHash123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-jwt-token",
          }),
          body: expect.any(FormData),
        }),
      );
    });

    it("should upload file with custom name", async () => {
      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = {
        IpfsHash: "QmTestHash456",
        PinSize: 12,
        Timestamp: "2023-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile, "custom.txt");

      expect(result.url).toContain("QmTestHash456");

      // Verify FormData contains the custom name
      const formData = mockFetch.mock.calls[0][1].body as FormData;
      const metadata = JSON.parse(formData.get("pinataMetadata") as string);
      expect(metadata.name).toBe("custom.txt");
    });

    it("should upload file with custom name", async () => {
      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = {
        IpfsHash: "QmTestHash789",
        PinSize: 12,
        Timestamp: "2023-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile, "test.txt");

      expect(result.url).toContain("QmTestHash789");

      // Verify FormData contains the custom name
      const formData = mockFetch.mock.calls[0][1].body as FormData;
      const metadata = JSON.parse(formData.get("pinataMetadata") as string);
      expect(metadata.name).toBe("test.txt");
    });

    it("should handle upload failures", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Invalid JWT token"),
      });

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "Pinata upload failed: Invalid JWT token",
      );
    });

    it("should handle missing hash in response", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ PinSize: 12 }), // Missing IpfsHash
      });

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "Pinata upload succeeded but no IPFS hash returned",
      );
    });

    describe("Network Error Handling", () => {
      it("should wrap network errors during upload in a StorageError", async () => {
        const testFile = new Blob(["test content"], { type: "text/plain" });

        // Simulate network failure
        mockFetch.mockRejectedValue(new Error("Network Failure"));

        await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
        await expect(storage.upload(testFile)).rejects.toThrow(
          "Pinata upload error: Network Failure",
        );
      });
    });
  });

  describe("Download", () => {
    it("should successfully download a file by CID", async () => {
      const expectedBlob = new Blob(["downloaded content"], {
        type: "text/plain",
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(expectedBlob),
      });

      const result = await storage.download("QmTestHash123");

      expect(result).toBe(expectedBlob);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://gateway.pinata.cloud/ipfs/QmTestHash123",
      );
    });

    it("should handle download failures", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(storage.download("QmMissingHash")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.download("QmMissingHash")).rejects.toThrow(
        "Failed to download from IPFS: Not Found",
      );
    });

    it("should handle invalid CID format", async () => {
      await expect(storage.download("invalid-cid")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.download("invalid-cid")).rejects.toThrow(
        "Invalid IPFS CID format",
      );
    });
  });

  describe("List", () => {
    it("should successfully list files", async () => {
      const mockResponse = {
        count: 2,
        rows: [
          {
            id: "pin-1",
            ipfs_pin_hash: "QmTestHash123",
            size: 1024,
            user_id: "user-123",
            date_pinned: "2023-01-01T00:00:00Z",
            date_unpinned: null,
            metadata: {
              name: "test1.txt",
              keyvalues: {
                uploadedBy: "vana-sdk",
                category: "test",
              },
            },
          },
          {
            id: "pin-2",
            ipfs_pin_hash: "QmTestHash456",
            size: 2048,
            user_id: "user-123",
            date_pinned: "2023-01-02T00:00:00Z",
            date_unpinned: null,
            metadata: {
              name: "test2.txt",
              keyvalues: {
                uploadedBy: "vana-sdk",
              },
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.list();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "pin-1",
        name: "test1.txt",
        url: "ipfs://QmTestHash123",
        size: 1024,
        contentType: "application/octet-stream",
        createdAt: new Date("2023-01-01T00:00:00Z"),
        metadata: {
          uploadedBy: "vana-sdk",
          category: "test",
        },
      });
    });

    it("should handle list with query parameters", async () => {
      const mockResponse = {
        count: 1,
        rows: [
          {
            id: "pin-1",
            ipfs_pin_hash: "QmTestHash123",
            size: 1024,
            user_id: "user-123",
            date_pinned: "2023-01-01T00:00:00Z",
            date_unpinned: null,
            metadata: {
              name: "filtered.txt",
              keyvalues: {
                uploadedBy: "vana-sdk",
              },
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const query: PinataListQuery = {
        limit: 5,
        offset: 10,
        namePattern: "filtered",
      };

      const result = await storage.list(query);

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("pageLimit=5"),
        expect.any(Object),
      );
    });

    it("should handle list failures", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Invalid JWT token"),
      });

      await expect(storage.list()).rejects.toThrow(StorageError);
      await expect(storage.list()).rejects.toThrow(
        "Failed to list Pinata files: Invalid JWT token",
      );
    });
  });

  describe("Delete", () => {
    it("should successfully delete a file", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Successfully unpinned" }),
      });

      await storage.delete("QmTestHash123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pinata.cloud/pinning/unpin/QmTestHash123",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            Authorization: "Bearer test-jwt-token",
          }),
        }),
      );
    });

    it("should successfully delete a file using gateway URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Successfully unpinned" }),
      });

      await storage.delete("https://gateway.pinata.cloud/ipfs/QmTestHash123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pinata.cloud/pinning/unpin/QmTestHash123",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            Authorization: "Bearer test-jwt-token",
          }),
        }),
      );
    });

    it("should handle delete failures", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("Pin not found"),
      });

      await expect(storage.delete("QmMissingHash")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.delete("QmMissingHash")).rejects.toThrow(
        "Failed to delete from Pinata: Pin not found",
      );
    });

    it("should handle invalid CID format in delete", async () => {
      await expect(storage.delete("invalid-cid")).rejects.toThrow(StorageError);
      await expect(storage.delete("invalid-cid")).rejects.toThrow(
        "Invalid IPFS CID format",
      );
    });
  });

  describe("List with query parameters", () => {
    it("should handle list with offset parameter", async () => {
      const mockResponse = {
        count: 1,
        rows: [
          {
            id: "pin-1",
            ipfs_pin_hash: "QmTestHash123",
            size: 1024,
            user_id: "user-123",
            date_pinned: "2023-01-01T00:00:00Z",
            date_unpinned: null,
            metadata: {
              name: "test.txt",
              keyvalues: {
                uploadedBy: "vana-sdk",
              },
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const query: PinataListQuery = {
        offset: 20,
      };

      const result = await storage.list(query);

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("pageOffset=20"),
        expect.any(Object),
      );
    });

    it("should handle list with namePattern parameter", async () => {
      const mockResponse = {
        count: 1,
        rows: [
          {
            id: "pin-1",
            ipfs_pin_hash: "QmTestHash123",
            size: 1024,
            user_id: "user-123",
            date_pinned: "2023-01-01T00:00:00Z",
            date_unpinned: null,
            metadata: {
              name: "pattern.txt",
              keyvalues: {
                uploadedBy: "vana-sdk",
              },
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const query: PinataListQuery = {
        namePattern: "pattern",
      };

      const result = await storage.list(query);

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("metadata%5Bname%5D=pattern"),
        expect.any(Object),
      );
    });
  });

  describe("CID validation and extraction", () => {
    it("should validate Test CID format", async () => {
      const expectedBlob = new Blob(["test content"], { type: "text/plain" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(expectedBlob),
      });

      const result = await storage.download("TestCID12345");

      expect(result).toBe(expectedBlob);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://gateway.pinata.cloud/ipfs/TestCID12345",
      );
    });

    it("should extract CID from non-URL string", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Successfully unpinned" }),
      });

      await storage.delete("QmDirectCID123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pinata.cloud/pinning/unpin/QmDirectCID123",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    });
  });

  describe("Configuration edge cases", () => {
    it("should use custom gateway URL when provided", () => {
      const customGateway = "https://custom.gateway.com";
      const customStorage = new PinataStorage({
        jwt: "test-jwt",
        gatewayUrl: customGateway,
      });

      expect(customStorage.getConfig().name).toBe("Pinata IPFS");
    });

    it("should handle missing metadata in list response", async () => {
      const mockResponse = {
        count: 1,
        rows: [
          {
            id: "pin-1",
            ipfs_pin_hash: "QmTestHash123",
            size: 1024,
            user_id: "user-123",
            date_pinned: "2023-01-01T00:00:00Z",
            date_unpinned: null,
            metadata: {
              // Missing name and keyvalues
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.list();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Unnamed");
      expect(result[0].metadata).toEqual({});
    });
  });
});
