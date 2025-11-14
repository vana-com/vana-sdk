// Vana Personal Server API Types
// Generated automatically from OpenAPI specification - do not edit manually
// Network: mainnet
// Source: https://server.vana.com/openapi.json
// Generated on: 2025-11-13T22:24:20.859Z

export interface paths {
  "/api/v1/operations": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create a new operation
     * @description Submit a new operation for asynchronous processing. Operations are validated against blockchain permissions before execution. The operation type (LLM inference, vector search, etc.) and parameters are determined by the grant file referenced in the blockchain permission.
     */
    post: operations["create_operation_api_v1_operations_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/operations/{operation_id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get operation status
     * @description Retrieve the current status and result of an operation. Poll this endpoint to track operation progress from 'starting' through 'processing' to terminal states ('succeeded', 'failed', 'canceled').
     */
    get: operations["get_operation_api_v1_operations__operation_id__get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/operations/{operation_id}/cancel": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Cancel an operation
     * @description Cancel a running operation. Only operations in 'starting' or 'processing' states can be canceled. Completed operations cannot be canceled.
     */
    post: operations["cancel_operation_api_v1_operations__operation_id__cancel_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/identity": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get user identity
     * @description Retrieve identity information for a user including their personal server details. The personal server address and public key are deterministically derived from the user's address.
     */
    get: operations["get_identity_api_v1_identity_get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/artifacts/download": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Download operation artifact
     * @description Download an artifact file produced by an operation. Requires ECDSA signature authentication - the grantee (app) that created the operation must sign the download request.
     */
    post: operations["download_artifact_api_v1_artifacts_download_post"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/artifacts/{operation_id}/list": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * List operation artifacts
     * @description List all artifacts produced by an operation. Requires ECDSA signature authentication from the grantee (app) that created the operation.
     */
    post: operations["list_artifacts_api_v1_artifacts__operation_id__list_post"];
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
     * ArtifactDownloadRequest
     * @description Request model for authenticated artifact downloads.
     * @example {
     *       "artifact_path": "outputs/result.json",
     *       "operation_id": "cm4xp9qkw0001qj0g8xqg8xqg",
     *       "signature": "0x3cffa64411a02d4a257663848df70fd445f513edcbb78a2e94495af45987e2de6144efdafd37a3d2b95e4e535c4a84fbcfb088d8052d435c382e7ca9a5ac57801c"
     *     }
     */
    ArtifactDownloadRequest: {
      /**
       * Operation Id
       * @description Unique operation identifier
       * @example cm4xp9qkw0001qj0g8xqg8xqg
       */
      operation_id: string;
      /**
       * Artifact Path
       * @description Path to the artifact file to download
       * @example outputs/result.json
       */
      artifact_path: string;
      /**
       * Signature
       * @description Ethereum signature of the request for authentication
       * @example 0x3cffa64411a02d4a257663848df70fd445f513edcbb78a2e94495af45987e2de6144efdafd37a3d2b95e4e535c4a84fbcfb088d8052d435c382e7ca9a5ac57801c
       */
      signature: string;
    };
    /**
     * ArtifactInfo
     * @description Information about a single artifact file.
     */
    ArtifactInfo: {
      /**
       * Path
       * @description Relative path to the artifact file
       * @example outputs/analysis.json
       */
      path: string;
      /**
       * Size
       * @description File size in bytes
       * @example 4096
       */
      size: number;
      /**
       * Content Type
       * @description MIME type of the artifact
       * @example application/json
       */
      content_type: string;
    };
    /**
     * ArtifactListRequest
     * @description Request model for listing artifacts (no artifact_path needed).
     * @example {
     *       "operation_id": "cm4xp9qkw0001qj0g8xqg8xqg",
     *       "signature": "0x3cffa64411a02d4a257663848df70fd445f513edcbb78a2e94495af45987e2de6144efdafd37a3d2b95e4e535c4a84fbcfb088d8052d435c382e7ca9a5ac57801c"
     *     }
     */
    ArtifactListRequest: {
      /**
       * Operation Id
       * @description Unique operation identifier
       * @example cm4xp9qkw0001qj0g8xqg8xqg
       */
      operation_id: string;
      /**
       * Signature
       * @description Ethereum signature of the request for authentication
       * @example 0x3cffa64411a02d4a257663848df70fd445f513edcbb78a2e94495af45987e2de6144efdafd37a3d2b95e4e535c4a84fbcfb088d8052d435c382e7ca9a5ac57801c
       */
      signature: string;
    };
    /**
     * ArtifactListResponse
     * @description Response containing list of available artifacts for an operation.
     * @example {
     *       "artifacts": [
     *         {
     *           "content_type": "application/json",
     *           "path": "outputs/analysis.json",
     *           "size": 4096
     *         },
     *         {
     *           "content_type": "text/markdown",
     *           "path": "outputs/report.md",
     *           "size": 2048
     *         }
     *       ],
     *       "kind": "ArtifactList",
     *       "operation_id": "cm4xp9qkw0001qj0g8xqg8xqg"
     *     }
     */
    ArtifactListResponse: {
      /**
       * Kind
       * @description Resource type identifier for response routing
       * @default ArtifactList
       * @example ArtifactList
       * @constant
       */
      kind: "ArtifactList";
      /**
       * Operation Id
       * @description Unique operation identifier
       * @example cm4xp9qkw0001qj0g8xqg8xqg
       */
      operation_id: string;
      /**
       * Artifacts
       * @description List of available artifacts for this operation
       * @default []
       */
      artifacts: components["schemas"]["ArtifactInfo"][];
    };
    /**
     * CreateOperationRequest
     * @description Request payload for creating a new operation.
     * @example {
     *       "app_signature": "0x3cffa64411a02d4a257663848df70fd445f513edcbb78a2e94495af45987e2de6144efdafd37a3d2b95e4e535c4a84fbcfb088d8052d435c382e7ca9a5ac57801c",
     *       "operation_request_json": "{\"permission_id\": 1024}"
     *     }
     */
    CreateOperationRequest: {
      /**
       * App Signature
       * @description ECDSA signature over operation_request_json using app's private key. Must be hex-encoded with 0x prefix (132 chars total)
       * @example 0x3cffa64411a02d4a257663848df70fd445f513edcbb78a2e94495af45987e2de6144efdafd37a3d2b95e4e535c4a84fbcfb088d8052d435c382e7ca9a5ac57801c
       */
      app_signature: string;
      /**
       * Operation Request Json
       * @description JSON-encoded operation request. Must contain permission_id. Can optionally include operation (for verification) and parameters (runtime values). Runtime parameters are merged with grant parameters (grant takes precedence).
       * @example {"permission_id": 1024, "parameters": {"goal": "analyze trends"}}
       */
      operation_request_json: string;
    };
    /**
     * CreateOperationResponse
     * @description Response after successfully creating an operation.
     * @example {
     *       "created_at": "2024-01-01T00:00:00Z",
     *       "id": "cm4xp9qkw0001qj0g8xqg8xqg",
     *       "kind": "OperationCreated"
     *     }
     */
    CreateOperationResponse: {
      /**
       * Kind
       * @description Resource type identifier for response routing
       * @default OperationCreated
       * @example OperationCreated
       * @constant
       */
      kind: "OperationCreated";
      /**
       * Id
       * @description Unique operation identifier for tracking and status queries
       * @example cm4xp9qkw0001qj0g8xqg8xqg
       */
      id: string;
      /**
       * Created At
       * @description ISO 8601 timestamp when operation was created
       * @example 2024-01-01T00:00:00Z
       */
      created_at: string;
    };
    /**
     * ErrorResponse
     * @description Standardized error response format.
     * @example {
     *       "detail": "Signature verification failed",
     *       "error_code": "INVALID_SIGNATURE",
     *       "field": "app_signature",
     *       "hint": "Ensure signature is hex-encoded with 0x prefix",
     *       "kind": "Error"
     *     }
     */
    ErrorResponse: {
      /**
       * Kind
       * @description Resource type identifier for error responses
       * @default Error
       * @example Error
       * @constant
       */
      kind: "Error";
      /**
       * Detail
       * @description Human-readable error message explaining what went wrong
       * @example Signature verification failed
       */
      detail: string;
      /**
       * Error Code
       * @description Machine-readable error code for programmatic handling. Common codes: INVALID_SIGNATURE, PERMISSION_DENIED, NOT_FOUND, RATE_LIMIT_EXCEEDED, INTERNAL_SERVER_ERROR
       * @example INVALID_SIGNATURE
       */
      error_code: string;
      /**
       * Field
       * @description Specific field that caused the error, if applicable
       * @example app_signature
       */
      field?: string | null;
    };
    /**
     * GetOperationResponse
     * @description Operation status and result information.
     * @example {
     *       "finished_at": "2024-01-01T00:00:05Z",
     *       "id": "cm4xp9qkw0001qj0g8xqg8xqg",
     *       "kind": "OperationStatus",
     *       "result": {
     *         "output": "The analysis of your data indicates positive trends..."
     *       },
     *       "started_at": "2024-01-01T00:00:01Z",
     *       "status": "succeeded"
     *     }
     */
    GetOperationResponse: {
      /**
       * Kind
       * @description Resource type identifier for response routing
       * @default OperationStatus
       * @example OperationStatus
       * @constant
       */
      kind: "OperationStatus";
      /**
       * Id
       * @description Unique operation identifier
       * @example cm4xp9qkw0001qj0g8xqg8xqg
       */
      id: string;
      /**
       * Status
       * @description Current operation status. Transitions: starting → processing → (succeeded|failed|canceled)
       * @example processing
       * @enum {string}
       */
      status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
      /**
       * Started At
       * @description ISO 8601 timestamp when operation began processing
       * @example 2024-01-01T00:00:01Z
       */
      started_at?: string | null;
      /**
       * Finished At
       * @description ISO 8601 timestamp when operation completed (succeeded, failed, or canceled)
       * @example 2024-01-01T00:00:05Z
       */
      finished_at?: string | null;
      /**
       * Result
       * @description Operation result data as a dictionary. Format depends on operation type. For LLM inference: {'output': 'generated text'} or parsed JSON object. For JSON mode: parsed JSON object structure.
       * @example {
       *       "output": "The analysis of your data indicates positive trends in engagement metrics..."
       *     }
       */
      result?: {
        [key: string]: unknown;
      } | null;
    };
    /** HTTPValidationError */
    HTTPValidationError: {
      /** Detail */
      detail?: components["schemas"]["ValidationError"][];
    };
    /**
     * IdentityResponseModel
     * @description Identity response containing user and personal server information.
     * @example {
     *       "kind": "Identity",
     *       "personal_server": {
     *         "address": "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
     *         "kind": "PersonalServer",
     *         "public_key": "0x04bcdf3e094f5c9a7819baedfabe81c235b8e6c8a5b26b62a98fa685deaac1e488090fa3c6b2667c1bf3a6e593bc0fb3e670f78a72e9fe0b1c40e2f9dda957f61a"
     *       },
     *       "user_address": "0xf0ebD65BEaDacD191dc96D8EC69bbA4ABCf621D4"
     *     }
     */
    IdentityResponseModel: {
      /**
       * Kind
       * @description Resource type identifier for response routing
       * @default Identity
       * @example Identity
       * @constant
       */
      kind: "Identity";
      /**
       * User Address
       * @description User's EVM wallet address
       * @example 0xf0ebD65BEaDacD191dc96D8EC69bbA4ABCf621D4
       */
      user_address: string;
      /** @description Personal server details for this user */
      personal_server: components["schemas"]["PersonalServerModel"];
    };
    /**
     * PersonalServerModel
     * @description Personal server identity information.
     * @example {
     *       "address": "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
     *       "kind": "PersonalServer",
     *       "public_key": "0x04bcdf3e094f5c9a7819baedfabe81c235b8e6c8a5b26b62a98fa685deaac1e488090fa3c6b2667c1bf3a6e593bc0fb3e670f78a72e9fe0b1c40e2f9dda957f61a"
     *     }
     */
    PersonalServerModel: {
      /**
       * Kind
       * @description Resource type identifier for response routing
       * @default PersonalServer
       * @example PersonalServer
       * @constant
       */
      kind: "PersonalServer";
      /**
       * Address
       * @description Personal server's EVM wallet address
       * @example 0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36
       */
      address: string;
      /**
       * Public Key
       * @description Personal server's public key for encryption (SEC1 uncompressed format)
       * @example 0x04bcdf3e094f5c9a7819baedfabe81c235b8e6c8a5b26b62a98fa685deaac1e488090fa3c6b2667c1bf3a6e593bc0fb3e670f78a72e9fe0b1c40e2f9dda957f61a
       */
      public_key: string;
    };
    /** ValidationError */
    ValidationError: {
      /** Location */
      loc: (string | number)[];
      /** Message */
      msg: string;
      /** Error Type */
      type: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  create_operation_api_v1_operations_post: {
    parameters: {
      query?: never;
      header?: {
        "x-request-id"?: string | null;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateOperationRequest"];
      };
    };
    responses: {
      /** @description Operation accepted and queued for processing */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /** @example {
           *       "kind": "OperationCreated",
           *       "id": "cm4xp9qkw0001qj0g8xqg8xqg",
           *       "created_at": "2024-01-01T00:00:00Z"
           *     } */
          "application/json": components["schemas"]["CreateOperationResponse"];
        };
      };
      /** @description Invalid request format or malformed JSON in operation_request_json */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Signature verification failed or invalid authentication */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description No valid blockchain permission for requested operation */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Referenced permission or grant file not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
      /** @description Rate limit exceeded - retry with exponential backoff */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Internal server error or backend service unavailable */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
    };
  };
  get_operation_api_v1_operations__operation_id__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique operation identifier from create operation */
        operation_id: string;
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
          /** @example {
           *       "kind": "OperationStatus",
           *       "id": "cm4xp9qkw0001qj0g8xqg8xqg",
           *       "status": "succeeded",
           *       "started_at": "2024-01-01T00:00:01Z",
           *       "finished_at": "2024-01-01T00:00:05Z",
           *       "result": "The analysis indicates positive trends..."
           *     } */
          "application/json": components["schemas"]["GetOperationResponse"];
        };
      };
      /** @description Operation not found - ID may be invalid or expired */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
      /** @description Internal server error retrieving operation status */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
    };
  };
  cancel_operation_api_v1_operations__operation_id__cancel_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique operation identifier to cancel */
        operation_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Operation canceled successfully */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Operation not found or already completed */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
      /** @description Rate limit exceeded for cancellation requests */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Internal server error during cancellation */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
    };
  };
  get_identity_api_v1_identity_get: {
    parameters: {
      query: {
        /**
         * @description User's EVM wallet address (EIP-55 checksum format)
         * @example 0xf0ebD65BEaDacD191dc96D8EC69bbA4ABCf621D4
         */
        address: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Identity information retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /** @example {
           *       "kind": "Identity",
           *       "user_address": "0xf0ebD65BEaDacD191dc96D8EC69bbA4ABCf621D4",
           *       "personal_server": {
           *         "kind": "PersonalServer",
           *         "address": "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
           *         "public_key": "0x04bcdf3e094f5c9a7819baedfabe81c235b8e6c8a5b26b62a98fa685deaac1e488090fa3c6b2667c1bf3a6e593bc0fb3e670f78a72e9fe0b1c40e2f9dda957f61a"
           *       }
           *     } */
          "application/json": components["schemas"]["IdentityResponseModel"];
        };
      };
      /** @description Invalid EVM address format */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
      /** @description Rate limit exceeded - retry with exponential backoff */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Internal server error during identity derivation */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
    };
  };
  download_artifact_api_v1_artifacts_download_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ArtifactDownloadRequest"];
      };
    };
    responses: {
      /** @description Artifact file content with appropriate content type */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /** @example {
           *       "result": "analysis data"
           *     } */
          "application/json": unknown;
          /** @example Text file content */
          "text/plain": unknown;
          /** @example # Report
           *     Content here */
          "text/markdown": unknown;
        };
      };
      /** @description Signature verification failed or invalid authentication */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Access denied - not the authorized grantee for this operation */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Operation or artifact not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
      /** @description Internal server error retrieving artifact */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
    };
  };
  list_artifacts_api_v1_artifacts__operation_id__list_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        operation_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ArtifactListRequest"];
      };
    };
    responses: {
      /** @description List of available artifacts retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ArtifactListResponse"];
        };
      };
      /** @description Signature verification failed or invalid authentication */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Access denied - not the authorized grantee for this operation */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Operation not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["HTTPValidationError"];
        };
      };
      /** @description Internal server error retrieving artifact list */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ErrorResponse"];
        };
      };
    };
  };
}
