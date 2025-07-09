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
export type { VanaChainId, VanaChain } from "./chains";

export { isVanaChainId, isVanaChain } from "./chains";

// Contract types
export type {
  VanaContractName,
  ContractInfo,
  ContractDeployment,
  VanaContractInstance,
  ContractAddresses,
  ContractMethodParams,
  ContractMethodReturnType,
} from "./contracts";

// Note: VanaContract and ContractAbis are exported directly from src/index.ts
// to avoid circular dependencies. Do not re-export them here.

// Storage types
export type {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
  StorageProviderConfig,
} from "./storage";

export { StorageError } from "./storage";

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
  Schema,
  Refiner,
  AddSchemaParams,
  AddSchemaResult,
  AddRefinerParams,
  AddRefinerResult,
  UpdateSchemaIdParams,
  UpdateSchemaIdResult,
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
  Server,
  TrustServerParams,
  UntrustServerParams,
  TrustServerInput,
  UntrustServerInput,
  TrustServerTypedData,
  UntrustServerTypedData,
} from "./permissions";

// Personal server types
export type {
  PostRequestParams,
  InitPersonalServerParams,
  ReplicatePredictionResponse,
  PersonalServerResponse,
} from "./personal";

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
  PermissionGrantDomain as PermissionGrantDomainLegacy,
  PermissionGrantMessage as PermissionGrantMessageLegacy,
  PermissionInputMessage as PermissionInputMessageLegacy,
  SimplifiedPermissionMessage as SimplifiedPermissionMessageLegacy,
  GrantFile as GrantFileLegacy,
  PermissionGrantTypedData as PermissionGrantTypedDataLegacy,
  GenericTypedData as GenericTypedDataLegacy,
} from "./permissions";

export type { ContractInfo as ContractInfoLegacy } from "./contracts";

// Generic types for extensibility
export type {
  GenericRequest,
  GenericResponse,
  AsyncResult,
  ContractCall,
  EventFilter,
  EventLog,
  ControllerContext,
  Controller,
  Cache,
  RetryConfig,
  RateLimiterConfig,
  Middleware,
  Plugin,
  Factory,
  Repository,
  Validator,
  Transformer,
  Service,
  Observer,
  Observable,
  StateMachine,
  ConditionalOptional,
  PromiseResult,
  AllKeys,
  DeepPartial,
  DeepReadonly,
  RequireKeys,
  OptionalKeys,
  NonNullable,
  PickByType,
  OmitByType,
  Brand,
  Nominal,
} from "./generics";

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
