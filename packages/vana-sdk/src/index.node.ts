import { NodePlatformAdapter } from "./platform/node";
import { VanaCore } from "./core";
import type {
  VanaConfig,
  VanaConfigWithStorage,
  StorageRequiredMarker,
} from "./types";

/**
 * Internal implementation class for Node.js environments.
 * This class is not exported directly - use the Vana factory function instead.
 */
class VanaNodeImpl extends VanaCore {
  constructor(config: VanaConfig) {
    super(new NodePlatformAdapter(), config);
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
 * import { handleRelayerRequest } from '@opendatalabs/vana-sdk/node';
 *
 * const app = express();
 *
 * app.post('/api/relay/:operation', async (req, res) => {
 *   try {
 *     const result = await handleRelayerRequest(
 *       req.params.operation,
 *       req.body,
 *       vana
 *     );
 *     res.json({ success: true, result });
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
export function Vana(
  config: VanaConfigWithStorage,
): VanaNodeImpl & StorageRequiredMarker;
export function Vana(config: VanaConfig): VanaNodeImpl;
/**
 * Creates a new Vana SDK instance.
 *
 * @param config - The configuration for the Vana SDK
 * @returns A new Vana SDK instance
 */
export function Vana(config: VanaConfig) {
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
export { SchemaController } from "./controllers/schemas";

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

// Server-side utilities
export { handleRelayerRequest } from "./server/handler";
export type { RelayerRequestPayload } from "./server/handler";
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
export type { VanaPlatformAdapter } from "./platform/interface";

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
