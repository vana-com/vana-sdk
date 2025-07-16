import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { GoogleDriveStorage, GoogleDriveConfig } from "./google-drive";

// Mock fetch globally
global.fetch = vi.fn();

describe("GoogleDriveStorage - Folder Management", () => {
  let storage: GoogleDriveStorage;
  let mockConfig: GoogleDriveConfig;
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
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      folderId: "test-folder-id",
    };

    storage = new GoogleDriveStorage(mockConfig);
  });

  describe("findFolder", () => {
    it("should find an existing folder and return its ID", async () => {
      const mockResponse = {
        files: [
          {
            id: "found-folder-id",
            name: "screenshots",
            mimeType: "application/vnd.google-apps.folder",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.findFolder(
        "screenshots",
        "parent-folder-id",
      );

      expect(result).toBe("found-folder-id");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://www.googleapis.com/drive/v3/files"),
        expect.objectContaining({
          headers: {
            Authorization: "Bearer test-access-token",
          },
        }),
      );

      // Verify the query parameters
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("q=");
      expect(calledUrl).toContain("name%3D%27screenshots%27");
      expect(calledUrl).toContain("parent-folder-id");
      expect(calledUrl).toContain("application%2Fvnd.google-apps.folder");
    });

    it("should return null when folder is not found", async () => {
      const mockResponse = {
        files: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.findFolder(
        "nonexistent-folder",
        "parent-folder-id",
      );

      expect(result).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://www.googleapis.com/drive/v3/files"),
        expect.objectContaining({
          headers: {
            Authorization: "Bearer test-access-token",
          },
        }),
      );
    });
  });

  describe("createFolder", () => {
    it("should create a new folder and return its ID", async () => {
      const mockResponse = {
        id: "new-folder-id",
        name: "roasts",
        mimeType: "application/vnd.google-apps.folder",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await storage.createFolder("roasts", "parent-folder-id");

      expect(result).toBe("new-folder-id");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/drive/v3/files",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-access-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "roasts",
            mimeType: "application/vnd.google-apps.folder",
            parents: ["parent-folder-id"],
          }),
        }),
      );
    });
  });

  describe("findOrCreateFolder", () => {
    it("should return existing folder ID when folder exists", async () => {
      const mockFindResponse = {
        files: [
          {
            id: "existing-folder-id",
            name: "screenshots",
            mimeType: "application/vnd.google-apps.folder",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFindResponse),
      });

      const result = await storage.findOrCreateFolder(
        "screenshots",
        "parent-folder-id",
      );

      expect(result).toBe("existing-folder-id");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should create and return new folder ID when folder does not exist", async () => {
      const mockFindResponse = {
        files: [],
      };

      const mockCreateResponse = {
        id: "new-folder-id",
        name: "roasts",
        mimeType: "application/vnd.google-apps.folder",
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockFindResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCreateResponse),
        });

      const result = await storage.findOrCreateFolder(
        "roasts",
        "parent-folder-id",
      );

      expect(result).toBe("new-folder-id");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
