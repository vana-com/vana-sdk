/**
 * Tests for grant file utilities
 *
 * @remarks
 * Tests grant file creation, storage, retrieval, hashing, and validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createGrantFile,
  storeGrantFile,
  retrieveGrantFile,
  getGrantFileHash,
  validateGrantFile,
} from "../grantFiles";
import type { GrantPermissionParams, GrantFile } from "../../types/permissions";
import { NetworkError } from "../../errors";

// Mock the download utility
vi.mock("../download", () => ({
  universalFetch: vi.fn(),
}));

describe("grantFiles", () => {
  describe("createGrantFile", () => {
    it("should create basic grant file", () => {
      const params: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [],
        parameters: { model: "gpt-4" },
      };

      const grant = createGrantFile(params);

      expect(grant).toEqual({
        grantee: params.grantee,
        operation: params.operation,
        parameters: { model: "gpt-4" },
      });
    });

    it("should include expiration when provided", () => {
      const params: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        files: [],
        parameters: {},
        expiresAt: 1234567890,
      };

      const grant = createGrantFile(params);

      expect(grant.expires).toBe(1234567890);
    });

    it("should include filters in parameters when provided", () => {
      const params: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        files: [],
        parameters: { version: "1.0" },
        filters: { category: "documents" },
      };

      const grant = createGrantFile(params);

      expect(grant.parameters.filters).toEqual({ category: "documents" });
    });

    it("should create independent copy of parameters", () => {
      const originalParams = { model: "gpt-4" };
      const params: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [],
        parameters: originalParams,
      };

      const grant = createGrantFile(params);

      // Modify original
      originalParams.model = "gpt-3";

      // Grant should have original value
      expect(grant.parameters.model).toBe("gpt-4");
    });

    it("should handle empty parameters", () => {
      const params: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        files: [],
        parameters: {},
      };

      const grant = createGrantFile(params);

      expect(grant.parameters).toEqual({});
    });

    it("should handle complex nested parameters", () => {
      const params: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "compute",
        files: [],
        parameters: {
          config: {
            model: "gpt-4",
            settings: {
              temperature: 0.7,
              maxTokens: 1000,
            },
          },
          metadata: ["tag1", "tag2"],
        },
      };

      const grant = createGrantFile(params);

      expect(grant.parameters).toEqual(params.parameters);
    });

    it("should not include expires when not provided", () => {
      const params: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        files: [],
        parameters: {},
      };

      const grant = createGrantFile(params);

      expect(grant).not.toHaveProperty("expires");
    });

    it("should not include filters when not provided", () => {
      const params: GrantPermissionParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        files: [],
        parameters: { version: "1.0" },
      };

      const grant = createGrantFile(params);

      expect(grant.parameters).not.toHaveProperty("filters");
    });
  });

  describe("storeGrantFile", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
      global.FormData = class FormData {
        private data: Map<string, { value: Blob | string; filename?: string }> =
          new Map();
        append(name: string, value: Blob | string, filename?: string) {
          this.data.set(name, { value, filename });
        }
        get(name: string) {
          return this.data.get(name)?.value;
        }
      } as never;
      global.Blob = class Blob {
        constructor(
          public parts: BlobPart[],
          public options?: BlobPropertyBag,
        ) {}
      } as never;
    });

    it("should store grant file successfully", async () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      const mockResponse = {
        success: true,
        url: "ipfs://QmTest123",
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const url = await storeGrantFile(
        grantFile,
        "https://relayer.example.com",
      );

      expect(url).toBe("ipfs://QmTest123");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://relayer.example.com/api/ipfs/upload",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        }),
      );
    });

    it("should throw NetworkError on HTTP error", async () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        storeGrantFile(grantFile, "https://relayer.example.com"),
      ).rejects.toThrow(NetworkError);
      await expect(
        storeGrantFile(grantFile, "https://relayer.example.com"),
      ).rejects.toThrow(/Failed to store grant file: Not Found/);
    });

    it("should throw on unsuccessful upload", async () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, error: "Upload failed" }),
      });

      await expect(
        storeGrantFile(grantFile, "https://relayer.example.com"),
      ).rejects.toThrow(NetworkError);
      await expect(
        storeGrantFile(grantFile, "https://relayer.example.com"),
      ).rejects.toThrow(/Upload failed/);
    });

    it("should throw when no URL returned", async () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }), // no url
      });

      await expect(
        storeGrantFile(grantFile, "https://relayer.example.com"),
      ).rejects.toThrow(NetworkError);
      await expect(
        storeGrantFile(grantFile, "https://relayer.example.com"),
      ).rejects.toThrow(/no URL was returned/);
    });

    it("should throw NetworkError on network failure", async () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network failure"),
      );

      await expect(
        storeGrantFile(grantFile, "https://relayer.example.com"),
      ).rejects.toThrow(NetworkError);
      await expect(
        storeGrantFile(grantFile, "https://relayer.example.com"),
      ).rejects.toThrow(/Network error/);
    });

    it("should format grant file as JSON", async () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: { test: "value" },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, url: "ipfs://test" }),
      });

      await storeGrantFile(grantFile, "https://relayer.example.com");

      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const formData = call.body as unknown as FormData;
      const blob = formData.get("file") as unknown as Blob & {
        parts: BlobPart[];
      };

      expect(blob).toBeDefined();
      expect(blob.parts[0]).toContain(grantFile.grantee);
      expect(blob.parts[0]).toContain(grantFile.operation);
    });
  });

  describe("retrieveGrantFile", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should retrieve grant file successfully", async () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      const { universalFetch } = await import("../download");
      (universalFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(grantFile),
      });

      const result = await retrieveGrantFile("ipfs://QmTest123");

      expect(result).toEqual(grantFile);
      expect(universalFetch).toHaveBeenCalledWith(
        "ipfs://QmTest123",
        undefined,
      );
    });

    it("should pass download relayer", async () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      const mockRelayer = { proxyDownload: vi.fn() };

      const { universalFetch } = await import("../download");
      (universalFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(grantFile),
      });

      await retrieveGrantFile("ipfs://QmTest123", undefined, mockRelayer);

      expect(universalFetch).toHaveBeenCalledWith(
        "ipfs://QmTest123",
        mockRelayer,
      );
    });

    it("should warn on HTTP gateway URL", async () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const { universalFetch } = await import("../download");
      (universalFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(grantFile),
      });

      await retrieveGrantFile("https://ipfs.io/ipfs/QmTest123");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("HTTP gateway format"),
      );

      consoleWarnSpy.mockRestore();
    });

    it("should throw NetworkError on HTTP error", async () => {
      const { universalFetch } = await import("../download");
      (universalFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(retrieveGrantFile("ipfs://QmTest123")).rejects.toThrow(
        NetworkError,
      );
      await expect(retrieveGrantFile("ipfs://QmTest123")).rejects.toThrow(
        /404/,
      );
    });

    it("should throw on invalid JSON", async () => {
      const { universalFetch } = await import("../download");
      (universalFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => "invalid json{",
      });

      await expect(retrieveGrantFile("ipfs://QmTest123")).rejects.toThrow(
        NetworkError,
      );
    });

    it("should throw on invalid grant file format", async () => {
      const invalidGrant = { invalid: "format" };

      const { universalFetch } = await import("../download");
      (universalFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(invalidGrant),
      });

      await expect(retrieveGrantFile("ipfs://QmTest123")).rejects.toThrow(
        NetworkError,
      );
      await expect(retrieveGrantFile("ipfs://QmTest123")).rejects.toThrow(
        /Invalid grant file format/,
      );
    });

    it("should throw NetworkError on network failure", async () => {
      const { universalFetch } = await import("../download");
      (universalFetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network failure"),
      );

      await expect(retrieveGrantFile("ipfs://QmTest123")).rejects.toThrow(
        NetworkError,
      );
    });
  });

  describe("getGrantFileHash", () => {
    it("should generate hash for grant file", () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const hash = getGrantFileHash(grantFile);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(consoleInfoSpy).toHaveBeenCalled();

      consoleInfoSpy.mockRestore();
    });

    it("should generate same hash for same grant file", () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: { model: "gpt-4" },
      };

      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const hash1 = getGrantFileHash(grantFile);
      const hash2 = getGrantFileHash(grantFile);

      expect(hash1).toBe(hash2);

      consoleInfoSpy.mockRestore();
    });

    it("should generate same hash regardless of property order", () => {
      const grantFile1: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: { a: "1", b: "2" },
      };

      const grantFile2: GrantFile = {
        operation: "read",
        parameters: { b: "2", a: "1" },
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      };

      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const hash1 = getGrantFileHash(grantFile1);
      const hash2 = getGrantFileHash(grantFile2);

      expect(hash1).toBe(hash2);

      consoleInfoSpy.mockRestore();
    });

    it("should generate different hash for different grant files", () => {
      const grantFile1: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      const grantFile2: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "write",
        parameters: {},
      };

      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const hash1 = getGrantFileHash(grantFile1);
      const hash2 = getGrantFileHash(grantFile2);

      expect(hash1).not.toBe(hash2);

      consoleInfoSpy.mockRestore();
    });

    it("should include expires in hash when present", () => {
      const grantFile1: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {},
      };

      const grantFile2: GrantFile = {
        ...grantFile1,
        expires: 1234567890,
      };

      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const hash1 = getGrantFileHash(grantFile1);
      const hash2 = getGrantFileHash(grantFile2);

      expect(hash1).not.toBe(hash2);

      consoleInfoSpy.mockRestore();
    });

    it("should handle nested objects in parameters", () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "compute",
        parameters: {
          config: {
            model: "gpt-4",
            settings: {
              temperature: 0.7,
            },
          },
        },
      };

      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const hash = getGrantFileHash(grantFile);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      consoleInfoSpy.mockRestore();
    });

    it("should handle arrays in parameters", () => {
      const grantFile: GrantFile = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "read",
        parameters: {
          tags: ["tag1", "tag2", "tag3"],
        },
      };

      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const hash = getGrantFileHash(grantFile);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      consoleInfoSpy.mockRestore();
    });
  });

  describe("validateGrantFile", () => {
    it("should validate valid grant file", () => {
      const grantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        parameters: {},
      };

      expect(validateGrantFile(grantFile)).toBe(true);
    });

    it("should reject non-object", () => {
      expect(validateGrantFile(null)).toBe(false);
      expect(validateGrantFile(undefined)).toBe(false);
      expect(validateGrantFile("string")).toBe(false);
      expect(validateGrantFile(123)).toBe(false);
      expect(validateGrantFile([])).toBe(false);
    });

    it("should reject missing grantee", () => {
      const invalid = {
        operation: "read",
        parameters: {},
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject invalid grantee format", () => {
      const invalid = {
        grantee: "not-an-address",
        operation: "read",
        parameters: {},
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject non-string grantee", () => {
      const invalid = {
        grantee: 123,
        operation: "read",
        parameters: {},
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject missing operation", () => {
      const invalid = {
        grantee: "0x1234567890123456789012345678901234567890",
        parameters: {},
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject empty operation", () => {
      const invalid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "",
        parameters: {},
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject non-string operation", () => {
      const invalid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: 123,
        parameters: {},
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject missing parameters", () => {
      const invalid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject non-object parameters", () => {
      const invalid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        parameters: "not-an-object",
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should accept valid expires", () => {
      const valid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        parameters: {},
        expires: 1234567890,
      };

      expect(validateGrantFile(valid)).toBe(true);
    });

    it("should reject negative expires", () => {
      const invalid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        parameters: {},
        expires: -100,
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject non-integer expires", () => {
      const invalid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        parameters: {},
        expires: 123.45,
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject non-number expires", () => {
      const invalid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        parameters: {},
        expires: "not-a-number",
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should accept checksummed address", () => {
      const valid = {
        grantee: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
        operation: "read",
        parameters: {},
      };

      expect(validateGrantFile(valid)).toBe(true);
    });

    it("should accept lowercase address", () => {
      const valid = {
        grantee: "0xabcdef1234567890abcdef1234567890abcdef12",
        operation: "read",
        parameters: {},
      };

      expect(validateGrantFile(valid)).toBe(true);
    });

    it("should reject address without 0x prefix", () => {
      const invalid = {
        grantee: "1234567890123456789012345678901234567890",
        operation: "read",
        parameters: {},
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should reject address with wrong length", () => {
      const invalid = {
        grantee: "0x1234", // too short
        operation: "read",
        parameters: {},
      };

      expect(validateGrantFile(invalid)).toBe(false);
    });

    it("should accept complex parameters", () => {
      const valid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "compute",
        parameters: {
          config: { model: "gpt-4" },
          tags: ["tag1", "tag2"],
          metadata: { version: "1.0" },
        },
      };

      expect(validateGrantFile(valid)).toBe(true);
    });

    it("should accept grant file without expires", () => {
      const valid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        parameters: {},
      };

      expect(validateGrantFile(valid)).toBe(true);
    });

    it("should accept zero expires", () => {
      const valid = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "read",
        parameters: {},
        expires: 0,
      };

      expect(validateGrantFile(valid)).toBe(true);
    });
  });
});
