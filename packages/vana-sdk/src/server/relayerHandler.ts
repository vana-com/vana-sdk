import { v4 as uuidv4 } from "uuid";
import type { VanaInstance, VanaWithStores } from "../index.node";
import type { TransactionOptions } from "../types/index";
import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
  DirectRelayerRequest,
} from "../types/relayer";
import type {
  TransactionResult,
  TransactionOptions,
  TransactionReceipt,
} from "../types";
import type { OperationState } from "../types/operationStore";
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
 * Options for handleRelayerOperation
 */
export interface RelayerOperationOptions extends TransactionOptions {
  /**
   * Execution mode for the operation.
   *
   * @remarks
   * - 'sync' (default): Attempts to process the transaction immediately.
   *   If a timeout occurs, automatically falls back to returning a pending operation ID.
   *   This is the Vana App's current model.
   *
   * - 'async': Immediately queues the operation and returns a pending operation ID.
   *   The transaction will be processed by a background worker.
   *   Requires an operationStore to be configured.
   *
   * @default 'sync'
   */
  execution?: "sync" | "async";

  /**
   * Timeout for synchronous execution in milliseconds.
   * Only applies when execution is 'sync'.
   *
   * @default 30000 (30 seconds)
   */
  syncTimeout?: number;
}

/**
 * Universal handler for all relayer operations.
 *
 * This function processes both EIP-712 signed operations and direct operations,
 * automatically routing to the appropriate SDK methods.
 *
 * @param sdk - Initialized Vana SDK instance
 * @param request - The unified relayer request
 * @param options - Transaction and execution options
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
 *     // Explicit synchronous execution (Vana App model)
 *     const result = await handleRelayerOperation(vana, body, {
 *       execution: 'sync', // Explicit mode
 *       syncTimeout: 45000  // 45 second timeout
 *     });
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
  options: RelayerOperationOptions = {},
): Promise<UnifiedRelayerResponse> {
  // Type cast to access internal properties - safe for server-side relayer instances
  const sdkWithStores = sdk as VanaInstance & Partial<VanaWithStores>;
  const storeUntyped = sdkWithStores.operationStore;

  // Check if it's a IRelayerStateStore (has get/set methods)
  const isRelayerStore =
    storeUntyped && "get" in storeUntyped && "set" in storeUntyped;
  const store = isRelayerStore
    ? (storeUntyped as import("../types/operationStore").IRelayerStateStore)
    : undefined;

  // Extract execution mode and timeout with defaults
  const executionMode = options.execution ?? "sync";
  const syncTimeout = options.syncTimeout ?? 30000; // 30 seconds default

  // --- STATEFUL (ROBUST) MODE ---
  // This block executes ONLY if the developer provided a relayer state store.
  if (store) {
    if (request.type === "status_check") {
      const state = await store.get(request.operationId);
      if (!state) return { type: "error", error: "Operation not found" };

      // If already confirmed or failed, return immediately
      if (state.status === "confirmed")
        return {
          type: "confirmed",
          hash: state.transactionHash,
          receipt: state.finalReceipt,
        };
      if (state.status === "failed")
        return { type: "error", error: state.error ?? "Operation failed" };

      // For pending operations, check the blockchain for transaction status
      if (state.status === "pending") {
        try {
          // Get a public client to check transaction status
          const publicClient = sdkWithStores.publicClient;

          if (publicClient) {
            // Check if transaction has been mined
            let receipt;
            try {
              receipt = await publicClient.getTransactionReceipt({
                hash: state.transactionHash,
              });
            } catch (receiptError: any) {
              // Transaction not found is expected - it may not be mined yet
              if (receiptError?.name !== "TransactionReceiptNotFoundError") {
                // Unexpected error - log but don't fail
                console.warn(
                  `⚠️ [Relayer] Unexpected error checking receipt:`,
                  receiptError?.message ?? receiptError,
                );
              }
              // Continue returning pending status
              receipt = null;
            }

            if (receipt) {
              // Update the operation state based on transaction status
              const updatedState: OperationState = {
                ...state,
                status: receipt.status === "success" ? "confirmed" : "failed",
                finalReceipt: receipt as TransactionReceipt,
                ...(receipt.status !== "success" && {
                  error: "Transaction reverted on chain",
                }),
              };

              // Persist the updated state
              await store.set(request.operationId, updatedState);

              // Return the appropriate response
              if (receipt.status === "success") {
                return {
                  type: "confirmed",
                  hash: state.transactionHash,
                  receipt: receipt as TransactionReceipt,
                };
              } else {
                return {
                  type: "error",
                  error: "Transaction reverted on chain",
                };
              }
            }
          } else {
            console.warn(
              "⚠️ [Relayer] No public client available for status checking",
            );
          }
        } catch (error) {
          console.error(
            `❌ [Relayer] Unexpected error in status check:`,
            error,
          );
          // Don't fail the operation, just continue returning pending
        }
      }

      return { type: "pending", operationId: request.operationId };
    }

    const operationId = uuidv4();

    // Handle async execution mode - immediately queue and return
    if (executionMode === "async") {
      // Store the operation for later processing
      await store.set(operationId, {
        status: "pending",
        transactionHash: "" as Hash, // Will be filled when processed
        originalRequest: request,
        nonce: options?.nonce,
        retryCount: 0,
        lastAttemptedGas: {
          maxFeePerGas: options?.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: options?.maxPriorityFeePerGas?.toString(),
        },
        submittedAt: Date.now(),
      });

      console.log(
        `[Relayer] Operation ${operationId} queued for async processing`,
      );
      return { type: "pending", operationId };
    }

    // Handle sync execution mode (default) - try to execute immediately with timeout protection
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Sync execution timeout after ${syncTimeout}ms`));
        }, syncTimeout);
      });

      // Race between execution and timeout
      const txResult = await Promise.race([
        routeAndExecuteRequest(sdk, request, options),
        timeoutPromise,
      ]);

      // We only store state for operations that result in a transaction.
      if ("hash" in txResult) {
        // In sync mode with successful execution, store as confirmed
        await store.set(operationId, {
          status: "confirmed",
          transactionHash: txResult.hash,
          originalRequest: request,
          nonce: options?.nonce,
          retryCount: 0,
          lastAttemptedGas: {
            maxFeePerGas: options?.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: options?.maxPriorityFeePerGas?.toString(),
          },
          submittedAt: Date.now(),
        });

        // Return immediately with the transaction hash (sync success)
        return { type: "signed", hash: txResult.hash };
      } else {
        // This handles non-transactional direct operations like `storeGrantFile`
        return { type: "direct", result: txResult };
      }
    } catch (e) {
      // On timeout or error in sync mode, fall back to pending
      const error =
        e instanceof Error
          ? e
          : new Error("Unknown error during operation submission");

      // Store as pending for recovery
      await store.set(operationId, {
        status: "pending",
        transactionHash: "" as Hash, // Will be filled when retried
        originalRequest: request,
        nonce: options?.nonce,
        retryCount: 0,
        lastAttemptedGas: {
          maxFeePerGas: options?.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: options?.maxPriorityFeePerGas?.toString(),
        },
        submittedAt: Date.now(),
        error: error.message,
      });

      console.warn(
        `[Relayer] Sync execution failed/timed out, returning pending operationId: ${operationId}`,
      );
      return { type: "pending", operationId };
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
        return { type: "direct", result: txResult };
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
): Promise<UnifiedRelayerResponse> {
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
    const result = await routeSignedOperation(
      sdk,
      typedData,
      signature,
      options,
    );
    return { type: "signed", hash: result.hash };
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
): Promise<UnifiedRelayerResponse> {
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

      // Return as direct result wrapped in UnifiedRelayerResponse
      return { type: "direct", result };
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

      // Return as direct result wrapped in UnifiedRelayerResponse
      return { type: "direct", result };
    }

    case "submitFileAdditionComplete": {
      const { url, userAddress, permissions, schemaId, ownerAddress } =
        request.params;

      // Permissions are already encrypted, use the appropriate method
      // No mapping needed - permissions already have { account, key } format
      const txResult = await sdk.data.addFileWithEncryptedPermissionsAndSchema(
        url,
        ownerAddress ?? userAddress,
        permissions, // Already in correct format with encrypted 'key' field
        schemaId,
        options,
      );

      // File uploads need synchronous response with fileId
      // Use the SDK's built-in event parsing - it knows how to extract events from TransactionResult
      const eventResult = await sdk.waitForTransactionEvents(txResult);
      const fileAddedEvent = eventResult.expectedEvents?.FileAdded;

      if (!fileAddedEvent || !fileAddedEvent.fileId) {
        console.error("Event result:", eventResult);
        throw new Error("FileAdded event not found in transaction");
      }

      const fileId = Number(fileAddedEvent.fileId);

      // Return as a direct result wrapped in UnifiedRelayerResponse
      return {
        type: "direct",
        result: {
          fileId,
          transactionHash: txResult.hash,
        },
      };
    }

    case "storeGrantFile": {
      const grantFile = request.params;

      // Access the data controller's context which has storage
      const dataController = sdk.data as any;
      const context = dataController.context;

      if (!context?.storageManager) {
        throw new Error(
          "Storage configuration is required for storing grant files",
        );
      }

      // Convert grant file to blob for storage
      const blob = new Blob([JSON.stringify(grantFile)], {
        type: "application/json",
      });

      // Upload directly to storage (IPFS) without blockchain transaction
      const uploadResult = await context.storageManager.upload(
        blob,
        `grant-${Date.now()}.json`,
      );

      return { type: "direct", result: { url: uploadResult.url } };
    }

    case "submitRegisterGrantee": {
      const { owner, granteeAddress, publicKey } = request.params;

      // Use SDK to register grantee
      const result = await sdk.permissions.submitRegisterGrantee({
        owner,
        granteeAddress,
        publicKey,
      });

      // Return as direct result wrapped in UnifiedRelayerResponse
      return { type: "direct", result };
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
