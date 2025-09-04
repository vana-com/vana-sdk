/**
 * @module Node
 * Node.js-specific implementation of the Vana SDK
 */
import { NodePlatformAdapter } from "./platform/node";
import { VanaCore } from "./core";
/**
 * Internal implementation class for Node.js environments.
 * This class is not exported directly - use the Vana factory function instead.
 */
class VanaNodeImpl extends VanaCore {
    constructor(config) {
        super(new NodePlatformAdapter(), config);
    }
}
/**
 * Creates a new Vana SDK instance.
 *
 * @param config - The configuration for the Vana SDK
 * @returns A new Vana SDK instance
 */
export function Vana(config) {
    return new VanaNodeImpl(config);
}
// Export as default export
export default Vana;
// Re-export everything that was in index.ts (avoiding circular dependency)
// Core class and factory
export { VanaCore, VanaCoreFactory } from "./core";
// Type guards and utilities
export { isReplicateAPIResponse, isAPIResponse, safeParseJSON, parseReplicateOutput, } from "./types/external-apis";
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
export { mainnetServices, mokshaServices, getServiceEndpoints, getDefaultPersonalServerUrl, } from "./config/default-services";
// Chain configurations with subgraph URLs - explicit exports for better DX
export { vanaMainnet, mokshaTestnet, moksha, getChainConfig, getAllChains, } from "./chains";
export * from "./chains";
// ABIs
export { getAbi } from "./generated/abi";
// Generic utilities for extensibility
export { BaseController, RetryUtility, RateLimiter, MemoryCache, EventEmitter, MiddlewarePipeline, AsyncQueue, CircuitBreaker, } from "./core/generics";
// Server-side utilities
export { handleRelayerRequest } from "./server/handler";
// Platform adapters
export { NodePlatformAdapter } from "./platform/node";
export { BrowserPlatformAdapter } from "./platform/browser";
// Platform utilities
export { detectPlatform, createPlatformAdapter, createPlatformAdapterFor, isPlatformSupported, getPlatformCapabilities, } from "./platform/utils";
// Browser-safe platform utilities
export { createNodePlatformAdapter, createBrowserPlatformAdapter, createPlatformAdapterSafe, } from "./platform/browser-safe";
export { ApiClient } from "./core/apiClient";
// Note: Default export is already handled above with the Vana factory function
// For testing purposes, we also export the implementation class
export { VanaNodeImpl };
//# sourceMappingURL=index.node.js.map