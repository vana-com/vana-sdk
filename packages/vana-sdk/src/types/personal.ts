/**
 * Defines parameters for posting data requests to personal servers.
 *
 * @remarks
 * Used to initiate data access requests that require user permission.
 * The permission ID references a previously granted permission that
 * authorizes the requester to access specific user data.
 *
 * @example
 * ```typescript
 * const params: PostRequestParams = {
 *   permissionId: 123
 * };
 *
 * const response = await vana.personal.postRequest(params);
 * console.log('Request posted:', response.requestId);
 * ```
 *
 * @category Personal Server
 */
export interface PostRequestParams {
  /**
   * References a granted permission authorizing data access.
   * Obtain via permission granting flow or query existing permissions.
   * @throws {PermissionNotFoundError} If permission ID is invalid.
   */
  permissionId: number;
}

/**
 * Defines parameters for creating server-side operations.
 *
 * @remarks
 * Initiates asynchronous operations on the personal server that
 * process user data according to granted permissions. Operations
 * run in the background and can be monitored via their operation ID.
 *
 * @example
 * ```typescript
 * const params: CreateOperationParams = {
 *   permissionId: 456
 * };
 *
 * const operation = await vana.server.createOperation(params);
 * // Monitor operation status
 * const status = await vana.server.getOperationStatus(operation.id);
 * ```
 *
 * @category Personal Server
 */
export interface CreateOperationParams {
  /**
   * References the permission scope for this operation.
   * Determines what data and actions are allowed.
   * @throws {InsufficientPermissionsError} If permission scope is inadequate.
   */
  permissionId: number;
}

/**
 * Parameters for downloading an artifact from a server operation.
 *
 * @remarks
 * Artifacts are files generated during operations like Gemini agent analysis.
 * The download requires authentication using the application's signature.
 *
 * @category Personal Server
 */
export interface DownloadArtifactParams {
  /**
   * The operation ID that generated the artifact.
   */
  operationId: string;
  /**
   * The path to the artifact file to download.
   */
  artifactPath: string;
}

/**
 * Defines parameters for initializing personal server connections.
 *
 * @remarks
 * Establishes secure communication channels with a user's personal
 * data server. The server manages encrypted user data and enforces
 * permission-based access control. Initialization includes key exchange
 * and session establishment.
 *
 * @example
 * ```typescript
 * const params: InitPersonalServerParams = {
 *   userAddress: '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36'
 * };
 *
 * const server = await vana.personal.initServer(params);
 * console.log('Connected to server:', server.baseUrl);
 * ```
 *
 * @category Personal Server
 */
export interface InitPersonalServerParams {
  /**
   * Identifies the user whose personal server to connect to.
   * Must be a valid Ethereum address in hex format.
   * @example '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36'
   */
  userAddress: string;
}

/**
 * Represents comprehensive personal server identity and connection information.
 *
 * @remarks
 * Combines core server identity with connection metadata required for
 * establishing secure communication. Personal servers are user-controlled
 * nodes that store and serve encrypted personal data according to
 * user-defined permissions. This interface provides all necessary
 * information to connect to and interact with a personal server.
 *
 * @example
 * ```typescript
 * const identity: PersonalServerIdentity = {
 *   kind: 'PersonalServer',
 *   address: '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36',
 *   publicKey: '0x04...', // 65-byte uncompressed public key
 *   baseUrl: 'https://ps.user.vana.com',
 *   name: 'User Personal Server #1'
 * };
 *
 * // Use identity to establish encrypted connection
 * const encrypted = await crypto.encrypt(data, identity.publicKey);
 * const response = await fetch(`${identity.baseUrl}/api/data`, {
 *   method: 'POST',
 *   body: encrypted
 * });
 * ```
 *
 * @category Personal Server
 */
export interface PersonalServerIdentity {
  /**
   * Identifies the resource type for API disambiguation.
   * Always 'PersonalServer' for personal server instances.
   */
  kind: string;

  /**
   * Uniquely identifies the server on the blockchain.
   * Used for permission verification and identity proofs.
   * @example '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36'
   */
  address: string;

  /**
   * Enables end-to-end encryption for data transmission.
   * Must be in uncompressed format (65 bytes with 0x04 prefix).
   * @example '0x04...' (130 hex characters)
   */
  publicKey: string;

  /**
   * Provides the HTTPS endpoint for server API requests.
   * Should not include trailing slashes or API paths.
   * @example 'https://ps.user.vana.com'
   */
  baseUrl: string;

  /**
   * Displays a user-friendly identifier for the server.
   * Used in UI components and logging for clarity.
   * @example 'Primary Data Server'
   */
  name: string;
}

/**
 * @remarks
 * Additional server response types are auto-generated from the OpenAPI
 * specification and available in the server-exports module. Import those
 * types directly when working with server API responses.
 *
 * @see {@link ../types/server-exports | Server Export Types}
 */
