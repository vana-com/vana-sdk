/**
 * Base error class for all Vana SDK errors with structured error codes.
 *
 * @remarks
 * This abstract base class provides a foundation for all SDK-specific errors with
 * consistent error codes and stack trace handling. All Vana SDK errors extend this
 * class to provide structured error information that applications can handle
 * programmatically. The error code enables differentiation between error types
 * without relying on string matching.
 * @category Error Handling
 */
export class VanaError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = this.constructor.name;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when gasless transaction submission via relayer fails.
 *
 * @remarks
 * This error occurs when the relayer service is unavailable, returns an error,
 * or fails to process a gasless transaction. It includes the HTTP status code
 * and response details when available to help with debugging relayer issues.
 * @category Error Handling
 */
export class RelayerError extends VanaError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown,
  ) {
    super(message, "RELAYER_ERROR");
  }
}

/**
 * Thrown when the user rejects a wallet signature request.
 *
 * @remarks
 * This error occurs when users decline to sign transactions or typed data through
 * their wallet interface. It's a normal part of user interaction and should be
 * handled gracefully by applications without treating it as a system error.
 * @category Error Handling
 */
export class UserRejectedRequestError extends VanaError {
  constructor(message: string = "User rejected the signature request") {
    super(message, "USER_REJECTED_REQUEST");
  }
}

/**
 * Thrown when the SDK configuration contains invalid or missing parameters.
 *
 * @remarks
 * This error occurs during SDK initialization when required configuration
 * parameters are missing, invalid, or incompatible. Common causes include
 * missing wallet clients, invalid chain IDs, malformed storage provider
 * configurations, or incompatible parameter combinations.
 *
 * Applications should catch this error during initialization and provide
 * clear feedback to users about configuration requirements.
 *
 * @example
 * ```typescript
 * try {
 *   const vana = Vana({
 *     chainId: 999999, // Invalid chain ID
 *     account: null // Missing account
 *   });
 * } catch (error) {
 *   if (error instanceof InvalidConfigurationError) {
 *     console.error('Configuration error:', error.message);
 *     // Show user-friendly configuration help
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class InvalidConfigurationError extends VanaError {
  constructor(message: string) {
    super(message, "INVALID_CONFIGURATION");
  }
}

/**
 * Thrown when a required Vana protocol contract is not deployed on the current chain.
 *
 * @remarks
 * This error occurs when attempting to interact with contracts that are not
 * available on the connected blockchain network. It includes the contract name
 * and chain ID to help identify deployment issues or incorrect network configuration.
 * @category Error Handling
 */
export class ContractNotFoundError extends VanaError {
  constructor(contractName: string, chainId: number) {
    super(
      `Contract ${contractName} not found on chain ${chainId}`,
      "CONTRACT_NOT_FOUND",
    );
  }
}

