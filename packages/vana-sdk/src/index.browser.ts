/**
 * @module Browser
 * Browser entry point for the Vana SDK.
 *
 * @remarks
 * Exposes the platform adapter, ECIES crypto, storage providers, smart-contract
 * helpers, ABIs, addresses, chain configurations, and shared types — without
 * Node-only dependencies.
 */

// Type re-exports
export type * from "./types";

// Errors
export * from "./errors";

// Contract controller (L1 + smart contract integration)
export * from "./contracts/contractController";

// ABIs
export { getAbi } from "./generated/abi";
export type {
  VanaContract,
  VanaContract as VanaContractAbi,
} from "./generated/abi";

// Addresses
export { getContractAddress, CONTRACTS } from "./generated/addresses";
export type { VanaContractAddress } from "./generated/addresses";

// Chain configurations
export {
  vanaMainnet,
  mokshaTestnet,
  moksha,
  type VanaChainConfig,
  getChainConfig,
  getAllChains,
} from "./chains";
export * from "./chains";

// viem chain registry
export { chains } from "./config/chains";

// Default service endpoints
export {
  type ServiceEndpoints,
  mainnetServices,
  mokshaServices,
  getServiceEndpoints,
} from "./config/default-services";

// Storage API
export * from "./storage/index";
export { createVanaStorageProvider } from "./storage/default";
export type { VanaStorageProviderOptions } from "./storage/default";

// Platform adapters - browser-safe exports
export { BrowserPlatformAdapter } from "./platform/browser";
export { BrowserECIESUint8Provider as BrowserECIESProvider } from "./crypto/ecies/browser";
export type { VanaPlatformAdapter } from "./platform/interface";

// ECIES utilities
export {
  ECIESError,
  isECIESEncrypted,
  serializeECIES,
  deserializeECIES,
} from "./crypto/ecies";
export type {
  ECIESProvider,
  ECIESEncrypted,
  ECIESOptions,
} from "./crypto/ecies";

