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

// Server response types are now auto-generated from OpenAPI spec in server.d.ts
// Use components["schemas"]["CreateOperationResponse"] and components["schemas"]["GetOperationResponse"]

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
