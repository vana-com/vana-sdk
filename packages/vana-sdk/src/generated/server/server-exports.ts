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
  createOperationApiV1OperationsPost: "/api/v1/operations",
  /** Get operation status */
  getOperationApiV1Operations_OperationId_Get: (operation_id: string) =>
    `/api/v1/operations/${operation_id}`,
  /** Cancel an operation */
  cancelOperationApiV1Operations_OperationId_CancelPost: (
    operation_id: string,
  ) => `/api/v1/operations/${operation_id}/cancel`,
  /** Get user identity */
  getIdentityApiV1IdentityGet: "/api/v1/identity",
  /** Download operation artifact */
  downloadArtifactApiV1ArtifactsDownloadPost: "/api/v1/artifacts/download",
  /** List operation artifacts */
  listArtifactsApiV1Artifacts_OperationId_ListPost: (operation_id: string) =>
    `/api/v1/artifacts/${operation_id}/list`,
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

// Auto-generated type aliases for all schemas
export type ArtifactDownloadRequest =
  components["schemas"]["ArtifactDownloadRequest"];
export type ArtifactInfo = components["schemas"]["ArtifactInfo"];
export type ArtifactListRequest = components["schemas"]["ArtifactListRequest"];
export type ArtifactListResponse =
  components["schemas"]["ArtifactListResponse"];
export type CreateOperationRequest =
  components["schemas"]["CreateOperationRequest"];
export type CreateOperationResponse =
  components["schemas"]["CreateOperationResponse"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type GetOperationResponse =
  components["schemas"]["GetOperationResponse"];
export type HTTPValidationError = components["schemas"]["HTTPValidationError"];
export type IdentityResponseModel =
  components["schemas"]["IdentityResponseModel"];
export type PersonalServerModel = components["schemas"]["PersonalServerModel"];
export type ValidationError = components["schemas"]["ValidationError"];