/**
 * Thrown when blockchain operations fail due to network, contract, or transaction issues.
 *
 * @remarks
 * This error encompasses various blockchain-related failures including network
 * connectivity issues, contract execution failures, insufficient gas, invalid
 * transaction parameters, or smart contract reverts. The original error is
 * preserved to provide detailed debugging information while maintaining a
 * consistent SDK error interface.
 *
 * Common causes:
 * - Network connectivity problems
 * - Insufficient gas or gas price too low
 * - Contract function reverts
 * - Invalid transaction parameters
 * - Blockchain congestion or downtime
 *
 * @example
 * ```typescript
 * try {
 *   await vana.permissions.grant({
 *     grantee: '0x742d35...',
 *     operation: 'read'
 *   });
 * } catch (error) {
 *   if (error instanceof BlockchainError) {
 *     console.error('Blockchain operation failed:', error.message);
 *
 *     // Check if it's a network issue
 *     if (error.originalError?.message.includes('network')) {
 *       // Retry with exponential backoff
 *       await retryOperation();
 *     }
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class BlockchainError extends VanaError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message, "BLOCKCHAIN_ERROR");
  }
}

/**
 * Thrown when data serialization or deserialization operations fail.
 *
 * @remarks
 * This error occurs when the SDK cannot properly serialize parameters for
 * blockchain transactions, IPFS storage, or API calls. Common causes include
 * circular references in objects, unsupported data types, or malformed JSON.
 * It's typically encountered during grant file creation, storage operations,
 * or when preparing transaction data.
 *
 * @example
 * ```typescript
 * try {
 *   // Object with circular reference causes serialization error
 *   const obj = { name: 'test' };
 *   obj.self = obj; // Circular reference
 *
 *   await vana.data.upload({
 *     content: obj,
 *     filename: 'data.json'
 *   });
 * } catch (error) {
 *   if (error instanceof SerializationError) {
 *     console.error('Data serialization failed:', error.message);
 *     // Clean data before retry
 *     const cleanedData = removeCircularReferences(obj);
 *     await vana.data.upload({
 *       content: cleanedData,
 *       filename: 'data.json'
 *     });
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class SerializationError extends VanaError {
  constructor(message: string) {
    super(message, "SERIALIZATION_ERROR");
  }
}

/**
 * Thrown when a signature operation fails or cannot be completed.
 *
 * @remarks
 * This error occurs when wallet signature operations fail due to disconnection,
 * locked accounts, or other wallet-related issues. It preserves the original
 * error for debugging while providing consistent error handling across the SDK.
 *
 * Recovery strategies:
 * - Check wallet connection and account unlock status
 * - Retry operation with explicit user interaction
 * - For gasless operations, consider switching to direct transactions
 *
 * @example
 * ```typescript
 * try {
 *   await vana.permissions.grant({ grantee: '0x...' });
 * } catch (error) {
 *   if (error instanceof SignatureError) {
 *     // Prompt user to unlock wallet
 *     await promptWalletUnlock();
 *     // Retry operation
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class SignatureError extends VanaError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message, "SIGNATURE_ERROR");
  }
}

/**
 * Thrown when network communication fails during API calls or blockchain interactions.
 *
 * @remarks
 * This error encompasses network connectivity issues, API unavailability,
 * timeout errors, and CORS restrictions. It's commonly encountered during
 * IPFS operations, subgraph queries, or RPC calls.
 *
 * Recovery strategies:
 * - Check network connectivity
 * - Retry with exponential backoff
 * - Verify API endpoints are accessible
 * - Switch to alternative network providers or gateways
 *
 * @example
 * ```typescript
 * try {
 *   const files = await vana.data.getUserFiles({ owner: '0x...' });
 * } catch (error) {
 *   if (error instanceof NetworkError) {
 *     // Implement retry with exponential backoff
 *     await retryWithBackoff(() => vana.data.getUserFiles({ owner: '0x...' }));
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class NetworkError extends VanaError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message, "NETWORK_ERROR");
  }
}

/**
 * Thrown when transaction nonce retrieval fails during gasless operations.
 *
 * @remarks
 * This error occurs when the SDK cannot retrieve the user's current nonce from
 * smart contracts, preventing gasless transaction submission. Nonces are critical
 * for preventing replay attacks in signed transactions.
 *
 * Recovery strategies:
 * - Retry nonce retrieval after brief delay
 * - Check wallet connection and account status
 * - Use manual nonce specification if supported by the operation
 * - Switch to direct transactions as fallback
 *
 * @example
 * ```typescript
 * try {
 *   await vana.permissions.grant({ grantee: '0x...' });
 * } catch (error) {
 *   if (error instanceof NonceError) {
 *     // Wait and retry
 *     await delay(1000);
 *     await vana.permissions.grant({ grantee: '0x...' });
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class NonceError extends VanaError {
  constructor(message: string) {
    super(message, "NONCE_ERROR");
  }
}

/**
 * Thrown when personal server operations fail or cannot be completed.
 *
 * @remarks
 * This error occurs during interactions with personal servers for computation
 * requests, identity retrieval, or operation status checks. Common causes include
 * server unavailability, untrusted server status, or invalid permission grants.
 *
 * Recovery strategies:
 * - Verify server URL accessibility
 * - Check server trust status via `vana.permissions.getTrustedServers()`
 * - Ensure valid permissions exist for the operation
 * - Retry after server becomes available
 *
 * @example
 * ```typescript
 * try {
 *   const result = await vana.server.createOperation({ permissionId: 123 });
 * } catch (error) {
 *   if (error instanceof PersonalServerError) {
 *     // Check if server is trusted
 *     const trustedServers = await vana.permissions.getTrustedServers();
 *     if (!trustedServers.includes(serverId)) {
 *       await vana.permissions.trustServer({ serverId });
 *     }
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class PersonalServerError extends VanaError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message, "PERSONAL_SERVER_ERROR");
  }
}

/**
 * Thrown when attempting to register a server with a URL different from its existing registration.
 *
 * @remarks
 * This error occurs when trying to add or trust a server that's already registered
 * on-chain with a different URL. Server URLs are immutable once registered to
 * maintain consistency and security. Applications should use the existing URL
 * or register a new server with a different ID.
 *
 * @example
 * ```typescript
 * try {
 *   await vana.permissions.addAndTrustServer({
 *     serverId: 1,
 *     serverUrl: 'https://new-url.com',
 *     publicKey: '0x...'
 *   });
 * } catch (error) {
 *   if (error instanceof ServerUrlMismatchError) {
 *     console.log(`Server already registered with: ${error.existingUrl}`);
 *     // Use existing URL or register new server
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class ServerUrlMismatchError extends VanaError {
  constructor(existingUrl: string, providedUrl: string, serverId: string) {
    super(
      `Server ${serverId} is already registered with URL "${existingUrl}". Cannot change to "${providedUrl}".`,
      "SERVER_URL_MISMATCH",
    );
    this.existingUrl = existingUrl;
    this.providedUrl = providedUrl;
    this.serverId = serverId;
  }

  public readonly existingUrl: string;
  public readonly providedUrl: string;
  public readonly serverId: string;
}

/**
 * Thrown when permission grant, revoke, or validation operations fail.
 *
 * @remarks
 * This error occurs during permission management operations including grants,
 * revocations, and permission validation checks. Common causes include invalid
 * grantee addresses, expired permissions, or insufficient privileges.
 *
 * @example
 * ```typescript
 * try {
 *   await vana.permissions.revoke({ permissionId: 999999 });
 * } catch (error) {
 *   if (error instanceof PermissionError) {
 *     console.error('Permission operation failed:', error.message);
 *     // Permission may not exist or user may not be owner
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class PermissionError extends VanaError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message, "PERMISSION_ERROR");
  }
}

/**
 * Thrown when attempting to perform write operations without a wallet client.
 *
 * @remarks
 * This error occurs when trying to execute operations that require wallet
 * interaction (signing, encrypting, or submitting transactions) while the SDK
 * is initialized in read-only mode without a wallet client. To perform write
 * operations, the SDK must be initialized with a wallet client.
 *
 * Common operations that require a wallet:
 * - Signing transactions or typed data
 * - Encrypting or decrypting files
 * - Granting or revoking permissions
 * - Uploading data to IPFS
 * - Submitting blockchain transactions
 *
 * @example
 * ```typescript
 * try {
 *   // This will throw if no wallet client is provided
 *   await vana.data.decryptFile({ fileId: 'abc123' });
 * } catch (error) {
 *   if (error instanceof ReadOnlyError) {
 *     console.error(`Cannot ${error.operation}: ${error.message}`);
 *     // Initialize with wallet client to enable write operations
 *     const vanaWithWallet = Vana({
 *       walletClient: createWalletClient(...)
 *     });
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class ReadOnlyError extends VanaError {
  constructor(
    operation: string,
    suggestion: string = "Initialize the SDK with a walletClient to perform this operation",
  ) {
    super(
      `Operation '${operation}' requires a wallet client. ${suggestion}`,
      "READ_ONLY_ERROR",
    );
    this.operation = operation;
    this.suggestion = suggestion;
  }

  /** The operation that was attempted */
  public readonly operation: string;
  /** Suggested solution for fixing the error */
  public readonly suggestion: string;
}

