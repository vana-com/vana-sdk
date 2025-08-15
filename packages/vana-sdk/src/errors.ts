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
