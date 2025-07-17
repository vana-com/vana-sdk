/**
 * Parameters for the `vana.personal.postRequest` method.
 */
export interface PostRequestParams {
  /** The permission ID */
  permissionId: number;
}

/**
 * Parameters for the `vana.server.createOperation` method.
 */
export interface CreateOperationParams {
  /** The permission ID */
  permissionId: number;
}

/**
 * Parameters for personal server operations.
 */
export interface InitPersonalServerParams {
  /** The user's wallet address */
  userAddress: string;
}

/**
 * Response from creating an operation via the personal server API.
 */
export interface CreateOperationResponse {
  /** The operation ID for tracking the computation */
  id: string;
  /** The timestamp when the operation was created */
  created_at: string;
}

/**
 * Response from getting operation status via the personal server API.
 */
export interface GetOperationResponse {
  /** The operation ID */
  id: string;
  /** The status of the operation */
  status: string;
  /** Optional timestamp when the operation started */
  started_at?: string;
  /** Optional timestamp when the operation finished */
  finished_at?: string;
  /** Optional result data if operation completed successfully */
  result?: unknown;
  /** The prediction ID (same as id) */
  prediction_id: string;
}

export interface PersonalServerIdentity {
  /** Derived address for the personal server */
  address: string;
  /** Public key for encryption */
  public_key: string;
  /** Base URL for the personal server */
  base_url: string;
  /** Name of the personal server */
  name: string;
}
