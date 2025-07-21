/**
 * Types for external API responses used by the Vana SDK
 * These types help ensure type safety when interacting with third-party services
 */

/**
 * Replicate API Response Types
 * Documentation: https://replicate.com/docs/reference/http
 */

/** Status values for Replicate predictions */
export type ReplicateStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

/** Base Replicate API prediction response */
export interface ReplicateAPIResponse {
  /** Unique identifier for the prediction */
  id: string;
  /** Model version identifier */
  version: string;
  /** Current status of the prediction */
  status: ReplicateStatus;
  /** Input parameters sent to the model */
  input: Record<string, unknown>;
  /** Output from the model (if completed successfully) */
  output?: unknown;
  /** Error message (if failed) */
  error?: string | null;
  /** Logs from the prediction run */
  logs?: string;
  /** Whether data has been removed due to content policy */
  data_removed?: boolean;
  /** Timestamp when prediction was created */
  created_at: string;
  /** Timestamp when prediction started processing */
  started_at?: string;
  /** Timestamp when prediction completed */
  completed_at?: string;
  /** URLs for interacting with the prediction */
  urls: {
    /** URL to get prediction status/results */
    get: string;
    /** URL to cancel the prediction */
    cancel: string;
    /** Web interface URL */
    web?: string;
  };
  /** Performance metrics */
  metrics?: {
    /** Time spent in prediction (seconds) */
    predict_time?: number;
    /** Total time including setup (seconds) */
    total_time?: number;
  };
}

// Note: Server-specific types have been moved to auto-generated types in server.ts
// Import types from @opendatalabs/vana-sdk/types/server-exports instead

/**
 * Storage Provider API Types
 */

/** Pinata IPFS upload response */
export interface PinataUploadResponse {
  /** IPFS hash of the uploaded content */
  IpfsHash: string;
  /** Size of the pinned content in bytes */
  PinSize: number;
  /** Timestamp of when content was pinned */
  Timestamp: string;
  /** Whether this content was already pinned */
  isDuplicate?: boolean;
}

/** Pinata pin information */
export interface PinataPin {
  /** IPFS hash */
  ipfs_pin_hash: string;
  /** Pin size in bytes */
  size: number;
  /** User ID */
  user_id: string;
  /** Date pinned */
  date_pinned: string;
  /** Date unpinned (if applicable) */
  date_unpinned?: string;
  /** Additional metadata */
  metadata?: {
    name?: string;
    keyvalues?: Record<string, string>;
  };
}

/** Pinata list response */
export interface PinataListResponse {
  /** Total count of pins */
  count: number;
  /** Array of pin information */
  rows: PinataPin[];
}

/**
 * Generic API Response Wrapper
 * Used for internal API routes in the demo application
 */

/** Standard API response wrapper */
export interface APIResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data (if successful) */
  data?: T;
  /** Error message (if unsuccessful) */
  error?: string;
}

/**
 * Type Guards for Runtime Validation
 */

/**
 * Validates whether a value is a valid ReplicateAPIResponse.
 *
 * @param value - The value to check
 * @returns True if the value matches the ReplicateAPIResponse structure
 * @example
 * ```typescript
 * const response = await fetch('/api/replicate');
 * const data = await response.json();
 *
 * if (isReplicateAPIResponse(data)) {
 *   console.log('Status:', data.status);
 *   console.log('Output:', data.output);
 * }
 * ```
 */
export function isReplicateAPIResponse(
  value: unknown,
): value is ReplicateAPIResponse {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  return (
    "id" in obj &&
    "status" in obj &&
    "urls" in obj &&
    typeof obj.id === "string" &&
    ["starting", "processing", "succeeded", "failed", "canceled"].includes(
      obj.status as string,
    )
  );
}

// Note: Type guards for server types removed - use generated types and create
// type guards for IdentityResponseModel and PersonalServerModel from
// @opendatalabs/vana-sdk/types/server-exports if needed

/**
 * Validates whether a value is a valid APIResponse.
 *
 * @param value - The value to check
 * @returns True if the value matches the APIResponse structure
 * @example
 * ```typescript
 * const response = await fetch('/api/data');
 * const data = await response.json();
 *
 * if (isAPIResponse(data)) {
 *   if (data.success) {
 *     console.log('Data:', data.data);
 *   } else {
 *     console.error('Error:', data.error);
 *   }
 * }
 * ```
 */
export function isAPIResponse<T>(value: unknown): value is APIResponse<T> {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  return "success" in obj && typeof obj.success === "boolean";
}

/**
 * Utility Functions for Safe JSON Parsing
 */

/**
 * Safely parses JSON string with type validation.
 *
 * @param jsonString - The JSON string to parse
 * @param typeGuard - Type guard function to validate the parsed value
 * @returns The parsed and validated value, or null if parsing/validation fails
 * @example
 * ```typescript
 * const jsonStr = '{"user_address": "0x123...", "identity": {}}';
 * const result = safeParseJSON(jsonStr, isAPIResponse);
 *
 * if (result) {
 *   console.log('Parsed server output:', result.user_address);
 * } else {
 *   console.log('Invalid JSON or type mismatch');
 * }
 * ```
 */
export function safeParseJSON<T>(
  jsonString: string,
  typeGuard: (value: unknown) => value is T,
): T | null {
  try {
    const parsed = JSON.parse(jsonString);
    return typeGuard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Parses Replicate API response output with type safety.
 *
 * @param response - The Replicate API response
 * @param typeGuard - Type guard function to validate the output
 * @returns The parsed and validated output, or null if validation fails
 * @example
 * ```typescript
 * const response = await replicateClient.get(predictionId);
 * const output = parseReplicateOutput(response, isReplicateAPIResponse);
 *
 * if (output) {
 *   console.log('Identity server result:', output.user_address);
 * } else {
 *   console.log('Output not available or invalid format');
 * }
 * ```
 */
export function parseReplicateOutput<T>(
  response: ReplicateAPIResponse,
  typeGuard: (value: unknown) => value is T,
): T | null {
  if (!response.output) return null;

  if (typeof response.output === "string") {
    return safeParseJSON(response.output, typeGuard);
  }

  return typeGuard(response.output) ? response.output : null;
}
