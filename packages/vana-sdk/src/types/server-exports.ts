// Server API types (auto-generated from OpenAPI spec)
// This file re-exports all types from the generated server types
// DO NOT EDIT - regenerated automatically by fetch-server-types.ts

// Re-export all types with original names
export * from "./server";

// Namespace all server types for clearer usage
export type {
  paths as ServerPaths,
  webhooks as ServerWebhooks,
  components as ServerComponents,
  operations as ServerOperations,
  $defs as ServerDefs,
} from "./server";

// Common server schema type aliases for easier usage
import type { components } from "./server";

export type CreateOperationResponse =
  components["schemas"]["CreateOperationResponse"];
export type GetOperationResponse =
  components["schemas"]["GetOperationResponse"];

// Legacy alias for backward compatibility
export type OperationCreatedResponse = CreateOperationResponse;
