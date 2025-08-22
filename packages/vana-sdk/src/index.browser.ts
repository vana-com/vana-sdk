import { BrowserPlatformAdapter } from "./platform/browser";
import { VanaCore } from "./core";
import type {
  VanaConfig,
  VanaConfigWithStorage,
  StorageRequiredMarker,
} from "./types";

/**
 * Internal implementation class for browser environments.
 * This class is not exported directly - use the Vana factory function instead.
 */
class VanaBrowserImpl extends VanaCore {
  constructor(config: VanaConfig) {
    super(new BrowserPlatformAdapter(), config);
  }
}

/**
 * Creates a new Vana SDK instance configured for browser environments.
 *
 * @remarks
 * This is the primary entry point for browser applications using the Vana SDK. The function
 * automatically detects your configuration type and provides compile-time type safety:
 * - **With storage configured**: All methods including file upload/download are available
 * - **Without storage**: Storage-dependent methods throw runtime errors and are excluded from TypeScript
 *
 * The SDK supports multiple wallet configurations (direct WalletClient or chain config),
 * various storage providers (IPFS, Pinata, Google Drive), and gasless transactions via relayers.
 * All operations are optimized for browser environments with proper bundle size optimization.
 *
 * @param config - Configuration object containing wallet, storage, and relayer settings
 * @returns A fully configured Vana SDK instance for browser use
 * @throws {InvalidConfigurationError} When configuration parameters are invalid or missing
 * @example
 * ```typescript
 * import { Vana } from '@opendatalabs/vana-sdk/browser';
 * import { createWalletClient, custom } from 'viem';
 * import { IPFSStorage } from '@opendatalabs/vana-sdk/browser';
 *
 * // Complete setup with storage and wallet
 * const walletClient = createWalletClient({
 *   chain: mokshaTestnet,
 *   transport: custom(window.ethereum)
 * });
 *
 * const vana = Vana({
 *   walletClient,
 *   storage: {
 *     providers: {
 *       ipfs: new IPFSStorage({ gateway: 'https://gateway.pinata.cloud' }),
 *       pinata: new PinataStorage({ apiKey: process.env.PINATA_KEY })
 *     },
 *     defaultProvider: 'ipfs'
 *   },
 *   relayerCallbacks: {
 *     async submitPermissionGrant(typedData, signature) {
 *       const response = await fetch('/api/relay/grant', {
 *         method: 'POST',
 *         body: JSON.stringify({ typedData, signature })
 *       });
 *       return (await response.json()).transactionHash;
 *     }
 *   }
 * });
 *
 * // All operations now available
 * const files = await vana.data.getUserFiles();
 * const permissions = await vana.permissions.getUserPermissions();
 * await vana.data.upload({ content: 'My data', filename: 'data.txt' });
 * ```
 *
 * @example
 * ```typescript
 * // Minimal setup without storage (read-only operations)
 * const vanaReadOnly = Vana({ walletClient });
 *
 * // These work without storage
 * const files = await vanaReadOnly.data.getUserFiles();
 * const permissions = await vanaReadOnly.permissions.getUserPermissions();
 *
 * // This would throw a runtime error
 * // await vanaReadOnly.data.upload(params); // ❌ InvalidConfigurationError
 *
 * // Safe runtime check
 * if (vanaReadOnly.isStorageEnabled()) {
 *   await vanaReadOnly.data.upload(params); // ✅ TypeScript allows this
 * } else {
 *   console.log('Storage not configured - upload unavailable');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Using chain configuration instead of wallet client
 * const vana = Vana({
 *   chainId: 14800, // Moksha testnet
 *   account: '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36',
 *   rpcUrl: 'https://rpc.moksha.vana.org',
 *   storage: {
 *     providers: { ipfs: new IPFSStorage() },
 *     defaultProvider: 'ipfs'
 *   }
 * });
 * ```
 *
 * @see {@link https://docs.vana.org/docs/sdk/getting-started | Getting Started Guide} for setup tutorials
 * @see {@link VanaCore} for the underlying implementation details
 * @category Core SDK
 */
export function Vana(
  config: VanaConfigWithStorage,
): VanaBrowserImpl & StorageRequiredMarker;
export function Vana(config: VanaConfig): VanaBrowserImpl;
/**
 * Creates a new Vana SDK instance.
 *
 * @param config - The configuration for the Vana SDK
 * @returns A new Vana SDK instance
 */
export function Vana(config: VanaConfig) {
  return new VanaBrowserImpl(config);
}

/**
 * The type of a Vana SDK instance in browser environments.
 * Uses InstanceType to properly expose all public methods from the class hierarchy.
 *
 * @see {@link Vana}
 */
export type VanaInstance = InstanceType<typeof VanaBrowserImpl>;

// Export as default export
export default Vana;

// Re-export everything that was in index.ts (avoiding circular dependency)
// Core class and factory
export { VanaCore, VanaCoreFactory } from "./core";

// Types - modular exports
export type * from "./types";

// Type guards and utilities
export {
  isReplicateAPIResponse,
  isAPIResponse,
  safeParseJSON,
  parseReplicateOutput,
} from "./types/external-apis";

// VanaContract is exported from abi to avoid circular dependencies
export type { VanaContract } from "./generated/abi";

// Error classes
export * from "./errors";

// Controllers
export { PermissionsController } from "./controllers/permissions";
export { DataController } from "./controllers/data";
export { ServerController } from "./controllers/server";
export { ProtocolController } from "./controllers/protocol";

// Contract controller
export * from "./contracts/contractController";

// Utilities
export * from "./utils/encryption";
export * from "./utils/formatters";
export * from "./utils/grantFiles";
export * from "./utils/grantValidation";
export * from "./utils/grants";
export * from "./utils/ipfs";
export * from "./utils/schemaValidation";
export * from "./utils/signatureCache";
// TransactionHandle removed - using POJOs instead
export type {
  Operation,
  TransactionResult,
  TransactionReceipt,
  PollingOptions,
  TransactionWaitOptions,
} from "./types/operations";

// Storage API
export * from "./storage";

// Configuration
export { getContractAddress } from "./config/addresses";
export { chains } from "./config/chains";

// Chain configurations with subgraph URLs - explicit exports for better DX
export {
  vanaMainnet,
  mokshaTestnet,
  moksha,
  type VanaChainConfig,
  getChainConfig,
  getAllChains,
} from "./chains";
export * from "./chains";

// ABIs
export { getAbi } from "./generated/abi";
export type { VanaContract as VanaContractAbi } from "./generated/abi";

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

// Platform adapters - browser-safe exports
export { BrowserPlatformAdapter } from "./platform/browser";
export { BrowserECIESUint8Provider as BrowserECIESProvider } from "./crypto/ecies/browser";
export type { VanaPlatformAdapter } from "./platform/interface";

// Browser-only platform adapter utilities
export {
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./platform/browser-only";

// Note: createNodePlatformAdapter is not exported in browser bundle to avoid Node.js dependencies

// NodePlatformAdapter is available through dynamic import to avoid bundling Node.js dependencies
// Use createNodePlatformAdapter() for dynamic import

// Platform utilities - browser-safe only
export {
  detectPlatform,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";

export { ApiClient } from "./core/apiClient";

export type {
  ApiClientConfig,
  HttpMethod,
  RequestOptions,
} from "./core/apiClient";

// Note: Default export is already handled above with the Vana factory function

// For testing purposes, we also export the implementation class
export { VanaBrowserImpl };
