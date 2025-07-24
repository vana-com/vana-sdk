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
 * Error thrown when a signature operation fails.
 *
 * @remarks
 * Recovery strategies: Check wallet connection and account unlock status,
 * retry operation with explicit user interaction, or for gasless operations
 * consider switching to direct transactions.
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
 * Error thrown when a network operation fails.
 *
 * @remarks
 * Recovery strategies: Check network connectivity, retry with exponential backoff,
 * verify API endpoints are accessible, or switch to alternative network providers.
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
 * Error thrown when the nonce retrieval fails.
 *
 * @remarks
 * Recovery strategies: Retry nonce retrieval after brief delay, check wallet connection
 * and account status, or use manual nonce specification if supported by the operation.
 */
export class NonceError extends VanaError {
  constructor(message: string) {
    super(message, "NONCE_ERROR");
  }
}

/**
 * Error thrown when a personal server operation fails.
 *
 * @remarks
 * Recovery strategies: Verify server URL accessibility, check server trust status via
 * `vana.permissions.getUserTrustedServers()`, or retry after server becomes available.
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
 * Error thrown when trying to register a server with a URL that doesn't match the existing registration.
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
 * Error thrown when a permission operation fails.
 */
export class PermissionError extends VanaError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message, "PERMISSION_ERROR");
  }
}
