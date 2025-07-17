// This file exports only types for editor intellisense and type-checking compatibility
// All runtime code should be imported from index.node.ts or index.browser.ts

// Platform adapters - export both types and runtime implementations
export type { VanaPlatformAdapter } from "./platform/interface";
export type { BrowserPlatformAdapter } from "./platform/browser";
export type { NodePlatformAdapter } from "./platform/node";

// Platform utilities - type-only exports
export type {
  detectPlatform,
  createPlatformAdapter,
  createPlatformAdapterFor,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./platform/utils";

// Types - modular exports
export type * from "./types";

// Type guards and utilities (these are type-only exports)
export type {
  isReplicateAPIResponse,
  isIdentityServerOutput,
  isPersonalServerOutput,
  isAPIResponse,
  safeParseJSON,
  parseReplicateOutput,
} from "./types/external-apis";

// VanaContract is exported from abi to avoid circular dependencies
export type { VanaContract } from "./abi";

// Error types
export type * from "./errors";

// Controller types
export type { PermissionsController } from "./controllers/permissions";
export type { DataController } from "./controllers/data";
export type { ServerController } from "./controllers/server";
export type { ProtocolController } from "./controllers/protocol";

// Contract controller types
export type * from "./contracts/contractController";

// Utility types
export type * from "./utils/encryption";
export type * from "./utils/formatters";
export type * from "./utils/grantFiles";
export type * from "./utils/grantValidation";
export type * from "./utils/grants";
export type * from "./utils/ipfs";
export type * from "./utils/schemaValidation";

// Storage types
export type * from "./storage";

// Configuration types
export type { getContractAddress } from "./config/addresses";
export type { chains, mokshaTestnet, vanaMainnet } from "./config/chains";

// Chain configuration types
export type * from "./chains";

// ABI types
export type { getAbi } from "./abi";
export type { VanaContract as VanaContractAbi } from "./abi";

// Generic utility types
export type {
  BaseController,
  RetryUtility,
  RateLimiter,
  MemoryCache,
  EventEmitter,
  MiddlewarePipeline,
  AsyncQueue,
  CircuitBreaker,
} from "./core/generics";

export type { ApiClient } from "./core/apiClient";

export type {
  ApiClientConfig,
  HttpMethod,
  RequestOptions,
} from "./core/apiClient";

// Core types
export type { VanaCore } from "./core";
export type { Vana } from "./index.node"; // Type reference to the Node.js implementation
