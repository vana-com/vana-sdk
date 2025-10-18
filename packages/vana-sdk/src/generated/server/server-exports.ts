// Server API types (auto-generated from OpenAPI spec)
// This file re-exports all types from the generated server types
// DO NOT EDIT - regenerated automatically by fetch-server-types.ts

// Re-export all types with original names
export * from "./server";

/**
 * Personal Server API endpoint paths.
 *
 * @remarks
 * These paths are extracted from the OpenAPI spec to ensure consistency
 * between the SDK and the server implementation. All paths are relative
 * to the personal server base URL.
 *
 * @category Server
 */
export const SERVER_PATHS = {
  /** Create a new operation */
  operations: "/api/v1/operations",
  /** Get operation status by ID */
  getOperation: (operationId: string) => `/api/v1/operations/${operationId}`,
  /** Cancel a running operation */
  cancelOperation: (operationId: string) =>
    `/api/v1/operations/${operationId}/cancel`,
  /** Get user identity */
  identity: "/api/v1/identity",
  /** Download an artifact file */
  downloadArtifact: "/api/v1/artifacts/download",
  /** List artifacts for an operation */
  listArtifacts: (operationId: string) =>
    `/api/v1/artifacts/${operationId}/list`,
} as const;

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

// Artifact types
export type ArtifactInfo = components["schemas"]["ArtifactInfo"];

// Error types
export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type HTTPValidationError = components["schemas"]["HTTPValidationError"];
export type ValidationError = components["schemas"]["ValidationError"];
