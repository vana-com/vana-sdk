import {
  CreateOperationParams,
  InitPersonalServerParams,
  PersonalServerIdentity,
} from "../types";
import {
  CreateOperationResponse,
  GetOperationResponse,
  IdentityResponseModel,
} from "../generated/server/server-exports";
import {
  NetworkError,
  SerializationError,
  SignatureError,
  PersonalServerError,
} from "../errors";
import { ControllerContext } from "./permissions";
import { OperationHandle, type PollingOptions } from "../utils/operationHandle";

// Server types are now auto-imported from the generated exports

/**
 * Manages interactions with Vana personal servers and identity infrastructure.
 *
 * @remarks
 * This controller handles communication with personal servers for data processing
 * and identity servers for public key derivation. It provides methods for posting
 * computation requests to personal servers, polling for results, and retrieving
 * cryptographic keys for secure data sharing. All server interactions use the
 * Replicate API infrastructure with proper authentication and error handling.
 *
 * **Server Identity System:**
 * Personal servers use deterministic key derivation: each user address maps to a specific server identity.
 * This enables secure communication without requiring servers to be online during key retrieval.
 *
 * **Method Selection:**
 * - `getIdentity()` retrieves server public keys and addresses for encryption setup
 * - `createOperation()` submits computation requests with signed permission verification
 * - `getOperation()` polls operation status and retrieves results when complete
 * - `cancelOperation()` stops running operations when cancellation is supported
 *
 * **Workflow Pattern:**
 * Typical flow: Get identity → Create operation → Poll status → Retrieve results
 *
 * @example
 * ```typescript
 * // Get a server's identity including public key for encryption
 * const identity = await vana.server.getIdentity({
 *   userAddress: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36"
 * });
 *
 * // Create an operation using a granted permission
 * const response = await vana.server.createOperation({
 *   permissionId: 123,
 * });
 *
 * // Poll for computation results
 * const result = await vana.server.getOperation(response.id);
 * ```
 * @category Server Management
 * @see {@link https://docs.vana.com/developer/personal-servers | Vana Personal Servers} for conceptual overview
 */
export class ServerController {
  constructor(private readonly context: ControllerContext) {}

  private get personalServerBaseUrl(): string {
    if (!this.context.defaultPersonalServerUrl) {
      throw new PersonalServerError(
        "Personal server URL is required for server operations. " +
          "Please configure defaultPersonalServerUrl in your VanaConfig.",
      );
    }
    return this.context.defaultPersonalServerUrl;
  }

