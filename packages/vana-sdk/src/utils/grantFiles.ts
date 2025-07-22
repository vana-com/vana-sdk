import { keccak256, toHex } from "viem";
import type { GrantFile, GrantPermissionParams } from "../types/permissions";
import { SerializationError, NetworkError } from "../errors";

interface GrantFileStorageResponse {
  success: boolean;
  error?: string;
  url?: string;
}

/**
 * Creates a grant file structure from permission parameters.
 *
 * @param params - The permission parameters to create the grant file from
 * @returns The constructed grant file object
 */
export function createGrantFile(params: GrantPermissionParams): GrantFile {
  const grantFile: GrantFile = {
    grantee: params.grantee,
    operation: params.operation,
    parameters: params.parameters,
  };

  // Add expiration if provided
  if (params.expiresAt) {
    grantFile.expires = params.expiresAt;
  }

  return grantFile;
}

/**
 * Stores a grant file in IPFS via the relayer service.
 *
 * @param grantFile - The grant file to store
 * @param relayerUrl - URL of the relayer service
 * @returns Promise resolving to the IPFS URL
 */
export async function storeGrantFile(
  grantFile: GrantFile,
  relayerUrl: string,
): Promise<string> {
  try {
    // Convert grant file to blob and use IPFS upload endpoint
    const grantFileBlob = new Blob([JSON.stringify(grantFile, null, 2)], {
      type: "application/json",
    });

    const formData = new FormData();
    formData.append("file", grantFileBlob, "grant-file.json");

    const response = await fetch(`${relayerUrl}/api/ipfs/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new NetworkError(
        `Failed to store grant file: ${response.statusText}`,
        new Error(`HTTP ${response.status}`),
      );
    }

    const responseData: unknown = await response.json();
    const data = responseData as GrantFileStorageResponse;

    if (!data.success) {
      throw new NetworkError(data.error || "Failed to store grant file");
    }

    return data.url || ""; // The IPFS URL from the upload response
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(
      `Network error while storing grant file: ${error instanceof Error ? error.message : "Unknown error"}`,
      error as Error,
    );
  }
}

/**
 * Retrieves detailed grant file data from IPFS or HTTP storage.
 *
 * @remarks
 * **This is Step 2 of the performant two-step permission API.**
 *
 * Use this method to resolve detailed permission data (operation, parameters, etc.)
 * for specific grants after first getting the fast on-chain data using
 * `getUserPermissionGrantsOnChain()`. This design eliminates N+1 query problems
 * by allowing selective lazy-loading of expensive off-chain data.
 *
 * **Performance**: Single network request per grant file (typically 100-500ms).
 * **Reliability**: Tries multiple IPFS gateways as fallbacks if primary URL fails.
 *
 * @param grantUrl - The grant file URL from OnChainPermissionGrant.grantUrl
 * @param _relayerUrl - URL of the relayer service (optional, unused)
 * @returns Promise resolving to the complete grant file with operation details
 * @throws {NetworkError} When all retrieval attempts fail
 * @throws {SerializationError} When grant file format is invalid
 * @example
 * ```typescript
 * // Step 1: Fast on-chain data (no N+1 queries)
 * const grants = await vana.permissions.getUserPermissionGrantsOnChain();
 *
 * // Step 2: Lazy-load details for specific grant when needed
 * const grantFile = await retrieveGrantFile(grants[0].grantUrl);
 *
 * console.log(`Operation: ${grantFile.operation}`);
 * console.log(`Grantee: ${grantFile.grantee}`);
 * console.log(`Parameters:`, grantFile.parameters);
 *
 * // Only fetch details for grants user actually wants to see
 * for (const grant of selectedGrants) {
 *   const details = await retrieveGrantFile(grant.grantUrl);
 *   displayGrantDetails(details);
 * }
 * ```
 */
export async function retrieveGrantFile(
  grantUrl: string,
  _relayerUrl?: string,
): Promise<GrantFile> {
  try {
    // Check if the URL is a gateway URL instead of ipfs:// protocol
    if (grantUrl.startsWith("http") && grantUrl.includes("/ipfs/")) {
      console.warn(
        `⚠️  Grant URL uses HTTP gateway format instead of ipfs:// protocol. ` +
          `Found: ${grantUrl}. ` +
          `Consider using ipfs:// format for better protocol-agnostic storage.`,
      );
    }

    // Try direct fetch first (works for any HTTP/HTTPS URL)
    if (grantUrl.startsWith("http")) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Request timeout")), 10000);
        });

        const response = await Promise.race([fetch(grantUrl), timeoutPromise]);

        if (response.ok) {
          const text = await response.text();
          const grantFile = JSON.parse(text);

          if (validateGrantFile(grantFile)) {
            return grantFile;
          }
        }
      } catch (directFetchError) {
        console.warn(`Direct fetch failed for ${grantUrl}:`, directFetchError);
        // Continue to IPFS fallback if this might be an IPFS URL
      }
    }

    // Try IPFS gateways as fallback (for ipfs:// URLs or failed gateway URLs)
    const { extractIpfsHash } = await import("./ipfs");
    const ipfsHash = extractIpfsHash(grantUrl);

    if (ipfsHash) {
      // Try multiple IPFS gateways
      const gateways = [
        `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
        `https://ipfs.io/ipfs/${ipfsHash}`,
        `https://dweb.link/ipfs/${ipfsHash}`,
      ];

      for (const gatewayUrl of gateways) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Request timeout")), 10000);
          });

          const response = await Promise.race([
            fetch(gatewayUrl),
            timeoutPromise,
          ]);

          if (response.ok) {
            const text = await response.text();
            const grantFile = JSON.parse(text);

            if (validateGrantFile(grantFile)) {
              return grantFile;
            }
          }
        } catch (gatewayError) {
          console.warn(`Gateway ${gatewayUrl} failed:`, gatewayError);
          continue; // Try next gateway
        }
      }
    }

    throw new NetworkError(
      `Failed to retrieve grant file from ${grantUrl}. Tried direct fetch${ipfsHash ? " and IPFS gateways" : ""}.`,
    );
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(
      `Error retrieving grant file: ${error instanceof Error ? error.message : "Unknown error"}`,
      error as Error,
    );
  }
}

