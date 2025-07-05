import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { IPFSStorage, IPFSConfig } from "../providers/ipfs";
import { StorageError } from "../index";

// Mock fetch globally
global.fetch = vi.fn();

describe("IPFSStorage", () => {
  let storage: IPFSStorage;
  let mockConfig: IPFSConfig;
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
      apiEndpoint: "https://api.example-ipfs.com/add",
      apiKey: "test-api-key",
      gatewayUrl: "https://gateway.example.com/ipfs",
    };

    storage = new IPFSStorage(mockConfig);
  });

  describe("Configuration", () => {
    it("should initialize with valid configuration", () => {
      expect(storage).toBeInstanceOf(IPFSStorage);
      expect(storage.getConfig()).toEqual({
        name: "IPFS",
        type: "ipfs",
        requiresAuth: true,
        features: {
          upload: true,
          download: true,
          list: false,
          delete: false,
        },
      });
    });

    it("should throw error when API endpoint is missing", () => {
      expect(() => new IPFSStorage({ apiEndpoint: "" })).toThrow(StorageError);
      expect(() => new IPFSStorage({ apiEndpoint: "" })).toThrow(
        "IPFS API endpoint is required",
      );
    });

    it("should set requiresAuth based on credentials presence", () => {
      const configWithoutAuth = { apiEndpoint: "https://api.example.com" };
      const storageWithoutAuth = new IPFSStorage(configWithoutAuth);

      expect(storageWithoutAuth.getConfig().requiresAuth).toBe(false);

      const configWithJWT = {
        apiEndpoint: "https://api.example.com",
        jwt: "test-jwt",
      };
      const storageWithJWT = new IPFSStorage(configWithJWT);

      expect(storageWithJWT.getConfig().requiresAuth).toBe(true);
    });
  });

  describe("Upload", () => {
    it("should successfully upload a file with API key authentication", async () => {
      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = {
        Hash: "QmTestHash123",
        Size: 12,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile, "test.txt");

      expect(result).toEqual({
        url: "https://gateway.example.com/ipfs/QmTestHash123",
        size: 12,
        contentType: "text/plain",
        metadata: {
          hash: "QmTestHash123",
          fileName: "test.txt",
          ipfsUrl: "ipfs://QmTestHash123",
          gatewayUrl: "https://gateway.example.com/ipfs/QmTestHash123",
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example-ipfs.com/add",
        expect.objectContaining({
          method: "POST",
          headers: {
            "X-API-Key": "test-api-key",
          },
          body: expect.any(FormData),
        }),
      );
    });

    it("should successfully upload with JWT authentication", async () => {
      const jwtConfig = {
        apiEndpoint: "https://api.pinata.cloud/pinning/pinFileToIPFS",
        jwt: "test-jwt-token",
      };
      const jwtStorage = new IPFSStorage(jwtConfig);

      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = {
        IpfsHash: "QmTestHash123", // Pinata format
        PinSize: 12,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await jwtStorage.upload(testFile, "test.txt");

      expect(result.metadata?.hash).toBe("QmTestHash123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-jwt-token",
          },
        }),
      );
    });

    it("should upload without authentication when no credentials provided", async () => {
      const noAuthConfig = { apiEndpoint: "https://public-ipfs.com/add" };
      const noAuthStorage = new IPFSStorage(noAuthConfig);

      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = { hash: "QmTestHash123" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await noAuthStorage.upload(testFile);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://public-ipfs.com/add",
        expect.objectContaining({
          method: "POST",
          headers: {}, // No auth headers
          body: expect.any(FormData),
        }),
      );
    });

    it("should generate filename when not provided", async () => {
      const testFile = new Blob(["test"], { type: "application/octet-stream" });
      const mockResponse = { Hash: "QmTestHash123" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile);

      expect(result.metadata?.fileName).toMatch(/^vana-file-\d+\.dat$/);
      expect(result.contentType).toBe("application/octet-stream");
    });

    it("should use default gateway URL when not configured", async () => {
      const defaultConfig = {
        apiEndpoint: "https://api.example.com",
        apiKey: "test-key",
      };
      const defaultStorage = new IPFSStorage(defaultConfig);

      const testFile = new Blob(["test"], { type: "text/plain" });
      const mockResponse = { Hash: "QmTestHash123" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await defaultStorage.upload(testFile);

      expect(result.url).toBe(
        "https://gateway.pinata.cloud/ipfs/QmTestHash123",
      );
      expect(result.metadata?.gatewayUrl).toBe(
        "https://gateway.pinata.cloud/ipfs/QmTestHash123",
      );
    });

    it("should handle different hash field names in response", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      // Test different response formats
      const testCases = [
        {
          response: { IpfsHash: "QmPinataFormat" },
          expected: "QmPinataFormat",
        },
        {
          response: { Hash: "QmStandardFormat" },
          expected: "QmStandardFormat",
        },
        {
          response: { hash: "QmLowercaseFormat" },
          expected: "QmLowercaseFormat",
        },
      ];

      for (const testCase of testCases) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testCase.response),
        });

        const result = await storage.upload(testFile);
        expect(result.metadata?.hash).toBe(testCase.expected);
      }
    });

    it("should handle upload failure with error response", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request: File too large"),
        json: () => Promise.reject(new Error("Response is not JSON")),
      });

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "Failed to upload to IPFS: Bad Request: File too large",
      );
    });

    it("should handle missing hash in response", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, but: "no hash field" }),
        text: () => Promise.resolve("OK"),
      });

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "IPFS upload succeeded but no hash returned",
      );
    });

    it("should handle network errors during upload", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockRejectedValue(new Error("Network connection failed"));

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "IPFS upload error: Network connection failed",
      );
    });

    it("should include Pinata metadata when using JWT", async () => {
      const jwtConfig = {
        apiEndpoint: "https://api.pinata.cloud/pinning/pinFileToIPFS",
        jwt: "test-jwt",
      };
      const jwtStorage = new IPFSStorage(jwtConfig);

      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = { IpfsHash: "QmTestHash123" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await jwtStorage.upload(testFile, "important-file.txt");

      const formDataCall = mockFetch.mock.calls[0][1];
      const formData = formDataCall.body as FormData;

      const fileFromFormData = formData.get("file") as File;
      expect(fileFromFormData.size).toBe(testFile.size);
      expect(fileFromFormData.type).toBe(testFile.type);

      const metadata = JSON.parse(formData.get("pinataMetadata") as string);
      expect(metadata).toEqual({
        name: "important-file.txt",
        keyvalues: {
          uploadedBy: "vana-sdk",
          timestamp: expect.any(String),
        },
      });
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
        "https://gateway.example.com/ipfs/QmTestHash123",
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
        "https://ipfs.io/ipfs/QmTestHash123",
      );

      expect(result).toBe(expectedBlob);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://gateway.example.com/ipfs/QmTestHash123",
      );
    });

    it("should use default gateway when not configured", async () => {
      const defaultConfig = { apiEndpoint: "https://api.example.com" };
      const defaultStorage = new IPFSStorage(defaultConfig);

      const expectedBlob = new Blob(["content"], { type: "text/plain" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(expectedBlob),
      });

      await defaultStorage.download("ipfs://QmTestHash123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://gateway.pinata.cloud/ipfs/QmTestHash123",
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
        "Failed to download from IPFS: Not Found",
      );
    });

    it("should handle network errors during download", async () => {
      mockFetch.mockRejectedValue(new Error("Connection timeout"));

      await expect(storage.download("ipfs://QmTestHash")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.download("ipfs://QmTestHash")).rejects.toThrow(
        "IPFS download error: Connection timeout",
      );
    });
  });

  describe("List and Delete Operations", () => {
    it("should throw error for list operation (not supported)", async () => {
      await expect(storage.list()).rejects.toThrow(StorageError);
      await expect(storage.list()).rejects.toThrow(
        "IPFS storage does not support file listing",
      );
    });

    it("should throw error for delete operation (not supported)", async () => {
      await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.delete("ipfs://QmTestHash")).rejects.toThrow(
        "IPFS storage does not support file deletion",
      );
    });

    it("should provide correct feature configuration", () => {
      const config = storage.getConfig();
      expect(config.features.list).toBe(false);
      expect(config.features.delete).toBe(false);
      expect(config.features.upload).toBe(true);
      expect(config.features.download).toBe(true);
    });
  });

  describe("IPFS Hash Extraction", () => {
    it("should extract hash from various URL formats", async () => {
      const testCases = [
        { url: "ipfs://QmTestHash123", expected: "QmTestHash123" },
        {
          url: "https://gateway.pinata.cloud/ipfs/QmTestHash123",
          expected: "QmTestHash123",
        },
        {
          url: "https://ipfs.io/ipfs/QmTestHash123",
          expected: "QmTestHash123",
        },
        {
          url: "QmTestHash123456789012345678901234567890123456",
          expected: "QmTestHash123456789012345678901234567890123456",
        },
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
          `https://gateway.example.com/ipfs/${testCase.expected}`,
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
        "invalid-format-no-protocol", // Plain string, too short
      ];

      for (const url of invalidUrls) {
        await expect(storage.download(url)).rejects.toThrow(
          "Invalid IPFS URL format",
        );
      }
    });

    it("should accept hash-only format for long enough strings", async () => {
      const longHash = "QmTestHash123456789012345678901234567890123456";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(["test"])),
      });

      await storage.download(longHash);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://gateway.example.com/ipfs/${longHash}`,
      );
    });
  });

  describe("Error Handling", () => {
    it("should preserve StorageError instances", async () => {
      const originalError = new StorageError(
        "Original error",
        "TEST_CODE",
        "ipfs",
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
          "IPFS upload error: Something went wrong",
        );
        expect((error as StorageError).code).toBe("UPLOAD_ERROR");
        expect((error as StorageError).provider).toBe("ipfs");
      }
    });

    it("should use correct error codes for different operations", async () => {
      const errorCases = [
        {
          operation: () => storage.upload(new Blob(["test"])),
          expectedCode: "UPLOAD_ERROR",
        },
        {
          operation: () => storage.download("ipfs://QmTest"),
          expectedCode: "DOWNLOAD_ERROR",
        },
      ];

      for (const errorCase of errorCases) {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

        try {
          await errorCase.operation();
        } catch (error) {
          expect(error).toBeInstanceOf(StorageError);
          expect((error as StorageError).code).toBe(errorCase.expectedCode);
          expect((error as StorageError).provider).toBe("ipfs");
        }
      }
    });
  });

  describe("Configuration Edge Cases", () => {
    it("should handle missing optional configurations gracefully", () => {
      const minimalConfig = { apiEndpoint: "https://api.example.com" };
      const minimalStorage = new IPFSStorage(minimalConfig);

      const config = minimalStorage.getConfig();
      expect(config.requiresAuth).toBe(false);
      expect(config.name).toBe("IPFS");
      expect(config.type).toBe("ipfs");
    });

    it("should prefer JWT over API key when both are provided", async () => {
      const dualConfig = {
        apiEndpoint: "https://api.example.com",
        apiKey: "test-api-key",
        jwt: "test-jwt-token",
      };
      const dualStorage = new IPFSStorage(dualConfig);

      const testFile = new Blob(["test"], { type: "text/plain" });
      const mockResponse = { Hash: "QmTest" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await dualStorage.upload(testFile);

      // Should use JWT, not API key
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: {
            Authorization: "Bearer test-jwt-token",
          },
        }),
      );
    });
  });
});
