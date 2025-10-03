import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateDataAgainstSchema,
  validateSchemaDefinition,
} from "../schemaValidation";
import type { Schema } from "@opendatalabs/vana-sdk/browser";

// Mock the SDK imports
vi.mock("@opendatalabs/vana-sdk/browser", () => ({
  validateDataAgainstSchema: vi.fn(),
  validateDataSchemaAgainstMetaSchema: vi.fn(),
  fetchWithFallbacks: vi.fn(),
}));

describe("schemaValidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateDataAgainstSchema", () => {
    it("should validate data against a schema successfully", async () => {
      const { validateDataAgainstSchema: sdkValidate } = await import(
        "@opendatalabs/vana-sdk/browser"
      );
      const { fetchWithFallbacks } = await import(
        "@opendatalabs/vana-sdk/browser"
      );

      const mockSchema: Schema = {
        id: 1,
        name: "Test Schema",
        dialect: "json",
        definitionUrl: "ipfs://QmTest",
      };

      const mockDefinition = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };

      vi.mocked(fetchWithFallbacks).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDefinition),
      } as any);

      vi.mocked(sdkValidate).mockImplementation(() => {});

      const result = await validateDataAgainstSchema(
        { name: "test" },
        mockSchema,
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should handle string data by parsing it", async () => {
      const { validateDataAgainstSchema: sdkValidate } = await import(
        "@opendatalabs/vana-sdk/browser"
      );
      const { fetchWithFallbacks } = await import(
        "@opendatalabs/vana-sdk/browser"
      );

      const mockSchema: Schema = {
        id: 1,
        name: "Test Schema",
        dialect: "json",
        definitionUrl: "ipfs://QmTest",
      };

      vi.mocked(fetchWithFallbacks).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ type: "object" }),
      } as any);

      vi.mocked(sdkValidate).mockImplementation(() => {});

      const result = await validateDataAgainstSchema(
        '{"name":"test"}',
        mockSchema,
      );

      expect(result.isValid).toBe(true);
    });

    it("should handle fetch errors", async () => {
      const { fetchWithFallbacks } = await import(
        "@opendatalabs/vana-sdk/browser"
      );

      const mockSchema: Schema = {
        id: 1,
        name: "Test Schema",
        dialect: "json",
        definitionUrl: "ipfs://QmTest",
      };

      vi.mocked(fetchWithFallbacks).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as any);

      const result = await validateDataAgainstSchema(
        { name: "test" },
        mockSchema,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Failed to fetch schema definition: 404 Not Found",
      );
    });

    it("should handle validation errors with AJV error details", async () => {
      const { validateDataAgainstSchema: sdkValidate } = await import(
        "@opendatalabs/vana-sdk/browser"
      );
      const { fetchWithFallbacks } = await import(
        "@opendatalabs/vana-sdk/browser"
      );

      const mockSchema: Schema = {
        id: 1,
        name: "Test Schema",
        dialect: "json",
        definitionUrl: "ipfs://QmTest",
      };

      vi.mocked(fetchWithFallbacks).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ type: "object" }),
      } as any);

      const ajvError = {
        errors: [
          {
            instancePath: "/name",
            message: "must be string",
          },
        ],
      };

      vi.mocked(sdkValidate).mockImplementation(() => {
        throw ajvError;
      });

      const result = await validateDataAgainstSchema({ name: 123 }, mockSchema);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("/name: must be string");
    });
  });

  describe("validateSchemaDefinition", () => {
    it("should validate a valid schema definition", () => {
      const result = validateSchemaDefinition(
        { type: "object" },
        "Test Schema",
        "json",
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should handle validation errors", async () => {
      const { validateDataSchemaAgainstMetaSchema } = await import(
        "@opendatalabs/vana-sdk/browser"
      );

      vi.mocked(validateDataSchemaAgainstMetaSchema).mockImplementation(() => {
        throw new Error("Invalid schema");
      });

      const result = validateSchemaDefinition({}, "Test Schema", "json");

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid schema");
    });

    it("should extract AJV error details from validation errors", async () => {
      const { validateDataSchemaAgainstMetaSchema } = await import(
        "@opendatalabs/vana-sdk/browser"
      );

      const ajvError = {
        errors: [
          {
            instancePath: "/schema",
            dataPath: "/schema",
            message: "must be object",
          },
        ],
      };

      vi.mocked(validateDataSchemaAgainstMetaSchema).mockImplementation(() => {
        throw ajvError;
      });

      const result = validateSchemaDefinition({}, "Test Schema", "json");

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("/schema: must be object");
    });

    it("should use dialect parameter", () => {
      const result = validateSchemaDefinition(
        "CREATE TABLE users (id INTEGER)",
        "Test Schema",
        "sqlite",
      );

      // Should not throw and should validate
      expect(result).toBeDefined();
    });
  });
});