/**
 * Thrown when a long-running transaction operation times out or fails during polling.
 *
 * @remarks
 * This error occurs when asynchronous relayer operations exceed the configured timeout
 * or encounter non-recoverable errors during status polling. It preserves the operation ID
 * to allow recovery and status checking at a later time.
 *
 * The error includes:
 * - Operation ID for recovery and status checking
 * - Last known status before failure
 * - Original error details
 *
 * Recovery strategies:
 * - Save the operation ID for later status checking
 * - Implement manual recovery flow using the operation ID
 * - Check transaction status through alternative means
 * - Contact support if operation remains stuck
 *
 * @example
 * ```typescript
 * try {
 *   const result = await vana.permissions.grant({
 *     grantee: '0x...',
 *     files: [1, 2, 3]
 *   });
 * } catch (error) {
 *   if (error instanceof TransactionPendingError) {
 *     // Save operation ID for recovery
 *     localStorage.setItem('pending_operation', error.operationId);
 *
 *     // Show recovery UI
 *     showRecoveryDialog({
 *       operationId: error.operationId,
 *       lastStatus: error.lastKnownStatus
 *     });
 *
 *     // Attempt recovery later
 *     const status = await vana.checkOperationStatus(error.operationId);
 *   }
 * }
 * ```
 * @category Error Handling
 */
