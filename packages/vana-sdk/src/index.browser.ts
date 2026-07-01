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
  serverDeregistrationDomain,
  builderRegistrationDomain,
  escrowPaymentDomain,
  GRANT_REGISTRATION_TYPES,
  GRANT_REVOCATION_TYPES,
  SERVER_REGISTRATION_TYPES,
  SERVER_DEREGISTRATION_TYPES,
  BUILDER_REGISTRATION_TYPES,
  ADD_DATA_TYPES,
  RECORD_DATA_ACCESS_TYPES,
  type DataPortabilityContracts,
  type DataPortabilityGatewayConfig,
  type GrantRegistrationMessage,
  type GrantRevocationMessage,
  type ServerRegistrationMessage,
  type ServerDeregistrationMessage,
  type BuilderRegistrationMessage,
  type AddDataMessage,
  type RecordDataAccessMessage,
} from "./protocol/eip712";
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
  PERSONAL_SERVER_DEREGISTRATION_DEFAULT_CHAIN_ID,
  PERSONAL_SERVER_DEREGISTRATION_DEFAULT_VERIFYING_CONTRACT,
  PERSONAL_SERVER_DEREGISTRATION_DEFAULT_TTL_SECONDS,
  personalServerDeregistrationDomain,
  personalServerDeregistrationDeadline,
  createViemPersonalServerDeregistrationSigner,
  buildPersonalServerDeregistrationTypedData,
  buildPersonalServerDeregistrationSignature,
  deregisterPersonalServerSignature,
  type PersonalServerDeregistrationTypedData,
  type PersonalServerDeregistrationSigner,
  type PersonalServerDeregistrationDomainInput,
  type ViemPersonalServerDeregistrationWalletClient,
  type ViemPersonalServerDeregistrationSignerSource,
  type BuildPersonalServerDeregistrationTypedDataInput,
  type BuildPersonalServerDeregistrationSignatureInput,
  type PersonalServerDeregistrationSignature,
} from "./protocol/personal-server-revocation";
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
  type GatewayGrantFee,
  type GatewayGrantStatus,
  type GatewayGrantResponse,
  type GrantListItem,
  type DataPointRecord,
  type DataPointListResult,
  type ListDataPointsOptions,
  type RegisterServerParams,
  type RegisterServerResult,
  type RevokeServerParams,
  type RegisterBuilderParams,
  type RegisterBuilderResult,
  type RegisterDataPointParams,
  type RegisterDataPointResult,
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
