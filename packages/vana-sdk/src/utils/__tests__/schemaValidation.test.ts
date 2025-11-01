/**
 * Tests for schema validation utilities
 *
 * @remarks
 * Tests data schema validation against Vana meta-schema, data validation against schemas,
 * SQLite DDL validation, and schema fetching from URLs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SchemaValidator,
  SchemaValidationError,
  validateDataSchemaAgainstMetaSchema,
  validateDataAgainstSchema,
  fetchAndValidateSchema,
  schemaValidator,
  type DataSchema,
} from "../schemaValidation";

// Mock the dataSchema.schema.json import
vi.mock("../../schemas/dataSchema.schema.json", () => ({
  default: {
    type: "object",
    required: ["name", "version", "dialect", "schema"],
    properties: {
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      dialect: { type: "string", enum: ["sqlite", "json"] },
      dialectVersion: { type: "string" },
      schema: { oneOf: [{ type: "string" }, { type: "object" }] },
    },
  },
}));

describe("schemaValidation", () => {
  describe("SchemaValidationError", () => {
    it("should create error with message and errors array", () => {
      const errors = [
        {
          instancePath: "/name",
          schemaPath: "#/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        },
      ];

      const error = new SchemaValidationError("Validation failed", errors);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("SchemaValidationError");
      expect(error.message).toBe("Validation failed");
      expect(error.errors).toEqual(errors);
    });

    it("should handle empty errors array", () => {
      const error = new SchemaValidationError("No specific errors", []);

      expect(error.errors).toEqual([]);
    });
  });

  describe("SchemaValidator", () => {
    let validator: SchemaValidator;

    beforeEach(() => {
      validator = new SchemaValidator();
    });

    describe("validateDataSchemaAgainstMetaSchema", () => {
      it("should validate valid JSON schema", () => {
        const schema = {
          name: "User Profile",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
            },
          },
        };

        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(schema);
        }).not.toThrow();
      });

      it("should validate JSON schema with optional description", () => {
        const schema = {
          name: "User Profile",
          version: "1.0.0",
          description: "A schema for user profiles",
          dialect: "json",
          schema: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        };

        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(schema);
        }).not.toThrow();
      });

      it("should validate valid SQLite schema", () => {
        const schema = {
          name: "User Table",
          version: "1.0.0",
          dialect: "sqlite",
          schema: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        };

        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(schema);
        }).not.toThrow();
      });

      it("should validate SQLite schema with dialectVersion", () => {
        const schema = {
          name: "User Table",
          version: "1.0.0",
          dialect: "sqlite",
          dialectVersion: "3",
          schema: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        };

        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(schema);
        }).not.toThrow();
      });

      it("should throw on missing required fields", () => {
        const invalidSchema = {
          name: "Incomplete",
          version: "1.0.0",
          // missing dialect and schema
        };

        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(invalidSchema);
        }).toThrow(SchemaValidationError);
      });

      it("should throw on invalid dialect", () => {
        const invalidSchema = {
          name: "Invalid",
          version: "1.0.0",
          dialect: "mongodb", // not allowed
          schema: "{}",
        };

        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(invalidSchema);
        }).toThrow(SchemaValidationError);
      });

      it("should throw on invalid JSON schema definition", () => {
        const invalidSchema = {
          name: "Invalid JSON Schema",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "invalid_type", // not a valid JSON Schema type
          },
        };

        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(invalidSchema);
        }).toThrow(SchemaValidationError);
      });

      it("should throw on invalid SQLite DDL", () => {
        const invalidSchema = {
          name: "Invalid SQLite",
          version: "1.0.0",
          dialect: "sqlite",
          schema: "INVALID SQL SYNTAX", // no CREATE TABLE
        };

        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(invalidSchema);
        }).toThrow(SchemaValidationError);
        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(invalidSchema);
        }).toThrow(/CREATE TABLE/);
      });

      // Note: The meta-schema uses if/then to conditionally validate schema type,
      // but Ajv may not enforce this as strictly as expected. These cases are
      // handled at runtime when using validateSQLiteDDL or validateDataAgainstSchema.

      it("should handle complex nested JSON schemas", () => {
        const schema = {
          name: "Complex Schema",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  contacts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        value: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        };

        expect(() => {
          validator.validateDataSchemaAgainstMetaSchema(schema);
        }).not.toThrow();
      });
    });

    describe("validateDataAgainstSchema", () => {
      it("should validate valid data against JSON schema", () => {
        const schema: DataSchema = {
          name: "User",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
            },
            required: ["name"],
          },
        };

        const validData = { name: "Alice", age: 30 };

        expect(() => {
          validator.validateDataAgainstSchema(validData, schema);
        }).not.toThrow();
      });

      it("should throw on invalid data against JSON schema", () => {
        const schema: DataSchema = {
          name: "User",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
            },
            required: ["name"],
          },
        };

        const invalidData = { age: 30 }; // missing required name

        expect(() => {
          validator.validateDataAgainstSchema(invalidData, schema);
        }).toThrow(SchemaValidationError);
        expect(() => {
          validator.validateDataAgainstSchema(invalidData, schema);
        }).toThrow(/Data validation failed/);
      });

      it("should skip validation for SQLite dialect", () => {
        const schema: DataSchema = {
          name: "User Table",
          version: "1.0.0",
          dialect: "sqlite",
          schema: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        };

        const consoleWarnSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {});

        const anyData = { random: "data" };

        expect(() => {
          validator.validateDataAgainstSchema(anyData, schema);
        }).not.toThrow();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Data validation skipped"),
        );

        consoleWarnSpy.mockRestore();
      });

      it("should throw if JSON schema is not an object", () => {
        const schema: DataSchema = {
          name: "Invalid",
          version: "1.0.0",
          dialect: "json",
          schema: "not an object" as never,
        };

        expect(() => {
          validator.validateDataAgainstSchema({}, schema);
        }).toThrow(SchemaValidationError);
        expect(() => {
          validator.validateDataAgainstSchema({}, schema);
        }).toThrow(/must have an object schema/);
      });

      it("should validate data with nested objects", () => {
        const schema: DataSchema = {
          name: "Nested",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        };

        const validData = { user: { name: "Alice" } };

        expect(() => {
          validator.validateDataAgainstSchema(validData, schema);
        }).not.toThrow();
      });

      it("should validate data with arrays", () => {
        const schema: DataSchema = {
          name: "Array Schema",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { type: "number" },
              },
            },
          },
        };

        const validData = { items: [1, 2, 3] };

        expect(() => {
          validator.validateDataAgainstSchema(validData, schema);
        }).not.toThrow();
      });

      it("should throw on array with wrong item types", () => {
        const schema: DataSchema = {
          name: "Array Schema",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { type: "number" },
              },
            },
          },
        };

        const invalidData = { items: [1, "two", 3] };

        expect(() => {
          validator.validateDataAgainstSchema(invalidData, schema);
        }).toThrow(SchemaValidationError);
      });

      it("should handle additional properties validation", () => {
        const schema: DataSchema = {
          name: "Strict Schema",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            additionalProperties: false,
          },
        };

        const invalidData = { name: "Alice", extra: "field" };

        expect(() => {
          validator.validateDataAgainstSchema(invalidData, schema);
        }).toThrow(SchemaValidationError);
      });
    });

    describe("validateSQLiteDDL", () => {
      it("should validate valid SQLite DDL", () => {
        const ddl = "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)";

        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).not.toThrow();
      });

      it("should validate DDL with multiple tables", () => {
        const ddl = `
          CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
          CREATE TABLE posts (id INTEGER, user_id INTEGER, content TEXT);
        `;

        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).not.toThrow();
      });

      it("should validate DDL with version 3", () => {
        const ddl = "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)";

        expect(() => {
          validator.validateSQLiteDDL(ddl, "3");
        }).not.toThrow();
      });

      it("should throw on empty DDL string", () => {
        expect(() => {
          validator.validateSQLiteDDL("");
        }).toThrow(SchemaValidationError);
        expect(() => {
          validator.validateSQLiteDDL("");
        }).toThrow(/non-empty string/);
      });

      it("should throw on whitespace-only DDL", () => {
        expect(() => {
          validator.validateSQLiteDDL("   \n\t  ");
        }).toThrow(SchemaValidationError);
      });

      it("should throw on non-string DDL", () => {
        expect(() => {
          validator.validateSQLiteDDL(123 as never);
        }).toThrow(SchemaValidationError);
      });

      it("should throw on DDL without CREATE TABLE", () => {
        const ddl = "SELECT * FROM users";

        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).toThrow(SchemaValidationError);
        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).toThrow(/CREATE TABLE/);
      });

      it("should throw on unsupported dialect version", () => {
        const ddl = "CREATE TABLE users (id INTEGER PRIMARY KEY)";

        expect(() => {
          validator.validateSQLiteDDL(ddl, "2");
        }).toThrow(SchemaValidationError);
        expect(() => {
          validator.validateSQLiteDDL(ddl, "2");
        }).toThrow(/Unsupported.*version/);
      });

      it("should throw on unbalanced opening parentheses", () => {
        const ddl = "CREATE TABLE users (id INTEGER PRIMARY KEY";

        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).toThrow(SchemaValidationError);
        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).toThrow(/unbalanced parentheses/);
      });

      it("should throw on unbalanced closing parentheses", () => {
        const ddl = "CREATE TABLE users id INTEGER PRIMARY KEY)";

        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).toThrow(SchemaValidationError);
        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).toThrow(/unbalanced parentheses/);
      });

      it("should throw on extra closing parentheses", () => {
        const ddl = "CREATE TABLE users (id INTEGER PRIMARY KEY))";

        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).toThrow(SchemaValidationError);
      });

      it("should handle case-insensitive CREATE TABLE", () => {
        const ddl = "create table users (id INTEGER PRIMARY KEY)";

        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).not.toThrow();
      });

      it("should handle mixed case", () => {
        const ddl = "CrEaTe TaBlE users (id INTEGER PRIMARY KEY)";

        expect(() => {
          validator.validateSQLiteDDL(ddl);
        }).not.toThrow();
      });
    });

    describe("fetchAndValidateSchema", () => {
      beforeEach(() => {
        vi.resetModules();
      });

      it("should fetch and validate valid schema from URL", async () => {
        const mockSchema = {
          name: "Remote Schema",
          version: "1.0.0",
          dialect: "json",
          schema: { type: "object" },
        };

        const mockUniversalFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockSchema),
        });

        vi.doMock("../download", () => ({
          universalFetch: mockUniversalFetch,
        }));

        const result = await validator.fetchAndValidateSchema(
          "https://example.com/schema.json",
        );

        expect(result).toEqual(mockSchema);
        expect(mockUniversalFetch).toHaveBeenCalledWith(
          "https://example.com/schema.json",
          undefined,
        );
      });

      it("should fetch with download relayer", async () => {
        const mockSchema = {
          name: "Remote Schema",
          version: "1.0.0",
          dialect: "json",
          schema: { type: "object" },
        };

        const mockRelayer = {
          proxyDownload: vi.fn(),
        };

        const mockUniversalFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockSchema),
        });

        vi.doMock("../download", () => ({
          universalFetch: mockUniversalFetch,
        }));

        await validator.fetchAndValidateSchema(
          "https://example.com/schema.json",
          mockRelayer,
        );

        expect(mockUniversalFetch).toHaveBeenCalledWith(
          "https://example.com/schema.json",
          mockRelayer,
        );
      });

      it("should throw on HTTP error", async () => {
        const mockUniversalFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
        });

        vi.doMock("../download", () => ({
          universalFetch: mockUniversalFetch,
        }));

        await expect(
          validator.fetchAndValidateSchema("https://example.com/missing.json"),
        ).rejects.toThrow(SchemaValidationError);
        await expect(
          validator.fetchAndValidateSchema("https://example.com/missing.json"),
        ).rejects.toThrow(/404/);
      });

      it("should throw on network error", async () => {
        const mockUniversalFetch = vi
          .fn()
          .mockRejectedValue(new Error("Network error"));

        vi.doMock("../download", () => ({
          universalFetch: mockUniversalFetch,
        }));

        await expect(
          validator.fetchAndValidateSchema("https://example.com/schema.json"),
        ).rejects.toThrow(SchemaValidationError);
        await expect(
          validator.fetchAndValidateSchema("https://example.com/schema.json"),
        ).rejects.toThrow(/Failed to fetch/);
      });

      it("should throw on invalid schema from URL", async () => {
        const invalidSchema = {
          name: "Invalid",
          // missing required fields
        };

        const mockUniversalFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(invalidSchema),
        });

        vi.doMock("../download", () => ({
          universalFetch: mockUniversalFetch,
        }));

        await expect(
          validator.fetchAndValidateSchema("https://example.com/invalid.json"),
        ).rejects.toThrow(SchemaValidationError);
      });

      it("should validate SQLite DDL after fetching", async () => {
        const sqliteSchema = {
          name: "SQLite Schema",
          version: "1.0.0",
          dialect: "sqlite",
          schema: "INVALID SQL", // no CREATE TABLE
        };

        const mockUniversalFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(sqliteSchema),
        });

        vi.doMock("../download", () => ({
          universalFetch: mockUniversalFetch,
        }));

        await expect(
          validator.fetchAndValidateSchema("https://example.com/sqlite.json"),
        ).rejects.toThrow(SchemaValidationError);
        await expect(
          validator.fetchAndValidateSchema("https://example.com/sqlite.json"),
        ).rejects.toThrow(/CREATE TABLE/);
      });
    });
  });

  describe("Convenience Functions", () => {
    describe("validateDataSchemaAgainstMetaSchema", () => {
      it("should validate and return valid schema", () => {
        const schema = {
          name: "Test",
          version: "1.0.0",
          dialect: "json",
          schema: { type: "object" },
        };

        const result = validateDataSchemaAgainstMetaSchema(schema);

        expect(result).toEqual(schema);
      });

      it("should throw on invalid schema", () => {
        const invalidSchema = { name: "Incomplete" };

        expect(() =>
          validateDataSchemaAgainstMetaSchema(invalidSchema),
        ).toThrow(SchemaValidationError);
      });
    });

    describe("validateDataAgainstSchema", () => {
      it("should validate data against schema", () => {
        const schema: DataSchema = {
          name: "Test",
          version: "1.0.0",
          dialect: "json",
          schema: { type: "object" },
        };

        expect(() => {
          validateDataAgainstSchema({}, schema);
        }).not.toThrow();
      });

      it("should throw on invalid data", () => {
        const schema: DataSchema = {
          name: "Test",
          version: "1.0.0",
          dialect: "json",
          schema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        };

        expect(() => {
          validateDataAgainstSchema({}, schema);
        }).toThrow(SchemaValidationError);
      });
    });

    describe("fetchAndValidateSchema", () => {
      it("should fetch and validate schema", async () => {
        const mockSchema = {
          name: "Remote",
          version: "1.0.0",
          dialect: "json",
          schema: { type: "object" },
        };

        const mockUniversalFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockSchema),
        });

        vi.doMock("../download", () => ({
          universalFetch: mockUniversalFetch,
        }));

        const result = await fetchAndValidateSchema(
          "https://example.com/schema.json",
        );

        expect(result).toEqual(mockSchema);
      });
    });
  });

  describe("Global Instance", () => {
    it("should provide global schemaValidator instance", () => {
      expect(schemaValidator).toBeInstanceOf(SchemaValidator);
    });

    it("should be reusable across multiple validations", () => {
      const schema1 = {
        name: "Schema 1",
        version: "1.0.0",
        dialect: "json",
        schema: { type: "object" },
      };

      const schema2 = {
        name: "Schema 2",
        version: "2.0.0",
        dialect: "json",
        schema: { type: "array" },
      };

      expect(() => {
        schemaValidator.validateDataSchemaAgainstMetaSchema(schema1);
      }).not.toThrow();
      expect(() => {
        schemaValidator.validateDataSchemaAgainstMetaSchema(schema2);
      }).not.toThrow();
    });
  });
});
