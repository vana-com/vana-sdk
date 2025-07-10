import { Address } from "viem";
import type { GrantFile } from "../types/permissions";
import { validateGrantFile } from "./grantFiles";

/**
 * Error thrown when grant validation fails
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
 * Validates that a grant file has the correct structure and content
 */
export function validateGrantFileStructure(
  data: unknown,
): asserts data is GrantFile {
  if (!validateGrantFile(data)) {
    throw new GrantValidationError("Invalid grant file structure");
  }
}

/**
 * Validates that a grant file allows access for a specific grantee
 */
export function validateGranteeAccess(
  grantFile: GrantFile,
  requestingAddress: Address,
): void {
  if (grantFile.grantee.toLowerCase() !== requestingAddress.toLowerCase()) {
    throw new GrantValidationError(
      "Permission denied: requesting address does not match grantee",
      {
        grantee: grantFile.grantee,
        requestingAddress,
      },
    );
  }
}

/**
 * Validates that a grant has not expired (if expiry is set)
 */
export function validateGrantExpiry(grantFile: GrantFile): void {
  if (grantFile.expires) {
    const now = Math.floor(Date.now() / 1000); // Current Unix timestamp

    if (now > grantFile.expires) {
      throw new GrantValidationError("Permission denied: grant has expired", {
        expires: grantFile.expires,
        currentTime: now,
      });
    }
  }
}

/**
 * Validates that a grant includes access to specific file IDs
 */
export function validateFileAccess(
  grantFile: GrantFile,
  requestedFileIds: number[],
): void {
  const grantedFileIds = new Set(grantFile.files);
  const unauthorizedFiles = requestedFileIds.filter(
    (fileId) => !grantedFileIds.has(fileId),
  );

  if (unauthorizedFiles.length > 0) {
    throw new GrantValidationError(
      "Permission denied: access not granted for some files",
      {
        requestedFiles: requestedFileIds,
        grantedFiles: grantFile.files,
        unauthorizedFiles,
      },
    );
  }
}

/**
 * Validates that a grant allows a specific operation
 */
export function validateOperationAccess(
  grantFile: GrantFile,
  requestedOperation: string,
): void {
  if (grantFile.operation !== requestedOperation) {
    throw new GrantValidationError(
      "Permission denied: operation not allowed by grant",
      {
        grantedOperation: grantFile.operation,
        requestedOperation,
      },
    );
  }
}

/**
 * Comprehensive validation of a grant file for a specific request
 */
export function validateGrantForRequest(
  grantFile: GrantFile,
  requestingAddress: Address,
  operation: string,
  fileIds: number[],
): void {
  // Validate structure
  validateGrantFileStructure(grantFile);

  // Validate grantee access
  validateGranteeAccess(grantFile, requestingAddress);

  // Validate expiry
  validateGrantExpiry(grantFile);

  // Validate operation
  validateOperationAccess(grantFile, operation);

  // Validate file access
  validateFileAccess(grantFile, fileIds);
}

/**
 * Validates grant file against JSON schema (runtime validation)
 */
export function validateGrantFileAgainstSchema(grantFile: unknown): GrantFile {
  // Basic validation first
  validateGrantFileStructure(grantFile);

  const validated = grantFile as GrantFile;

  // Additional validation rules from schema
  if (!validated.grantee.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new GrantValidationError("Invalid grantee address format");
  }

  if (!validated.operation || validated.operation.trim().length === 0) {
    throw new GrantValidationError("Operation cannot be empty");
  }

  if (!Array.isArray(validated.files) || validated.files.length === 0) {
    throw new GrantValidationError("Files array cannot be empty");
  }

  // Validate file IDs are non-negative integers
  const invalidFileIds = validated.files.filter(
    (id) => !Number.isInteger(id) || id < 0,
  );
  if (invalidFileIds.length > 0) {
    throw new GrantValidationError("Invalid file IDs", { invalidFileIds });
  }

  // Validate expires format if present (Unix timestamp)
  if (validated.expires !== undefined) {
    if (!Number.isInteger(validated.expires) || validated.expires < 0) {
      throw new GrantValidationError("Invalid expires timestamp format (must be positive integer)");
    }
  }

  return validated;
}