export class TransactionPendingError extends VanaError {
  constructor(
    /** The operation ID that can be used for status checking */
    public readonly operationId: string,
    message: string,
    /** The last known status of the operation before failure */
    public readonly lastKnownStatus?: unknown,
  ) {
    super(
      `Transaction operation pending: ${message} (operationId: ${operationId})`,
      "TRANSACTION_PENDING",
    );
  }

  /**
   * Converts the error to a JSON-serializable format.
   *
   * @remarks
   * Useful for logging, storage, or transmission of error details.
   *
   * @returns JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      operationId: this.operationId,
      lastKnownStatus: this.lastKnownStatus,
    };
  }
}

/**
 * Personal Server error codes a Write API call can surface in
 * {@link PersonalServerWriteError.errorCode}.
 *
 * @remarks
 * The `WRITE_*` and `LINEAGE_*` codes are specific to the Write API; the
 * rest are the shared protocol codes the write policy reuses. The string
 * escape hatch keeps codes introduced by a newer Personal Server readable.
 * @category Error Handling
 */
export type PersonalServerWriteErrorCode =
  | "WRITE_SESSION_AUTH_FAILED"
  | "WRITE_SESSION_PROOF_REQUIRED"
  | "WRITE_SESSION_PROOF_REPLAY"
  | "GRANT_ID_REQUIRED"
  | "WRITE_ATTRIBUTION_REQUIRED"
  | "WRITE_ATTRIBUTION_INVALID"
  | "WRITE_ATTRIBUTION_SIGNER_MISMATCH"
  | "WRITE_ATTRIBUTION_GRANT_MISMATCH"
  | "WRITE_ATTRIBUTION_REPLAY"
  | "WRITE_BODY_NOT_CANONICAL"
  | "LINEAGE_INVALID"
  | "LINEAGE_SCOPE_UNDER_SOURCE_PREFIX"
  | "LINEAGE_SOURCE_UNKNOWN"
  | "LINEAGE_SOURCE_LOOKUP_FAILED"
  | "LINEAGE_FORBIDDEN"
  | "LINEAGE_GATEWAY_ERROR"
  | "LINEAGE_UNAVAILABLE"
  | "LINEAGE_CASCADE_UNAVAILABLE"
  | "LINEAGE_SIGNATURE_REQUIRED"
  | "LINEAGE_SIGNATURE_INVALID"
  | "INVALID_CASCADE"
  | "INVALID_VERSION"
  | "NOT_FOUND"
  | "MISSING_AUTH"
  | "INVALID_SIGNATURE"
  | "UNREGISTERED_BUILDER"
  | "GRANT_REQUIRED"
  | "GRANT_REVOKED"
  | "GRANT_EXPIRED"
  | "GRANT_OWNER_MISMATCH"
  | "SCOPE_MISMATCH"
  | "INVALID_BODY"
  | "CONTENT_TOO_LARGE"
  | "PS_UNAVAILABLE"
  | "SERVER_NOT_CONFIGURED"
  | "INTERNAL_ERROR"
  | "DERIVATIVE_QUESTION_INVALID"
  | "DERIVATIVE_QUESTION_NOT_FOUND"
  | "DERIVATIVE_DERIVED_SCOPE_REQUIRED"
  | "DERIVATIVE_CYCLE"
  | "DERIVATIVE_SOURCE_NOT_GRANTED"
  | "DERIVATIVE_COMPUTE_UNAVAILABLE"
  | "METHOD_NOT_ALLOWED"
  | (string & {});

/**
 * Base class for every Personal Server Write API failure, including the
 * derivative question routes that authenticate with the same credential.
 *
 * @remarks
 * `status` is the HTTP status the Personal Server answered with (absent for
 * failures raised before a request was sent or when no response arrived),
 * `errorCode` is the Personal Server's protocol error code when the body
 * carried one, and `details` is the server-supplied detail object.
 * @category Error Handling
 */
export class PersonalServerWriteError extends VanaError {
  constructor(
    message: string,
    code: string,
    public readonly status?: number,
    public readonly errorCode: PersonalServerWriteErrorCode | null = null,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, code);
  }
}

