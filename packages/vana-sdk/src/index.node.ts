/**
 * @module Node
 * Node.js entry point for the Vana SDK.
 *
 * @remarks
 * Exposes the platform adapter, ECIES crypto, storage providers, smart-contract
 * helpers, ABIs, addresses, chain configurations, and shared types.
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

// Platform adapters
export { NodePlatformAdapter } from "./platform/node";
export { BrowserPlatformAdapter } from "./platform/browser";
export { NodeECIESUint8Provider as NodeECIESProvider } from "./crypto/ecies/node";
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

// Platform utilities
export {
  detectPlatform,
  createPlatformAdapter,
  createPlatformAdapterFor,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";

// Browser-safe platform utilities
export {
  createNodePlatformAdapter,
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./platform/browser-safe";

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

// PKCE + token-store (OAuth client primitives)
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

// Data Portability protocol signing helpers
export {
  fileRegistrationDomain,
  grantRegistrationDomain,
  grantRevocationDomain,
  serverRegistrationDomain,
  builderRegistrationDomain,
  FILE_REGISTRATION_TYPES,
  GRANT_REGISTRATION_TYPES,
  GRANT_REVOCATION_TYPES,
  SERVER_REGISTRATION_TYPES,
  BUILDER_REGISTRATION_TYPES,
  type DataPortabilityContracts,
  type DataPortabilityGatewayConfig,
  type FileRegistrationMessage,
  type GrantRegistrationMessage,
  type GrantRevocationMessage,
  type ServerRegistrationMessage,
  type BuilderRegistrationMessage,
} from "./protocol/eip712";
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
  type GatewayGrantResponse,
  type GrantListItem,
  type FileRecord,
  type FileListResult,
  type RegisterServerParams,
  type RegisterServerResult,
  type RegisterFileParams,
  type CreateGrantParams,
  type RevokeGrantParams,
  type GatewayClient,
} from "./protocol/gateway";

// Personal Server typed errors
export { PSError, parsePSError, type PSErrorCode } from "./types/ps-errors";
