import { v4 as uuidv4 } from "uuid";
import type { VanaInstance } from "../index.node";
import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
  DirectRelayerRequest,
} from "../types/relayer";
import type {
  TransactionResult,
  TransactionOptions,
  IOperationStore,
} from "../types";
import type { Contract, Fn } from "../generated/event-types";
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
  sdk: VanaInstance, // The public signature is generic
  request: UnifiedRelayerRequest,
  options?: TransactionOptions,
): Promise<UnifiedRelayerResponse> {
  // Type assertion required: VanaInstance public interface doesn't expose operationStore
  // to maintain API simplicity, but server-side handler needs access for stateful mode.
  // The factory overloads guarantee this is safe for relayer-configured instances.
  // TODO(TYPES): Consider exposing operationStore through a server-specific interface

  const store = (sdk as any).operationStore as IOperationStore | undefined;

  // --- STATEFUL (ROBUST) MODE ---
  // This block executes ONLY if the developer provided an IOperationStore.
  if (store) {
    if (request.type === "status_check") {
      const state = await store.get(request.operationId);
      if (!state) return { type: "error", error: "Operation not found" };
      if (state.status === "confirmed")
        return {
          type: "confirmed",
          hash: state.transactionHash,
          receipt: state.finalReceipt,
        };
      if (state.status === "failed")
        return { type: "error", error: state.error ?? "Operation failed" };
      return { type: "pending", operationId: request.operationId };
    }

    const operationId = uuidv4();
    try {
      const txResult = await routeAndExecuteRequest(sdk, request, options);

      // We only store state for operations that result in a transaction.
      if ("hash" in txResult) {
        await store.set(operationId, {
          status: "pending",
          transactionHash: txResult.hash,
          originalRequest: request,
          nonce: (options?.nonce ?? 0) as number,
          retryCount: 0,
          lastAttemptedGas: {
            maxFeePerGas: options?.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: options?.maxPriorityFeePerGas?.toString(),
          },
          submittedAt: Date.now(),
        });
        return { type: "pending", operationId };
      } else {
        // This handles non-transactional direct operations like `storeGrantFile`
        return { type: "direct_result_untracked", result: txResult };
      }
    } catch (e) {
      const error =
        e instanceof Error
          ? e
          : new Error("Unknown error during operation submission");
      // We don't create a persistent error state for an initial submission failure.
      return { type: "error", error: error.message };
    }
  }

  // --- STATELESS (SIMPLE) MODE ---
  // This block executes if no IOperationStore was provided. Fire-and-forget.
  else {
    if (request.type === "status_check") {
      return {
        type: "error",
        error: "Stateless relayer does not support operation status checks.",
      };
    }

    try {
      const txResult = await routeAndExecuteRequest(sdk, request, options);

      // For stateless relayers, we can only handle transactional results.
      if ("hash" in txResult) {
        return { type: "submitted", hash: txResult.hash };
      } else {
        // Non-transactional direct operations can return their result directly.
        return { type: "direct_result_untracked", result: txResult };
      }
    } catch (e) {
      const error =
        e instanceof Error
          ? e
          : new Error("Unknown error during operation submission");
      return { type: "error", error: error.message };
    }
  }
}

/**
 * Helper function to route and execute requests.
 * This simply delegates to the appropriate handler based on request type.
 */
async function routeAndExecuteRequest(
  sdk: VanaInstance,
  request: UnifiedRelayerRequest,
  options?: TransactionOptions,
): Promise<TransactionResult<Contract, Fn<Contract>> | { url: string }> {
  if (request.type === "signed") {
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
    return await routeSignedOperation(sdk, typedData, signature, options);
  } else if (request.type === "direct") {
    return await handleDirectOperation(sdk, request, options);
  }
  throw new Error("Invalid request type for execution");
}

/**
 * Route signed operations to the appropriate SDK method with type safety.
 *
 * Returns a TransactionResult for one of the valid contracts and their functions.
 * Using Contract and Fn<Contract> ensures we're working with known contract types.
 */
