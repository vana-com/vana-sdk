/**
 * Provides comprehensive validation for permission grant files.
 *
 * @remarks
 * This module implements multi-layer validation for grant files including
 * JSON schema validation, business rule checking, expiration verification,
 * and access control validation. It provides both throwing and non-throwing
 * modes for flexible error handling.
 *
 * @category Permissions
 * @module utils/grantValidation
 */

import type { Address } from "viem";
import { getAddress } from "viem";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { GrantFile } from "../types/permissions";
import grantFileSchema from "../schemas/grantFile.schema.json";

/**
 * Indicates a general grant validation failure.
 *
 * @remarks
 * Base class for all grant validation errors. Provides structured
 * error details for debugging and recovery.
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
 * Indicates that a grant has expired and is no longer valid.
 *
 * @remarks
 * Thrown when attempting to use a grant past its expiration timestamp.
 * Includes both the expiration time and current time for debugging.
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
 * Indicates that the requesting address doesn't match the grant's grantee.
 *
 * @remarks
 * Thrown when a user attempts to use a grant that was issued to a
 * different address. This prevents unauthorized use of permissions.
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
 * Indicates that the requested operation is not allowed by the grant.
 *
 * @remarks
 * Thrown when attempting an operation that differs from what the
 * grant authorizes. Includes both granted and requested operations.
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
 * Indicates that the grant file structure violates the JSON schema.
 *
 * @remarks
 * Thrown when a grant file doesn't conform to the expected schema.
 * Includes detailed schema validation errors and the invalid data.
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
 * Ajv instance configured for strict grant file validation.
 *
 * @internal
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
 * Pre-compiled grant file schema validator for performance.
 *
 * @internal
 */
const validateGrantFileSchema: ValidateFunction = ajv.compile(grantFileSchema);

/**
 * Configures grant validation behavior and scope.
 *
 * @remarks
 * Controls which validations to perform and how to handle errors.
 * Allows selective validation of specific aspects of a grant.
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
 * Represents the detailed result of grant validation.
 *
 * @remarks
 * Provides comprehensive validation results including all errors
 * encountered during validation. Used in non-throwing mode.
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

/** @internal */
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
 * Extracts the field name from business validation errors for reporting.
 *
 * @param error - The validation error to analyze
 * @returns The field name associated with the error, or undefined
 *
 * @internal
 */
function extractFieldFromBusinessError(error: unknown): string | undefined {
  if (error instanceof GrantExpiredError) return "expires";
  if (error instanceof GranteeMismatchError) return "grantee";
  if (error instanceof OperationNotAllowedError) return "operation";
  return undefined;
}

/**
 * Validates that a grant allows access for the requesting address.
 *
 * @param grantFile - The grant file to validate.
 *   Obtain from permission operations or server responses.
 * @param requestingAddress - The address requesting access.
 *   Typically the current wallet address.
 *
 * @throws {GranteeMismatchError} If addresses don't match.
 *   Ensure using the correct wallet that received the grant.
 *
 * @example
 * ```typescript
 * validateGranteeAccess(grantFile, walletAddress);
 * // Throws if walletAddress doesn't match grantFile.grantee
 * ```
 *
 * @category Permissions
 */
export function validateGranteeAccess(
  grantFile: GrantFile,
  requestingAddress: Address,
): void {
  const normalizedGrantee = getAddress(grantFile.grantee);
  const normalizedRequesting = getAddress(requestingAddress);

  if (normalizedGrantee !== normalizedRequesting) {
    throw new GranteeMismatchError(
      "Permission denied: requesting address does not match grantee",
      grantFile.grantee,
      requestingAddress,
    );
  }
}

/**
 * Validates that a grant has not expired.
 *
 * @param grantFile - The grant file to check.
 *   Must include expiry timestamp if time-limited.
 * @param currentTime - Optional time override for testing.
 *   Unix timestamp in seconds. Defaults to current time.
 *
 * @throws {GrantExpiredError} If grant has expired.
 *   Request a new grant from the data owner.
 *
 * @example
 * ```typescript
 * validateGrantExpiry(grantFile);
 * // Throws if current time > grantFile.expires
 * ```
 *
 * @category Permissions
 */
export function validateGrantExpiry(
  grantFile: GrantFile,
  currentTime?: number,
): void {
  if (grantFile.expires) {
    const now =
      currentTime !== undefined ? currentTime : Math.floor(Date.now() / 1000); // Current Unix timestamp

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
 * Validates that a grant authorizes the requested operation.
 *
 * @param grantFile - The grant file to check.
 *   Contains the authorized operation.
 * @param requestedOperation - The operation to validate.
 *   Must match the grant's operation exactly.
 *
 * @throws {OperationNotAllowedError} If operations don't match.
 *   Request a grant for the specific operation needed.
 *
 * @example
 * ```typescript
 * validateOperationAccess(grantFile, 'llm_inference');
 * // Throws if grantFile.operation !== 'llm_inference'
 * ```
 *
 * @category Permissions
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
