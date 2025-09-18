/**
 * Centralized type exports for the Vana SDK.
 *
 * @remarks
 * This module re-exports all public types from their respective modules,
 * providing a single import point for SDK consumers. Types are organized
 * by category for easy discovery and usage.
 *
 * **Import Strategy:**
 * - Import types from this module for application code
 * - Import from specific modules only for advanced use cases
 * - Avoid importing from internal paths
 *
 * @example
 * ```typescript
 * // Recommended: Import from types module
 * import type { VanaConfig, UserFile, GrantPermissionParams } from '@opendatalabs/vana-sdk';
 *
 * // Alternative: Import from specific category
 * import type { StorageProvider } from '@opendatalabs/vana-sdk';
 * ```
 *
 * @category Types
 * @module types
 */

// Configuration types
export type {
  BaseConfig,
  BaseConfigWithStorage,
  WalletConfig,
  WalletConfigWithStorage,
  ChainConfig,
  ChainConfigWithStorage,
  VanaConfig,
  VanaConfigWithStorage,
  VanaConfigWithWallet,
  VanaConfigReadOnly,
  VanaConfigAddressOnly,
  VanaConfigWithWalletWithStorage,
  VanaConfigReadOnlyWithStorage,
  VanaConfigAddressOnlyWithStorage,
  RuntimeConfig,
  StorageConfig,
  ConfigValidationOptions,
  ConfigValidationResult,
  DownloadRelayerCallbacks,
  StorageRequiredMarker,
  RelayerRequiredMarker,
} from "./config";

export {
  isWalletConfig,
  isChainConfig,
  isReadOnlyConfig,
  isAddressOnlyConfig,
  hasStorageConfig,
} from "./config";

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
  UploadParams,
  FilePermissionParams,
  LegacyPermissionParams,
  EncryptedUploadParams,
  UnencryptedUploadParams,
  UploadResult,
  UploadFileParams,
  UploadFileResult,
  UploadEncryptedFileResult,
  EncryptionInfo,
  GetUserFilesParams,
  GetFileParams,
  EncryptFileOptions,
  EncryptFileResult,
  DecryptFileOptions,
  UploadFileWithPermissionsParams,
  AddFilePermissionParams,
  DecryptFileWithPermissionOptions,
  DownloadFileParams,
  DownloadFileResult,
  DeleteFileParams,
  DeleteFileResult,
  FileAccessPermissions,
  FileSharingConfig,
  BatchUploadParams,
  BatchUploadResult,
  SchemaMetadata,
  CompleteSchema,
  Schema,
  Refiner,
  AddSchemaParams,
  AddSchemaResult,
  AddRefinerParams,
  AddRefinerResult,
  UpdateSchemaIdParams,
  UpdateSchemaIdResult,
  TrustedServer,
  GetUserTrustedServersParams,
} from "./data";

// Schema types
export type {
  CreateSchemaParams,
  CreateSchemaResult,
} from "../controllers/schemas";

// Schema validation types
export type { DataSchema } from "../utils/schemaValidation";
export {
  SchemaValidationError,
  SchemaValidator,
  validateDataSchemaAgainstMetaSchema,
  validateDataAgainstSchema,
  fetchAndValidateSchema,
} from "../utils/schemaValidation";

// Permission types
export type {
  OnChainPermissionGrant,
  GetUserPermissionsOptions,
  GrantPermissionParams,
  RevokePermissionParams,
  CheckPermissionParams,
  PermissionCheckResult,
  PermissionGrantDomain,
  PermissionGrantMessage,
  PermissionInputMessage,
  SimplifiedPermissionMessage,
  GrantFile,
  PermissionGrantTypedData,
  RevokePermissionTypedData,
  GenericTypedData,
  TypedDataPrimaryType,
  SpecificTypedData,
  PermissionOperation,
  PermissionStatus,
  QueryPermissionsParams,
  PermissionQueryResult,
  PermissionAnalytics,
  PermissionEvent,
  GrantedPermission,
  Server,
  AddAndTrustServerParams,
  TrustServerParams,
  UntrustServerParams,
  AddAndTrustServerInput,
  TrustServerInput,
  UntrustServerInput,
  AddAndTrustServerTypedData,
  TrustServerTypedData,
  UntrustServerTypedData,
  PermissionInfo,
  RevokePermissionInput,
  TrustedServerInfo,
  PaginatedTrustedServers,
  TrustedServerQueryOptions,
  BatchServerInfoResult,
  ServerTrustStatus,
  ServerInfo,
  Grantee,
  GranteeInfo,
  RegisterGranteeParams,
  RegisterGranteeInput,
  RegisterGranteeTypedData,
  GranteeQueryOptions,
  PaginatedGrantees,
  ServerFilesAndPermissionParams,
  ServerFilesAndPermissionTypedData,
  Permission,
} from "./permissions";

// Personal server types
export type {
  PostRequestParams,
  CreateOperationParams,
  InitPersonalServerParams,
  PersonalServerIdentity,
} from "./personal";

// Server API types (auto-generated via fetch-server-types.ts)
export type * from "../generated/server/server-exports";

// External API types
export type {
  ReplicateAPIResponse,
  ReplicateStatus,
  PinataUploadResponse,
  PinataPin,
  PinataListResponse,
  APIResponse,
} from "./external-apis";

export {
  isReplicateAPIResponse,
  isAPIResponse,
  safeParseJSON,
  parseReplicateOutput,
} from "./external-apis";

// Relayer types
export type {
  RelayerStorageResponse,
  RelayerTransactionResponse,
  RelayerStoreParams,
  RelayerSubmitParams,
  RelayerStatus,
  RelayerConfig,
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
  SignedRelayerRequest,
  DirectRelayerRequest,
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

// Operation types
export type {
  TransactionOptions,
  TransactionReceipt,
  TransactionResult,
  IOperationStore,
  OperationState,
} from "./operations";

// Options types
export type {
  ConsistencyOptions,
  DataSource,
  PaginationOptions,
  ListOptions,
  WriteOptions,
  LegacyTransactionOptions,
} from "./options";

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
