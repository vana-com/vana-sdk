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

/**
 * Identity Server Output Types
 * These define the expected structure of output from Vana's identity server
 */

/** Output from the identity server model */
export interface IdentityServerOutput {
  /** User's Ethereum address */
  user_address: string;
  /** Personal server information */
  personal_server: {
    /** Derived address for the personal server */
    address: string;
    /** Public key for encryption */
    public_key: string;
  };
}

/** Identity server response with typed output */
export interface IdentityServerResponse
  extends Omit<ReplicateAPIResponse, "output"> {
  /** Parsed identity server output */
  output?: IdentityServerOutput | string; // Can be string (needs parsing) or parsed object
}

/**
 * Personal Server Output Types
 * These define the expected structure of output from Vana's personal server
 */

/** Output from the personal server model */
export interface PersonalServerOutput {
  /** User's Ethereum address */
  user_address: string;
  /** Identity information */
  identity: {
    /** Additional metadata */
    metadata?: Record<string, unknown>;
    /** Derived address (alternative location) */
    derivedAddress?: string;
  };
}

/** Personal server response with typed output */
export interface PersonalServerResponse
  extends Omit<ReplicateAPIResponse, "output"> {
  /** Parsed personal server output */
  output?: PersonalServerOutput | string; // Can be string (needs parsing) or parsed object
}

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

/** Type guard to check if a value is a ReplicateAPIResponse */
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

/** Type guard to check if output is IdentityServerOutput */
export function isIdentityServerOutput(
  value: unknown,
): value is IdentityServerOutput {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  if (typeof obj.user_address !== "string") return false;
  if (typeof obj.personal_server !== "object" || obj.personal_server === null)
    return false;

  const personalServer = obj.personal_server as Record<string, unknown>;
  return "address" in personalServer && "public_key" in personalServer;
}

/** Type guard to check if output is PersonalServerOutput */
export function isPersonalServerOutput(
  value: unknown,
): value is PersonalServerOutput {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  return (
    "user_address" in obj &&
    "identity" in obj &&
    typeof obj.user_address === "string" &&
    typeof obj.identity === "object"
  );
}

/** Type guard to check if response is an APIResponse */
export function isAPIResponse<T>(value: unknown): value is APIResponse<T> {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  return "success" in obj && typeof obj.success === "boolean";
}

/**
 * Utility Functions for Safe JSON Parsing
 */

/** Safely parse JSON with type validation */
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

/** Parse Replicate output with type safety */
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
