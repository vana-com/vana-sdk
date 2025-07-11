import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import dataContractSchema from "../schemas/dataContract.schema.json";

/**
 * Data contract interface following the Vana schema specification
 */
export interface DataContract {
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
  private dataContractValidator: ValidateFunction;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
    });

    // Add format validation (e.g., date, email, uri)
    addFormats(this.ajv);

    // Compile the data contract meta-schema validator
    this.dataContractValidator = this.ajv.compile(dataContractSchema);
  }

  /**
   * Validates a data contract against the Vana meta-schema
   *
   * @param contract - The data contract to validate
   * @returns true if valid
   * @throws SchemaValidationError if invalid
   *
   * @example
   * ```typescript
   * const validator = new SchemaValidator();
   *
   * const contract = {
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
   * validator.validateDataContract(contract); // throws if invalid
   * ```
   */
  validateDataContract(contract: unknown): asserts contract is DataContract {
    const isValid = this.dataContractValidator(contract);

    if (!isValid) {
      const errors = this.dataContractValidator.errors || [];
      const errorMessage = `Data contract validation failed: ${errors.map((e) => `${e.instancePath} ${e.message}`).join(", ")}`;
      throw new SchemaValidationError(errorMessage, errors);
    }
  }

  /**
   * Validates data against a JSON Schema from a data contract
   *
   * @param data - The data to validate
   * @param contract - The data contract containing the schema
   * @returns true if valid
   * @throws SchemaValidationError if invalid
   *
   * @example
   * ```typescript
   * const validator = new SchemaValidator();
   *
   * const contract = {
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
   * validator.validateDataAgainstContract(userData, contract);
   * ```
   */
  validateDataAgainstContract(data: unknown, contract: DataContract): void {
    // First validate the contract itself
    this.validateDataContract(contract);

    if (contract.dialect !== "json") {
      throw new SchemaValidationError(
        `Data validation only supported for JSON dialect, got: ${contract.dialect}`,
        [],
      );
    }

    if (typeof contract.schema !== "object") {
      throw new SchemaValidationError(
        "JSON dialect contracts must have an object schema",
        [],
      );
    }

    // Compile and validate against the data schema
    const dataValidator = this.ajv.compile(contract.schema);
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
   * @returns true if basic validation passes
   * @throws SchemaValidationError if invalid
   */
  validateSQLiteDDL(ddl: string): void {
    if (typeof ddl !== "string" || ddl.trim().length === 0) {
      throw new SchemaValidationError(
        "SQLite DDL must be a non-empty string",
        [],
      );
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
   * @returns The validated data contract
   * @throws SchemaValidationError if invalid or fetch fails
   *
   * @example
   * ```typescript
   * const validator = new SchemaValidator();
   * const contract = await validator.fetchAndValidateSchema("https://example.com/schema.json");
   * ```
   */
  async fetchAndValidateSchema(url: string): Promise<DataContract> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contract = await response.json();
      this.validateDataContract(contract);

      // Additional validation based on dialect
      if (
        contract.dialect === "sqlite" &&
        typeof contract.schema === "string"
      ) {
        this.validateSQLiteDDL(contract.schema);
      }

      return contract;
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
 * Convenience function to validate a data contract
 *
 * @param contract - The data contract to validate
 * @returns true if valid
 * @throws SchemaValidationError if invalid
 */
export function validateDataContract(
  contract: unknown,
): asserts contract is DataContract {
  return schemaValidator.validateDataContract(contract);
}

/**
 * Convenience function to validate data against a contract
 *
 * @param data - The data to validate
 * @param contract - The data contract containing the schema
 * @throws SchemaValidationError if invalid
 */
export function validateDataAgainstContract(
  data: unknown,
  contract: DataContract,
): void {
  return schemaValidator.validateDataAgainstContract(data, contract);
}

/**
 * Convenience function to fetch and validate a schema from a URL
 *
 * @param url - The URL to fetch the schema from
 * @returns The validated data contract
 * @throws SchemaValidationError if invalid or fetch fails
 */
export function fetchAndValidateSchema(url: string): Promise<DataContract> {
  return schemaValidator.fetchAndValidateSchema(url);
}
