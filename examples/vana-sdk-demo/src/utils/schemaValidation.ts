import {
  validateDataAgainstSchema as sdkValidateDataAgainstSchema,
  type DataSchema,
  type Schema,
} from "@opendatalabs/vana-sdk/browser-wasm";

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates data against a schema retrieved from the blockchain
 *
 * @param data - The data to validate (string or object)
 * @param schema - The schema object from the blockchain
 * @returns Validation result with success status and error messages
 */
export async function validateDataAgainstSchema(
  data: unknown,
  schema: Schema,
): Promise<ValidationResult> {
  try {
    // Parse the data if it's a string
    let parsedData: unknown;
    if (typeof data === "string") {
      try {
        parsedData = JSON.parse(data);
      } catch {
        // If parsing fails, treat as raw string data
        parsedData = data;
      }
    } else {
      parsedData = data;
    }

    // Fetch the schema definition from the URL
    const response = await fetch(schema.definitionUrl);
    if (!response.ok) {
      return {
        isValid: false,
        errors: [
          `Failed to fetch schema definition: ${response.status} ${response.statusText}`,
        ],
      };
    }

    const schemaDefinition = await response.json();

    // Convert to DataSchema format expected by SDK
    const dataSchema: DataSchema = {
      name: schema.name,
      version: "1.0.0", // Default version since it's not provided in Schema interface
      description: `Schema for ${schema.name}`,
      dialect: "json",
      schema: schemaDefinition as string | object,
    };

    // Use SDK validation
    sdkValidateDataAgainstSchema(parsedData, dataSchema);

    return {
      isValid: true,
      errors: [],
    };
  } catch (error) {
    // Extract error messages from SchemaValidationError or other errors
    const errorMessage =
      error instanceof Error ? error.message : "Unknown validation error";

    return {
      isValid: false,
      errors: [errorMessage],
    };
  }
}

/**
 * Validates raw schema definition as a DataSchema
 *
 * @param schemaDefinition - The raw schema definition object
 * @param name - The schema name
 * @param version - The schema version
 * @returns Validation result with success status and error messages
 */
export function validateSchemaDefinition(
  schemaDefinition: unknown,
  name: string,
  version: string = "1.0.0",
): ValidationResult {
  try {
    const dataSchema: DataSchema = {
      name,
      version,
      dialect: "json",
      schema: schemaDefinition as string | object,
    };

    // This will throw if invalid
    sdkValidateDataAgainstSchema({}, dataSchema);

    return {
      isValid: true,
      errors: [],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown validation error";

    return {
      isValid: false,
      errors: [errorMessage],
    };
  }
}
