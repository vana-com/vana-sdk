import { Address } from "viem";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { GrantFile } from "../types/permissions";
import grantFileSchema from "../schemas/grantFile.schema.json";

/**
 * Base error class for grant validation failures
 *
 * @category Permissions
 */
export class GrantValidationError extends Error {
  constructor(
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GrantValidationError";
  }
}

/**
 * Error thrown when a grant has expired
 *
 * @category Permissions
 */
export class GrantExpiredError extends GrantValidationError {
  constructor(
    message: string,
    public expires: number,
    public currentTime: number,
  ) {
    super(message, { expires, currentTime });
    this.name = "GrantExpiredError";
  }
}

/**
 * Error thrown when grantee doesn't match requesting address
 *
 * @category Permissions
 */
export class GranteeMismatchError extends GrantValidationError {
  constructor(
    message: string,
    public grantee: Address,
    public requestingAddress: Address,
  ) {
    super(message, { grantee, requestingAddress });
    this.name = "GranteeMismatchError";
  }
}

/**
 * Error thrown when operation is not allowed by grant
 *
 * @category Permissions
 */
export class OperationNotAllowedError extends GrantValidationError {
  constructor(
    message: string,
    public grantedOperation: string,
    public requestedOperation: string,
  ) {
    super(message, { grantedOperation, requestedOperation });
    this.name = "OperationNotAllowedError";
  }
}

/**
 * Error thrown when grant file structure is invalid
 *
 * @category Permissions
 */
export class GrantSchemaError extends GrantValidationError {
  constructor(
    message: string,
    public schemaErrors: unknown[],
    public invalidData: unknown,
  ) {
    super(message, { errors: schemaErrors, data: invalidData });
    this.name = "GrantSchemaError";
  }
}

/**
 * Ajv instance for grant file validation with draft 2020-12 support
 */
const ajv = new Ajv({
  strict: true,
  removeAdditional: false,
  useDefaults: false,
  coerceTypes: false,
});

// Add format validators (email, date, etc.)
addFormats(ajv);

/**
 * Compiled grant file schema validator
 */
const validateGrantFileSchema: ValidateFunction = ajv.compile(grantFileSchema);

/**
 * Options for grant validation
 *
 * @category Permissions
 */
export interface GrantValidationOptions {
  /** Enable JSON schema validation (default: true) */
  schema?: boolean;
  /** Grantee address to validate access for */
  grantee?: Address;
  /** Operation to validate permission for */
  operation?: string;
  /** Override current time for expiry checking (Unix timestamp) */
  currentTime?: number;
  /** Return detailed results instead of throwing (default: false) */
  throwOnError?: boolean;
}

/**
 * Detailed validation result
 *
 * @category Permissions
 */
export interface GrantValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors encountered */
  errors: Array<{
    type: "schema" | "business";
    field?: string;
    message: string;
    error?: Error;
  }>;
  /** The validated grant file (if validation passed) */
  grant?: GrantFile;
}

/**
 * Validates a grant file with comprehensive schema and business rule checking.
 *
 * This function provides flexible validation with TypeScript overloads:
 * - When `throwOnError` is false (or `{ throwOnError: false }`), returns a detailed validation result
 * - When `throwOnError` is true (default), throws specific errors or returns the validated grant
 *
 * @param data - The grant file data to validate (unknown type for safety)
 * @param options - Validation options including grantee, operation, files, etc.
 * @returns Either a GrantFile (when throwing) or GrantValidationResult (when not throwing)
 * @throws {GrantSchemaError} When the grant file structure is invalid
 * @throws {GrantExpiredError} When the grant has expired
 * @throws {GranteeMismatchError} When the grantee doesn't match the requesting address
 * @throws {OperationNotAllowedError} When the requested operation is not allowed
 * @example
 * ```typescript
 * // Throwing mode (default) - returns GrantFile or throws
 * const grant = validateGrant(data, {
 *   grantee: '0x123...',
 *   operation: 'llm_inference',
 * });
 *
 * // Non-throwing mode - returns validation result
 * const result = validateGrant(data, {
 *   grantee: '0x123...',
 *   throwOnError: false
 * });
 * if (result.valid) {
 *   console.log('Grant is valid:', result.grant);
 * } else {
 *   console.log('Validation errors:', result.errors);
 * }
 * ```
 */

export function validateGrant(
  data: unknown,
  options: GrantValidationOptions & { throwOnError: false },
): GrantValidationResult;

export function validateGrant(
  data: unknown,
  options?:
    | Omit<GrantValidationOptions, "throwOnError">
    | (GrantValidationOptions & { throwOnError?: true }),
): GrantFile;

/**
 * Implementation function for grant validation with flexible return types
 *
 * @param data - The grant file data to validate
 * @param options - Validation configuration options
 * @returns Either a GrantFile or GrantValidationResult depending on throwOnError setting
 */
