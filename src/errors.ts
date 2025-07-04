/**
 * Base error class for all Vana SDK errors.
 */
export class VanaError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when there's an issue with the relayer service.
 */
export class RelayerError extends VanaError {
  constructor(message: string, public readonly statusCode?: number, public readonly response?: any) {
    super(message, 'RELAYER_ERROR');
  }
}

/**
 * Error thrown when the user rejects a signature request.
 */
export class UserRejectedRequestError extends VanaError {
  constructor(message: string = 'User rejected the signature request') {
    super(message, 'USER_REJECTED_REQUEST');
  }
}

/**
 * Error thrown when the SDK configuration is invalid.
 */
export class InvalidConfigurationError extends VanaError {
  constructor(message: string) {
    super(message, 'INVALID_CONFIGURATION');
  }
}

/**
 * Error thrown when a required contract is not found.
 */
export class ContractNotFoundError extends VanaError {
  constructor(contractName: string, chainId: number) {
    super(`Contract ${contractName} not found on chain ${chainId}`, 'CONTRACT_NOT_FOUND');
  }
}

/**
 * Error thrown when a blockchain operation fails.
 */
export class BlockchainError extends VanaError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'BLOCKCHAIN_ERROR');
  }
}

/**
 * Error thrown when parameter serialization fails.
 */
export class SerializationError extends VanaError {
  constructor(message: string) {
    super(message, 'SERIALIZATION_ERROR');
  }
}

/**
 * Error thrown when a signature operation fails.
 */
export class SignatureError extends VanaError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'SIGNATURE_ERROR');
  }
}

/**
 * Error thrown when a network operation fails.
 */
export class NetworkError extends VanaError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'NETWORK_ERROR');
  }
}

/**
 * Error thrown when the nonce retrieval fails.
 */
export class NonceError extends VanaError {
  constructor(message: string) {
    super(message, 'NONCE_ERROR');
  }
}