// Browser-only platform adapter utilities
export {
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./platform/browser-only";

// Auth primitives
export {
  generatePkceVerifier,
  computePkceChallenge,
  verifyPkceChallenge,
  assertValidPkceVerifier,
  PKCE_VERIFIER_PATTERN,
  PKCE_CHALLENGE_PATTERN,
} from "./auth/pkce";
export {
  InMemoryTokenStore,
  type TokenStore,
  type TokenRecord,
} from "./auth/token-store";
export {
  OAuthClient,
  type OAuthClientConfig,
  type AuthorizationUrlResult,
} from "./auth/oauth-client";

// Note: createNodePlatformAdapter is intentionally not exported in browser bundle
// to avoid bundling Node-only dependencies.

// Platform utilities - browser-safe only
export {
  detectPlatform,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";

// HKDF / master key derivation (DPv1 envelope)
export {
  deriveMasterKey,
  deriveScopeKey,
  recoverServerOwner,
  MASTER_KEY_MESSAGE,
} from "./crypto/keys/derive";

// OpenPGP file encryption (DPv1 envelope)
export {
  encryptWithPassword,
  decryptWithPassword,
} from "./crypto/envelope/openpgp";

// Web3Signed auth primitives
export {
  parseWeb3SignedHeader,
  verifyWeb3Signed,
  type Web3SignedPayload,
  type VerifiedAuth,
} from "./auth/web3-signed";
export {
  buildWeb3SignedHeader,
  computeBodyHash,
  type Web3SignedSignFn,
} from "./auth/web3-signed-builder";
export {
  MissingAuthError,
  InvalidSignatureError,
  ExpiredTokenError,
} from "./auth/errors";

// Data Portability protocol signing helpers
export {
  NATIVE_VANA_ASSET,
  dataRegistryDomain,
  grantRegistrationDomain,
  grantRevocationDomain,
  serverRegistrationDomain,
  builderRegistrationDomain,
  escrowPaymentDomain,
  GRANT_REGISTRATION_TYPES,
  GRANT_REVOCATION_TYPES,
  SERVER_REGISTRATION_TYPES,
  BUILDER_REGISTRATION_TYPES,
  ADD_DATA_TYPES,
  RECORD_DATA_ACCESS_TYPES,
  type DataPortabilityContracts,
  type DataPortabilityGatewayConfig,
  type GrantRegistrationMessage,
  type GrantRevocationMessage,
  type ServerRegistrationMessage,
  type BuilderRegistrationMessage,
  type AddDataMessage,
  type RecordDataAccessMessage,
} from "./protocol/eip712";
export {
  ENCLAVE_IDENTITY_EVIDENCE_VERSION,
  USER_PS_ID_DOMAIN,
  ENCLAVE_WALLET_PURPOSE,
  MASTER_SIGNATURE_DELIVERY_VERSION,
  SEALED_ENVELOPE_VERSION,
  ENCLAVE_TRUST_ANCHORS,
  userPsId,
  appRootPreimage,
  kmsIssuedPreimage,
  verifyEnclaveIdentityEvidence,
  buildMasterSignatureDelivery,
  encryptMasterSignatureDelivery,
  type UserPsId,
  type EnclaveIdentityEvidence,
  type IdentityRequest,
  type IdentityState,
  type IdentityResponse,
  type IdentityRegistrationRequest,
  type IdentityRegistrationResponse,
  type MasterSignatureDelivery,
  type SealedSecretSubmission,
  type SealedSecretResponse,
  type AesGcmBox,
  type SealedEnvelope,
  type EnclaveTrustAnchors,
} from "./protocol/identity";
export {
  PERSONAL_SERVER_REGISTRATION_DEFAULT_CHAIN_ID,
  PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
  personalServerRegistrationDomain,
  createViemPersonalServerRegistrationSigner,
  buildPersonalServerRegistrationTypedData,
  buildPersonalServerRegistrationSignature,
  registerPersonalServerSignature,
  type PersonalServerRegistrationTypedData,
  type PersonalServerRegistrationSigner,
  type PersonalServerRegistrationDomainInput,
  type ViemPersonalServerRegistrationWalletClient,
  type ViemPersonalServerRegistrationSignerSource,
  type BuildPersonalServerRegistrationTypedDataInput,
  type BuildPersonalServerRegistrationSignatureInput,
  type PersonalServerRegistrationSignature,
} from "./protocol/personal-server-registration";
export {
  PERSONAL_SERVER_LITE_OWNER_BINDING_VERSION,
  PERSONAL_SERVER_LITE_OWNER_BINDING_PURPOSE,
  PERSONAL_SERVER_LITE_OWNER_BINDING_PREFIX,
  buildPersonalServerLiteOwnerBindingMessage,
  createViemPersonalServerLiteOwnerBindingSigner,
  buildPersonalServerLiteOwnerBindingSignature,
  signPersonalServerLiteOwnerBinding,
  type PersonalServerLiteOwnerBindingPurpose,
  type PersonalServerLiteOwnerBindingMessage,
  type PersonalServerLiteOwnerBindingSigner,
  type ViemPersonalServerLiteOwnerBindingWalletClient,
  type ViemPersonalServerLiteOwnerBindingSignerSource,
  type BuildPersonalServerLiteOwnerBindingSignatureInput,
  type PersonalServerLiteOwnerBindingSignature,
} from "./personal-server-lite/owner-binding";
export {
  ACCOUNT_PERSONAL_SERVER_REGISTRATION_INTENT,
  AccountPersonalServerRegistrationError,
  signPersonalServerRegistrationWithAccount,
  type AccountPersonalServerRegistrationIntent,
  type AccountPersonalServerRegistrationSignature,
  type AccountPersonalServerRegistrationStatus,
  type AccountPersonalServerRegistrationRequest,
  type AccountPersonalServerRegistrationConfig,
  type AccountSignedPersonalServerRegistration,
  type AccountConfirmationRequiredPersonalServerRegistration,
  type AccountFallbackSignedPersonalServerRegistration,
  type AccountPersonalServerRegistrationResult,
} from "./account/personal-server-registration";
export {
  AccountPersonalServerLiteOwnerBindingError,
  signPersonalServerLiteOwnerBindingWithAccountClient,
  type AccountPersonalServerLiteOwnerBindingClient,
  type SignPersonalServerLiteOwnerBindingWithAccountClientConfig,
} from "./account/personal-server-lite-owner-binding";
export {
  isDataPortabilityGatewayConfig,
  verifyGrantRegistration,
  type VerifyGrantRegistrationInput,
  type VerifyGrantRegistrationResult,
} from "./protocol/grants";
export {
  FEE_REGISTRY_ABI,
  REGISTRATION_KIND_FOR_OP,
  getFee,
  getOpFee,
  type FeeKind,
  type FeeEntry,
  type OpFee,
  type FeeRegistryOptions,
} from "./protocol/fee-registry";
export {
  escrowContractAddress,
  encodeDepositNativeData,
  encodeDepositTokenData,
  buildDepositNativeRequest,
  buildDepositTokenRequest,
  type DepositNativeInput,
  type DepositTokenInput,
  type DepositTransactionRequest,
} from "./protocol/escrow-deposit";
export {
  DATA_REGISTRY_STATUS_ABI,
  DataPointStatus,
  dataRegistryContractAddress,
  encodeSetDataPointStatusData,
  buildSetDataPointStatusRequest,
  buildMarkDataPointUnavailableRequest,
  type SetDataPointStatusInput,
  type DataPointStatusTransactionRequest,
} from "./protocol/data-point-status";
export {
  TOMBSTONE_DATA_HASH,
  TOMBSTONE_METADATA_HASH,
  TOMBSTONE_DATA_HASH_PREIMAGE,
  TOMBSTONE_METADATA_HASH_PREIMAGE,
  computeTombstoneHash,
  isTombstoneHashes,
  isDataPointTombstone,
  tombstoneDeletedAt,
  createViemDataPointDeletionSigner,
  buildDataPointDeletionTypedData,
  buildDataPointDeletionSignature,
  deleteDataPoint,
  type DataPointDeletionTypedData,
  type DataPointDeletionSigner,
  type ViemDataPointDeletionWalletClient,
  type ViemDataPointDeletionSignerSource,
  type BuildDataPointDeletionTypedDataInput,
  type BuildDataPointDeletionSignatureInput,
  type DataPointDeletionSignature,
  type DataPointBlobDeleteResult,
  type DataPointBlobStore,
  type DeleteDataPointInput,
  type DataPointDeletedResult,
  type DataPointDeletionPartialResult,
  type DataPointDeletionResult,
} from "./protocol/data-point-deletion";
export {
  personalServerDataReadPath,
  buildPersonalServerDataReadRequest,
  readPersonalServerData,
  type BuildPersonalServerDataReadRequestParams,
  type ReadPersonalServerDataParams,
} from "./protocol/personal-server-data";
export {
  ScopeSchema,
  parseScope,
  scopeToPathSegments,
  scopeMatchesPattern,
  scopeCoveredByGrant,
  type Scope,
  type ParsedScope,
} from "./protocol/scopes";
export {
  SCOPE_ACTIONS,
  InvalidScopeEntryError,
  parseScopeEntry,
  formatScopeEntry,
  grantPermissions,
  permissionsToScopes,
  tryGrantPermissions,
  hasAction,
  type ScopeAction,
  type ParsedScopeEntry,
  type GrantPermission,
} from "./protocol/scope-actions";
export {
  WRITE_SESSION_PATH,
  WRITE_SIGNATURE_HEADER,
  WRITE_METADATA_HEADER,
  WRITE_FILENAME_HEADER,
  WRITE_CONTENT_DISPOSITION_HEADER,
  WRITER_ATTRIBUTION_KEY,
  LINEAGE_KEY,
  LINEAGE_FIELD,
  MAX_LINEAGE_SOURCES,
  RESERVED_WRITE_KEYS,
  openWriteSession,
  writeData,
  writePersonalServerData,
  sessionCoversScope,
  binaryWriteSignedBytes,
  normalizeBinaryMimeType,
  parseWriteMetadataHeader,
  encodeWriteMetadataHeader,
  type WriteTransportRetryOptions,
  type WriteSession,
  type OpenWriteSessionParams,
  type WriteBinaryPayload,
  type LineageSource,
  type WriteJsonDataParams,
  type WriteBinaryDataParams,
  type WriteDataParams,
  type WriteDataResult,
  type WritePersonalServerDataParams,
  type WritePersonalServerDataResult,
  type BinaryWriteSignedBytesInput,
} from "./protocol/personal-server-write";
export {
  resolveWriteSigner,
  type WriteSigner,
  type WriteSignerSource,
  type ViemWriteAccount,
  type ViemWriteWalletClient,
  type ResolveWriteSignerOptions,
} from "./protocol/write-signer";
export {
  DERIVATIVE_QUESTIONS_PATH,
  MAX_QUESTION_SOURCE_SCOPES,
  MAX_QUESTION_CHARS,
  MAX_QUESTION_MODEL_CHARS,
  DEFAULT_QUESTION_TIMEOUT_MS,
  DEFAULT_QUESTION_POLL_INTERVAL_MS,
  QUESTION_STATUSES,
  DERIVATIVE_ERROR_CODES,
  DerivativeErrorCodeSchema,
  type DerivativeErrorCode,
  registerQuestion,
  getQuestion,
  listQuestions,
  recomputeQuestion,
  deleteQuestion,
  waitForQuestion,
  askPersonalServer,
  QuestionStatusSchema,
  QuestionRegisteredBySchema,
  DerivativeQuestionSchema,
  QuestionRecomputeResultSchema,
  QuestionDeleteResultSchema,
  type QuestionStatus,
  type QuestionRegisteredBy,
  type DerivativeQuestion,
  type QuestionRecomputeResult,
  type QuestionDeleteResult,
  type DerivativeQuestionAuthParams,
  type RegisterQuestionParams,
  type GetQuestionParams,
  type ListQuestionsParams,
  type RecomputeQuestionParams,
  type DeleteQuestionParams,
  type WaitForQuestionParams,
  type AskPersonalServerParams,
  type AskPersonalServerResult,
} from "./protocol/derivative-questions";
export {
  DERIVATIVE_STATUS_PATH,
  DEFAULT_DERIVATIVE_STATUS_TIMEOUT_MS,
  DEFAULT_DERIVATIVE_STATUS_POLL_INTERVAL_MS,
  derivativeStatusTarget,
  getDerivativeStatus,
  waitForDerivativeStatus,
  isDerivativeStatusSettled,
  DerivativeStatusSchema,
  type DerivativeStatus,
  type GetDerivativeStatusParams,
  type WaitForDerivativeStatusParams,
} from "./protocol/derivative-status";
export {
  deriveDataPointId,
  isDataPointId,
  scopeNamespace,
  derivedScopeViolatesNaming,
  assertDerivedScopeNaming,
  isRedactedLineageNode,
  personalServerLineagePath,
  gatewayLineagePath,
  getLineage,
  getPersonalServerLineage,
  getGatewayLineage,
  LineageNodeSchema,
  RedactedLineageNodeSchema,
  LineageEntrySchema,
  LineageGraphSchema,
  type LineageNode,
  type RedactedLineageNode,
  type LineageEntry,
  type LineageGraph,
  type LineageReadResult,
  type PersonalServerLineageParams,
  type GatewayLineageParams,
  type GetLineageParams,
} from "./protocol/lineage";
export {
  DataFileEnvelopeSchema,
  createDataFileEnvelope,
  IngestResponseSchema,
  type DataFileEnvelope,
  type IngestResponse,
} from "./protocol/data-file";
export {
  createGatewayClient,
  type GatewayEnvelope,
  type GatewayProof,
  type Builder,
  type Schema,
  type ServerInfo,
  type OwnerServerRecord,
  type OwnerServersResult,
  type GatewayGrantFee,
  type GatewayGrantStatus,
  type GatewayGrantResponse,
  type GrantListItem,
  type DataPointRecord,
  type DataPointListResult,
  type ListDataPointsOptions,
  type RegisterServerParams,
  type RegisterServerResult,
  type RegisterBuilderParams,
  type RegisterBuilderResult,
  type RegisterDataPointParams,
  type RegisterDataPointResult,
  type GetDataPointOptions,
  type DeleteDataPointParams,
  type DeleteDataPointResult,
  type CreateGrantParams,
  type RevokeGrantParams,
  type AccessRecord,
  type PayForOperationParams,
  type PayForOperationResult,
  type SettleOpType,
  type SettleItem,
  type SettlePromoteResult,
  type SettleReconcileItem,
  type SettleParams,
  type SettleResult,
  type GatewayClient,
} from "./protocol/gateway";
// DPv2 escrow payment helpers
export {
  createEscrowGatewayClient,
  genericPaymentDomain,
  GENERIC_PAYMENT_TYPES,
  ESCROW_DEPOSIT_ABI,
  NATIVE_ASSET_ADDRESS,
  type GenericPaymentMessage,
  type EscrowBalanceEntry,
  type EscrowBalanceResult,
  type EscrowBalanceSyncResult,
  type DepositSubmissionResult,
  type PaymentBreakdown,
  type EscrowPayResult,
  type SubmitDepositParams,
  type PayForOpParams,
  type EscrowGatewayClient,
  type SubmittedDepositEntry,
  type FinalizedDepositEntry,
  type FailedDepositEntry,
} from "./protocol/escrow";

// Personal Server typed errors
export { PSError, parsePSError, type PSErrorCode } from "./types/ps-errors";
