// Core modules
export { Vana } from "./vana";
export { VanaProvider } from "./core/provider";

// Types - modular exports
export type * from "./types";

// Specific type exports for convenience
// Configuration types
export type {
  VanaConfig,
  WalletConfig,
  ChainConfig,
  RuntimeConfig,
  StorageConfig,
} from "./types/config";

// Chain types
export type { VanaChainId, VanaChain } from "./types/chains";

// Contract types
export type {
  VanaContractName,
  ContractInfo,
  ContractAddresses,
} from "./types/contracts";

export type { VanaContract } from "./abi";

// Data types
export type {
  UserFile,
  FileMetadata,
  UploadFileParams,
  UploadFileResult,
  UploadEncryptedFileResult,
} from "./types/data";

// Permission types
export type {
  GrantedPermission,
  GrantPermissionParams,
  RevokePermissionParams,
  PermissionGrantTypedData,
  GrantFile,
} from "./types/permissions";

// Relayer types
export type {
  RelayerStorageResponse,
  RelayerTransactionResponse,
  RelayerConfig,
} from "./types/relayer";

// Utility types
export type {
  ApiResponse,
  VanaError,
  PaginationParams,
  PaginationResult,
  TransactionOptions,
  TransactionReceipt,
} from "./types/utils";

// Type guards and utilities
export { isWalletConfig, isChainConfig } from "./types/config";
export { isVanaChainId, isVanaChain } from "./types/chains";

// Error classes
export * from "./errors";

// Controllers
export { PermissionsController } from "./controllers/permissions";
export { DataController } from "./controllers/data";
export { ProtocolController } from "./controllers/protocol";

// Base contract class
export * from "./contracts/contractClient";
export * from "./contracts/contractController";

// Utilities
export * from "./utils/encryption";
export * from "./utils/formatters";
export * from "./utils/grantFiles";

// Storage API
export * from "./storage";

// Configuration
export { getContractAddress } from "./config/addresses";
export { chains, mokshaTestnet, vanaMainnet } from "./config/chains";

// ABIs
export { getAbi } from "./abi";
export type { VanaContract as VanaContractAbi } from "./abi";

// Generic utilities for extensibility
export {
  BaseController,
  RetryUtility,
  RateLimiter,
  MemoryCache,
  EventEmitter,
  MiddlewarePipeline,
  AsyncQueue,
  CircuitBreaker,
} from "./core/generics";

export { ApiClient } from "./core/apiClient";

export type {
  ApiClientConfig,
  HttpMethod,
  RequestOptions,
} from "./core/apiClient";

// Legacy exports for backward compatibility
// VanaContract is already exported from "./types" above
