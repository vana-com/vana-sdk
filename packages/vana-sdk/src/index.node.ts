/**
 * @module Node
 * Node.js-specific implementation of the Vana SDK
 */

import { NodePlatformAdapter } from "./platform/node";
import { VanaCore } from "./core";
import type {
  VanaConfig,
  VanaConfigWithStorage,
  StorageRequiredMarker,
  RelayerRequiredMarker,
} from "./types";
import type {
  IOperationStore,
  IRelayerStateStore,
} from "./types/operationStore";
import type { IAtomicStore } from "./types/atomicStore";
import type { PublicClient } from "viem";

/**
 * Node.js-specific configuration interface with operation store support
 *
 * @category Configuration
 */
export type VanaNodeConfig = VanaConfig & {
  operationStore?: IOperationStore | IRelayerStateStore; // Can be either type
  atomicStore?: IAtomicStore;
};

/**
 * Node.js configuration with storage requirements
 *
 * @category Configuration
 */
export type VanaNodeConfigWithStorage = VanaConfigWithStorage & {
  operationStore?: IOperationStore | IRelayerStateStore; // Can be either type
  atomicStore?: IAtomicStore;
};

/**
 * Internal implementation class for Node.js environments.
 * This class is not exported directly - use the Vana factory function instead.
 */
class VanaNodeImpl extends VanaCore {
  override readonly operationStore?: IOperationStore | IRelayerStateStore;
  override readonly atomicStore?: IAtomicStore;

  constructor(config: VanaNodeConfig) {
    super(new NodePlatformAdapter(), config);
    this.operationStore = config.operationStore;
    this.atomicStore = config.atomicStore;
  }
}

/**
 * Creates a new Vana SDK instance configured for Node.js environments.
 *
 * @remarks
 * This is the primary entry point for Node.js applications using the Vana SDK. The function
 * automatically detects your configuration type and provides compile-time type safety:
 * - **With storage configured**: All methods including file upload/download are available
 * - **Without storage**: Storage-dependent methods throw runtime errors and are excluded from TypeScript
 *
 * The Node.js version provides enhanced capabilities including native file system access,
 * server-side cryptographic operations, and support for personal server deployment.
 * It includes all browser capabilities plus Node.js-specific optimizations and utilities.
 *
 * @param config - Configuration object containing wallet, storage, and relayer settings
 * @returns A fully configured Vana SDK instance for Node.js use
 * @throws {InvalidConfigurationError} When configuration parameters are invalid or missing
 * @example
 * ```typescript
 * import { Vana } from '@opendatalabs/vana-sdk/node';
 * import { createWalletClient, http } from 'viem';
 * import { privateKeyToAccount } from 'viem/accounts';
 * import { IPFSStorage, PinataStorage } from '@opendatalabs/vana-sdk/node';
 * import { mokshaTestnet } from '@opendatalabs/vana-sdk/node';
 *
 * // Server setup with private key
 * const account = privateKeyToAccount('0x...');
 * const walletClient = createWalletClient({
 *   account,
 *   chain: mokshaTestnet,
 *   transport: http('https://rpc.moksha.vana.org')
 * });
 *
 * const vana = Vana({
 *   walletClient,
 *   storage: {
 *     providers: {
 *       ipfs: new IPFSStorage({
 *         gateway: 'https://gateway.pinata.cloud',
 *         timeout: 30000
 *       }),
 *       pinata: new PinataStorage({
 *         apiKey: process.env.PINATA_KEY,
 *         secretKey: process.env.PINATA_SECRET
 *       })
 *     },
 *     defaultProvider: 'pinata'
 *   },
 *   relayerCallbacks: {
 *     async submitPermissionGrant(typedData, signature) {
 *       // Server-side relayer implementation
 *       return await submitToCustomRelayer(typedData, signature);
 *     }
 *   }
 * });
 *
 * // Server operations
 * const uploadResult = await vana.data.upload({
 *   content: await fs.readFile('./user-data.json'),
 *   filename: 'user-data.json',
 *   schemaId: 1
 * });
 *
 * // Personal server setup
 * await vana.server.setupPersonalServer({
 *   serverUrl: 'https://my-server.example.com',
 *   capabilities: ['data_processing', 'ml_inference']
 * });
 * ```
 *
 * @example
 * ```typescript
 * // CLI tool or script usage
 * const vana = Vana({
 *   chainId: 14800, // Moksha testnet
 *   account: privateKeyToAccount(process.env.PRIVATE_KEY),
 *   rpcUrl: process.env.RPC_URL,
 *   storage: {
 *     providers: { ipfs: new IPFSStorage() },
 *     defaultProvider: 'ipfs'
 *   }
 * });
 *
 * // Batch operations for data processing
 * const userFiles = await vana.data.getUserFiles({
 *   owner: process.env.USER_ADDRESS
 * });
 *
 * for (const file of userFiles) {
 *   const decrypted = await vana.data.decryptFile(file);
 *   // Process file data...
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Express.js server integration
 * import express from 'express';
 * import { handleRelayerOperation } from '@opendatalabs/vana-sdk/node';
 *
 * const app = express();
 *
 * app.post('/api/relay', async (req, res) => {
 *   try {
 *     const result = await handleRelayerOperation(
 *       vana,
 *       req.body
 *     );
 *     res.json(result);
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 * ```
 *
 * @see {@link https://docs.vana.org/docs/sdk/server-setup | Server Setup Guide} for Node.js-specific features
 * @see {@link VanaCore} for the underlying implementation details
 * @category Core SDK
 */
