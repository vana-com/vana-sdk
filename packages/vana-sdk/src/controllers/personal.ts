import { Address } from "viem";
import {
  PostRequestParams,
  ReplicatePredictionResponse,
  InitPersonalServerParams,
  PersonalServerResponse,
} from "../types";
import {
  NetworkError,
  SerializationError,
  SignatureError,
  PersonalServerError,
} from "../errors";
import { ControllerContext } from "./permissions";

/**
 * Controller for managing personal server interactions.
 */
export class PersonalController {
  private readonly REPLICATE_API_URL =
    "https://api.replicate.com/v1/predictions";
  private readonly PERSONAL_SERVER_VERSION =
    "vana-com/personal-server:1ef2dbffd550699b73b1a4d43ec9407e129333bdb59cdb701caefa6c03a42155";
  private readonly IDENTITY_SERVER_VERSION =
    "vana-com/identity-server:367b7d1a75f948de18fd1868fd4d29fff55d8277c3cc68c75df0bd2cf5f1d359";

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
      console.debug("🔍 Debug - replicateInput", replicateInput);
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
   * Initializes the personal server and fetches user identity.
   *
   * @param params - The request parameters containing user address
   * @returns Promise resolving to the user's identity information
   */
  async initPersonalServer(
    params: InitPersonalServerParams,
  ): Promise<PersonalServerResponse> {
    try {
      // Step 1: Validate parameters
      this.validateInitPersonalServerParams(params);

      // Step 2: Make request to personal server
      const response = await this.makePersonalServerRequest(params);

      // Step 3: Poll for results until completion
      const result = await this.pollPersonalServerResult(response);

      return result;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (
          error instanceof NetworkError ||
          error instanceof SerializationError ||
          error instanceof PersonalServerError
        ) {
          throw error;
        }
        // Wrap unknown errors
        throw new PersonalServerError(
          `Personal server initialization failed: ${error.message}`,
          error,
        );
      }
      throw new PersonalServerError(
        "Personal server initialization failed with unknown error",
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
      console.debug("Polling Replicate Status:", getUrl);

      const response = await fetch(getUrl, {
        method: "GET",
        headers: {
          Authorization: `Token ${this.getReplicateApiToken()}`,
          "Content-Type": "application/json",
        },
      });

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

      const data = await response.json();

      console.debug("Polling Success Response:", data);

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
   * Validates the init personal server parameters.
   */
  private validateInitPersonalServerParams(
    params: InitPersonalServerParams,
  ): void {
    if (!params.userAddress || typeof params.userAddress !== "string") {
      throw new PersonalServerError(
        "User address is required and must be a valid string",
      );
    }

    // Basic address validation
    if (
      !params.userAddress.startsWith("0x") ||
      params.userAddress.length !== 42
    ) {
      throw new PersonalServerError(
        "User address must be a valid Ethereum address",
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

  /**
   * Gets the Replicate API token from environment.
   */
  private getReplicateApiToken(): string {
    // Try server-side env var first, fallback to public for backwards compatibility
    const token =
      process.env.REPLICATE_API_TOKEN ||
      process.env.NEXT_PUBLIC_REPLICATE_API_TOKEN;
    if (!token) {
      throw new PersonalServerError(
        "REPLICATE_API_TOKEN environment variable is required",
      );
    }
    return token;
  }

  /**
   * Makes the request to the Replicate API.
   */
  private async makeReplicateRequest(
    input: Record<string, unknown>,
  ): Promise<ReplicatePredictionResponse> {
    try {
      const requestBody = {
        version: this.PERSONAL_SERVER_VERSION,
        input,
      };

      console.debug("Replicate Request:", {
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
        console.debug("Replicate Error Response:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new NetworkError(
          `Replicate API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();

      console.debug("Replicate Success Response:", data);

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
   * Makes the request to the personal server.
   */
  private async makePersonalServerRequest(
    params: InitPersonalServerParams,
  ): Promise<ReplicatePredictionResponse> {
    try {
      const requestBody = {
        version: this.IDENTITY_SERVER_VERSION,
        input: {
          user_address: params.userAddress,
        },
      };

      console.debug("Personal Server Request:", {
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
        console.debug("Personal Server Error Response:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new NetworkError(
          `Personal Server API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();

      console.debug("Personal Server Success Response:", data);

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
        `Failed to make Personal Server API request: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Polls the personal server result until completion.
   */
  private async pollPersonalServerResult(
    initialResponse: ReplicatePredictionResponse,
  ): Promise<PersonalServerResponse> {
    const maxAttempts = 60; // 60 seconds max
    let attempts = 0;
    let currentResponse = initialResponse;

    while (attempts < maxAttempts) {
      if (currentResponse.status === "succeeded") {
        // Parse the output to extract identity information
        const output = currentResponse.output as Record<string, unknown>;

        // Parse the output string if it's a JSON string
        let parsedOutput: Record<string, unknown>;
        if (typeof output === "string") {
          try {
            parsedOutput = JSON.parse(output);
          } catch {
            parsedOutput = output as Record<string, unknown>;
          }
        } else {
          parsedOutput = output;
        }

        return {
          userAddress: parsedOutput.user_address as string,
          identity: {
            name: undefined,
            email: undefined,
            avatar: undefined,
            metadata: {
              derivedAddress: parsedOutput.derived_address as string,
            },
          },
          timestamp: new Date().toISOString(),
        };
      } else if (currentResponse.status === "failed") {
        throw new PersonalServerError(
          `Personal server initialization failed: ${currentResponse.error || "Unknown error"}`,
        );
      } else if (currentResponse.status === "canceled") {
        throw new PersonalServerError(
          "Personal server initialization was canceled",
        );
      }

      // Wait 1 second before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;

      // Poll for updated status
      if (currentResponse.urls.get) {
        currentResponse = await this.pollStatus(currentResponse.urls.get);
      }
    }

    throw new PersonalServerError(
      "Personal server initialization timed out after 60 seconds",
    );
  }

  /**
   * Gets the user's address from the wallet client.
   */
  private async getApplicationAddress(): Promise<Address> {
    try {
      // Use applicationClient if available, fallback to walletClient
      const client =
        this.context.applicationClient || this.context.walletClient;
      const addresses = await client.getAddresses();
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
