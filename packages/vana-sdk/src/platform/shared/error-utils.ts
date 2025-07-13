/**
 * Shared error utilities for platform adapters
 *
 * IMPORTANT: This module contains NO IMPORTS to avoid affecting bundle loading.
 * All functions are pure utilities that can be safely shared across platforms.
 */

/**
 * Wrap platform-specific errors with consistent messaging
 * Provides consistent error formatting across all crypto operations
 *
 * @param operation The operation that failed (e.g., "encryption", "decryption")
 * @param error The original error that occurred
 * @returns Wrapped error with consistent format
 */
export function wrapCryptoError(operation: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : "Unknown error";
  return new Error(`${operation} failed: ${message}`);
}

/**
 * Validate encrypted data structure has required fields
 * Ensures encrypted data objects contain the expected properties
 *
 * @param data The data structure to validate
 * @throws Error if data structure is invalid
 */
export function validateEncryptedDataStructure(data: unknown): void {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid encrypted data format");
  }

  const obj = data as Record<string, unknown>;
  if (!obj.encrypted || !obj.iv || !obj.ephemeralPublicKey) {
    throw new Error("Invalid encrypted data format");
  }
}
