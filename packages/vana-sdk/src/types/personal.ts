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
 * Extended personal server identity information including connection details.
 * This combines the base PersonalServerModel with additional metadata
 * needed for client connections.
 */
export interface PersonalServerIdentity {
  /** Resource type identifier */
  kind: string;
  /** The server's Ethereum address */
  address: string;
  /** The server's public key for encryption */
  public_key: string;
  /** The base URL for connecting to this server */
  base_url: string;
  /** Human-readable name for this server */
  name: string;
}

// Server response types are now auto-generated from OpenAPI spec in server.ts
// Import types from ../types/server-exports for easy usage
