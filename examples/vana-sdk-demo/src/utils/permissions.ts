import type {
  GrantedPermission,
  GrantPermissionParams,
} from "@opendatalabs/vana-sdk/browser";

/**
 * Utilities for managing and deduplicating permissions in the Vana SDK.
 *
 * These utilities help prevent duplicate permission grants by checking if
 * an existing permission already satisfies the requested parameters.
 *
 * @module utils/permissions
 */

/**
 * Checks if two arrays of file IDs contain the same files (order-independent)
 *
 * @param files1 - First array of file IDs
 * @param files2 - Second array of file IDs
 * @returns True if both arrays contain the same file IDs
 *
 * @example
 * areFileSetsEqual([1, 2, 3], [3, 1, 2]) // true
 * areFileSetsEqual([1, 2], [1, 2, 3]) // false
 */
function areFileSetsEqual(files1: number[], files2: number[]): boolean {
  if (files1.length !== files2.length) return false;

  const set1 = new Set(files1);
  const set2 = new Set(files2);

  return (
    files1.every((id) => set2.has(id)) && files2.every((id) => set1.has(id))
  );
}

/**
 * Checks if two permission parameters are equivalent
 *
 * @param params1 - First set of parameters
 * @param params2 - Second set of parameters
 * @returns True if parameters are equivalent
 *
 * @remarks
 * Currently only compares the 'prompt' field, but can be extended
 * to handle more complex parameter comparisons in the future.
 */
function areParametersEqual(params1: unknown, params2: unknown): boolean {
  // Handle null/undefined cases - treat undefined and empty objects as equivalent
  const isEmpty1 =
    !params1 ||
    (typeof params1 === "object" &&
      Object.keys(params1 as Record<string, unknown>).length === 0);
  const isEmpty2 =
    !params2 ||
    (typeof params2 === "object" &&
      Object.keys(params2 as Record<string, unknown>).length === 0);

  if (isEmpty1 && isEmpty2) return true;
  if (isEmpty1 || isEmpty2) return false;

  // For now, we only check the prompt parameter
  // This can be extended to handle more complex parameter comparisons
  const p1 = params1 as Record<string, unknown>;
  const p2 = params2 as Record<string, unknown>;

  return (p1.prompt || "") === (p2.prompt || "");
}

/**
 * Represents the result of finding a matching permission
 */
export interface MatchingPermissionResult {
  found: boolean;
  permission?: GrantedPermission;
  reason?: string;
}

/**
 * Finds an existing permission that matches the given parameters
 *
 * @param existingPermissions - List of user's existing permissions
 * @param params - Parameters for the permission being requested
 * @returns Result indicating if a matching permission was found
 *
 * @remarks
 * The smart contract prevents duplicate grants by checking the hash of the grant URL.
 * Therefore, we need to find permissions that would result in the same grant content,
 * which means same grantee, operation, and parameters. File IDs can differ because
 * they're stored on-chain, not in the grant file.
 */
export function findMatchingPermission(
  existingPermissions: GrantedPermission[],
  params: GrantPermissionParams,
): MatchingPermissionResult {
  console.info(
    "[findMatchingPermission] Checking for existing permissions with params:",
    {
      to: params.to,
      operation: params.operation,
      files: params.files,
      parameters: params.parameters,
    },
  );

  for (const permission of existingPermissions) {
    // Check grantee
    if (permission.grantee.toLowerCase() !== params.to.toLowerCase()) {
      continue;
    }

    // Check operation
    if (permission.operation !== params.operation) {
      continue;
    }

    // Check parameters (this is what goes in the grant file)
    if (!areParametersEqual(permission.parameters, params.parameters)) {
      continue;
    }

    // Check if permission is active
    if (permission.active === false) {
      continue;
    }

    // Check if files match - if they don't, we can't reuse this permission
    // because it would require a new grant with the same content (causing GrantAlreadyUsed error)
    if (!areFileSetsEqual(permission.files, params.files)) {
      console.info(
        `[findMatchingPermission] Permission ${permission.id} has matching grant content but different files - cannot reuse due to smart contract constraints`,
      );
      continue;
    }

    // Found a match!
    console.info(
      "[findMatchingPermission] Found matching permission:",
      permission,
    );
    return {
      found: true,
      permission,
      reason: `Permission ${permission.id} already exists with same grantee, operation, files, and parameters`,
    };
  }

  console.info("[findMatchingPermission] No matching permission found");
  return {
    found: false,
    reason: "No existing permission matches the requested parameters",
  };
}

/**
 * Determines if a new permission needs to be created or if an existing one can be reused
 *
 * @param existingPermissions - List of user's existing permissions
 * @param params - Parameters for the permission being requested
 * @returns True if a new permission should be created, false if an existing one can be reused
 */
export function shouldCreateNewPermission(
  existingPermissions: GrantedPermission[],
  params: GrantPermissionParams,
): boolean {
  const result = findMatchingPermission(existingPermissions, params);
  return !result.found;
}
