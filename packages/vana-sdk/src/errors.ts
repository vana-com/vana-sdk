/**
 * Base error class for all Vana SDK errors with structured error codes.
 *
 * @remarks
 * This abstract base class provides a foundation for all SDK-specific errors with
 * consistent error codes and stack trace handling. All Vana SDK errors extend this
 * class to provide structured error information that applications can handle
 * programmatically. The error code enables differentiation between error types
 * without relying on string matching.
 *
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
 *
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
 *
 * @category Error Handling
 */
export class UserRejectedRequestError extends VanaError {
  constructor(message: string = "User rejected the signature request") {
    super(message, "USER_REJECTED_REQUEST");
  }
}

/**
 * Error thrown when the SDK configuration is invalid.
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
 *
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
 * Error thrown when a blockchain operation fails.
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
 * Error thrown when parameter serialization fails.
 */
export class SerializationError extends VanaError {
  constructor(message: string) {
    super(message, "SERIALIZATION_ERROR");
  }
}

/**
 * Error thrown when a signature operation fails.
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
 */
export class NonceError extends VanaError {
  constructor(message: string) {
    super(message, "NONCE_ERROR");
  }
}

/**
 * Error thrown when a personal server operation fails.
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
