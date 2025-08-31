/**
 * Provides high-level grant management utilities for the Vana permission system.
 *
 * @remarks
 * This module simplifies grant file creation, validation, storage, and retrieval.
 * Grants are the core mechanism for permission management in Vana, allowing users
 * to delegate specific operations to applications and services.
 *
 * @category Permissions
 * @module grants
 */

import type { Address } from "viem";
import type { GrantFile, GrantPermissionParams } from "../types/permissions";
import {
  createGrantFile,
  storeGrantFile,
  retrieveGrantFile,
} from "./grantFiles";
import { validateGrant, GrantValidationError } from "./grantValidation";

/**
 * Creates and validates a grant file from permission parameters.
 *
 * @remarks
 * Combines grant creation with immediate validation to ensure only valid
 * grants are created. Validates schema compliance, grantee address, and
 * operation parameters before returning the grant file.
 *
 * @param params - The permission parameters to create and validate the grant from.
 *   Obtain from user input or application configuration.
 * @returns The validated grant file object ready for storage
 *
 * @throws {GrantValidationError} When grant parameters are invalid.
 *   Check error message for specific validation failures.
 *
 * @example
 * ```typescript
 * const grant = createValidatedGrant({
 *   grantee: '0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb',
 *   operation: 'llm_inference',
 *   parameters: { model: 'gpt-4', maxTokens: 1000 },
 *   expiresAt: Date.now() + 86400000 // 24 hours
 * });
 * ```
 *
 * @category Permissions
 */
export function createValidatedGrant(params: GrantPermissionParams): GrantFile {
  const grantFile = createGrantFile(params);

  // Validate the created grant file
  try {
    validateGrant(grantFile, {
      schema: true,
      grantee: params.grantee,
      operation: params.operation,
    });
  } catch (error) {
    throw new GrantValidationError(
      `Created grant file failed validation: ${error instanceof Error ? error.message : "Unknown error"}`,
      { grantFile, params },
    );
  }

  return grantFile;
}

/**
 * Creates a grant file and stores it in IPFS.
 *
 * @remarks
 * Combines grant creation, validation, and IPFS storage in a single operation.
 * The grant is stored immutably on IPFS and can be referenced by its URL in
 * on-chain permission records.
 *
 * @param params - The permission parameters to create the grant from.
 *   Obtain from user input or application configuration.
 * @param relayerUrl - The URL of the relayer service for IPFS storage.
 *   Obtain from SDK configuration or environment.
 * @returns Promise resolving to an object containing the grant file and its IPFS URL
 *
 * @throws {GrantValidationError} When grant parameters are invalid.
 *   Check error message for specific validation failures.
 * @throws {Error} When IPFS storage fails.
 *   Retry with exponential backoff or check relayer status.
 *
 * @example
 * ```typescript
 * const { grantFile, grantUrl } = await createAndStoreGrant(
 *   {
 *     grantee: applicationAddress,
 *     operation: 'data_processing',
 *     parameters: { dataTypes: ['medical', 'financial'] }
 *   },
 *   'https://relayer.vana.org'
 * );
 *
 * console.log('Grant stored at:', grantUrl);
 * ```
 *
 * @category Permissions
 */
export async function createAndStoreGrant(
  params: GrantPermissionParams,
  relayerUrl: string,
): Promise<{ grantFile: GrantFile; grantUrl: string }> {
  const grantFile = createValidatedGrant(params);
  const grantUrl = await storeGrantFile(grantFile, relayerUrl);

  return { grantFile, grantUrl };
}

/**
 * Retrieves and validates a grant file from IPFS.
 *
 * @remarks
 * Fetches a grant file from IPFS and performs basic validation to ensure
 * the retrieved data is a valid grant structure. Use this when you need to
 * verify or process existing grants.
 *
 * @param grantUrl - The IPFS URL of the grant file to retrieve.
 *   Obtain from on-chain permission records or grant events.
 * @param relayerUrl - Optional URL of the relayer service.
 *   If not provided, uses default IPFS gateways.
 * @returns Promise resolving to the validated grant file
 *
 * @throws {Error} When grant retrieval fails.
 *   Check network connectivity or IPFS gateway availability.
 * @throws {Error} When grant file is malformed.
 *   Verify the grant URL points to a valid grant file.
 *
 * @example
 * ```typescript
 * const grant = await retrieveAndValidateGrant(
 *   'ipfs://QmXxx...'
 * );
 *
 * console.log('Grant for:', grant.grantee);
 * console.log('Operation:', grant.operation);
 * ```
 *
 * @category Permissions
 */
export async function retrieveAndValidateGrant(
  grantUrl: string,
  relayerUrl?: string,
): Promise<GrantFile> {
  const grantFile = await retrieveGrantFile(grantUrl, relayerUrl);

  // Additional validation can be added here if needed
  return grantFile;
}

/**
 * Checks if a grant allows access for a specific request
 *
 * @param grantUrl - The IPFS URL of the grant file to check
 * @param requestingAddress - The address making the access request
 * @param operation - The operation being requested
 * @param _fileIds - Array of file IDs being accessed (currently unused but part of interface)
 * @param relayerUrl - Optional URL of the relayer service
 * @returns Promise resolving to access result with allowed status, reason, and grant file
 */
export async function checkGrantAccess(
  grantUrl: string,
  requestingAddress: Address,
  operation: string,
  _fileIds: number[],
  relayerUrl?: string,
): Promise<{ allowed: boolean; reason?: string; grantFile?: GrantFile }> {
  try {
    const grantFile = await retrieveAndValidateGrant(grantUrl, relayerUrl);

    // Validate the grant for the request
    validateGrant(grantFile, {
      schema: true,
      grantee: requestingAddress,
      operation,
    });

    return { allowed: true, grantFile };
  } catch (error) {
    if (error instanceof GrantValidationError) {
      return {
        allowed: false,
        reason: error.message,
      };
    }

    return {
      allowed: false,
      reason: `Grant access check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Utility to check if a grant has expired
 *
 * @param grantFile - The grant file to check for expiration
 * @returns True if the grant has expired, false otherwise
 */
export function isGrantExpired(grantFile: GrantFile): boolean {
  if (!grantFile.expires) {
    return false; // No expiration set
  }

  const now = Math.floor(Date.now() / 1000);
  return now > grantFile.expires;
}

/**
 * Utility to get the time remaining before grant expires (in seconds)
 *
 * @param grantFile - The grant file to check time remaining for
 * @returns Number of seconds remaining, or null if no expiration is set
 */
export function getGrantTimeRemaining(grantFile: GrantFile): number | null {
  if (!grantFile.expires) {
    return null; // No expiration set
  }

  const now = Math.floor(Date.now() / 1000);
  const remaining = grantFile.expires - now;
  return Math.max(0, remaining);
}

/**
 * Creates a human-readable summary of a grant
 *
 * @param grantFile - The grant file to create a summary for
 * @returns A human-readable string describing the grant
 */
export function summarizeGrant(grantFile: GrantFile): string {
  const expiration = grantFile.expires
    ? new Date(grantFile.expires * 1000).toISOString()
    : "No expiration";

  return `Grant for ${grantFile.grantee} to perform "${grantFile.operation}" (expires: ${expiration})`;
}
