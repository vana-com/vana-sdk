// Core modules
export { Vana } from "./vana";

// Types - modular exports
export type * from "./types";

// Type guards and utilities
export {
  isReplicateAPIResponse,
  isIdentityServerOutput,
  isPersonalServerOutput,
  isAPIResponse,
  safeParseJSON,
  parseReplicateOutput,
} from "./types/external-apis";

// VanaContract is exported from abi to avoid circular dependencies
export type { VanaContract } from "./abi";

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

// Storage API
export * from "./storage";

// Configuration
export { getContractAddress } from "./config/addresses";
export { chains, mokshaTestnet, vanaMainnet } from "./config/chains";

// Chain configurations with subgraph URLs
export * from "./chains";

// ABIs
export { getAbi } from "./abi";
export type { VanaContract as VanaContractAbi } from "./abi";

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

export { ApiClient } from "./core/apiClient";

export type {
  ApiClientConfig,
  HttpMethod,
  RequestOptions,
} from "./core/apiClient";

// Legacy exports for backward compatibility
// VanaContract is already exported from "./types" above
