/**
 * Input validation for batch rotation
 * V1 Minimal: Only 3 blocking errors, no warnings
 */
import { isAddress, getAddress } from "viem";
import type {
  RotationFormInput,
  ValidationError,
  ValidationResult,
} from "./types";

/**
 * Validate rotation form inputs
 *
 * Only 3 blocking errors in V1:
 * - E001: Old address invalid/empty
 * - E002: New address invalid/empty
 * - E003: Old address === new address
 *
 * @param input - Form input to validate
 * @returns Validation result with errors array
 */
export function validateRotationInput(
  input: RotationFormInput,
): ValidationResult {
  const errors: ValidationError[] = [];

  // E001: Old address must be valid
  if (!input.oldAddress || !isAddress(input.oldAddress)) {
    errors.push({
      code: "E001",
      field: "oldAddress",
      message: "Old address is required and must be a valid Ethereum address",
    });
  }

  // E002: New address must be valid
  if (!input.newAddress || !isAddress(input.newAddress)) {
    errors.push({
      code: "E002",
      field: "newAddress",
      message: "New address is required and must be a valid Ethereum address",
    });
  }

  // E003: Addresses must be different
  // Use getAddress() to normalize checksums before comparison
  if (
    input.oldAddress &&
    input.newAddress &&
    isAddress(input.oldAddress) &&
    isAddress(input.newAddress)
  ) {
    const oldNormalized = getAddress(input.oldAddress);
    const newNormalized = getAddress(input.newAddress);

    if (oldNormalized === newNormalized) {
      errors.push({
        code: "E003",
        field: "newAddress",
        message: "Old and new addresses must be different",
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
