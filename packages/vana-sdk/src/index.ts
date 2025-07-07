// Core modules
export { Vana } from "./vana";
export { VanaProvider } from "./core/provider";

// Types - modular exports
export type * from "./types";

// Specific type exports for convenience
export type {
  // Configuration types
  VanaConfig,
  WalletConfig,
  ChainConfig,
  RuntimeConfig,
  StorageConfig,

  // Chain types
  VanaChainId,
  VanaChain,

  // Contract types
  VanaContractName,
  ContractInfo,
  VanaContract,
  ContractAddresses,

  // Data types
  UserFile,
  FileMetadata,
  UploadFileParams,
  UploadFileResult,
  UploadEncryptedFileResult,

  // Permission types
  GrantedPermission,
  GrantPermissionParams,
  RevokePermissionParams,
  PermissionGrantTypedData,
  GrantFile,

  // Relayer types
  RelayerStorageResponse,
  RelayerTransactionResponse,
  RelayerConfig,

  // Utility types
  ApiResponse,
  VanaError,
  PaginationParams,
  PaginationResult,
  TransactionOptions,
  TransactionReceipt,
} from "./types";

// Type guards and utilities
export {
  isWalletConfig,
  isChainConfig,
  isVanaChainId,
  isVanaChain,
} from "./types";

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

// Legacy exports for backward compatibility
export type { VanaContract } from "./types";
