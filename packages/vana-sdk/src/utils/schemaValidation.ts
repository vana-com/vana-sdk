import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import dataSchemaSchema from "../schemas/dataSchema.schema.json";
import type { Schema } from "../types/data";

/**
 * Data schema interface following the Vana schema specification
 *
 * @category Configuration
 */
export interface DataSchema {
  /** The name of the data schema */
  name: string;
  /** The version of the data schema */
  version: string;
  /** Optional description of the data schema */
  description?: string;
  /** The dialect type - either SQLite or JSON */
  dialect: "sqlite" | "json";
  /** Optional version of the dialect */
  dialectVersion?: string;
  /** The actual schema definition as string or object */
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
 * Data schema validation utility class
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
   * Validates a data schema definition against the Vana meta-schema
   *
   * @param schema - The data schema definition to validate
   * @throws SchemaValidationError if invalid
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
   * validator.validateDataSchemaAgainstMetaSchema(schema); // throws if invalid
   * ```
   */
  validateDataSchemaAgainstMetaSchema(
    schema: unknown,
  ): asserts schema is DataSchema {
    const isValid = this.dataSchemaValidator(schema);

    if (!isValid) {
      const errors = this.dataSchemaValidator.errors ?? [];
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
   * Validates data against a JSON Schema
   *
   * @param data - The data to validate
   * @param schema - The schema containing the validation rules (must have been validated or fetched from chain)
   * @throws SchemaValidationError if invalid
   * @example
   * ```typescript
   * const validator = new SchemaValidator();
   *
   * // Works with Schema from schemas.get()
   * const schema = await vana.schemas.get(1);
   * validator.validateDataAgainstSchema(userData, schema);
   *
   * // Also works with pre-validated DataSchema object
   * const dataSchema = validator.validateDataSchemaAgainstMetaSchema({
   *   name: "User Profile",
   *   version: "1.0.0",
   *   dialect: "json",
   *   schema: { type: "object", properties: { name: { type: "string" } } }
   * });
   * validator.validateDataAgainstSchema(userData, dataSchema);
   * ```
   */
  validateDataAgainstSchema(data: unknown, schema: DataSchema | Schema): void {
    if (schema.dialect !== "json") {
      console.warn(
        `[SchemaValidator] Data validation skipped: dialect '${schema.dialect}' does not support data validation. ` +
          `Only JSON schemas can validate data structure.`,
      );
      return;
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
      const errors = dataValidator.errors ?? [];
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
   * Fetches and validates a data schema from a URL
   *
   * @param url - The URL to fetch the data schema from
   * @param downloadRelayer - Optional download relayer for CORS bypass
   * @param downloadRelayer.proxyDownload - Function to proxy downloads through application server
   * @returns The validated data schema
   * @throws SchemaValidationError if invalid or fetch fails
   * @example
   * ```typescript
   * const validator = new SchemaValidator();
   * const schema = await validator.fetchAndValidateSchema("https://example.com/schema.json");
   * ```
   */
  async fetchAndValidateSchema(
    url: string,
    downloadRelayer?: { proxyDownload: (url: string) => Promise<Blob> },
  ): Promise<DataSchema> {
    try {
      const { universalFetch } = await import("./download");
      const response = await universalFetch(url, downloadRelayer);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const schema = await response.json();
      this.validateDataSchemaAgainstMetaSchema(schema);

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
 * Convenience function to validate a data schema definition against the Vana meta-schema
 *
 * @param schema - The data schema definition to validate
 * @returns The validated DataSchema
 * @throws SchemaValidationError if invalid
 * @example
 * ```typescript
 * const schemaDefinition = {
 *   name: "User Profile",
 *   version: "1.0.0",
 *   dialect: "json",
 *   schema: { type: "object", properties: { name: { type: "string" } } }
 * };
 *
 * const validatedSchema = validateDataSchemaAgainstMetaSchema(schemaDefinition);
 * ```
 */
export function validateDataSchemaAgainstMetaSchema(
  schema: unknown,
): DataSchema {
  const validator: SchemaValidator = schemaValidator;
  validator.validateDataSchemaAgainstMetaSchema(schema);
  // If we get here, schema is valid and typed as DataSchema
  return schema;
}

/**
 * Convenience function to validate data against a schema
 *
 * @param data - The data to validate
 * @param schema - The data schema containing the schema
 * @returns void - Function doesn't return a value
 * @throws SchemaValidationError if invalid
 */
export function validateDataAgainstSchema(
  data: unknown,
  schema: DataSchema | Schema,
): void {
  schemaValidator.validateDataAgainstSchema(data, schema);
}

/**
 * Convenience function to fetch and validate a data schema from a URL
 *
 * @param url - The URL to fetch the data schema from
 * @param downloadRelayer - Optional download relayer for CORS bypass
 * @param downloadRelayer.proxyDownload - Function to proxy downloads through application server
 * @returns The validated data schema
 * @throws SchemaValidationError if invalid or fetch fails
 */
export function fetchAndValidateSchema(
  url: string,
  downloadRelayer?: { proxyDownload: (url: string) => Promise<Blob> },
): Promise<DataSchema> {
  return schemaValidator.fetchAndValidateSchema(url, downloadRelayer);
}
