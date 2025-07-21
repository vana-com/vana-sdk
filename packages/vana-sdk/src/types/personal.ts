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

// Server response types are now auto-generated from OpenAPI spec in server.ts
// Import types from ../types/server-exports for easy usage
