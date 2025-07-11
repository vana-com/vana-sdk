import { Address } from "viem";
import type { GrantFile, GrantPermissionParams } from "../types/permissions";
import {
  createGrantFile,
  storeGrantFile,
  retrieveGrantFile,
} from "./grantFiles";
import { validateGrant, GrantValidationError } from "./grantValidation";

/**
 * High-level utilities for working with grants in the Vana SDK
 */

/**
 * Creates and validates a grant file from permission parameters
 */
export function createValidatedGrant(params: GrantPermissionParams): GrantFile {
  const grantFile = createGrantFile(params);

  // Validate the created grant file
  try {
    validateGrant(grantFile, {
      schema: true,
      grantee: params.to,
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
 * Creates a grant file and stores it in IPFS
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
 * Retrieves and validates a grant file from IPFS
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
 */
export async function checkGrantAccess(
  grantUrl: string,
  requestingAddress: Address,
  operation: string,
  fileIds: number[],
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
 */
export function summarizeGrant(grantFile: GrantFile): string {
  const expiration = grantFile.expires
    ? new Date(grantFile.expires * 1000).toISOString()
    : "No expiration";

  return `Grant for ${grantFile.grantee} to perform "${grantFile.operation}" (expires: ${expiration})`;
}
