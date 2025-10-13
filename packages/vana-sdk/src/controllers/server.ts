import type {
  CreateOperationParams,
  InitPersonalServerParams,
  PersonalServerIdentity,
  DownloadArtifactParams,
} from "../types";
import type {
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
import type { ControllerContext } from "./permissions";
import type { Operation, PollingOptions } from "../types/operations";
import { BaseController } from "./base";

// Server types are now auto-imported from the generated exports

/**
 * Manages personal server interactions for secure data processing.
 *
 * @remarks
 * Handles communication with personal servers for computation requests
 * and identity retrieval. Personal servers process user data with
 * cryptographic verification, ensuring privacy and permission compliance.
 *
 * **Architecture:**
 * Servers use deterministic key derivation from user addresses.
 * Identity cached for offline retrieval. Operations authenticated
 * via wallet signatures and permission verification.
 *
 * **Method Selection:**
 * - `getIdentity()` - Retrieve server public key for encryption
 * - `createOperation()` - Submit computation with permission ID
 * - `getOperation()` - Check status and retrieve results
 * - `waitForOperation()` - Poll until completion or timeout
 * - `cancelOperation()` - Stop running operations
 *
 * **Typical Workflow:**
 * 1. Get server identity for encryption key
 * 2. Create operation with permission ID
 * 3. Poll for completion
 * 4. Retrieve results
 *
 * @example
 * ```typescript
 * // Get server identity for encryption
 * const identity = await vana.server.getIdentity({
 *   userAddress: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36"
 * });
 * console.log(`Server key: ${identity.publicKey}`);
 *
 * // Submit computation request
 * const operation = await vana.server.createOperation({
 *   permissionId: 123
 * });
 *
 * // Wait for results
 * const result = await vana.server.waitForOperation(operation.id);
 * console.log("Processing complete:", result.result);
 * ```
 *
 * @category Server Management
 * @see For conceptual overview, visit {@link https://docs.vana.org/docs/personal-servers}
 */
export class ServerController extends BaseController {
  constructor(context: ControllerContext) {
    super(context);
  }

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
   * Retrieves cryptographic identity for a personal server.
   *
   * @remarks
   * Fetches public key and metadata required for data encryption.
   * Identity cached by infrastructure for offline retrieval.
   * Each user address maps to deterministic server identity.
   *
   * @param request - Identity request parameters
   * @param request.userAddress - Wallet address of server owner
   *
   * @returns Server identity with public key and metadata
   *
   * @throws {NetworkError} Identity service unavailable.
   *   Check network connection and server URL configuration.
   * @throws {PersonalServerError} Identity retrieval failed.
   *   Verify user address and server registration.
   *
   * @example
   * ```typescript
   * const identity = await vana.server.getIdentity({
   *   userAddress: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36"
   * });
   *
   * console.log(`Server: ${identity.name}`);
   * console.log(`Address: ${identity.address}`);
   * console.log(`Public Key: ${identity.publicKey}`);
   *
   * // Use for encryption before data sharing
   * const encrypted = await encryptWithPublicKey(
   *   data,
   *   identity.publicKey
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
        publicKey: serverResponse.personal_server.public_key,
        baseUrl: this.personalServerBaseUrl,
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
   * Creates a server operation and returns its details as a plain object.
   *
   * @remarks
   * This method submits a computation request to the personal server and returns
   * an Operation object that can be serialized and passed across API boundaries.
   * Use `waitForOperation()` to poll for completion.
   *
   * @param params - The operation request parameters
   * @param params.permissionId - The permission ID authorizing this operation.
   *   Obtain via `vana.permissions.getUserPermissionGrantsOnChain()`.
   * @returns An Operation object containing the operation ID and status
   * @throws {PersonalServerError} When the server request fails or parameters are invalid
   * @throws {NetworkError} When personal server API communication fails
   * @example
   * ```typescript
   * const operation = await vana.server.createOperation({
   *   permissionId: 123
   * });
   * console.log(`Operation ID: ${operation.id}`);
   *
   * // Wait for completion
   * const result = await vana.server.waitForOperation(operation.id);
   * console.log("Result:", result.result);
   * ```
   */
  async createOperation<T = unknown>(
    params: CreateOperationParams,
  ): Promise<Operation<T>> {
    this.assertWallet();

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

      return {
        id: response.id,
        status: "starting",
        createdAt: Date.now(),
      } as Operation<T>;
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
   * Retrieves the current status and result of a server operation.
   *
   * @remarks
   * Common status values: `starting`, `running`, `succeeded`, `failed`, `canceled`.
   * When status is `succeeded`, the result field contains the operation output.
   *
   * @param operationId - The ID of the operation to query
   * @returns The operation as a plain object containing status, result, and metadata
   * @throws {NetworkError} When the API request fails or returns invalid data
   * @example
   * ```typescript
   * const operation = await vana.server.getOperation(operationId);
   * if (operation.status === 'succeeded') {
   *   console.log('Result:', operation.result);
   * }
   * ```
   */
  async getOperation<T = unknown>(operationId: string): Promise<Operation<T>> {
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

      return {
        id: data.id,
        status: data.status as Operation["status"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        result: data.status === "succeeded" ? (data.result as T) : undefined,
        error:
          data.status === "failed" ? (data.result ?? undefined) : undefined,
      };
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
   * Waits for an operation to complete and returns the final result.
   *
   * @remarks
   * This method polls the operation status at regular intervals until it
   * reaches a terminal state (succeeded, failed, or canceled). Supports
   * ergonomic overloads to accept either an Operation object or just the ID.
   *
   * @param opOrId - Either an Operation object or operation ID string
   * @param options - Optional polling configuration
   * @returns The completed operation with result or error
   * @throws {PersonalServerError} When the operation fails or times out
   * @example
   * ```typescript
   * // Using operation object
   * const operation = await vana.server.createOperation({ permissionId: 123 });
   * const completed = await vana.server.waitForOperation(operation);
   *
   * // Using just the ID
   * const completed = await vana.server.waitForOperation("op_abc123");
   *
   * // With custom timeout
   * const completed = await vana.server.waitForOperation(operation, {
   *   timeout: 60000,
   *   pollingInterval: 1000
   * });
   * ```
   */
  async waitForOperation<T = unknown>(
    opOrId: Operation<T> | string,
    options?: PollingOptions,
  ): Promise<Operation<T>> {
    const id = typeof opOrId === "string" ? opOrId : opOrId.id;
    const startTime = Date.now();
    const timeout = options?.timeout ?? 30000;
    const interval = options?.pollingInterval ?? 500;

    while (true) {
      const operation = await this.getOperation<T>(id);

      if (operation.status === "succeeded") {
        return operation;
      }

      if (operation.status === "failed") {
        throw new PersonalServerError(
          `Operation ${operation.status}: ${operation.error ?? "Unknown error"}`,
        );
      }

      if (operation.status === "canceled") {
        throw new PersonalServerError(`Operation was canceled`);
      }

      if (Date.now() - startTime > timeout) {
        throw new PersonalServerError(`Operation timed out after ${timeout}ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  /**
   * Downloads an artifact generated by a server operation.
   *
   * @remarks
   * Artifacts are files generated during operations like Gemini agent analysis.
   * The download requires authentication using the application's signature.
   * This method returns the artifact as a Blob that can be saved or processed.
   *
   * **Simplified Signature Scheme:**
   * The signature is generated over the operation ID only, allowing a single signature
   * to be reused for listing and downloading multiple artifacts from the same operation.
   * This simplifies client implementation while maintaining security - access to the
   * operation ID grants access to all artifacts.
   *
   * @param params - The download parameters
   * @param params.operationId - The operation ID that generated the artifact
   * @param params.artifactPath - The path to the artifact file to download
   * @returns A Blob containing the artifact data
   * @throws {PersonalServerError} When the artifact cannot be downloaded or doesn't exist
   * @throws {NetworkError} When unable to reach the personal server API
   * @throws {SignatureError} When unable to create the required signature
   * @example
   * ```typescript
   * // Download an artifact after a Gemini operation
   * const blob = await vana.server.downloadArtifact({
   *   operationId: 'op_123',
   *   artifactPath: 'analysis_report.pdf'
   * });
   *
   * // Save to file in Node.js
   * const buffer = await blob.arrayBuffer();
   * fs.writeFileSync('report.pdf', Buffer.from(buffer));
   *
   * // Or create download link in browser
   * const url = URL.createObjectURL(blob);
   * const a = document.createElement('a');
   * a.href = url;
   * a.download = 'report.pdf';
   * a.click();
   * ```
   */
  async downloadArtifact(params: DownloadArtifactParams): Promise<Blob> {
    this.assertWallet();

    try {
      // Simplified signature scheme: sign only operation_id
      // This allows the same signature to be reused for all artifacts
      const signatureData = {
        operation_id: params.operationId,
      };

      const requestJson = JSON.stringify(signatureData);
      const signature = await this.createSignature(requestJson);

      // Request body still includes artifact_path for the API
      const requestBody = {
        operation_id: params.operationId,
        artifact_path: params.artifactPath,
        signature,
      };

      const response = await fetch(
        `${this.personalServerBaseUrl}/artifacts/download`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new PersonalServerError(
          `Artifact download failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      return await response.blob();
    } catch (error) {
      if (
        error instanceof NetworkError ||
        error instanceof PersonalServerError ||
        error instanceof SignatureError
      ) {
        throw error;
      }
      throw new PersonalServerError(
        `Failed to download artifact: ${error instanceof Error ? error.message : "Unknown error"}`,
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
        this.context.applicationClient ?? this.context.walletClient;

      if (!client) {
        throw new SignatureError("No client available for signing");
      }

      // Get the account from the wallet client
      const { account } = client;
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
}
