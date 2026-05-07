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
export * from "./storage";

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

// Note: createNodePlatformAdapter is intentionally not exported in browser bundle
// to avoid bundling Node-only dependencies.

// Platform utilities - browser-safe only
export {
  detectPlatform,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";
