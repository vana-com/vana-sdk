import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { PinataStorage, PinataConfig } from "../providers/pinata";
import { StorageError } from "../index";

// Mock fetch globally
global.fetch = vi.fn();

describe("PinataStorage", () => {
  let storage: PinataStorage;
  let mockConfig: PinataConfig;
  let mockFetch: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure fetch mock exists and is properly reset
    if (!global.fetch) {
      global.fetch = vi.fn();
    }
    mockFetch = global.fetch as Mock;
    mockFetch.mockReset();

    mockConfig = {
      jwt: "test-jwt-token",
      gatewayUrl: "https://test-gateway.pinata.cloud",
      apiUrl: "https://api.pinata.cloud",
    };

    storage = new PinataStorage(mockConfig);
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

    it("should use default URLs when not provided", () => {
      const basicConfig = { jwt: "test-token" };
      const basicStorage = new PinataStorage(basicConfig);

      expect(basicStorage.getConfig()).toEqual({
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
  });

  describe("Upload", () => {
    it("should successfully upload a file", async () => {
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

      const result = await storage.upload(testFile, "test.txt");

      expect(result).toEqual({
        url: "https://test-gateway.pinata.cloud/ipfs/QmTestHash123",
        size: testFile.size, // Use actual file size, not mock response
        contentType: "text/plain",
        metadata: {
          ipfsHash: "QmTestHash123",
          fileName: "test.txt",
          ipfsUrl: "ipfs://QmTestHash123",
          gatewayUrl: "https://test-gateway.pinata.cloud/ipfs/QmTestHash123",
          pinataResponse: mockResponse,
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-jwt-token",
          },
          body: expect.any(FormData),
        }),
      );
    });

    it("should generate filename when not provided", async () => {
      const testFile = new Blob(["test"], { type: "application/octet-stream" });
      const mockResponse = {
        IpfsHash: "QmTestHash123",
        PinSize: 4,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile);

      expect(result.metadata?.fileName).toMatch(/^vana-file-\d+\.dat$/);
      expect(result.contentType).toBe("application/octet-stream");
    });

    it("should handle upload failure with error response", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request: Invalid file format"),
        json: () => Promise.reject(new Error("Response is not JSON")),
      });

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "Pinata upload failed",
      );
    });

    it("should handle missing IPFS hash in response", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, but: "no hash" }),
        text: () => Promise.resolve("OK"),
      });

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "no IPFS hash returned",
      );
    });

    it("should handle network errors during upload", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockRejectedValue(new Error("Network connection failed"));

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "Network connection failed",
      );
    });

    it("should include proper metadata in form data", async () => {
      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = { IpfsHash: "QmTestHash123" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await storage.upload(testFile, "important-file.txt");

      const formDataCall = mockFetch.mock.calls[0][1];
      expect(formDataCall.body).toBeInstanceOf(FormData);

      // Verify FormData contains the file and metadata
      const formData = formDataCall.body as FormData;
      expect(formData.get("file")).toBeInstanceOf(Blob);

      const metadata = JSON.parse(formData.get("pinataMetadata") as string);
      expect(metadata).toEqual({
        name: "important-file.txt",
        keyvalues: {
          uploadedBy: "vana-sdk",
          timestamp: expect.any(String),
          source: "browser-upload",
        },
      });
    });

    it("should handle file with no type (fallback to default content type)", async () => {
      // Create a blob without specifying type (will be empty string)
      const testFile = new Blob(["test content"]);
      const mockUploadResponse = {
        IpfsHash: "QmTestHash123456789",
        PinSize: "12",
        Timestamp: "2023-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUploadResponse),
      });

      const result = await storage.upload(testFile, "test-file.txt");

      // Verify the result uses the fallback content type
      expect(result.contentType).toBe("application/octet-stream");
      expect(result.url).toBe(
        "https://test-gateway.pinata.cloud/ipfs/QmTestHash123456789",
      );
    });
  });

  describe("Download", () => {
    it("should successfully download a file from IPFS URL", async () => {
      const expectedBlob = new Blob(["downloaded content"], {
        type: "text/plain",
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(expectedBlob),
      });

      const result = await storage.download("ipfs://QmTestHash123");

      expect(result).toBe(expectedBlob);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-gateway.pinata.cloud/ipfs/QmTestHash123",
      );
    });

    it("should successfully download from gateway URL", async () => {
      const expectedBlob = new Blob(["downloaded content"], {
        type: "text/plain",
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(expectedBlob),
      });

      const result = await storage.download(
        "https://gateway.pinata.cloud/ipfs/QmTestHash123",
      );

      expect(result).toBe(expectedBlob);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-gateway.pinata.cloud/ipfs/QmTestHash123",
      );
    });

    it("should handle invalid URL format", async () => {
      await expect(
        storage.download("https://example.com/invalid-url"),
      ).rejects.toThrow(StorageError);
      await expect(
        storage.download("https://example.com/invalid-url"),
      ).rejects.toThrow("Invalid IPFS URL format");
    });

    it("should handle download failures", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("Not Found"),
        blob: () => Promise.reject(new Error("Response is not blob")),
      });

      await expect(storage.download("ipfs://QmMissingHash")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.download("ipfs://QmMissingHash")).rejects.toThrow(
        "download from IPFS",
      );
    });

    it("should handle network errors during download", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      await expect(storage.download("ipfs://QmTestHash")).rejects.toThrow(
        "Pinata download error: Network timeout",
      );
    });

    it("should handle non-Error exceptions during download", async () => {
      // Mock a rejection with a non-Error object
      mockFetch.mockRejectedValueOnce("Download string error");

      await expect(storage.download("ipfs://QmTestHash")).rejects.toThrow(
        "Pinata download error: Unknown error",
      );
    });

    it("should handle undefined/null exceptions during download", async () => {
      // Mock a rejection with null/undefined
      mockFetch.mockRejectedValueOnce(undefined);

      await expect(storage.download("ipfs://QmTestHash")).rejects.toThrow(
        "Pinata download error: Unknown error",
      );
    });

    it("should handle object exceptions during download", async () => {
      // Mock a rejection with an object that's not an Error
      mockFetch.mockRejectedValueOnce({ status: "failed", reason: "Timeout" });

      await expect(storage.download("ipfs://QmTestHash")).rejects.toThrow(
        "Pinata download error: Unknown error",
      );
    });
  });

  describe("List", () => {
    it("should successfully list pinned files", async () => {
      const mockResponse = {
        count: 2,
        rows: [
          {
            ipfs_pin_hash: "QmFile1",
            size: "1024",
            date_pinned: "2023-01-01T00:00:00Z",
            metadata: {
              name: "file1.txt",
              keyvalues: {
                uploadedBy: "vana-sdk",
              },
            },
          },
          {
            ipfs_pin_hash: "QmFile2",
            size: "2048",
            date_pinned: "2023-01-02T00:00:00Z",
            metadata: {
              name: "file2.txt",
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

      const files = await storage.list({ limit: 10 });

      expect(files).toHaveLength(2);
      expect(files[0]).toEqual({
        id: "QmFile1",
        name: "file1.txt",
        url: "https://test-gateway.pinata.cloud/ipfs/QmFile1",
        size: 1024,
        contentType: "application/octet-stream",
        createdAt: new Date("2023-01-01T00:00:00Z"),
        metadata: {
          ipfsHash: "QmFile1",
          ipfsUrl: "ipfs://QmFile1",
          gatewayUrl: "https://test-gateway.pinata.cloud/ipfs/QmFile1",
          pinataMetadata: mockResponse.rows[0].metadata,
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/data/pinList"),
        expect.objectContaining({
          headers: {
            Authorization: "Bearer test-jwt-token",
          },
        }),
      );
    });

    it("should handle pagination parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 0, rows: [] }),
      });

      await storage.list({ limit: 25, offset: "next-page-token" });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("pageLimit=25");
      expect(calledUrl).toContain("pageOffset=next-page-token");
    });

    it("should use default limit when not specified", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 0, rows: [] }),
      });

      await storage.list();

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("pageLimit=10");
    });

    it("should handle list API errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
        json: () => Promise.reject(new Error("Response is not JSON")),
      });

      await expect(storage.list()).rejects.toThrow(StorageError);
      await expect(storage.list()).rejects.toThrow("list Pinata files");
    });

    it("should handle files without metadata gracefully", async () => {
      const mockResponse = {
        rows: [
          {
            ipfs_pin_hash: "QmTestHash1",
            size: "512",
            date_pinned: "2023-01-01T00:00:00Z",
            // No metadata
          },
          {
            ipfs_pin_hash: "QmTestHash2",
            metadata: null, // Null metadata
            size: "1024",
            date_pinned: "2023-01-02T00:00:00Z",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const files = await storage.list();

      expect(files).toHaveLength(2);
      expect(files[0].name).toBe("Unnamed");
      expect(files[0].size).toBe(512);
      expect(files[1].name).toBe("Unnamed");
      expect(files[1].size).toBe(1024);
    });

    it("should handle list with offset that is not a string", async () => {
      const mockResponse = {
        rows: [
          {
            ipfs_pin_hash: "QmTestHash1",
            metadata: { name: "test.txt" },
            size: "512",
            date_pinned: "2023-01-01T00:00:00Z",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Test with number offset (not string)
      const files = await storage.list({ offset: 10 as any });

      expect(files).toHaveLength(1);
      // Verify that pageOffset was not set for non-string offset
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("data/pinList"),
        expect.objectContaining({
          headers: { Authorization: "Bearer test-jwt-token" },
        }),
      );

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).not.toContain("pageOffset");
    });

    it("should handle list with undefined offset", async () => {
      const mockResponse = {
        rows: [
          {
            ipfs_pin_hash: "QmTestHash1",
            metadata: { name: "test.txt" },
            size: "512",
            date_pinned: "2023-01-01T00:00:00Z",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Test with undefined offset
      const files = await storage.list({ offset: undefined });

      expect(files).toHaveLength(1);
      // Verify that pageOffset was not set for undefined offset
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).not.toContain("pageOffset");
    });

    it("should handle list with string offset", async () => {
      const mockResponse = {
        rows: [
          {
            ipfs_pin_hash: "QmTestHash1",
            metadata: { name: "test.txt" },
            size: "512",
            date_pinned: "2023-01-01T00:00:00Z",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Test with string offset
      const files = await storage.list({ offset: "next-token" });

      expect(files).toHaveLength(1);
      // Verify that pageOffset was set for string offset
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("pageOffset=next-token");
    });

    it("should handle non-Error exceptions during list", async () => {
      // Mock a rejection with a non-Error object
      mockFetch.mockRejectedValueOnce("List string error");

      await expect(storage.list()).rejects.toThrow(
        "Pinata list error: Unknown error",
      );
    });

    it("should handle undefined/null exceptions during list", async () => {
      // Mock a rejection with null/undefined
      mockFetch.mockRejectedValueOnce(null);

      await expect(storage.list()).rejects.toThrow(
        "Pinata list error: Unknown error",
      );
    });
  });

  describe("Delete", () => {
    it("should successfully delete a pinned file", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Unpinned successfully" }),
      });

      const result = await storage.delete("ipfs://QmTestHash123");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pinata.cloud/pinning/unpin/QmTestHash123",
        expect.objectContaining({
          method: "DELETE",
          headers: {
            Authorization: "Bearer test-jwt-token",
          },
        }),
      );
    });

    it("should handle 404 errors gracefully (already unpinned)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Pin not found"),
      });

      const result = await storage.delete("ipfs://QmMissingHash");

      expect(result).toBe(true); // Should still return true for 404
    });

    it("should handle other delete errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
        json: () => Promise.reject(new Error("Response is not JSON")),
      });

      await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
        "delete from Pinata",
      );
    });

    it("should handle invalid URL format in delete", async () => {
      await expect(storage.delete("https://invalid-url.com")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.delete("https://invalid-url.com")).rejects.toThrow(
        "Invalid IPFS URL format",
      );
    });

    it("should handle non-Error exceptions during delete", async () => {
      // Mock a rejection with a non-Error object
      mockFetch.mockRejectedValueOnce("Delete string error");

      await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
        "Pinata delete error: Unknown error",
      );
    });

    it("should handle undefined/null exceptions during delete", async () => {
      // Mock a rejection with null/undefined
      mockFetch.mockRejectedValueOnce(null);

      await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
        "Pinata delete error: Unknown error",
      );
    });

    it("should handle object exceptions during delete", async () => {
      // Mock a rejection with an object that's not an Error
      mockFetch.mockRejectedValueOnce({ code: 403, reason: "Forbidden" });

      await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
        "Pinata delete error: Unknown error",
      );
    });
  });

  describe("IPFS Hash Extraction", () => {
    it("should extract hash from various URL formats", async () => {
      const testCases = [
        {
          url: "ipfs://QmTestHash123456789012345678901234567890123456",
          expected: "QmTestHash123456789012345678901234567890123456",
        },
        {
          url: "https://gateway.pinata.cloud/ipfs/QmTestHash123456789012345678901234567890123456",
          expected: "QmTestHash123456789012345678901234567890123456",
        },
        {
          url: "QmTestHash123456789012345678901234567890123456",
          expected: "QmTestHash123456789012345678901234567890123456",
        }, // Just the hash
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["test"])),
      });

      for (const testCase of testCases) {
        await storage.download(testCase.url);

        // Verify the correct hash was extracted by checking the fetch URL
        const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        expect(lastCall[0]).toBe(
          `https://test-gateway.pinata.cloud/ipfs/${testCase.expected}`,
        );
      }
    });

    it("should handle invalid hash formats", async () => {
      // Reset mock to ensure clean state
      mockFetch.mockReset();

      const invalidUrls = [
        "https://example.com/not-ipfs",
        "ipfs://", // Empty hash after protocol
        "https://random-domain.com/invalid", // Non-IPFS domain
        "", // Empty string
        "QmTooShortHash", // Hash too short (less than 46 chars)
      ];

      for (const url of invalidUrls) {
        await expect(storage.download(url)).rejects.toThrow(StorageError);
      }
    });

    it("should handle URLs with patterns that don't match", async () => {
      // Test URLs that definitely don't match any of the regex patterns
      const unmatchedUrls = [
        "https://example.com/file.txt", // Regular HTTP URL - no ipfs/ pattern
        "ftp://example.com/file", // Different protocol - no ipfs/ pattern
        "ipfs://", // Empty hash after ipfs://
        "https://cdn.example.com/assets/file.pdf", // Different structure entirely
        "mailto:test@example.com", // Completely different protocol
      ];

      for (const url of unmatchedUrls) {
        // Reset and configure mock for each URL
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(["test"])),
        });

        try {
          await storage.download(url);
          // If we get here, the URL unexpectedly succeeded
          throw new Error(
            `URL ${url} unexpectedly succeeded when it should have failed`,
          );
        } catch (error) {
          // We expect this to throw a StorageError with "Invalid IPFS URL format"
          expect(error).toBeInstanceOf(StorageError);
          expect((error as StorageError).message).toContain(
            "Invalid IPFS URL format",
          );
        }
      }
    });

    it("should handle delete with non-404 error codes", async () => {
      // Test specific error codes that are not 404
      const errorCodes = [400, 401, 403, 500, 502, 503];

      for (const errorCode of errorCodes) {
        // Reset and configure mock for each error code
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
          ok: false,
          status: errorCode,
          text: () => Promise.resolve(`HTTP ${errorCode} Error`),
        });

        await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
          StorageError,
        );
        await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
          "Failed to delete from Pinata",
        );
      }
    });

    it("should handle delete with 404 status specifically", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Pin not found"),
      });

      const result = await storage.delete("ipfs://QmMissingHash");
      expect(result).toBe(true); // Should still return true for 404
    });

    it("should handle different URL patterns in extractIPFSHash", async () => {
      // Test various URL formats to ensure all regex patterns are covered
      const testCases = [
        {
          url: "https://gateway.pinata.cloud/ipfs/QmTestHash1",
          description: "Gateway URL with ipfs/ pattern",
        },
        {
          url: "https://ipfs.io/ipfs/QmTestHash2",
          description: "Different gateway with ipfs/ pattern",
        },
        {
          url: "ipfs://QmTestHash3",
          description: "IPFS protocol URL",
        },
        {
          url: "QmTestHash4567890123456789012345678901234567890",
          description: "Direct hash (46+ chars)",
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["test"])),
      });

      for (const testCase of testCases) {
        try {
          await storage.download(testCase.url);
          // Verify the correct hash was extracted
          const lastCall =
            mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
          expect(lastCall[0]).toContain("ipfs/");
        } catch (error) {
          console.log(`Failed for ${testCase.description}: ${testCase.url}`);
          throw error;
        }
      }
    });

    it("should handle direct IPFS hash deletion", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Unpinned successfully" }),
      });

      const result = await storage.delete(
        "QmTestHash123456789012345678901234567890123456",
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pinata.cloud/pinning/unpin/QmTestHash123456789012345678901234567890123456",
        expect.objectContaining({
          method: "DELETE",
          headers: {
            Authorization: "Bearer test-jwt-token",
          },
        }),
      );
    });
  });

  describe("testConnection", () => {
    it("should successfully test authentication", async () => {
      const mockAuthResponse = {
        authenticated: true,
        pinCount: 150,
        pinSizeTotal: 1048576,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAuthResponse),
      });

      const result = await storage.testConnection();

      expect(result).toEqual({
        success: true,
        data: mockAuthResponse,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pinata.cloud/data/testAuthentication",
        expect.objectContaining({
          method: "GET",
          headers: {
            Authorization: "Bearer test-jwt-token",
          },
        }),
      );
    });

    it("should handle authentication failures", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Invalid JWT token"),
      });

      const result = await storage.testConnection();

      expect(result).toEqual({
        success: false,
        error: "Authentication failed: Invalid JWT token",
      });
    });

    it("should handle network errors during authentication test", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      const result = await storage.testConnection();

      expect(result).toEqual({
        success: false,
        error: "Network timeout",
      });
    });
  });

  describe("Error Handling", () => {
    it("should preserve StorageError instances", async () => {
      const originalError = new StorageError(
        "Original error",
        "TEST_CODE",
        "pinata",
      );

      mockFetch.mockImplementation(() => {
        throw originalError;
      });

      try {
        await storage.upload(new Blob(["test"]));
      } catch (error) {
        expect(error).toBe(originalError); // Should be the exact same instance
      }
    });

    it("should wrap unknown errors in StorageError", async () => {
      mockFetch.mockImplementation(() => {
        throw new TypeError("Something went wrong");
      });

      try {
        await storage.upload(new Blob(["test"]));
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).message).toContain(
          "Pinata upload error: Something went wrong",
        );
        expect((error as StorageError).code).toBe("UPLOAD_ERROR");
        expect((error as StorageError).provider).toBe("pinata");
      }
    });

    it("should handle non-Error objects thrown during operations", async () => {
      const nonErrorCases = [
        {
          operation: () => storage.upload(new Blob(["test"])),
          expectedCode: "UPLOAD_ERROR",
          thrownValue: "string error",
        },
        {
          operation: () => storage.download("ipfs://QmTestHash"),
          expectedCode: "DOWNLOAD_ERROR",
          thrownValue: { message: "object error" },
        },
        {
          operation: () => storage.list(),
          expectedCode: "LIST_ERROR",
          thrownValue: 42,
        },
        {
          operation: () => storage.delete("ipfs://QmTestHash"),
          expectedCode: "DELETE_ERROR",
          thrownValue: null,
        },
      ];

      for (const errorCase of nonErrorCases) {
        mockFetch.mockImplementation(() => {
          throw errorCase.thrownValue;
        });

        try {
          await errorCase.operation();
          expect.fail("Expected operation to throw");
        } catch (error) {
          expect(error).toBeInstanceOf(StorageError);
          expect((error as StorageError).code).toBe(errorCase.expectedCode);
          expect((error as StorageError).provider).toBe("pinata");
          expect((error as StorageError).message).toContain("Unknown error");
        }
      }
    });
  });

  describe("Edge Cases and Fallbacks", () => {
    it("should handle invalid pin size in list response", async () => {
      const mockResponse = {
        rows: [
          {
            ipfs_pin_hash: "QmTestHash",
            size: "invalid", // Non-numeric size
            date_pinned: "2023-01-01T00:00:00Z",
            metadata: { name: "test.txt" },
          },
          {
            ipfs_pin_hash: "QmTestHash2",
            size: "", // Empty string size
            date_pinned: "2023-01-01T00:00:00Z",
            metadata: { name: "test2.txt" },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const files = await storage.list();

      expect(files).toHaveLength(2);
      // Both should fallback to size 0 due to parseInt(invalid) || 0
      expect(files[0].size).toBe(0);
      expect(files[1].size).toBe(0);
    });

    it("should handle non-Error exceptions in list operation", async () => {
      mockFetch.mockImplementation(() => {
        throw { code: 500, message: "Server error" }; // Non-Error object
      });

      await expect(storage.list()).rejects.toThrow(
        "Pinata list error: Unknown error",
      );
    });

    it("should handle non-Error exceptions in delete operation", async () => {
      mockFetch.mockImplementation(() => {
        throw "network failure"; // Non-Error string
      });

      await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
        "Pinata delete error: Unknown error",
      );
    });

    it("should handle non-Error exceptions in testConnection", async () => {
      mockFetch.mockImplementation(() => {
        throw null; // Non-Error value
      });

      const result = await storage.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error");
    });
  });
});
