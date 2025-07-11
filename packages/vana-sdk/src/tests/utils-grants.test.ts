import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import {
  createValidatedGrant,
  createAndStoreGrant,
  retrieveAndValidateGrant,
  checkGrantAccess,
  isGrantExpired,
  getGrantTimeRemaining,
  summarizeGrant,
} from "../utils/grants";
import { GrantValidationError } from "../utils/grantValidation";

// Mock the dependencies
vi.mock("../utils/grantFiles", () => ({
  createGrantFile: vi.fn(),
  storeGrantFile: vi.fn(),
  retrieveGrantFile: vi.fn(),
}));

vi.mock("../utils/grantValidation", () => ({
  validateGrant: vi.fn(),
  GrantValidationError: class extends Error {
    constructor(
      message: string,
      public details?: Record<string, unknown>,
    ) {
      super(message);
      this.name = "GrantValidationError";
    }
  },
}));

// Import the mocked functions
import {
  createGrantFile,
  storeGrantFile,
  retrieveGrantFile,
} from "../utils/grantFiles";
import { validateGrant } from "../utils/grantValidation";

describe("Grant Utilities", () => {
  const mockGrantFile = {
    grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    operation: "llm_inference",
    parameters: { prompt: "test" },
    expires: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  const mockParams = {
    to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    operation: "llm_inference",
    files: [1, 2, 3],
    parameters: { prompt: "test" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createValidatedGrant", () => {
    it("should create and validate a grant file", () => {
      (createGrantFile as Mock).mockReturnValue(mockGrantFile);
      (validateGrant as Mock).mockImplementation(() => {});

      const result = createValidatedGrant(mockParams);

      expect(createGrantFile).toHaveBeenCalledWith(mockParams);
      expect(validateGrant).toHaveBeenCalledWith(mockGrantFile, {
        grantee: mockParams.to,
        operation: mockParams.operation,
        schema: true,
      });
      expect(result).toEqual(mockGrantFile);
    });

    it("should throw GrantValidationError if validation fails", () => {
      (createGrantFile as Mock).mockReturnValue(mockGrantFile);
      (validateGrant as Mock).mockImplementation(() => {
        throw new Error("Validation failed");
      });

      expect(() => createValidatedGrant(mockParams)).toThrow(
        GrantValidationError,
      );
    });
  });

  describe("createAndStoreGrant", () => {
    it("should create, validate, and store a grant file", async () => {
      const mockUrl = "https://ipfs.io/ipfs/QmGrantFile123";

      (createGrantFile as Mock).mockReturnValue(mockGrantFile);
      (validateGrant as Mock).mockImplementation(() => {});
      (storeGrantFile as Mock).mockResolvedValue(mockUrl);

      const result = await createAndStoreGrant(
        mockParams,
        "https://relayer.test",
      );

      expect(storeGrantFile).toHaveBeenCalledWith(
        mockGrantFile,
        "https://relayer.test",
      );
      expect(result).toEqual({
        grantFile: mockGrantFile,
        grantUrl: mockUrl,
      });
    });
  });

  describe("retrieveAndValidateGrant", () => {
    it("should retrieve and return a grant file", async () => {
      const mockUrl = "https://ipfs.io/ipfs/QmGrantFile123";

      (retrieveGrantFile as Mock).mockResolvedValue(mockGrantFile);

      const result = await retrieveAndValidateGrant(
        mockUrl,
        "https://relayer.test",
      );

      expect(retrieveGrantFile).toHaveBeenCalledWith(
        mockUrl,
        "https://relayer.test",
      );
      expect(result).toEqual(mockGrantFile);
    });
  });

  describe("checkGrantAccess", () => {
    const mockUrl = "https://ipfs.io/ipfs/QmGrantFile123";
    const requestingAddress =
      "0x1234567890123456789012345678901234567890" as `0x${string}`;

    it("should return allowed: true for valid grant", async () => {
      (retrieveGrantFile as Mock).mockResolvedValue(mockGrantFile);
      (validateGrant as Mock).mockImplementation(() => {});

      const result = await checkGrantAccess(
        mockUrl,
        requestingAddress,
        "llm_inference",
        [1, 2, 3],
      );

      expect(result.allowed).toBe(true);
      expect(result.grantFile).toEqual(mockGrantFile);
      expect(result.reason).toBeUndefined();
    });

    it("should return allowed: false for invalid grant", async () => {
      (retrieveGrantFile as Mock).mockResolvedValue(mockGrantFile);
      (validateGrant as Mock).mockImplementation(() => {
        throw new GrantValidationError("Access denied");
      });

      const result = await checkGrantAccess(
        mockUrl,
        requestingAddress,
        "llm_inference",
        [1, 2, 3],
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Access denied");
      expect(result.grantFile).toBeUndefined();
    });

    it("should handle retrieval errors", async () => {
      (retrieveGrantFile as Mock).mockRejectedValue(new Error("Network error"));

      const result = await checkGrantAccess(
        mockUrl,
        requestingAddress,
        "llm_inference",
        [1, 2, 3],
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Grant access check failed");
    });
  });

  describe("isGrantExpired", () => {
    it("should return false for grant without expiration", () => {
      const grantWithoutExpiry = { ...mockGrantFile };
      delete (grantWithoutExpiry as any).expires;

      expect(isGrantExpired(grantWithoutExpiry)).toBe(false);
    });

    it("should return false for grant that hasn't expired", () => {
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const grantFile = { ...mockGrantFile, expires: futureExpiry };

      expect(isGrantExpired(grantFile)).toBe(false);
    });

    it("should return true for expired grant", () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const grantFile = { ...mockGrantFile, expires: pastExpiry };

      expect(isGrantExpired(grantFile)).toBe(true);
    });
  });

  describe("getGrantTimeRemaining", () => {
    it("should return null for grant without expiration", () => {
      const grantWithoutExpiry = { ...mockGrantFile };
      delete (grantWithoutExpiry as any).expires;

      expect(getGrantTimeRemaining(grantWithoutExpiry)).toBeNull();
    });

    it("should return positive number for grant that hasn't expired", () => {
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const grantFile = { ...mockGrantFile, expires: futureExpiry };

      const remaining = getGrantTimeRemaining(grantFile);
      expect(remaining).toBeGreaterThan(3500); // Should be close to 3600
      expect(remaining).toBeLessThanOrEqual(3600);
    });

    it("should return 0 for expired grant", () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const grantFile = { ...mockGrantFile, expires: pastExpiry };

      expect(getGrantTimeRemaining(grantFile)).toBe(0);
    });
  });

  describe("summarizeGrant", () => {
    it("should create a readable summary with expiration", () => {
      const summary = summarizeGrant(mockGrantFile);

      expect(summary).toContain("0x1234567890123456789012345678901234567890");
      expect(summary).toContain("llm_inference");
      expect(summary).toContain("expires:");
    });

    it("should handle grant without expiration", () => {
      const grantWithoutExpiry = { ...mockGrantFile };
      delete (grantWithoutExpiry as any).expires;

      const summary = summarizeGrant(grantWithoutExpiry);

      expect(summary).toContain("No expiration");
    });
  });
});