/**
 * Thrown before any request is sent when the write input is invalid: no
 * payload, a payload that is not a JSON object, a reserved `$writtenBy` /
 * `$lineage` key, a malformed lineage source id, or an unusable signer.
 * @category Error Handling
 */
export class WriteRequestError extends PersonalServerWriteError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "WRITE_INVALID_REQUEST", undefined, null, details);
  }
}

/**
 * Thrown when the transport failed (fetch threw) on every attempt.
 *
 * @remarks
 * A write whose response was lost may still have been stored: the Personal
 * Server commits before answering. Check the scope before re-sending the
 * same record.
 * @category Error Handling
 */
export class WriteTransportError extends PersonalServerWriteError {
  constructor(
    message: string,
    public readonly attempts: number,
    cause?: unknown,
  ) {
    super(message, "WRITE_TRANSPORT_ERROR", undefined, null, { attempts });
    this.cause = cause;
  }
}

/**
 * Thrown when `POST /v1/write/session` refused the handshake (any non-2xx),
 * or answered with a body the SDK cannot read.
 * @category Error Handling
 */
export class WriteSessionError extends PersonalServerWriteError {
  constructor(
    message: string,
    status?: number,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "WRITE_SESSION_REJECTED", status, errorCode, details);
  }
}

/**
 * Thrown by {@link writeData} when the session's bearer token has passed its
 * `expires_in` lifetime. Open a new session; nothing was sent.
 * @category Error Handling
 */
export class WriteSessionExpiredError extends PersonalServerWriteError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "WRITE_SESSION_EXPIRED", undefined, null, details);
  }
}

/**
 * Thrown when a write answered 401.
 *
 * @remarks
 * `WRITE_ATTRIBUTION_*` codes describe the per-write proof. A plain
 * `INVALID_SIGNATURE` or `MISSING_AUTH` on a write usually means the session
 * token is no longer known to the Personal Server (expired, or the server
 * restarted and dropped its in-memory sessions): open a new session.
 * @category Error Handling
 */
export class WriteUnauthorizedError extends PersonalServerWriteError {
  constructor(
    message: string,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "WRITE_UNAUTHORIZED", 401, errorCode, details);
  }
}

/**
 * Thrown when a write answered 403: the live grant no longer authorizes it
 * (revoked, expired, wrong owner) or the scope is outside its write patterns.
 * @category Error Handling
 */
export class WriteForbiddenError extends PersonalServerWriteError {
  constructor(
    message: string,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "WRITE_FORBIDDEN", 403, errorCode, details);
  }
}

/**
 * Thrown when a write answered 409 (the record conflicts with server state).
 * @category Error Handling
 */
export class WriteConflictError extends PersonalServerWriteError {
  constructor(
    message: string,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "WRITE_CONFLICT", 409, errorCode, details);
  }
}

/**
 * Thrown when the Personal Server rejected the write's lineage: 422
 * `LINEAGE_SOURCE_UNKNOWN` (`details.unknown` lists the offending ids), 400
 * `LINEAGE_INVALID` / `LINEAGE_SCOPE_UNDER_SOURCE_PREFIX`, or 502
 * `LINEAGE_SOURCE_LOOKUP_FAILED`.
 * @category Error Handling
 */
export class WriteLineageError extends PersonalServerWriteError {
  constructor(
    message: string,
    status = 422,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "WRITE_LINEAGE_REJECTED", status, errorCode, details);
  }
}

/**
 * Thrown when a write answered any other non-2xx status (400 for a body the
 * server cannot store, 413 for an oversized payload, 5xx).
 * @category Error Handling
 */
export class WriteRejectedError extends PersonalServerWriteError {
  constructor(
    message: string,
    status: number,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "WRITE_REJECTED", status, errorCode, details);
  }
}

/** Gateway error codes surfaced by the builder jobs client. */
export type JobGatewayErrorCode =
  | "INVALID_WAIT"
  | "INVALID_BODY"
  | "BUILDER_UNKNOWN"
  | "GRANT_INVALID"
  | "OWNER_NOT_READY"
  | "BODY_TOO_LARGE"
  | "JOB_ID_MISMATCH"
  | "JOB_ID_TAKEN"
  | "JOB_NOT_FOUND"
  | (string & {});

