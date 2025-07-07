import { Address, keccak256, toHex } from "viem";
import type { WalletClient } from "viem";
import { PostRequestParams, ReplicatePredictionResponse } from "../types";
import {
  NetworkError,
  SerializationError,
  SignatureError,
  PersonalServerError,
} from "../errors";
import { ControllerContext } from "./permissions";
import { signMessage } from "viem/accounts";

/**
 * Controller for managing personal server interactions.
 */
export class PersonalController {
  private readonly REPLICATE_API_URL =
    "https://api.replicate.com/v1/predictions";
  private readonly PERSONAL_SERVER_VERSION =
    "vana-com/personal-server:1ef2dbffd550699b73b1a4d43ec9407e129333bdb59cdb701caefa6c03a42155";

  constructor(private readonly context: ControllerContext) {}

  /**
   * Posts a computation request to the personal server.
   *
   * @param params - The request parameters
   * @returns Promise resolving to the response with links to get results or cancel computation
   */
  async postRequest(
    params: PostRequestParams,
  ): Promise<ReplicatePredictionResponse> {
    try {
      // Step 1: Validate parameters
      this.validatePostRequestParams(params);

      // Step 2: Get user address for signature
      const applicationAddress = await this.getApplicationAddress();

      // Step 3: Create request JSON
      const requestJson = this.createRequestJson(params, applicationAddress);

      // Step 4: Create signature locally
      const signature = await this.createSignature(requestJson);

      // Step 5: Prepare input for Replicate API
      const replicateInput = {
        replicate_api_token: this.getReplicateApiToken(),
        signature,
        request_json: requestJson,
      };

      // Step 6: Make request to Replicate API
      console.log("🔍 Debug - replicateInput", replicateInput);
      const response = await this.makeReplicateRequest(replicateInput);

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
          `Personal server request failed: ${error.message}`,
          error,
        );
      }
      throw new PersonalServerError(
        "Personal server request failed with unknown error",
      );
    }
  }

  /**
   * Polls the status of a computation request using the get URL.
   *
   * @param getUrl - The URL to poll for status updates
   * @returns Promise resolving to the current status and results
   */
  async pollStatus(getUrl: string): Promise<ReplicatePredictionResponse> {
    try {
      console.log("Polling Replicate Status:", getUrl);

      const response = await fetch(getUrl, {
        method: "GET",
        headers: {
          Authorization: `Token ${this.getReplicateApiToken()}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log("Polling Error Response:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new NetworkError(
          `Status polling failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();

      console.log("Polling Success Response:", data);

      // Transform Replicate response to our expected format
      return {
        id: data.id,
        status: data.status,
        urls: {
          get: data.urls?.get || getUrl,
          cancel: data.urls?.cancel || "",
        },
        input: data.input,
        output: data.output,
        error: data.error,
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
   * Validates the post request parameters.
   */
  private validatePostRequestParams(params: PostRequestParams): void {
    if (typeof params.permissionId !== "number" || params.permissionId <= 0) {
      throw new PersonalServerError(
        "Permission ID is required and must be a valid positive number",
      );
    }
  }

  /**
   * Creates the request JSON string for the personal server.
   */
  private createRequestJson(
    params: PostRequestParams,
    userAddress: Address,
  ): string {
    try {
      const requestData = {
        user_address: userAddress,
        permission_id: params.permissionId,
      };

      return JSON.stringify(requestData);
    } catch (error) {
      throw new SerializationError(
        `Failed to create request JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Creates a signature for the request JSON.
   */
  private async createSignature(requestJson: string): Promise<string> {
    try {
      console.log("🔍 Debug - createSignature", requestJson);

      // Get the account from the wallet client
      const account = this.context.applicationClient.account;
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

  /**
   * Gets the Replicate API token from environment.
   */
  private getReplicateApiToken(): string {
    const token = process.env.NEXT_PUBLIC_REPLICATE_API_TOKEN;
    if (!token) {
      throw new PersonalServerError(
        "NEXT_PUBLIC_REPLICATE_API_TOKEN environment variable is required",
      );
    }
    return token;
  }

  /**
   * Makes the request to the Replicate API.
   */
  private async makeReplicateRequest(
    input: Record<string, any>,
  ): Promise<ReplicatePredictionResponse> {
    try {
      const requestBody = {
        version: this.PERSONAL_SERVER_VERSION,
        input,
      };

      console.log("Replicate Request:", {
        url: this.REPLICATE_API_URL,
        method: "POST",
        headers: {
          Authorization: `Token ${this.getReplicateApiToken().substring(0, 10)}...`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      const response = await fetch(this.REPLICATE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.getReplicateApiToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log("Replicate Error Response:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new NetworkError(
          `Replicate API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();

      console.log("Replicate Success Response:", data);

      // Transform Replicate response to our expected format
      return {
        id: data.id,
        status: data.status,
        urls: {
          get: data.urls?.get || "",
          cancel: data.urls?.cancel || "",
        },
        input: data.input,
        output: data.output,
        error: data.error,
      };
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to make Replicate API request: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Gets the user's address from the wallet client.
   */
  private async getApplicationAddress(): Promise<Address> {
    try {
      const addresses = await this.context.applicationClient.getAddresses();
      if (!addresses || addresses.length === 0) {
        throw new PersonalServerError(
          "No addresses available from wallet client",
        );
      }
      return addresses[0];
    } catch (error) {
      throw new PersonalServerError(
        `Failed to get user address: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
