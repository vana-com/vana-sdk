// Configuration types
export type {
  BaseConfig,
  WalletConfig,
  ChainConfig,
  VanaConfig,
  RuntimeConfig,
  StorageConfig,
  ConfigValidationOptions,
  ConfigValidationResult,
} from "./config";

export { isWalletConfig, isChainConfig } from "./config";

// Chain types
export type {
  VanaChainId,
  VanaChain,
  ChainConfig as ChainConfigType,
} from "./chains";

export { isVanaChainId, isVanaChain } from "./chains";

// Contract types
export type {
  VanaContractName,
  ContractInfo,
  ContractDeployment,
  VanaContract,
  ContractAddresses,
  ContractMethodParams,
  ContractMethodReturnType,
} from "./contracts";

// Data types
export type {
  UserFile,
  FileMetadata,
  UploadFileParams,
  UploadFileResult,
  UploadEncryptedFileResult,
  EncryptionInfo,
  GetUserFilesParams,
  GetFileParams,
  DownloadFileParams,
  DownloadFileResult,
  DeleteFileParams,
  DeleteFileResult,
  FileAccessPermissions,
  FileSharingConfig,
  BatchUploadParams,
  BatchUploadResult,
} from "./data";

// Permission types
export type {
  GrantedPermission,
  GrantPermissionParams,
  RevokePermissionParams,
  CheckPermissionParams,
  PermissionCheckResult,
  PermissionGrantDomain,
  PermissionGrantMessage,
  PermissionInputMessage,
  SimplifiedPermissionMessage,
  GrantFile,
  GrantFileMetadata,
  ApplicationMetadata,
  PermissionGrantTypedData,
  GenericTypedData,
  PermissionOperation,
  PermissionStatus,
  QueryPermissionsParams,
  PermissionQueryResult,
  PermissionAnalytics,
  PermissionEvent,
} from "./permissions";

// Relayer types
export type {
  RelayerStorageResponse,
  RelayerTransactionResponse,
  RelayerStoreParams,
  RelayerSubmitParams,
  RelayerStatus,
  RelayerConfig,
  RelayerRequestOptions,
  RelayerErrorResponse,
  RelayerQueueInfo,
  RelayerTransactionStatus,
  RelayerMetrics,
  RelayerWebhookConfig,
  RelayerWebhookPayload,
} from "./relayer";

// Utility types
export type {
  PartialExcept,
  RequiredExcept,
  Awaited,
  MaybePromise,
  MaybeArray,
  PaginationParams,
  PaginationResult,
  BlockRange,
  TransactionOptions,
  TransactionReceipt,
  ApiResponse,
  VanaError,
  RetryConfig,
  CacheConfig,
  ValidationResult,
  StatusInfo,
  RateLimitInfo,
  UploadProgress,
  NetworkInfo,
  GasEstimate,
  TimeRange,
} from "./utils";

// Legacy types for backward compatibility
// These will be deprecated in future versions
export type {
  GrantedPermission as GrantedPermissionLegacy,
  GrantPermissionParams as GrantPermissionParamsLegacy,
  RevokePermissionParams as RevokePermissionParamsLegacy,
  UploadEncryptedFileResult as UploadEncryptedFileResultLegacy,
  UserFile as UserFileLegacy,
  RelayerStorageResponse as RelayerStorageResponseLegacy,
  RelayerTransactionResponse as RelayerTransactionResponseLegacy,
  PermissionGrantDomain as PermissionGrantDomainLegacy,
  PermissionGrantMessage as PermissionGrantMessageLegacy,
  PermissionInputMessage as PermissionInputMessageLegacy,
  SimplifiedPermissionMessage as SimplifiedPermissionMessageLegacy,
  GrantFile as GrantFileLegacy,
  PermissionGrantTypedData as PermissionGrantTypedDataLegacy,
  GenericTypedData as GenericTypedDataLegacy,
} from "./permissions";

export type { ContractInfo as ContractInfoLegacy } from "./contracts";

// Re-export viem types that are commonly used
export type {
  Address,
  Hash,
  Abi,
  Chain,
  WalletClient,
  PublicClient,
  Account,
  GetContractReturnType,
} from "viem";
