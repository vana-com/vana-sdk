import { Address, keccak256, toHex } from "viem";
import {
  GrantFile,
  GrantPermissionParams,
  RelayerStorageResponse,
} from "../types";
import { SerializationError, NetworkError } from "../errors";

/**
 * Creates a grant file structure from permission parameters.
 */
export function createGrantFile(
  params: GrantPermissionParams,
  userAddress: Address
): GrantFile {
  return {
    operation: params.operation,
    files: params.files,
    parameters: params.parameters,
    metadata: {
      timestamp: new Date().toISOString(),
      version: "1.0",
      userAddress,
    },
  };
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
  relayerUrl: string
): Promise<string> {
  try {
    // Use existing parameters endpoint that handles IPFS storage
    const response = await fetch(`${relayerUrl}/api/v1/parameters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parameters: JSON.stringify(grantFile),
      }),
    });

    if (!response.ok) {
      throw new NetworkError(
        `Failed to store grant file: ${response.statusText}`,
        new Error(`HTTP ${response.status}`)
      );
    }

    const data: RelayerStorageResponse = await response.json();

    if (!data.success) {
      throw new NetworkError(data.error || "Failed to store grant file");
    }

    return data.grantUrl;
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(
      `Network error while storing grant file: ${error instanceof Error ? error.message : "Unknown error"}`,
      error as Error
    );
  }
}

/**
 * Retrieves a grant file from IPFS.
 *
 * @param grantUrl - The IPFS URL (e.g., "ipfs://QmHash...")
 * @param relayerUrl - URL of the relayer service (optional)
 * @returns Promise resolving to the grant file
 */
export async function retrieveGrantFile(
  grantUrl: string,
  relayerUrl?: string
): Promise<GrantFile> {
  try {
    // Extract IPFS hash from URL
    const ipfsHash = grantUrl.startsWith("ipfs://")
      ? grantUrl.replace("ipfs://", "")
      : grantUrl;

    // Try multiple IPFS gateways
    const gateways = [
      `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
      `https://ipfs.io/ipfs/${ipfsHash}`,
      `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
    ];

    for (const gatewayUrl of gateways) {
      try {
        const response = await fetch(gatewayUrl, {
          timeout: 10000, // 10 second timeout
        });

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

    throw new NetworkError(
      `Failed to retrieve grant file from any IPFS gateway: ${grantUrl}`
    );
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(
      `Error retrieving grant file: ${error instanceof Error ? error.message : "Unknown error"}`,
      error as Error
    );
  }
}

/**
 * Generates a content hash for a grant file.
 * This can be used for integrity verification.
 */
export function getGrantFileHash(grantFile: GrantFile): string {
  try {
    // Create a stable JSON representation
    const sortedFile = {
      operation: grantFile.operation,
      files: [...grantFile.files].sort((a, b) => a - b), // Sort files for consistency
      parameters: sortObjectKeys(grantFile.parameters),
      metadata: {
        timestamp: grantFile.metadata.timestamp,
        version: grantFile.metadata.version,
        userAddress: grantFile.metadata.userAddress,
      },
    };

    const jsonString = JSON.stringify(sortedFile);
    console.log(`Hash: ${keccak256(toHex(jsonString))}`);
    return keccak256(toHex(jsonString));
  } catch (error) {
    throw new SerializationError(
      `Failed to generate grant file hash: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Recursively sorts object keys for stable serialization.
 */
function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sortObjectKeys(item));
  }

  const sortedObj: Record<string, any> = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      sortedObj[key] = sortObjectKeys(obj[key]);
    });

  return sortedObj;
}

/**
 * Validates that a grant file has the required structure.
 */
export function validateGrantFile(data: any): data is GrantFile {
  return (
    data &&
    typeof data.operation === "string" &&
    Array.isArray(data.files) &&
    data.parameters &&
    typeof data.parameters === "object" &&
    data.metadata &&
    typeof data.metadata.timestamp === "string" &&
    typeof data.metadata.version === "string" &&
    typeof data.metadata.userAddress === "string"
  );
}
