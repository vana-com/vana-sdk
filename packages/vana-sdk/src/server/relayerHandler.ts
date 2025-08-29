import type { VanaInstance } from "../index.node";
import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
  SignedRelayerRequest,
  DirectRelayerRequest,
} from "../types/relayer";
import { handleRelayerRequest, type RelayerRequestPayload } from "./handler";

/**
 * Universal handler for all relayer operations.
 *
 * This function processes both EIP-712 signed operations and direct operations,
 * automatically routing to the appropriate SDK methods.
 *
 * @param sdk - Initialized Vana SDK instance
 * @param request - The unified relayer request
 * @returns Promise resolving to operation-specific response
 *
 * @category Server
 * @example
 * ```typescript
 * // In your server endpoint (Next.js example):
 * import { handleRelayerOperation } from '@opendatalabs/vana-sdk/node';
 *
 * export async function POST(request: NextRequest) {
 *   try {
 *     const body = await request.json();
 *     const vana = getServerVanaInstance(); // Your server SDK instance
 *
 *     const result = await handleRelayerOperation(vana, body);
 *
 *     return NextResponse.json(result);
 *   } catch (error) {
 *     return NextResponse.json(
 *       { error: error.message },
 *       { status: 500 }
 *     );
 *   }
 * }
 * ```
 */
export async function handleRelayerOperation(
  sdk: VanaInstance,
  request: UnifiedRelayerRequest,
): Promise<UnifiedRelayerResponse> {
  // Handle signed operations (EIP-712)
  if (request.type === "signed") {
    return handleSignedOperation(sdk, request);
  }

  // Handle direct operations (non-signed)
  return handleDirectOperation(sdk, request);
}

/**
 * Handle EIP-712 signed operations
 */
async function handleSignedOperation(
  sdk: VanaInstance,
  request: SignedRelayerRequest,
): Promise<UnifiedRelayerResponse> {
  // Use existing handleRelayerRequest for all signed operations
  const payload: RelayerRequestPayload = {
    typedData: request.typedData,
    signature: request.signature,
    expectedUserAddress: request.expectedUserAddress,
  };

  const result = await handleRelayerRequest(sdk, payload);

  // Return the transaction hash with type
  return {
    type: "signed",
    hash: result.hash,
  };
}

/**
 * Handle direct (non-signed) operations
 */
async function handleDirectOperation(
  sdk: VanaInstance,
  request: DirectRelayerRequest,
): Promise<UnifiedRelayerResponse> {
  switch (request.operation) {
    case "submitFileAddition": {
      const { url, userAddress } = request.params;

      // Use SDK to add file with no permissions
      const result = await sdk.data.addFileWithPermissions(
        url,
        userAddress,
        [], // No permissions
      );

      // Wait for transaction events to get fileId
      const eventData = await sdk.waitForTransactionEvents(result);
      const fileId = eventData.expectedEvents?.FileAdded?.fileId;

      if (!fileId) {
        throw new Error("Failed to get fileId from transaction events");
      }

      return {
        type: "direct",
        result: {
          fileId: Number(fileId),
          transactionHash: result.hash,
        },
      };
    }

    case "submitFileAdditionWithPermissions": {
      const { url, userAddress, permissions } = request.params;

      // Use SDK to add file with permissions
      const result = await sdk.data.addFileWithPermissions(
        url,
        userAddress,
        permissions,
      );

      // Wait for transaction events to get fileId
      const eventData = await sdk.waitForTransactionEvents(result);
      const fileId = eventData.expectedEvents?.FileAdded?.fileId;

      if (!fileId) {
        throw new Error("Failed to get fileId from transaction events");
      }

      return {
        type: "direct",
        result: {
          fileId: Number(fileId),
          transactionHash: result.hash,
        },
      };
    }

    case "submitFileAdditionComplete": {
      const { url, userAddress, permissions, schemaId, ownerAddress } =
        request.params;

      // Map permissions from relayer format to SDK format
      const sdkPermissions = permissions.map((p) => ({
        account: p.account,
        publicKey: p.key, // Map 'key' to 'publicKey'
      }));

      // Use SDK to add file with permissions and schema
      const result = await sdk.data.addFileWithPermissionsAndSchema(
        url,
        ownerAddress ?? userAddress,
        sdkPermissions,
        schemaId,
      );

      // Wait for transaction events to get fileId
      const eventData = await sdk.waitForTransactionEvents(result);
      const fileId = eventData.expectedEvents?.FileAdded?.fileId;

      if (!fileId) {
        throw new Error("Failed to get fileId from transaction events");
      }

      return {
        type: "direct",
        result: {
          fileId: Number(fileId),
          transactionHash: result.hash,
        },
      };
    }

    case "storeGrantFile": {
      const grantFile = request.params;

      // Store grant file using SDK's data controller
      // Convert grant file to blob for storage
      const blob = new Blob([JSON.stringify(grantFile)], {
        type: "application/json",
      });

      // Upload using the data controller
      const result = await sdk.data.upload({
        content: blob,
        filename: `grant-${Date.now()}.json`,
      });

      return {
        type: "direct",
        result: { url: result.url },
      };
    }

    default: {
      // TypeScript exhaustiveness check - ensures all cases are handled at compile time
      const exhaustiveCheck: never = request;
      // Return exhaustiveCheck to satisfy TypeScript while throwing an error
      // This should never be reached if all cases are handled
      return exhaustiveCheck;
    }
  }
}

// Re-export the existing handler for backwards compatibility
export { handleRelayerRequest } from "./handler";
