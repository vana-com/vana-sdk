import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import dataSchemaSchema from "../schemas/dataContract.schema.json";

/**
 * Data schema interface following the Vana schema specification
 */
export interface DataSchema {
  name: string;
  version: string;
  description?: string;
  dialect: "sqlite" | "json";
  dialectVersion?: string;
  schema: string | object;
}

/**
 * Error thrown when schema validation fails
 */
export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public errors: Array<{
      instancePath: string;
      schemaPath: string;
      keyword: string;
      params: Record<string, unknown>;
      message?: string;
    }>,
  ) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

/**
 * Schema validation utility class
 */
export class SchemaValidator {
  private ajv: Ajv;
  private dataSchemaValidator: ValidateFunction;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
    });

    // Add format validation (e.g., date, email, uri)
    addFormats(this.ajv);

    // Compile the data schema meta-schema validator
    this.dataSchemaValidator = this.ajv.compile(dataSchemaSchema);
  }

  /**
   * Validates a data schema against the Vana meta-schema
   *
   * @param schema - The data schema to validate
   * @returns true if valid
   * @throws SchemaValidationError if invalid
   *
   * @example
   * ```typescript
   * const validator = new SchemaValidator();
   *
   * const schema = {
   *   name: "User Profile",
   *   version: "1.0.0",
   *   dialect: "json",
   *   schema: {
   *     type: "object",
   *     properties: {
   *       name: { type: "string" },
   *       age: { type: "number" }
   *     }
   *   }
   * };
   *
   * validator.validateDataSchema(schema); // throws if invalid
   * ```
   */
  validateDataSchema(schema: unknown): asserts schema is DataSchema {
    const isValid = this.dataSchemaValidator(schema);

    if (!isValid) {
      const errors = this.dataSchemaValidator.errors || [];
      const errorMessage = `Data schema validation failed: ${errors.map((e) => `${e.instancePath} ${e.message}`).join(", ")}`;
      throw new SchemaValidationError(errorMessage, errors);
    }

    // Additional validation based on dialect
    const typedSchema = schema as DataSchema;
    if (
      typedSchema.dialect === "json" &&
      typeof typedSchema.schema === "object"
    ) {
      // Validate that the embedded JSON Schema is actually valid
      try {
        this.ajv.compile(typedSchema.schema);
      } catch (error) {
        const errorMessage = `Invalid JSON Schema in data schema: ${error instanceof Error ? error.message : "Unknown schema compilation error"}`;
        throw new SchemaValidationError(errorMessage, []);
      }
    } else if (
      typedSchema.dialect === "sqlite" &&
      typeof typedSchema.schema === "string"
    ) {
      // Validate SQLite DDL syntax
      this.validateSQLiteDDL(typedSchema.schema, typedSchema.dialectVersion);
    }
  }

  /**
   * Validates data against a JSON Schema from a data schema
   *
   * @param data - The data to validate
   * @param schema - The data schema containing the schema
   * @returns true if valid
   * @throws SchemaValidationError if invalid
   *
   * @example
   * ```typescript
   * const validator = new SchemaValidator();
   *
   * const schema = {
   *   name: "User Profile",
   *   version: "1.0.0",
   *   dialect: "json",
   *   schema: {
   *     type: "object",
   *     properties: {
   *       name: { type: "string" },
   *       age: { type: "number" }
   *     },
   *     required: ["name"]
   *   }
   * };
   *
   * const userData = { name: "Alice", age: 30 };
   * validator.validateDataAgainstSchema(userData, schema);
   * ```
   */
  validateDataAgainstSchema(data: unknown, schema: DataSchema): void {
    // First validate the schema itself
    this.validateDataSchema(schema);

    if (schema.dialect !== "json") {
      throw new SchemaValidationError(
        `Data validation only supported for JSON dialect, got: ${schema.dialect}`,
        [],
      );
    }

    if (typeof schema.schema !== "object") {
      throw new SchemaValidationError(
        "JSON dialect schemas must have an object schema",
        [],
      );
    }

    // Compile and validate against the data schema
    const dataValidator = this.ajv.compile(schema.schema);
    const isValid = dataValidator(data);

    if (!isValid) {
      const errors = dataValidator.errors || [];
      const errorMessage = `Data validation failed: ${errors.map((e) => `${e.instancePath} ${e.message}`).join(", ")}`;
      throw new SchemaValidationError(errorMessage, errors);
    }
  }

  /**
   * Validates a SQLite DDL string for basic syntax
   * Note: This is a basic validation, full SQL parsing would require a proper SQL parser
   *
   * @param ddl - The DDL string to validate
   * @param dialectVersion - Optional SQLite version (e.g., "3" for SQLite v3)
   * @returns true if basic validation passes
   * @throws SchemaValidationError if invalid
   */
  validateSQLiteDDL(ddl: string, dialectVersion?: string): void {
    if (typeof ddl !== "string" || ddl.trim().length === 0) {
      throw new SchemaValidationError(
        "SQLite DDL must be a non-empty string",
        [],
      );
    }

    // Validate dialectVersion if provided
    if (dialectVersion !== undefined) {
      const supportedVersions = ["3"];
      if (!supportedVersions.includes(dialectVersion)) {
        throw new SchemaValidationError(
          `Unsupported SQLite dialect version: ${dialectVersion}. Supported versions: ${supportedVersions.join(", ")}`,
          [],
        );
      }
    }

    // Basic validation - check for CREATE TABLE statements
    const normalizedDDL = ddl.trim().toUpperCase();
    if (!normalizedDDL.includes("CREATE TABLE")) {
      throw new SchemaValidationError(
        "SQLite DDL must contain at least one CREATE TABLE statement",
        [],
      );
    }

    // Check for balanced parentheses
    let parenCount = 0;
    for (const char of ddl) {
      if (char === "(") parenCount++;
      if (char === ")") parenCount--;
      if (parenCount < 0) {
        throw new SchemaValidationError(
          "SQLite DDL has unbalanced parentheses",
          [],
        );
      }
    }

    if (parenCount !== 0) {
      throw new SchemaValidationError(
        "SQLite DDL has unbalanced parentheses",
        [],
      );
    }
  }

  /**
   * Fetches and validates a schema from a URL
   *
   * @param url - The URL to fetch the schema from
   * @returns The validated data schema
   * @throws SchemaValidationError if invalid or fetch fails
   *
   * @example
   * ```typescript
   * const validator = new SchemaValidator();
   * const schema = await validator.fetchAndValidateSchema("https://example.com/schema.json");
   * ```
   */
  async fetchAndValidateSchema(url: string): Promise<DataSchema> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const schema = await response.json();
      this.validateDataSchema(schema);

      // Additional validation based on dialect
      if (schema.dialect === "sqlite" && typeof schema.schema === "string") {
        this.validateSQLiteDDL(schema.schema, schema.dialectVersion);
      }

      return schema;
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw error;
      }

      throw new SchemaValidationError(
        `Failed to fetch and validate schema from ${url}: ${error instanceof Error ? error.message : "Unknown error"}`,
        [],
      );
    }
  }
}

/**
 * Global schema validator instance
 */
export const schemaValidator = new SchemaValidator();

/**
 * Convenience function to validate a data schema
 *
 * @param schema - The data schema to validate
 * @returns true if valid
 * @throws SchemaValidationError if invalid
 */
export function validateDataSchema(
  schema: unknown,
): asserts schema is DataSchema {
  return schemaValidator.validateDataSchema(schema);
}

/**
 * Convenience function to validate data against a schema
 *
 * @param data - The data to validate
 * @param schema - The data schema containing the schema
 * @throws SchemaValidationError if invalid
 */
export function validateDataAgainstSchema(
  data: unknown,
  schema: DataSchema,
): void {
  return schemaValidator.validateDataAgainstSchema(data, schema);
}

/**
 * Convenience function to fetch and validate a schema from a URL
 *
 * @param url - The URL to fetch the schema from
 * @returns The validated data schema
 * @throws SchemaValidationError if invalid or fetch fails
 */
export function fetchAndValidateSchema(url: string): Promise<DataSchema> {
  return schemaValidator.fetchAndValidateSchema(url);
}
