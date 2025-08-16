import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SchemaValidator,
  SchemaValidationError,
  validateDataSchema,
  validateDataAgainstSchema,
  fetchAndValidateSchema,
  schemaValidator,
  type DataSchema,
} from "../utils/schemaValidation";

// Mock fetch for testing
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

    const error = new SchemaValidationError("Test error", errors);

    expect(error.name).toBe("SchemaValidationError");
    expect(error.message).toBe("Test error");
    expect(error.errors).toEqual(errors);
    expect(error).toBeInstanceOf(Error);
  });

  it("should create error with empty errors array", () => {
    const error = new SchemaValidationError("Test error", []);

    expect(error.name).toBe("SchemaValidationError");
    expect(error.message).toBe("Test error");
    expect(error.errors).toEqual([]);
  });
});

describe("SchemaValidator", () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe("constructor", () => {
    it("should initialize with correct configuration", () => {
      expect(validator).toBeInstanceOf(SchemaValidator);
      // Test that the validator is properly initialized by using it
      expect(() => validator.validateDataSchema({})).toThrow();
    });
  });

  describe("validateDataSchema", () => {
    it("should validate a correct JSON schema", () => {
      const validSchema = {
        name: "Test Schema",
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

      expect(() => validator.validateDataSchema(validSchema)).not.toThrow();
    });

    it("should validate a correct SQLite schema", () => {
      const validSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "sqlite",
        schema: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
      };

      expect(() => validator.validateDataSchema(validSchema)).not.toThrow();
    });

    it("should validate a schema with description", () => {
      const validSchema = {
        name: "Test Schema",
        version: "1.0.0",
        description: "A test schema",
        dialect: "json",
        schema: { type: "object" },
      };

      expect(() => validator.validateDataSchema(validSchema)).not.toThrow();
    });

    it("should validate a schema with dialectVersion", () => {
      const validSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "sqlite",
        dialectVersion: "3",
        schema: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
      };

      expect(() => validator.validateDataSchema(validSchema)).not.toThrow();
    });

    it("should throw error for missing required fields", () => {
      const invalidSchema = {
        name: "Test Schema",
        // missing version, dialect, schema
      };

      expect(() => validator.validateDataSchema(invalidSchema)).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for invalid dialect", () => {
      const invalidSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "invalid",
        schema: "some schema",
      };

      expect(() => validator.validateDataSchema(invalidSchema)).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for wrong schema type with json dialect", () => {
      const invalidSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json",
        schema: "should be object not string",
      };

      expect(() => validator.validateDataSchema(invalidSchema)).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for wrong schema type with sqlite dialect", () => {
      const invalidSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "sqlite",
        schema: { type: "object" },
      };

      expect(() => validator.validateDataSchema(invalidSchema)).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for invalid JSON schema", () => {
      const invalidSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json",
        schema: {
          type: "invalid-type",
        },
      };

      expect(() => validator.validateDataSchema(invalidSchema)).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for additional properties", () => {
      const invalidSchema = {
        name: "Test Schema",
        version: "1.0.0",
        dialect: "json",
        schema: { type: "object" },
        extraProperty: "not allowed",
      };

      expect(() => validator.validateDataSchema(invalidSchema)).toThrow(
        SchemaValidationError,
      );
    });
  });

  describe("validateDataAgainstSchema", () => {
    const validSchema: DataSchema = {
      name: "User Schema",
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

    it("should validate correct data against schema", () => {
      const validData = { name: "Alice", age: 30 };

      expect(() =>
        validator.validateDataAgainstSchema(validData, validSchema),
      ).not.toThrow();
    });

    it("should validate data without optional fields", () => {
      const validData = { name: "Bob" };

      expect(() =>
        validator.validateDataAgainstSchema(validData, validSchema),
      ).not.toThrow();
    });

    it("should throw error for missing required fields", () => {
      const invalidData = { age: 25 };

      expect(() =>
        validator.validateDataAgainstSchema(invalidData, validSchema),
      ).toThrow(SchemaValidationError);
    });

    it("should throw error for wrong data types", () => {
      const invalidData = { name: "Alice", age: "thirty" };

      expect(() =>
        validator.validateDataAgainstSchema(invalidData, validSchema),
      ).toThrow(SchemaValidationError);
    });

    it("should validate data against CompleteSchema from schemas.get()", () => {
      // This mimics what schemas.get() returns - a CompleteSchema with extra fields
      const completeSchema = {
        id: 19,
        name: "User Profile",
        dialect: "json" as const,
        definitionUrl: "ipfs://example",
        version: "1.0.0",
        schema: {
          type: "object",
          properties: {
            message: { type: "string", minLength: 20, maxLength: 100 },
          },
          required: ["message"],
          additionalProperties: false,
        },
      };

      const validData = {
        message: "This is a valid message that is long enough",
      };

      // This should NOT throw even though CompleteSchema has extra fields
      expect(() =>
        validator.validateDataAgainstSchema(validData, completeSchema),
      ).not.toThrow();
    });

    it("should throw error for non-json dialect", () => {
      const sqliteSchema: DataSchema = {
        name: "SQLite Schema",
        version: "1.0.0",
        dialect: "sqlite",
        schema: "CREATE TABLE users (id INTEGER PRIMARY KEY);",
      };

      const data = { name: "Alice" };

      expect(() =>
        validator.validateDataAgainstSchema(data, sqliteSchema),
      ).toThrow(SchemaValidationError);
    });

    it("should throw error for non-object schema", () => {
      const invalidSchema = {
        name: "Invalid Schema",
        version: "1.0.0",
        dialect: "json",
        schema: "not an object",
      } as DataSchema;

      const data = { name: "Alice" };

      expect(() =>
        validator.validateDataAgainstSchema(data, invalidSchema),
      ).toThrow(SchemaValidationError);
    });

    it("should first validate the schema itself", () => {
      const invalidSchema = {
        name: "Invalid Schema",
        version: "1.0.0",
        dialect: "invalid" as unknown as "json" | "sqlite",
        schema: { type: "object" },
      } as DataSchema;

      const data = { name: "Alice" };

      expect(() =>
        validator.validateDataAgainstSchema(data, invalidSchema),
      ).toThrow(SchemaValidationError);
    });
  });

  describe("validateSQLiteDDL", () => {
    it("should validate correct SQLite DDL", () => {
      const validDDL =
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);";

      expect(() => validator.validateSQLiteDDL(validDDL)).not.toThrow();
    });

    it("should validate DDL with multiple tables", () => {
      const validDDL = `
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT);
      `;

      expect(() => validator.validateSQLiteDDL(validDDL)).not.toThrow();
    });

    it("should validate DDL with dialect version", () => {
      const validDDL =
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);";

      expect(() => validator.validateSQLiteDDL(validDDL, "3")).not.toThrow();
    });

    it("should throw error for empty DDL", () => {
      expect(() => validator.validateSQLiteDDL("")).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for whitespace-only DDL", () => {
      expect(() => validator.validateSQLiteDDL("   \n  \t  ")).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for non-string DDL", () => {
      expect(() =>
        validator.validateSQLiteDDL(null as unknown as string),
      ).toThrow(SchemaValidationError);
    });

    it("should throw error for unsupported dialect version", () => {
      const validDDL =
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);";

      expect(() => validator.validateSQLiteDDL(validDDL, "2")).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for DDL without CREATE TABLE", () => {
      const invalidDDL = "INSERT INTO users VALUES (1, 'Alice');";

      expect(() => validator.validateSQLiteDDL(invalidDDL)).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for unbalanced parentheses (too many open)", () => {
      const invalidDDL =
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT;";

      expect(() => validator.validateSQLiteDDL(invalidDDL)).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for unbalanced parentheses (too many close)", () => {
      const invalidDDL =
        "CREATE TABLE users id INTEGER PRIMARY KEY, name TEXT);";

      expect(() => validator.validateSQLiteDDL(invalidDDL)).toThrow(
        SchemaValidationError,
      );
    });

    it("should throw error for unbalanced parentheses (close before open)", () => {
      const invalidDDL =
        "CREATE TABLE users )id INTEGER PRIMARY KEY, name TEXT(;";

      expect(() => validator.validateSQLiteDDL(invalidDDL)).toThrow(
        SchemaValidationError,
      );
    });

    it("should handle case insensitive CREATE TABLE", () => {
      const validDDL =
        "create table users (id integer primary key, name text);";

      expect(() => validator.validateSQLiteDDL(validDDL)).not.toThrow();
    });

    it("should handle mixed case CREATE TABLE", () => {
      const validDDL =
        "Create Table users (id INTEGER PRIMARY KEY, name TEXT);";

      expect(() => validator.validateSQLiteDDL(validDDL)).not.toThrow();
    });
  });

  describe("fetchAndValidateSchema", () => {
    beforeEach(() => {
      mockFetch.mockClear();
    });

    it("should fetch and validate a JSON schema", async () => {
      const validSchema = {
        name: "Remote Schema",
        version: "1.0.0",
        dialect: "json",
        schema: { type: "object" },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => validSchema,
      });

      const result = await validator.fetchAndValidateSchema(
        "https://example.com/schema.json",
      );

      expect(result).toEqual(validSchema);
      expect(mockFetch).toHaveBeenCalledWith("https://example.com/schema.json");
    });

    it("should fetch and validate a SQLite schema", async () => {
      const validSchema = {
        name: "Remote SQLite Schema",
        version: "1.0.0",
        dialect: "sqlite",
        schema: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => validSchema,
      });

      const result = await validator.fetchAndValidateSchema(
        "https://example.com/schema.json",
      );

      expect(result).toEqual(validSchema);
    });

    it("should throw error for HTTP error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        validator.fetchAndValidateSchema("https://example.com/schema.json"),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should throw error for network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        validator.fetchAndValidateSchema("https://example.com/schema.json"),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should throw error for invalid JSON response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      await expect(
        validator.fetchAndValidateSchema("https://example.com/schema.json"),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should throw error for invalid schema", async () => {
      const invalidSchema = {
        name: "Invalid Schema",
        version: "1.0.0",
        dialect: "invalid",
        schema: "some schema",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => invalidSchema,
      });

      await expect(
        validator.fetchAndValidateSchema("https://example.com/schema.json"),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should throw error for invalid SQLite DDL in fetched schema", async () => {
      const invalidSchema = {
        name: "Invalid SQLite Schema",
        version: "1.0.0",
        dialect: "sqlite",
        schema: "invalid ddl",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => invalidSchema,
      });

      await expect(
        validator.fetchAndValidateSchema("https://example.com/schema.json"),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should propagate SchemaValidationError from validation", async () => {
      const invalidSchema = {
        name: "Invalid Schema",
        // missing required fields
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => invalidSchema,
      });

      await expect(
        validator.fetchAndValidateSchema("https://example.com/schema.json"),
      ).rejects.toThrow(SchemaValidationError);
    });

    it("should handle unknown fetch errors", async () => {
      mockFetch.mockRejectedValueOnce("Unknown error");

      await expect(
        validator.fetchAndValidateSchema("https://example.com/schema.json"),
      ).rejects.toThrow(SchemaValidationError);
    });
  });
});

