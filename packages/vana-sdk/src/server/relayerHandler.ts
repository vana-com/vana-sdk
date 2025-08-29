import type { VanaInstance } from "../index.node";
import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
  SignedRelayerRequest,
  DirectRelayerRequest,
} from "../types/relayer";
import type {
  GenericTypedData,
  PermissionGrantTypedData,
  RevokePermissionTypedData,
  TrustServerTypedData,
  AddAndTrustServerTypedData,
  ServerFilesAndPermissionTypedData,
  TypedDataPrimaryType,
} from "../types/permissions";
import { SignatureError } from "../errors";
import { recoverTypedDataAddress, getAddress, type Hash } from "viem";

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
 * Handle EIP-712 signed operations with full type safety
 */
async function handleSignedOperation(
  sdk: VanaInstance,
  request: SignedRelayerRequest,
): Promise<UnifiedRelayerResponse> {
  const { typedData, signature, expectedUserAddress } = request;

  // Step 1: Verify the signature (security check)
  let recoveredAddress: `0x${string}`;
  try {
    recoveredAddress = await recoverTypedDataAddress({
      domain: {
        ...typedData.domain,
        chainId: typedData.domain.chainId
          ? BigInt(typedData.domain.chainId)
          : undefined,
      },
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message as unknown as Record<string, unknown>,
      signature,
    });
  } catch (error) {
    // Handle signature verification errors
    throw new SignatureError(
      `Signature verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Optional security check: Verify the signer matches expected address
  if (expectedUserAddress) {
    const normalizedExpected = getAddress(expectedUserAddress);
    const normalizedSigner = getAddress(recoveredAddress);

    if (normalizedSigner !== normalizedExpected) {
      throw new SignatureError(
        `Security verification failed: Recovered signer address (${normalizedSigner}) does not match expected user address (${normalizedExpected})`,
      );
    }
  }

  // Step 2: Route to appropriate SDK method based on primaryType
  // Using proper type narrowing instead of unsafe casts
  const result = await routeSignedOperation(sdk, typedData, signature);

  // Return the transaction hash with type
  return {
    type: "signed",
    hash: result.hash,
  };
}

/**
 * Route signed operations to the appropriate SDK method with type safety
 */
async function routeSignedOperation(
  sdk: VanaInstance,
  typedData: GenericTypedData,
  signature: Hash,
) {
  const primaryType = typedData.primaryType as TypedDataPrimaryType;

  // Type-safe routing based on primaryType
  switch (primaryType) {
    case "Permission":
      // TypeScript knows this is a Permission operation
      return sdk.permissions.submitSignedGrant(
        {
          ...typedData,
          primaryType: "Permission",
        } as PermissionGrantTypedData,
        signature,
      );

    case "RevokePermission":
      return sdk.permissions.submitSignedRevoke(
        {
          ...typedData,
          primaryType: "RevokePermission",
        } as RevokePermissionTypedData,
        signature,
      );

    case "TrustServer":
      return sdk.permissions.submitSignedTrustServer(
        {
          ...typedData,
          primaryType: "TrustServer",
        } as TrustServerTypedData,
        signature,
      );

    case "AddServer":
      return sdk.permissions.submitSignedAddAndTrustServer(
        {
          ...typedData,
          primaryType: "AddServer",
        } as AddAndTrustServerTypedData,
        signature,
      );

    case "UntrustServer":
      return sdk.permissions.submitSignedUntrustServer(
        {
          ...typedData,
          primaryType: "UntrustServer",
        } as GenericTypedData,
        signature,
      );

    case "ServerFilesAndPermission":
      return sdk.permissions.submitSignedAddServerFilesAndPermissions(
        {
          ...typedData,
          primaryType: "ServerFilesAndPermission",
        } as ServerFilesAndPermissionTypedData,
        signature,
      );

    // RegisterGrantee is commented out as it's not supported by smart contracts yet
    // case "RegisterGrantee":
    //   return sdk.permissions.submitSignedRegisterGrantee(...);

    default:
      throw new Error(`Unsupported operation type: ${typedData.primaryType}`);
  }
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

// Legacy handler export - DEPRECATED
// TODO: Remove in next major version
// Migration guide: Use handleRelayerOperation instead
export { handleRelayerRequest } from "./handler";