export function validateGrant(
  data: unknown,
  options: GrantValidationOptions = {},
): GrantFile | GrantValidationResult {
  const {
    schema = true,
    grantee,
    operation,
    currentTime,
    throwOnError = true,
  } = options;

  const errors: GrantValidationResult["errors"] = [];
  let grant: GrantFile | undefined;

  // 1. Schema Validation
  if (schema) {
    try {
      if (validateGrantFileSchema(data)) {
        grant = data as GrantFile;
      } else {
        throw new GrantValidationError("Invalid grant file schema");
      }
    } catch (error) {
      if (error instanceof GrantValidationError) {
        const schemaError = new GrantSchemaError(
          error.message,
          Array.isArray(error.details?.errors) ? error.details.errors : [],
          data,
        );
        errors.push({
          type: "schema",
          message: error.message,
          error: schemaError,
        });
      } else {
        errors.push({
          type: "schema",
          message: `Schema validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          error: error instanceof Error ? error : new Error("Unknown error"),
        });
      }
    }
  } else {
    // Minimal type assertion if schema validation is skipped
    grant = data as GrantFile;
  }

  // 2. Business Logic Validation (only if we have a valid grant)
  if (grant) {
    // Check grantee access
    if (grantee) {
      try {
        validateGranteeAccess(grant, grantee);
      } catch (error) {
        const field = extractFieldFromBusinessError(error);
        errors.push({
          type: "business",
          field,
          message:
            error instanceof Error
              ? error.message
              : "Unknown business rule error",
          error: error instanceof Error ? error : new Error("Unknown error"),
        });
      }
    }

    // Check expiration
    try {
      validateGrantExpiry(grant, currentTime);
    } catch (error) {
      const field = extractFieldFromBusinessError(error);
      errors.push({
        type: "business",
        field,
        message:
          error instanceof Error
            ? error.message
            : "Unknown business rule error",
        error: error instanceof Error ? error : new Error("Unknown error"),
      });
    }

    // Check operation access
    if (operation) {
      try {
        validateOperationAccess(grant, operation);
      } catch (error) {
        const field = extractFieldFromBusinessError(error);
        errors.push({
          type: "business",
          field,
          message:
            error instanceof Error
              ? error.message
              : "Unknown business rule error",
          error: error instanceof Error ? error : new Error("Unknown error"),
        });
      }
    }
  }

  // 3. Return Results
  if (errors.length > 0) {
    if (throwOnError) {
      // Throw the most specific error we have
      const firstError = errors[0];
      if (firstError.error) {
        throw firstError.error;
      } else {
        const combinedMessage = errors.map((e) => e.message).join("; ");
        throw new GrantValidationError(
          `Grant validation failed: ${combinedMessage}`,
          { errors, data },
        );
      }
    }

    return { valid: false, errors, grant };
  }

  if (throwOnError) {
    return grant as GrantFile;
  } else {
    return { valid: true, errors: [], grant: grant as GrantFile };
  }
}

/**
 * Helper function to extract field name from business validation errors
 *
 * @param error - The validation error to extract field information from
 * @returns The field name associated with the error, or undefined if not applicable
 */
function extractFieldFromBusinessError(error: unknown): string | undefined {
  if (error instanceof GrantExpiredError) return "expires";
  if (error instanceof GranteeMismatchError) return "grantee";
  if (error instanceof OperationNotAllowedError) return "operation";
  return undefined;
}

/**
 * Validates that a grant file allows access for a specific grantee
 *
 * @param grantFile - The grant file to validate access for
 * @param requestingAddress - The address requesting access to check against the grantee
 */
export function validateGranteeAccess(
  grantFile: GrantFile,
  requestingAddress: Address,
): void {
  if (grantFile.grantee.toLowerCase() !== requestingAddress.toLowerCase()) {
    throw new GranteeMismatchError(
      "Permission denied: requesting address does not match grantee",
      grantFile.grantee,
      requestingAddress,
    );
  }
}

/**
 * Validates that a grant has not expired (if expiry is set)
 *
 * @param grantFile - The grant file to check expiration for
 * @param currentTime - Optional override for current time (Unix timestamp)
 */
export function validateGrantExpiry(
  grantFile: GrantFile,
  currentTime?: number,
): void {
  if (grantFile.expires) {
    const now = currentTime || Math.floor(Date.now() / 1000); // Current Unix timestamp

    if (now > grantFile.expires) {
      throw new GrantExpiredError(
        "Permission denied: grant has expired",
        grantFile.expires,
        now,
      );
    }
  }
}

/**
 * Validates that a grant allows a specific operation
 *
 * @param grantFile - The grant file to validate operation access for
 * @param requestedOperation - The operation being requested to validate against the grant
 */
export function validateOperationAccess(
  grantFile: GrantFile,
  requestedOperation: string,
): void {
  if (grantFile.operation !== requestedOperation) {
    throw new OperationNotAllowedError(
      "Permission denied: operation not allowed by grant",
      grantFile.operation,
      requestedOperation,
    );
  }
}