describe("Global schema validator", () => {
  it("should export a global schema validator instance", () => {
    expect(schemaValidator).toBeInstanceOf(SchemaValidator);
  });
});

describe("Convenience functions", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("validateDataSchema", () => {
    it("should validate a correct schema", () => {
      const validSchema = {
        name: "User Schema",
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

      expect(() => validateDataSchema(validSchema)).not.toThrow();
    });

    it("should throw error for invalid schema", () => {
      const invalidSchema = {
        name: "Invalid Schema",
        // missing required fields
      };

      expect(() => validateDataSchema(invalidSchema)).toThrow(
        SchemaValidationError,
      );
    });
  });

  describe("validateDataAgainstSchema", () => {
    const validSchema: DataSchema = {
      name: "User Schema",
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

    it("should validate correct data", () => {
      const validData = { name: "Alice", age: 30 };

      expect(() =>
        validateDataAgainstSchema(validData, validSchema),
      ).not.toThrow();
    });

    it("should throw error for invalid data", () => {
      const invalidData = { age: 30 }; // missing required name

      expect(() => validateDataAgainstSchema(invalidData, validSchema)).toThrow(
        SchemaValidationError,
      );
    });
  });

  describe("fetchAndValidateSchema", () => {
    it("should fetch and validate a schema", async () => {
      const validSchema = {
        name: "Remote Schema",
        version: "1.0.0",
        dialect: "json",
        schema: { type: "object" },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => validSchema,
      });

      const result = await fetchAndValidateSchema(
        "https://example.com/schema.json",
      );

      expect(result).toEqual(validSchema);
    });

    it("should throw error for fetch failures", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        fetchAndValidateSchema("https://example.com/schema.json"),
      ).rejects.toThrow(SchemaValidationError);
    });
  });
});
