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

// Operation types
export type CreateOperationRequest =
  components["schemas"]["CreateOperationRequest"];
export type CreateOperationResponse =
  components["schemas"]["CreateOperationResponse"];
export type GetOperationResponse =
  components["schemas"]["GetOperationResponse"];

// Identity types
export type IdentityResponseModel =
  components["schemas"]["IdentityResponseModel"];
export type PersonalServerModel = components["schemas"]["PersonalServerModel"];

// Error types
export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type ValidationErrorResponse =
  components["schemas"]["ValidationErrorResponse"];
export type AuthenticationErrorResponse =
  components["schemas"]["AuthenticationErrorResponse"];
export type NotFoundErrorResponse =
  components["schemas"]["NotFoundErrorResponse"];
export type BlockchainErrorResponse =
  components["schemas"]["BlockchainErrorResponse"];
export type FileAccessErrorResponse =
  components["schemas"]["FileAccessErrorResponse"];
export type ComputeErrorResponse =
  components["schemas"]["ComputeErrorResponse"];
export type DecryptionErrorResponse =
  components["schemas"]["DecryptionErrorResponse"];
export type GrantValidationErrorResponse =
  components["schemas"]["GrantValidationErrorResponse"];
export type OperationErrorResponse =
  components["schemas"]["OperationErrorResponse"];
export type InternalServerErrorResponse =
  components["schemas"]["InternalServerErrorResponse"];