/**
 * Base class for failures raised by the builder jobs client.
 *
 * @remarks
 * `status` is the Gateway HTTP status when a response arrived, `errorCode`
 * is the Gateway protocol code when one was supplied, and `details` retains
 * structured response or client context for diagnostics.
 *
 * @param message - Human-readable failure description.
 * @param code - Stable SDK error code.
 * @param status - Gateway HTTP status, when available.
 * @param errorCode - Gateway protocol error code, when available.
 * @param details - Additional structured context.
 * @category Error Handling
 */
export class JobsClientError extends VanaError {
  constructor(
    message: string,
    code: string,
    public readonly status?: number,
    public readonly errorCode: JobGatewayErrorCode | null = null,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, code);
  }
}

/**
 * Thrown when the Gateway does not recognize the signing builder (403
 * `BUILDER_UNKNOWN`).
 *
 * @param message - Gateway failure description.
 * @param details - Additional structured Gateway context.
 * @category Error Handling
 */
export class BuilderUnknownError extends JobsClientError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "JOB_BUILDER_UNKNOWN", 403, "BUILDER_UNKNOWN", details);
  }
}

/**
 * Thrown when the supplied grant does not authorize the requested raw read
 * (403 `GRANT_INVALID`).
 *
 * @param message - Gateway failure description.
 * @param details - Additional structured Gateway context.
 * @category Error Handling
 */
export class GrantInvalidError extends JobsClientError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "JOB_GRANT_INVALID", 403, "GRANT_INVALID", details);
  }
}

/**
 * Thrown when the owner's enclave identity is not ready to accept encrypted
 * jobs, either locally after the identity lookup or as a 403 Gateway answer.
 *
 * @param message - Identity readiness failure description.
 * @param details - Additional identity or Gateway context.
 * @category Error Handling
 */
export class OwnerNotReadyError extends JobsClientError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "JOB_OWNER_NOT_READY", 403, "OWNER_NOT_READY", details);
  }
}

/**
 * Thrown when a freshly generated job id already exists at the Gateway (409
 * `JOB_ID_TAKEN`).
 *
 * @param message - Gateway conflict description.
 * @param details - Additional structured Gateway context.
 * @category Error Handling
 */
export class JobIdTakenError extends JobsClientError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "JOB_ID_TAKEN", 409, "JOB_ID_TAKEN", details);
  }
}

/**
 * Thrown when a job is unknown or belongs to another builder (404
 * `JOB_NOT_FOUND`).
 *
 * @param message - Gateway not-found description.
 * @param details - Additional structured Gateway context.
 * @category Error Handling
 */
export class JobNotFoundError extends JobsClientError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "JOB_NOT_FOUND", 404, "JOB_NOT_FOUND", details);
  }
}

/**
 * Thrown when a job submission exceeds the Gateway request limit (413).
 *
 * @param message - Gateway size-limit description.
 * @param errorCode - Gateway protocol error code.
 * @param details - Additional structured Gateway context.
 * @category Error Handling
 */
export class JobRequestTooLargeError extends JobsClientError {
  constructor(
    message: string,
    errorCode: JobGatewayErrorCode | null = "BODY_TOO_LARGE",
    details?: Record<string, unknown>,
  ) {
    super(message, "JOB_REQUEST_TOO_LARGE", 413, errorCode, details);
  }
}

/**
 * Thrown when a job does not reach a terminal state within the caller's wait
 * budget or before the job's own deadline.
 *
 * @param message - Timeout description.
 * @param details - Last known job state and timing context.
 * @category Error Handling
 */
export class JobTimeoutError extends JobsClientError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "JOB_TIMEOUT", undefined, null, details);
  }
}

/**
 * Thrown when fetched job-result bytes do not match their object handle.
 *
 * @param message - Integrity failure description.
 * @param details - Expected and actual result metadata.
 * @category Error Handling
 */
export class JobResultIntegrityError extends JobsClientError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "JOB_RESULT_INTEGRITY", undefined, null, details);
  }
}

