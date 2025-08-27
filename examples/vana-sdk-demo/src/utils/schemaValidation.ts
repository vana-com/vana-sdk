import {
  validateDataAgainstSchema as sdkValidateDataAgainstSchema,
  type DataSchema,
  type Schema,
  fetchWithFallbacks,
} from "@opendatalabs/vana-sdk/browser";

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

    // Fetch the schema definition from the URL (handles IPFS URLs)
    let fetchedSchema;
    try {
      const response = await fetchWithFallbacks(schema.definitionUrl);
      if (!response.ok) {
        return {
          isValid: false,
          errors: [
            `Failed to fetch schema definition: ${response.status} ${response.statusText}`,
          ],
        };
      }
      fetchedSchema = await response.json();
    } catch (error) {
      return {
        isValid: false,
        errors: [
          `Failed to fetch schema definition: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }

    // The fetched schema is already a DataSchema, use it directly
    // Only override dialect from on-chain if there's a mismatch
    const dataSchema: DataSchema = {
      ...fetchedSchema,
      dialect: schema.dialect, // Use on-chain dialect as authoritative
    };

    // Use SDK validation - this throws if invalid
    sdkValidateDataAgainstSchema(parsedData, dataSchema);

    return {
      isValid: true,
      errors: [],
    };
  } catch (error) {
    // Extract detailed error messages
    const errors: string[] = [];

    // Check if it's a SchemaValidationError with AJV errors
    if (error && typeof error === "object" && "errors" in error) {
      const ajvErrors = (error as any).errors;
      if (Array.isArray(ajvErrors) && ajvErrors.length > 0) {
        // Extract detailed validation errors from AJV
        for (const ajvError of ajvErrors) {
          const path = ajvError.instancePath ?? "root";
          const message = ajvError.message ?? "validation failed";
          errors.push(`${path}: ${message}`);
        }
      }
    }

    // Fall back to error message if no detailed errors
    if (errors.length === 0) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown validation error";
      errors.push(errorMessage);
    }

    return {
      isValid: false,
      errors,
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
