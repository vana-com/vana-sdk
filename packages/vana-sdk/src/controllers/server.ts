import {
  CreateOperationParams,
  InitPersonalServerParams,
  OperationCreatedResponse,
  GetOperationResponse,
} from "../types";
import { IdentityServerOutput } from "../types/external-apis";
import {
  NetworkError,
  SerializationError,
  SignatureError,
  PersonalServerError,
} from "../errors";
import { ControllerContext } from "./permissions";
import { PersonalServerInfo as PersonalServerIdentity } from "../types/personal";

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
 * Personal servers enable privacy-preserving computation on user data, while identity
 * servers provide deterministic key derivation for secure communication without
 * requiring servers to be online during key retrieval.
 * @example
 * ```typescript
 * // Post a request to a personal server
 * const response = await vana.server.postRequest({
 *   permissionId: 123,
 * });
 *
 * // Get a server's public key for encryption
 * const publicKey = await vana.server.getTrustedServerPublicKey(
 *   "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36"
 * );
 *
 * // Poll for computation results
 * const result = await vana.server.pollStatus(response.urls.get);
 * ```
 * @category Server Management
 * @see {@link [URL_PLACEHOLDER] | Vana Personal Servers} for conceptual overview
 */
export class ServerController {
  private readonly PERSONAL_SERVER_BASE_URL =
    process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL;

  constructor(private readonly context: ControllerContext) {}

  async getIdentity(
    request: InitPersonalServerParams,
  ): Promise<PersonalServerIdentity> {
    try {
      const response = await fetch(
        `${this.PERSONAL_SERVER_BASE_URL}/identity?address=${request.userAddress}`,
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

      const serverResponse = (await response.json()) as IdentityServerOutput;

      return {
        address: serverResponse.personal_server.address,
        public_key: serverResponse.personal_server.public_key,
        base_url: this.PERSONAL_SERVER_BASE_URL || "",
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
   * @remarks
   * This method submits a computation request to the personal server API.
   * The response includes the operation ID.
   * @param params - The request parameters object
   * @param params.permissionId - The permission ID authorizing this operation
   * @returns A Promise that resolves to an operation response with status and control URLs
   * @throws {PersonalServerError} When server request fails or parameters are invalid
   * @throws {NetworkError} When personal server API communication fails
   * @example
   * ```typescript
   * const response = await vana.server.createOperation({
   *   permissionId: 123,
   * });
   *
   * console.log(`Operation created: ${response.id}`);
   * ```
   */
  async createOperation(
    params: CreateOperationParams,
  ): Promise<OperationCreatedResponse> {
    try {
      const requestData = {
        permission_id: params.permissionId,
      };

      const requestJson = JSON.stringify(requestData);

      const signature = await this.createSignature(requestJson);

      const requestBody = {
        app_signature: signature,
        operation: {
          permission_id: params.permissionId,
        },
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
   * @remarks
   * This method checks the current status of a computation request by querying
   * the personal server API using the provided operation ID. It returns the current
   * status, any available output, and error information. The method can be
   * called periodically until the operation completes or fails.
   *
   * Common status values include: `starting`, `processing`, `succeeded`, `failed`, `canceled`.
   * @param operationId - The operation ID returned from the initial request submission
   * @returns A Promise that resolves to the current operation response with status and results
   * @throws {NetworkError} When the polling request fails or returns invalid data
   * @example
   * ```typescript
   * // Poll until completion
   * let result = await vana.server.getOperation(response.id);
   *
   * while (result.status === "processing") {
   *   await new Promise(resolve => setTimeout(resolve, 1000));
   *   result = await vana.server.getOperation(response.id);
   * }
   *
   * if (result.status === "succeeded") {
   *   console.log("Computation completed:", result.output);
   * }
   * ```
   */
  async getOperation(operationId: string): Promise<GetOperationResponse> {
    try {
      console.debug("Polling Operation Status:", operationId);

      const response = await fetch(
        `${this.PERSONAL_SERVER_BASE_URL}/operations/${operationId}`,
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

  async cancelOperation(operationId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.PERSONAL_SERVER_BASE_URL}/operations/${operationId}/cancel`,
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
   * @param params - The post request parameters to serialize
   * @returns JSON string representation of the request data
   */
  private async makeRequest(
    requestBody: Record<string, unknown>,
  ): Promise<OperationCreatedResponse> {
    try {
      console.debug("Personal Server Request:", {
        url: `${this.PERSONAL_SERVER_BASE_URL}/operations`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      const response = await fetch(
        `${this.PERSONAL_SERVER_BASE_URL}/operations`,
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
        console.debug("Personal Server Error Response:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new NetworkError(
          `Personal server API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = (await response.json()) as OperationCreatedResponse;

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