// Overload 1: For configurations that include both storage and operation store
export function Vana(
  config: VanaNodeConfigWithStorage & { operationStore: IOperationStore },
): VanaNodeImpl & StorageRequiredMarker & RelayerRequiredMarker;

// Overload 2: For configurations that include only the operation store
export function Vana(
  config: VanaNodeConfig & { operationStore: IOperationStore },
): VanaNodeImpl & RelayerRequiredMarker;

// Overload 3: For configurations with storage but no operation store
export function Vana(
  config: VanaNodeConfigWithStorage,
): VanaNodeImpl & StorageRequiredMarker;

// Overload 4: Base configuration without special requirements
export function Vana(config: VanaNodeConfig): VanaNodeImpl;

// Implementation
export function Vana(config: VanaNodeConfig) {
  return new VanaNodeImpl(config);
}

/**
 * The type of a Vana SDK instance in Node.js environments.
 * Uses InstanceType to properly expose all public methods from the class hierarchy.
 *
 * @see {@link Vana}
 */
export type VanaInstance = InstanceType<typeof VanaNodeImpl>;

// Export as default export
export default Vana;

// Re-export everything that was in index.ts (avoiding circular dependency)
// Core class and factory
export { VanaCore, VanaCoreFactory } from "./core";
export { DistributedNonceManager } from "./core/nonceManager";
export { InMemoryNonceManager } from "./core/inMemoryNonceManager";
export { SystemHealthChecker } from "./core/health";
export type {
  SystemHealthCheckerConfig,
  HealthStatus,
  ComponentHealth,
  NonceHealth,
  QueueHealth,
} from "./core/health";

// Storage implementations
export { RedisAtomicStore } from "./lib/redisAtomicStore";
export type { RedisAtomicStoreConfig } from "./lib/redisAtomicStore";

// Types - modular exports
export type * from "./types";
export type { IAtomicStore } from "./types/atomicStore";
export type {
  IOperationStore,
  StoredOperation,
  IRelayerStateStore,
  OperationState,
} from "./types/operationStore";

// Type guards and utilities
export {
  isReplicateAPIResponse,
  isAPIResponse,
  safeParseJSON,
  parseReplicateOutput,
} from "./types/external-apis";

// VanaContract is exported from abi to avoid circular dependencies
export type { VanaContract } from "./generated/abi";

// Enhanced response pattern for improved developer experience
export {
  EnhancedTransactionResponse,
  canEnhanceResponse,
  enhanceResponse,
} from "./client/enhancedResponse";

// Error classes
export * from "./errors";

// Controllers
export { PermissionsController } from "./controllers/permissions";
export { DataController } from "./controllers/data";
export { ServerController } from "./controllers/server";
export { ProtocolController } from "./controllers/protocol";
export { SchemaController } from "./controllers/schemas";
export { OperationsController } from "./controllers/operations";

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

// Storage API
export * from "./storage";

// Configuration
export { getContractAddress, CONTRACTS } from "./generated/addresses";
export { chains } from "./config/chains";
export {
  type ServiceEndpoints,
  mainnetServices,
  mokshaServices,
  getServiceEndpoints,
  getDefaultPersonalServerUrl,
} from "./config/default-services";

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

// Server-side utilities
export {
  handleRelayerOperation,
  type RelayerOperationOptions,
} from "./server/relayerHandler";
export type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
} from "./types/relayer";
// TransactionHandle removed - using POJOs instead
export type {
  Operation,
  TransactionResult,
  TransactionReceipt,
  PollingOptions,
  TransactionWaitOptions,
} from "./types/operations";

// Platform adapters
export { NodePlatformAdapter } from "./platform/node";
export { BrowserPlatformAdapter } from "./platform/browser";
export { NodeECIESUint8Provider as NodeECIESProvider } from "./crypto/ecies/node";
export type { VanaPlatformAdapter } from "./platform/interface";

// ECIES utilities and types (platform-agnostic, exported via module index)
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

export { ApiClient } from "./core/apiClient";

export type {
  ApiClientConfig,
  HttpMethod,
  RequestOptions,
} from "./core/apiClient";

// Note: Default export is already handled above with the Vana factory function
// For testing purposes, we also export the implementation class
export { VanaNodeImpl };

// Server-specific interface for accessing stores
export interface VanaWithStores {
  readonly operationStore?: IOperationStore | IRelayerStateStore;
  readonly atomicStore?: IAtomicStore;
  readonly publicClient: PublicClient;
}