async function routeSignedOperation(
  sdk: VanaInstance,
  typedData: GenericTypedData,
  signature: Hash,
  options?: TransactionOptions,
): Promise<TransactionResult<Contract, Fn<Contract>>> {
  // Validate primaryType before casting
  const validPrimaryTypes: readonly TypedDataPrimaryType[] = [
    "Permission",
    "RevokePermission",
    "TrustServer",
    "AddServer",
    "UntrustServer",
    "ServerFilesAndPermission",
  ] as const;

  if (
    !validPrimaryTypes.includes(typedData.primaryType as TypedDataPrimaryType)
  ) {
    throw new Error(
      `Unsupported operation type: ${typedData.primaryType}. ` +
        `Supported types: ${validPrimaryTypes.join(", ")}`,
    );
  }

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
        options,
      );

    case "RevokePermission":
      return sdk.permissions.submitSignedRevoke(
        {
          ...typedData,
          primaryType: "RevokePermission",
        } as RevokePermissionTypedData,
        signature,
        options,
      );

    case "TrustServer":
      // Note: TrustServer operation is deprecated but still supported for backwards compatibility
      // New implementations should use AddServer (AddAndTrustServer) instead
      return sdk.permissions.submitSignedTrustServer(
        {
          ...typedData,
          primaryType: "TrustServer",
        } as TrustServerTypedData,
        signature,
        options,
      );

    case "AddServer":
      return sdk.permissions.submitSignedAddAndTrustServer(
        {
          ...typedData,
          primaryType: "AddServer",
        } as AddAndTrustServerTypedData,
        signature,
        options,
      );

    case "UntrustServer":
      return sdk.permissions.submitSignedUntrustServer(
        {
          ...typedData,
          primaryType: "UntrustServer",
        } as GenericTypedData,
        signature,
        options,
      );

    case "ServerFilesAndPermission":
      return sdk.permissions.submitSignedAddServerFilesAndPermissions(
        {
          ...typedData,
          primaryType: "ServerFilesAndPermission",
        } as ServerFilesAndPermissionTypedData,
        signature,
        options,
      );

    // TODO: RegisterGrantee with signature is not supported until
    // DataPortabilityGrantees contract adds registerGranteeWithSignature function
    // case "RegisterGrantee":
    //   return sdk.permissions.submitSignedRegisterGrantee(...);

    default:
      // This should never be reached due to validation above, but TypeScript requires it
      throw new Error(
        `Unsupported operation type: ${typedData.primaryType}. ` +
          `Supported types: Permission, RevokePermission, TrustServer, AddServer, UntrustServer, ServerFilesAndPermission`,
      );
  }
}

/**
 * Handle direct (non-signed) operations
 */
async function handleDirectOperation(
  sdk: VanaInstance,
  request: DirectRelayerRequest,
  options?: TransactionOptions,
): Promise<TransactionResult<Contract, Fn<Contract>> | { url: string }> {
  switch (request.operation) {
    case "submitFileAddition": {
      const { url, userAddress } = request.params;

      // Use SDK to add file with no permissions
      const result = await sdk.data.addFileWithPermissions(
        url,
        userAddress,
        [], // No permissions
        options,
      );

      // Return the TransactionResult directly
      return result;
    }

    case "submitFileAdditionWithPermissions": {
      const { url, userAddress, permissions } = request.params;

      // Use SDK to add file with permissions
      const result = await sdk.data.addFileWithPermissions(
        url,
        userAddress,
        permissions,
        options,
      );

      // Return the TransactionResult directly
      return result;
    }

    case "submitFileAdditionComplete": {
      const { url, userAddress, permissions, schemaId, ownerAddress } =
        request.params;

      // Permissions are already encrypted, use the appropriate method
      // No mapping needed - permissions already have { account, key } format
      const result = await sdk.data.addFileWithEncryptedPermissionsAndSchema(
        url,
        ownerAddress ?? userAddress,
        permissions, // Already in correct format with encrypted 'key' field
        schemaId,
        options,
      );

      // Return the TransactionResult directly
      return result;
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

      return { url: result.url };
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
