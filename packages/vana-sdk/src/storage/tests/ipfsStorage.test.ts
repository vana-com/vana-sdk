import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { IpfsStorage } from "../providers/ipfs";
import { StorageError } from "../index";

// Mock fetch globally
global.fetch = vi.fn();

describe("IpfsStorage", () => {
  let storage: IpfsStorage;
  let mockFetch: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure fetch mock exists and is properly reset
    if (!global.fetch) {
      global.fetch = vi.fn();
    }
    mockFetch = global.fetch as Mock;
    mockFetch.mockReset();

    storage = new IpfsStorage({
      apiEndpoint: "https://ipfs.infura.io:5001/api/v0/add",
      gatewayUrl: "https://ipfs.infura.io/ipfs",
      headers: {
        Authorization: "Basic dGVzdDp0ZXN0",
      },
    });
  });

  describe("Constructor", () => {
    it("should initialize with valid configuration", () => {
      expect(storage).toBeInstanceOf(IpfsStorage);
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

    it("should throw error when apiEndpoint is missing", () => {
      expect(
        () =>
          new IpfsStorage({
            apiEndpoint: "",
            gatewayUrl: "https://ipfs.infura.io/ipfs",
          }),
      ).toThrow(StorageError);
      expect(
        () =>
          new IpfsStorage({
            apiEndpoint: "",
            gatewayUrl: "https://ipfs.infura.io/ipfs",
          }),
      ).toThrow("IPFS API endpoint is required");
    });

    it("should work without gatewayUrl (should use default)", () => {
      const ipfsStorage = new IpfsStorage({
        apiEndpoint: "https://ipfs.infura.io:5001/api/v0/add",
      });
      expect(ipfsStorage).toBeInstanceOf(IpfsStorage);
    });

    it("should work without headers", () => {
      const ipfsStorage = new IpfsStorage({
        apiEndpoint: "https://ipfs.infura.io:5001/api/v0/add",
        gatewayUrl: "https://ipfs.infura.io/ipfs",
      });
      expect(ipfsStorage).toBeInstanceOf(IpfsStorage);
      expect(ipfsStorage.getConfig().requiresAuth).toBe(false);
    });
  });

  describe("Static Factory Methods", () => {
    describe("forInfura", () => {
      it("should create correctly configured instance for Infura", () => {
        const infuraStorage = IpfsStorage.forInfura({
          projectId: "test-project-id",
          projectSecret: "test-project-secret",
        });

        expect(infuraStorage).toBeInstanceOf(IpfsStorage);
        expect(infuraStorage.getConfig().requiresAuth).toBe(true);
      });

      it("should set correct authorization header for Infura", async () => {
        const testFile = new Blob(["test content"], { type: "text/plain" });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Hash: "QmTestHash123", Size: 12 }),
        });

        const infuraStorage = IpfsStorage.forInfura({
          projectId: "test-project-id",
          projectSecret: "test-project-secret",
        });

        await infuraStorage.upload(testFile);

        expect(mockFetch).toHaveBeenCalledWith(
          "https://ipfs.infura.io:5001/api/v0/add",
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: expect.stringContaining("Basic"),
            }),
          }),
        );
      });
    });

    describe("forLocalNode", () => {
      it("should create correctly configured instance for local node with defaults", () => {
        const localStorage = IpfsStorage.forLocalNode();

        expect(localStorage).toBeInstanceOf(IpfsStorage);
        expect(localStorage.getConfig().requiresAuth).toBe(false);
      });

      it("should create correctly configured instance for local node with custom URL", () => {
        const localStorage = IpfsStorage.forLocalNode({
          url: "http://192.168.1.100:5001",
        });

        expect(localStorage).toBeInstanceOf(IpfsStorage);
      });

      it("should use correct endpoints for local node", async () => {
        const testFile = new Blob(["test content"], { type: "text/plain" });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Hash: "QmTestHash123", Size: 12 }),
        });

        const localStorage = IpfsStorage.forLocalNode();
        await localStorage.upload(testFile);

        expect(mockFetch).toHaveBeenCalledWith(
          "http://localhost:5001/api/v0/add",
          expect.any(Object),
        );
      });
    });
  });

  describe("Upload", () => {
    it("should successfully upload a file", async () => {
      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = {
        Hash: "QmTestHash123",
        Size: 12,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile);

      expect(result.url).toContain("QmTestHash123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://ipfs.infura.io:5001/api/v0/add",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Basic dGVzdDp0ZXN0",
          }),
          body: expect.any(FormData),
        }),
      );
    });

    it("should upload file with custom name", async () => {
      const testFile = new Blob(["test content"], { type: "text/plain" });
      const mockResponse = {
        Hash: "QmTestHash456",
        Size: 12,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.upload(testFile, "custom.txt");

      expect(result.url).toContain("QmTestHash456");
    });

    it("should handle upload failures", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Invalid credentials"),
      });

      await expect(storage.upload(testFile)).rejects.toThrow(StorageError);
      await expect(storage.upload(testFile)).rejects.toThrow(
        "Failed to upload to IPFS",
      );
    });

    it("should handle missing hash in response", async () => {
      const testFile = new Blob(["test"], { type: "text/plain" });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Size: 12 }), // Missing Hash
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
        "https://ipfs.infura.io/ipfs/QmTestHash123",
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
        "https://ipfs.infura.io/ipfs/QmTestHash123",
      );

      expect(result).toBe(expectedBlob);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://ipfs.infura.io/ipfs/QmTestHash123",
      );
    });

    it("should successfully download from ipfs:// URL", async () => {
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
        "https://ipfs.infura.io/ipfs/QmTestHash123",
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
        "Failed to download from IPFS",
      );
    });

    it("should handle invalid CID format", async () => {
      await expect(storage.download("invalid-cid")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.download("invalid-cid")).rejects.toThrow(
        "Invalid IPFS CID or URL format",
      );
    });

    it("should handle network errors during download", async () => {
      mockFetch.mockRejectedValue(new Error("Connection timeout"));

      await expect(storage.download("QmTestHash123")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.download("QmTestHash123")).rejects.toThrow(
        "IPFS download error: Connection timeout",
      );
    });
  });

  describe("Unsupported Operations", () => {
    it("should throw NotSupportedError for list operation", async () => {
      await expect(storage.list()).rejects.toThrow(StorageError);
      await expect(storage.list()).rejects.toThrow(
        "List operation is not supported by standard IPFS",
      );
    });

    it("should throw NotSupportedError for delete operation", async () => {
      await expect(storage.delete("QmTestHash123")).rejects.toThrow(
        StorageError,
      );
      await expect(storage.delete("QmTestHash123")).rejects.toThrow(
        "Delete operation is not supported by IPFS",
      );
    });

    it("should have correct config features", () => {
      const config = storage.getConfig();
      expect(config.features.list).toBe(false);
      expect(config.features.delete).toBe(false);
      expect(config.features.upload).toBe(true);
      expect(config.features.download).toBe(true);
    });
  });
});