/**
 * Thrown when the Gateway rejects a jobs request, returns an undocumented
 * response, or client input cannot form a valid jobs request.
 *
 * @param message - Rejection description.
 * @param status - Gateway HTTP status, when available.
 * @param errorCode - Gateway protocol error code, when available.
 * @param details - Additional structured context.
 * @category Error Handling
 */
export class JobRejectedError extends JobsClientError {
  constructor(
    message: string,
    status?: number,
    errorCode: JobGatewayErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "JOB_REJECTED", status, errorCode, details);
  }
}

/**
 * Thrown when a jobs client HTTP request fails before a response arrives.
 *
 * @param message - Human-readable transport failure.
 * @param cause - Original value thrown by `fetch`.
 * @category Error Handling
 */
export class JobTransportError extends JobsClientError {
  constructor(message: string, cause?: unknown) {
    super(message, "JOB_TRANSPORT_ERROR");
    this.cause = cause;
  }
}

/**
 * Thrown when a lineage read (Personal Server or gateway) fails: a non-2xx
 * answer, a body that is not a lineage graph, a malformed data point id, or
 * a transport failure.
 * @category Error Handling
 */
export class LineageReadError extends VanaError {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errorCode: PersonalServerWriteErrorCode | null = null,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, "LINEAGE_READ_ERROR");
  }
}

/**
 * Thrown when the Personal Server rejected a derivative question with a
 * status the more specific errors do not claim (405, 413
 * `CONTENT_TOO_LARGE`, 5xx), or answered a body the SDK cannot read.
 *
 * @remarks
 * The question routes share the Write API's credential, so their
 * authentication failures are the write errors: {@link WriteUnauthorizedError}
 * (401), {@link WriteForbiddenError} (403 on the derived scope),
 * {@link WriteConflictError} (409 that is not a cycle),
 * {@link WriteRequestError} (refused before sending),
 * {@link WriteTransportError} (`fetch` threw).
 * @category Error Handling
 */
export class DerivativeQuestionRejectedError extends PersonalServerWriteError {
  constructor(
    message: string,
    status: number,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "DERIVATIVE_QUESTION_REJECTED", status, errorCode, details);
  }
}

/**
 * Thrown when the Personal Server refused a question registration as
 * invalid: 400 `DERIVATIVE_QUESTION_INVALID` (body shape, the scope grammar,
 * 1 to 16 distinct source scopes, an 8000 character question, a model id) or
 * 400 `LINEAGE_SCOPE_UNDER_SOURCE_PREFIX` (the derived scope shares its first
 * dot-segment with a source scope). `details.field` names the offending
 * field when the server sent one.
 * @category Error Handling
 */
export class DerivativeQuestionInvalidError extends PersonalServerWriteError {
  constructor(
    message: string,
    status = 400,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "DERIVATIVE_QUESTION_INVALID", status, errorCode, details);
  }
}

/**
 * Thrown when a question id is unknown (404
 * `DERIVATIVE_QUESTION_NOT_FOUND`).
 *
 * @remarks
 * A builder only ever sees the questions it registered itself, so a question
 * another builder (or the owner) registered on the same derived scope is a
 * 404 too, not a 403. An id no Personal Server ever held is a 404 as well
 * for any authenticated caller (`personal-server-ts` d91124d and later),
 * where it used to fall through to the owner gate's 401.
 * @category Error Handling
 */
export class DerivativeQuestionNotFoundError extends PersonalServerWriteError {
  constructor(
    message: string,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "DERIVATIVE_QUESTION_NOT_FOUND", 404, errorCode, details);
  }
}

/**
 * Thrown when a builder listed questions without naming a derived scope (400
 * `DERIVATIVE_DERIVED_SCOPE_REQUIRED`).
 *
 * @remarks
 * The unfiltered list is the owner's; a builder may only see its own
 * questions on a scope it may write, so `?derivedScope=` is what the call is
 * authorized against. The SDK refuses an empty `derivedScope` before
 * signing anything ({@link WriteRequestError}), so this is what a hand-built
 * request gets. It is a 400, not the 401 older servers answered, so a client
 * with a re-handshake-on-401 policy does not go through a pointless
 * handshake and then report an authentication problem it does not have.
 * @category Error Handling
 */
export class DerivativeDerivedScopeRequiredError extends PersonalServerWriteError {
  constructor(
    message: string,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(
      message,
      "DERIVATIVE_DERIVED_SCOPE_REQUIRED",
      400,
      errorCode,
      details,
    );
  }
}