/**
 * Generates a content hash for a grant file.
 * This can be used for integrity verification.
 *
 * @param grantFile - The grant file to generate a hash for
 * @returns The keccak256 hash of the grant file as a hex string
 */
export function getGrantFileHash(grantFile: GrantFile): string {
  try {
    // Create a stable JSON representation
    const sortedFile: GrantFile = {
      grantee: grantFile.grantee,
      operation: grantFile.operation,
      parameters: sortObjectKeys(grantFile.parameters) as Record<
        string,
        unknown
      >,
    };

    // Add expires if present
    if (grantFile.expires !== undefined) {
      sortedFile.expires = grantFile.expires;
    }

    const jsonString = JSON.stringify(sortedFile);
    console.info(`Hash: ${keccak256(toHex(jsonString))}`);
    return keccak256(toHex(jsonString));
  } catch (error) {
    throw new SerializationError(
      `Failed to generate grant file hash: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Recursively sorts object keys for stable serialization.
 *
 * @param obj - The object to sort keys recursively
 * @returns The object with all keys sorted recursively
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sortObjectKeys(item));
  }

  const sortedObj: Record<string, unknown> = {};
  Object.keys(obj as Record<string, unknown>)
    .sort()
    .forEach((key) => {
      sortedObj[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    });

  return sortedObj;
}

/**
 * Validates that a grant file has the required structure.
 *
 * @param data - The data to validate as a grant file
 * @returns True if the data is a valid grant file, false otherwise
 */
export function validateGrantFile(data: unknown): data is GrantFile {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Validate required fields
  // Validate grantee address
  if (
    typeof obj.grantee !== "string" ||
    !obj.grantee.match(/^0x[a-fA-F0-9]{40}$/)
  ) {
    return false;
  }

  if (typeof obj.operation !== "string" || obj.operation.length === 0) {
    return false;
  }

  // Files are no longer stored in grant files - they're tracked in the contract

  if (!obj.parameters || typeof obj.parameters !== "object") {
    return false;
  }

  // Validate optional expires field
  if (obj.expires !== undefined) {
    if (
      typeof obj.expires !== "number" ||
      obj.expires < 0 ||
      !Number.isInteger(obj.expires)
    ) {
      return false;
    }
  }

  return true;
}
