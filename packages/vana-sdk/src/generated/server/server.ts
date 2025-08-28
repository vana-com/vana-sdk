// Vana Personal Server API Types
// Generated automatically from OpenAPI specification - do not edit manually
// Source: https://raw.githubusercontent.com/vana-com/vana-personal-server/main/openapi.yaml
// Generated on: 2025-08-28T03:43:46.312Z

export interface paths {
  "/operations": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Start an operation (asynchronous)
     * @description Creates a new operation with the provided request data and signature.
     *
     *     **How it works:**
     *     1. The `permission_id` in the request references a blockchain permission
     *     2. The permission contains a link to a grant file (stored on IPFS)
     *     3. The grant file defines the operation type and parameters
     *     4. The grant file is cryptographically signed by the grantee
     *
     *     **Grant File Examples:**
     *
     *     *LLM Inference with JSON mode:*
     *     ```json
     *     {
     *       "grantee": "0x123...",
     *       "operation": "llm_inference",
     *       "parameters": {
     *         "prompt": "Analyze this data: {{data}}",
     *         "response_format": {"type": "json_object"}
     *       }
     *     }
     *     ```
     *
     *     *LLM Inference with text mode (default):*
     *     ```json
     *     {
     *       "grantee": "0x123...",
     *       "operation": "llm_inference",
     *       "parameters": {
     *         "prompt": "Summarize this content: {{data}}"
     *       }
     *     }
     *     ```
     *
     *     **Possible Errors:**
     *     - `400 VALIDATION_ERROR`: Invalid request format or missing required fields
     *     - `400 VALIDATION_ERROR_PERMISSION_ID`: Invalid or missing permission ID
     *     - `400 VALIDATION_ERROR_OPERATION_REQUEST_JSON`: Invalid JSON format in operation request
     *     - `400 GRANT_VALIDATION_ERROR`: Grant validation failed
     *     - `401 AUTHENTICATION_ERROR`: Invalid signature or unable to recover app address
     *     - `404 NOT_FOUND_ERROR`: Permission, file, or grant not found
     *     - `500 BLOCKCHAIN_ERROR`: Blockchain communication failed
     *     - `500 FILE_ACCESS_ERROR`: Failed to access or download files
     *     - `500 DECRYPTION_ERROR`: Failed to decrypt file content
     *     - `500 COMPUTE_ERROR`: Compute operation failed
     *     - `500 OPERATION_ERROR`: General operation processing error
     *     - `500 INTERNAL_SERVER_ERROR`: Unexpected server error
     *
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody: {
        content: {
          "application/json": components["schemas"]["CreateOperationRequest"];
        };
      };
      responses: {
        /** @description Accepted — operation handle returned. */
        202: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["CreateOperationResponse"];
          };
        };
        /** @description Validation or grant validation error */
        400: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json":
              | components["schemas"]["ValidationErrorResponse"]
              | components["schemas"]["GrantValidationErrorResponse"];
          };
        };
        /** @description Authentication error (invalid signature) */
        401: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["AuthenticationErrorResponse"];
          };
        };
        /** @description Resource not found (permission, file, or grant) */
        404: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["NotFoundErrorResponse"];
          };
        };
        /** @description Server error during operation processing */
        500: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json":
              | components["schemas"]["BlockchainErrorResponse"]
              | components["schemas"]["FileAccessErrorResponse"]
              | components["schemas"]["DecryptionErrorResponse"]
              | components["schemas"]["ComputeErrorResponse"]
              | components["schemas"]["OperationErrorResponse"]
              | components["schemas"]["InternalServerErrorResponse"];
          };
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/operations/{operation_id}": {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description The operation ID */
        operation_id: components["parameters"]["OpId"];
      };
      cookie?: never;
    };
    /**
     * Poll operation status / result
     * @description Retrieves the current status and result of an operation.
     *
     *     **Possible Errors:**
     *     - `404 NOT_FOUND_ERROR`: Operation not found
     *     - `500 COMPUTE_ERROR`: Failed to get prediction status
     *     - `500 INTERNAL_SERVER_ERROR`: Unexpected server error
     *
     */
    get: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          /** @description The operation ID */
          operation_id: components["parameters"]["OpId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Operation status retrieved successfully */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["GetOperationResponse"];
          };
        };
        /** @description Operation not found */
        404: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["NotFoundErrorResponse"];
          };
        };
        /** @description Server error during status retrieval */
        500: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json":
              | components["schemas"]["ComputeErrorResponse"]
              | components["schemas"]["InternalServerErrorResponse"];
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/operations/{operation_id}/cancel": {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description The operation ID */
        operation_id: components["parameters"]["OpId"];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Cancel a running operation
     * @description Cancels a running operation.
     *
     *     **Possible Errors:**
     *     - `404 NOT_FOUND_ERROR`: Operation not found
     *     - `500 COMPUTE_ERROR`: Failed to cancel prediction
     *     - `500 INTERNAL_SERVER_ERROR`: Unexpected server error
     *
     */
    post: {
      parameters: {
        query?: never;
        header?: never;
        path: {
          /** @description The operation ID */
          operation_id: components["parameters"]["OpId"];
        };
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Operation cancelled or already finished */
        204: {
          headers: {
            [name: string]: unknown;
          };
          content?: never;
        };
        /** @description Operation not found */
        404: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["NotFoundErrorResponse"];
          };
        };
        /** @description Server error during cancellation */
        500: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json":
              | components["schemas"]["ComputeErrorResponse"]
              | components["schemas"]["InternalServerErrorResponse"];
          };
        };
      };
    };
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/identity": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Derive deterministic server identity for a user
     * @description Derives a deterministic server identity (address and public key) for a user based on their Ethereum address.
     *
     *     **Possible Errors:**
     *     - `400 VALIDATION_ERROR_USER_ADDRESS`: Invalid user address format
     *     - `500 OPERATION_ERROR`: Address derivation failed
     *     - `500 INTERNAL_SERVER_ERROR`: Unexpected server error
     *
     */
    get: {
      parameters: {
        query: {
          /** @description Caller's wallet address (EIP-55). */
          address: components["schemas"]["EthereumAddress"];
        };
        header?: never;
        path?: never;
        cookie?: never;
      };
      requestBody?: never;
      responses: {
        /** @description Server identity retrieved successfully */
        200: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["IdentityResponseModel"];
          };
        };
        /** @description Invalid address format */
        400: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json": components["schemas"]["ValidationErrorResponse"];
          };
        };
        /** @description Server error during identity derivation */
        500: {
          headers: {
            [name: string]: unknown;
          };
          content: {
            "application/json":
              | components["schemas"]["OperationErrorResponse"]
              | components["schemas"]["InternalServerErrorResponse"];
          };
        };
      };
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /**
     * @description EIP-55 checksum address, 20 bytes, 0x-prefixed.
     * @example 0xf0ebD65BEaDacD191dc96D8EC69bbA4ABCf621D4
     */
    EthereumAddress: string;
    /**
     * @description Uncompressed secp256k1 public key, 128 hex characters.
     * @example 0x04bcdf3e…
     */
    PublicKey: string;
    CreateOperationRequest: {
      /**
       * @description The signature over the operation_request_json
       * @example 0x3cffa64411a02d4a257663848df70fd445f513edcbb78a2e94495af45987e2de6144efdafd37a3d2b95e4e535c4a84fbcfb088d8052d435c382e7ca9a5ac57801c
       */
      app_signature: string;
      /**
       * @description The request JSON which contains permission_id.
       *     The operation type and parameters are defined in the grant file
       *     referenced by the blockchain permission.
       *
       * @example {"permission_id": 1024}
       */
      operation_request_json: string;
    };
    CreateOperationResponse: {
      /**
       * @description Resource type identifier
       * @default OperationCreated
       * @example OperationCreated
       */
      kind: string;
      /**
       * @description The operation ID for tracking the computation
       * @example test-prediction-id-123
       */
      id: string;
      /**
       * Format: date-time
       * @description The timestamp when the operation was created
       * @example 2024-01-01T00:00:00Z
       */
      created_at: string;
    };
    GetOperationResponse: {
      /**
       * @description Resource type identifier
       * @default OperationStatus
       * @example OperationStatus
       */
      kind: string;
      /**
       * @description The operation ID
       * @example test-prediction-id-123
       */
      id: string;
      /**
       * @description The status of the operation
       * @enum {string}
       */
      status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
      /**
       * Format: date-time
       * @description Optional timestamp when the operation started
       * @example 2024-01-01T00:00:00Z
       */
      started_at?: string | null;
      /**
       * Format: date-time
       * @description Optional timestamp when the operation finished
       * @example 2024-01-01T00:00:00Z
       */
      finished_at?: string | null;
      /** @description Optional result data if operation completed successfully */
      result?: string | null;
    };
    PersonalServerModel: {
      /**
       * @description Resource type identifier
       * @default PersonalServer
       * @example PersonalServer
       */
      kind: string;
      address: components["schemas"]["EthereumAddress"];
      public_key: components["schemas"]["PublicKey"];
    };
    IdentityResponseModel: {
      /**
       * @description Resource type identifier
       * @default Identity
       * @example Identity
       */
      kind: string;
      user_address: components["schemas"]["EthereumAddress"];
      personal_server: components["schemas"]["PersonalServerModel"];
    };
    ErrorResponse: {
      /**
       * @description Resource type identifier
       * @default Error
       * @example Error
       */
      kind: string;
      /**
       * @description Human-readable error message
       * @example Operation not found
       */
      detail: string;
      /**
       * @description Machine-readable error code
       * @example NOT_FOUND_ERROR
       */
      error_code: string;
      /**
       * @description Field name when error is related to a specific input field
       * @example permission_id
       */
      field?: string | null;
    };
    /** @description Response format specification for LLM operations */
    ResponseFormat: {
      /**
       * @description The response format type
       * @example json_object
       * @enum {string}
       */
      type: "text" | "json_object";
    };
    BaseGrantFile: {
      grantee: components["schemas"]["EthereumAddress"];
      /** @description The type of operation to perform */
      operation: string;
      /** @description Operation-specific parameters */
      parameters: Record<string, never>;
      /**
       * @description Optional Unix timestamp when grant expires
       * @example 1736467579
       */
      expires?: number;
    };
    LLMInferenceGrantFile: Omit<
      components["schemas"]["BaseGrantFile"],
      "operation"
    > & {
      /**
       * @example llm_inference
       * @enum {string}
       */
      operation?: "llm_inference";
      /** @description LLM inference parameters */
      parameters?: {
        /**
         * @description The prompt template with {{data}} placeholder
         * @example Analyze this data: {{data}}
         */
        prompt: string;
        response_format?: components["schemas"]["ResponseFormat"];
      } & {
        [key: string]: unknown;
      };
    } & {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      operation: "LLMInferenceGrantFile";
    } & {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      operation: "llm_inference";
    };
    /** @description Grant file structure that defines the operation and its parameters.
     *     The grant file is cryptographically signed and contains the user's intent.
     *
     *     **Currently Supported Operations:**
     *     - `llm_inference`: Large Language Model inference with optional JSON mode
     *
     *     **Future Operations:**
     *     Additional operation types will be added as the platform expands.
     *
     *     **JSON Mode (LLM only):**
     *     When `response_format.type` is `json_object`, the LLM will output valid JSON.
     *      */
    GrantFile: components["schemas"]["LLMInferenceGrantFile"];
    ValidationErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    AuthenticationErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    AuthorizationErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    NotFoundErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    BlockchainErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    FileAccessErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    ComputeErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    DecryptionErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    GrantValidationErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    OperationErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
    InternalServerErrorResponse: components["schemas"]["ErrorResponse"] &
      Record<string, never>;
  };
  responses: never;
  parameters: {
    /** @description The operation ID */
    OpId: string;
  };
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