/**
 * Thrown when a source scope of the question is not read-granted to the
 * builder (403 `DERIVATIVE_SOURCE_NOT_GRANTED`).
 *
 * @remarks
 * The answer exposes the sources to whoever may read the derived scope, so
 * the grant must carry a **bare** read entry for every source scope;
 * `write:` entries confer nothing. `details.scopes` lists the uncovered
 * ones.
 * @category Error Handling
 */
export class DerivativeSourceNotGrantedError extends PersonalServerWriteError {
  constructor(
    message: string,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "DERIVATIVE_SOURCE_NOT_GRANTED", 403, errorCode, details);
  }
}

/**
 * Thrown when the registration would make the derived scope a transitive
 * source of itself through other registrations (409 `DERIVATIVE_CYCLE`), so
 * recompute would never settle. `details.path` is the offending chain.
 * @category Error Handling
 */
export class DerivativeCycleError extends PersonalServerWriteError {
  constructor(
    message: string,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "DERIVATIVE_CYCLE", 409, errorCode, details);
  }
}

/**
 * Thrown when the Personal Server has no compute layer wired (503
 * `DERIVATIVE_COMPUTE_UNAVAILABLE`): it cannot answer questions at all.
 * @category Error Handling
 */
export class DerivativeComputeUnavailableError extends PersonalServerWriteError {
  constructor(
    message: string,
    errorCode: PersonalServerWriteErrorCode | null = null,
    details?: Record<string, unknown>,
  ) {
    super(message, "DERIVATIVE_COMPUTE_UNAVAILABLE", 503, errorCode, details);
  }
}

/**
 * Thrown when a question did not reach `ready` or `failed` within the
 * caller's budget. The question keeps computing on the server; poll it
 * again. `details.status` is the last status seen.
 * @category Error Handling
 */
export class DerivativeQuestionTimeoutError extends PersonalServerWriteError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DERIVATIVE_QUESTION_TIMEOUT", undefined, null, details);
  }
}

/**
 * Thrown when a question settled as `failed`.
 *
 * @remarks
 * `details.error` is the Personal Server's short failure reason (a status
 * code, a scope name, an error class); the prompt and the data are never
 * part of it. A failed question is recomputed on the next source change or
 * an explicit recompute.
 * @category Error Handling
 */
export class DerivativeQuestionFailedError extends PersonalServerWriteError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DERIVATIVE_QUESTION_FAILED", undefined, null, details);
  }
}

/**
 * Thrown when a DataRegistryV2 data point has been deleted (tombstoned).
 *
 * @remarks
 * Raised by gateway reads that hit HTTP 410, by Personal Server reads of a
 * deleted scope, and by any SDK read helper that would otherwise hand a
 * tombstone back to the caller as if it were data. Pass
 * `includeDeleted: true` to the gateway read helpers to opt in to seeing the
 * tombstone row (with its `deletedAt`) instead of this error.
 * @category Error Handling
 */
export class DataPointDeletedError extends VanaError {
  constructor(
    message: string,
    public readonly details: {
      dataPointId?: string;
      scope?: string;
      ownerAddress?: string;
      deletedAt?: string | null;
    } = {},
  ) {
    super(message, "DATA_POINT_DELETED");
  }
}

/**
 * Thrown when a data point operation targets a (owner, scope) the gateway
 * has no record of.
 * @category Error Handling
 */
export class DataPointNotFoundError extends VanaError {
  constructor(
    message: string,
    public readonly details: {
      dataPointId?: string;
      scope?: string;
      ownerAddress?: string;
    } = {},
  ) {
    super(message, "DATA_POINT_NOT_FOUND");
  }
}

/**
 * Thrown when the gateway rejects a data point write with HTTP 409 because
 * the signed `expectedVersion` is stale.
 *
 * @remarks
 * `currentExpectedVersion` is the version the gateway currently holds (when
 * the gateway surfaced it); re-sign against `currentExpectedVersion + 1`.
 * @category Error Handling
 */
export class DataPointVersionConflictError extends VanaError {
  constructor(
    message: string,
    public readonly details: {
      dataPointId?: string;
      scope?: string;
      ownerAddress?: string;
      expectedVersion?: string;
      currentExpectedVersion?: string;
    } = {},
  ) {
    super(message, "DATA_POINT_VERSION_CONFLICT");
  }
}