  /**
   * Retrieves the cryptographic identity of a personal server.
   *
   * @remarks
   * This method fetches the public key and metadata for a personal server,
   * which is required for encrypting data before sharing with the server.
   * The identity includes the server's public key, address, and operational
   * details needed for secure communication. This information is cached
   * by identity servers to enable offline key retrieval.
   *
   * @param request - Parameters containing the user address
   * @param request.userAddress - The wallet address associated with the personal server
   * @returns Promise resolving to the server's identity information
   * @throws {NetworkError} When the identity service is unavailable or returns invalid data
   * @throws {PersonalServerError} When server identity cannot be retrieved
   * @example
   * ```typescript
   * // Get server identity for data encryption
   * const identity = await vana.server.getIdentity({
   *   userAddress: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36"
   * });
   *
   * console.log(`Server: ${identity.name}`);
   * console.log(`Address: ${identity.address}`);
   * console.log(`Public Key: ${identity.public_key}`);
   *
   * // Use the public key for encrypting data to share with this server
   * const encryptedData = await encryptWithWalletPublicKey(
   *   userData,
   *   identity.public_key
   * );
   * ```
   */
  async getIdentity(
    request: InitPersonalServerParams,
  ): Promise<PersonalServerIdentity> {
    try {
      const response = await fetch(
        `${this.personalServerBaseUrl}/identity?address=${request.userAddress}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      console.debug("🔍 Debug - getIdentity response", response);
      if (!response.ok) {
        const errorText = await response.text();
        throw new NetworkError(
          `Local identity API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const serverResponse = (await response.json()) as IdentityResponseModel;

      return {
        kind: serverResponse.personal_server.kind,
        address: serverResponse.personal_server.address,
        public_key: serverResponse.personal_server.public_key,
        base_url: this.personalServerBaseUrl,
        name: "Hosted Vana Server",
      };
    } catch (error) {
      if (
        error instanceof NetworkError ||
        error instanceof PersonalServerError
      ) {
        throw error;
      }
      throw new PersonalServerError(
        `Failed to get personal server identity: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Creates an operation via the personal server API.
   *
   * @deprecated Use `createOperationAndWait()` for automatic polling or
   *   `createOperationHandle()` for more control. This method will be removed in v2.0.0.
   * @remarks
   * This method submits a computation request to the personal server API.
   * The response includes the operation ID which must be manually polled using
   * `getOperation()`. For a better developer experience, use the new Promise-based
   * methods that handle polling automatically.
   * @param params - The request parameters object
   * @param params.permissionId - The permission ID authorizing this operation.
   *   Obtain from granted permissions via `vana.permissions.getUserPermissionGrantsOnChain()`.
   * @returns A Promise that resolves to an operation response with status and control URLs
   * @throws {PersonalServerError} When server request fails or parameters are invalid.
   *   Verify permissionId exists and is active for the target server.
   * @throws {NetworkError} When personal server API communication fails.
   *   Check server URL configuration and network connectivity.
   * @example
   * ```typescript
   * // Deprecated usage (requires manual polling)
   * const response = await vana.server.createOperation({
   *   permissionId: 123,
   * });
   * console.log(`Operation created: ${response.id}`);
   *
   * // Recommended: Use createOperationAndWait() instead
   * const result = await vana.server.createOperationAndWait({
   *   permissionId: 123
   * });
   * ```
   */
  async createOperation(
    params: CreateOperationParams,
  ): Promise<CreateOperationResponse> {
    try {
      const requestData = {
        permission_id: params.permissionId,
      };

      const requestJson = JSON.stringify(requestData);

      const signature = await this.createSignature(requestJson);

      const requestBody = {
        app_signature: signature,
        operation_request_json: requestJson,
      };

      // Step 5: Make request to personal server API
      console.debug("🔍 Debug - createOperation requestBody", requestBody);
      const response = await this.makeRequest(requestBody);

      return response;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (
          error instanceof NetworkError ||
          error instanceof SerializationError ||
          error instanceof SignatureError ||
          error instanceof PersonalServerError
        ) {
          throw error;
        }
        // Wrap unknown errors
        throw new PersonalServerError(
          `Personal server operation creation failed: ${error.message}`,
          error,
        );
      }
      throw new PersonalServerError(
        "Personal server operation creation failed with unknown error",
      );
    }
  }

  /**
   * Polls the status of a computation request for updates and results.
   *
   * @deprecated Use `waitForOperation()` for automatic polling or access via
   *   `OperationHandle`. Manual polling will be discouraged in v2.0.0.
   * @remarks
   * This method checks the current status of a computation request by querying
   * the personal server API using the provided operation ID. It returns the current
   * status, any available output, and error information. The method requires manual
   * polling loops which are error-prone. Use the new Promise-based methods for
   * automatic polling with proper timeout and error handling.
   *
   * Common status values include: `starting`, `processing`, `succeeded`, `failed`, `canceled`.
   * @param operationId - The operation ID returned from the initial request submission
   * @returns A Promise that resolves to the current operation response with status and results
   * @throws {NetworkError} When the polling request fails or returns invalid data
   * @example
   * ```typescript
   * // Deprecated: Manual polling
   * let result = await vana.server.getOperation(response.id);
   * while (result.status === "processing") {
   *   await new Promise(resolve => setTimeout(resolve, 1000));
   *   result = await vana.server.getOperation(response.id);
   * }
   *
   * // Recommended: Use waitForOperation() instead
   * const result = await vana.server.waitForOperation(response.id);
   * console.log("Computation completed:", result);
   * ```
   */
  async getOperation(operationId: string): Promise<GetOperationResponse> {
    try {
      console.debug("Polling Operation Status:", operationId);

      const response = await fetch(
        `${this.personalServerBaseUrl}/operations/${operationId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.debug("Polling Error Response:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new NetworkError(
          `Status polling failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = (await response.json()) as GetOperationResponse;

      console.debug("Polling Success Response:", data);

      return data;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to poll status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Cancels a running operation on the personal server.
   *
   * @remarks
   * This method attempts to cancel an operation that is currently processing
   * on the personal server. The operation must be in a cancellable state
   * (typically `starting` or `processing`). Not all operations support
   * cancellation, and cancellation may not be immediate. The server will
   * attempt to stop the operation and update its status to `canceled`.
   *
   * **Cancellation Behavior:**
   * - Operations in `succeeded` or `failed` states cannot be canceled
   * - Some long-running operations may take time to respond to cancellation
   * - Always verify cancellation by polling the operation status afterward
   *
   * @param operationId - The unique identifier of the operation to cancel,
   *   obtained from `createOperation()` response
   * @returns Promise that resolves when the cancellation request is accepted
   * @throws {PersonalServerError} When the operation cannot be canceled or doesn't exist.
   *   Check operation status - it may already be completed or failed.
   * @throws {NetworkError} When unable to reach the personal server API.
   *   Verify server URL and network connectivity.
   * @example
   * ```typescript
   * // Start a long-running operation
   * const operation = await vana.server.createOperation({
   *   permissionId: 123
   * });
   *
   * // Cancel if needed
   * try {
   *   await vana.server.cancelOperation(operation.id);
   *   console.log("Cancellation requested");
   *
   *   // Verify cancellation
   *   const status = await vana.server.getOperation(operation.id);
   *   if (status.status === "canceled") {
   *     console.log("Operation successfully canceled");
   *   }
   * } catch (error) {
   *   console.error("Failed to cancel:", error);
   * }
   * ```
   */
  async cancelOperation(operationId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.personalServerBaseUrl}/operations/${operationId}/cancel`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new PersonalServerError(
          `Failed to cancel operation: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to cancel operation: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Makes the request to the personal server API.
   *
   * @param requestBody - The post request parameters to serialize
   * @returns JSON string representation of the request data
   */
  private async makeRequest(
    requestBody: Record<string, unknown>,
  ): Promise<CreateOperationResponse> {
    try {
      console.debug("Personal Server Request:", {
        url: `${this.personalServerBaseUrl}/operations`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      const response = await fetch(`${this.personalServerBaseUrl}/operations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.debug("Personal Server Error Response:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new NetworkError(
          `Personal server API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = (await response.json()) as CreateOperationResponse;

      console.debug("Personal Server Success Response:", data);

      return data;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to make personal server API request: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Creates a signature for the request JSON.
   *
   * @param requestJson - The JSON string to sign
   * @returns Promise resolving to the cryptographic signature
   */
  private async createSignature(requestJson: string): Promise<string> {
    try {
      console.debug("🔍 Debug - createSignature", requestJson);

      // Use applicationClient if available, fallback to walletClient
      const client =
        this.context.applicationClient || this.context.walletClient;

      // Get the account from the wallet client
      const account = client.account;
      if (!account) {
        throw new SignatureError("No account available for signing");
      }

      // Only allow local accounts for signing
      if (account.type !== "local") {
        throw new SignatureError(
          "Only local accounts are supported for signing",
        );
      }

      console.debug("🔍 Debug - createSignature account", account);
      // Sign locally using the account's signMessage method
      const signature = await account.signMessage({
        message: requestJson,
      });

      return signature;
    } catch (error) {
      if (error instanceof Error && error.message.includes("User rejected")) {
        throw new SignatureError("User rejected the signature request");
      }
      throw new SignatureError(
        `Failed to create signature: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // ============================================================================
  // New Promise-based Methods for Improved Developer Experience
  // ============================================================================

  /**
   * Creates an operation and automatically waits for completion.
   *
   * @remarks
   * This method combines `createOperation()` and `getOperation()` into a single
   * Promise-based call that automatically polls for results. It simplifies the
   * common pattern of creating an operation and waiting for its completion,
   * eliminating the need for manual polling loops.
   *
   * The method will poll the operation status at regular intervals until it
   * succeeds, fails, or times out. You can customize the polling behavior
   * through the options parameter.
   *
   * @param params - The operation parameters
   * @param params.permissionId - The permission ID authorizing this operation
   * @param options - Optional polling configuration
   * @param options.pollingInterval - How often to check status in ms (default: 1000)
   * @param options.timeout - Maximum time to wait in ms (default: 30000)
   * @returns Promise resolving to the operation result
   * @throws {PersonalServerError} If the operation fails or times out
   * @example
   * ```typescript
   * // Simple usage with automatic polling
   * const result = await vana.server.createOperationAndWait({
   *   permissionId: 123
   * });
   * console.log("Operation completed:", result);
   *
   * // Custom polling configuration
   * const result = await vana.server.createOperationAndWait(
   *   { permissionId: 123 },
   *   {
   *     pollingInterval: 2000,  // Check every 2 seconds
   *     timeout: 60000          // Wait up to 1 minute
   *   }
   * );
   * ```
   */
  async createOperationAndWait<T = unknown>(
    params: CreateOperationParams,
    options?: PollingOptions,
  ): Promise<T> {
    const operation = await this.createOperation(params);
    return this.waitForOperation<T>(operation.id, options);
  }

  /**
   * Creates an operation and returns a handle for flexible control.
   *
   * @remarks
   * This method creates an operation and returns an `OperationHandle` that
   * provides methods for checking status, waiting for results, or canceling
   * the operation. This pattern matches the `TransactionHandle` used for
   * blockchain operations, providing consistency across the SDK.
   *
   * Use this method when you need more control over the operation lifecycle,
   * such as checking status before waiting or canceling long-running operations.
   *
   * @param params - The operation parameters
   * @param params.permissionId - The permission ID authorizing this operation
   * @returns An OperationHandle for controlling the operation
   * @example
   * ```typescript
   * // Create operation and get handle
   * const handle = await vana.server.createOperationHandle({
   *   permissionId: 123
   * });
   *
   * // Check status
   * const status = await handle.getStatus();
   * if (status === 'processing') {
   *   console.log("Operation is running...");
   * }
   *
   * // Wait for result
   * const result = await handle.waitForResult();
   *
   * // Or cancel if needed
   * await handle.cancel();
   * ```
   */
  async createOperationHandle<T = unknown>(
    params: CreateOperationParams,
  ): Promise<OperationHandle<T>> {
    const operation = await this.createOperation(params);
    return new OperationHandle<T>(this, operation.id);
  }

  /**
   * Waits for an existing operation to complete.
   *
   * @remarks
   * This method polls an existing operation until it completes, fails, or
   * times out. It's useful when you have an operation ID from a previous
   * session or from another source and want to wait for its completion
   * with automatic polling.
   *
   * The polling behavior can be customized through the options parameter.
   * The method will throw an error if the operation fails or times out.
   *
   * @param operationId - The ID of the operation to wait for
   * @param options - Optional polling configuration
   * @param options.pollingInterval - How often to check status in ms (default: 1000)
   * @param options.timeout - Maximum time to wait in ms (default: 30000)
   * @returns Promise resolving to the operation result
   * @throws {PersonalServerError} If the operation fails or times out
   * @example
   * ```typescript
   * // Wait for an existing operation
   * const result = await vana.server.waitForOperation(operationId);
   *
   * // With custom timeout
   * const result = await vana.server.waitForOperation(
   *   operationId,
   *   { timeout: 120000 }  // Wait up to 2 minutes
   * );
   * ```
   */
  async waitForOperation<T = unknown>(
    operationId: string,
    options?: PollingOptions,
  ): Promise<T> {
    const handle = new OperationHandle<T>(this, operationId);
    return handle.waitForResult(options);
  }
}
