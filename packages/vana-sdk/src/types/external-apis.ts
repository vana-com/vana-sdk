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
  /** User's EVM address */
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
  /** User's EVM address */
  user_address: string;
  /** Identity information */
  identity: {
    /** Additional metadata */
    metadata?: Record<string, unknown>;
    /** Derived address (alternative location) */
    derivedAddress?: string;
  };
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

/**
 * Validates whether a value is a valid IdentityServerOutput.
 *
 * @param value - The value to check
 * @returns True if the value matches the IdentityServerOutput structure
 * @example
 * ```typescript
 * const output = response.output;
 *
 * if (isIdentityServerOutput(output)) {
 *   console.log('User address:', output.user_address);
 *   console.log('Server address:', output.personal_server.address);
 * }
 * ```
 */
export function isIdentityServerOutput(
  value: unknown,
): value is IdentityServerOutput {
  console.debug("🔍 Type Guard: Checking value:", value);
  console.debug("🔍 Type Guard: Value type:", typeof value);

  if (typeof value !== "object" || value === null) {
    console.debug("🔍 Type Guard: Failed - not object or null");
    return false;
  }

  const obj = value as Record<string, unknown>;
  console.debug("🔍 Type Guard: Object keys:", Object.keys(obj));
  console.debug(
    "🔍 Type Guard: user_address:",
    obj.user_address,
    typeof obj.user_address,
  );

  if (typeof obj.user_address !== "string") {
    console.debug("🔍 Type Guard: Failed - user_address not string");
    return false;
  }

  console.debug(
    "🔍 Type Guard: personal_server:",
    obj.personal_server,
    typeof obj.personal_server,
  );
  if (typeof obj.personal_server !== "object" || obj.personal_server === null) {
    console.debug("🔍 Type Guard: Failed - personal_server not object or null");
    return false;
  }

  const personalServer = obj.personal_server as Record<string, unknown>;
  console.debug(
    "🔍 Type Guard: Personal server keys:",
    Object.keys(personalServer),
  );
  console.debug("🔍 Type Guard: address:", personalServer.address);
  console.debug("🔍 Type Guard: public_key:", personalServer.public_key);

  const hasAddress = "address" in personalServer;
  const hasPublicKey = "public_key" in personalServer;
  console.debug(
    "🔍 Type Guard: Has address:",
    hasAddress,
    "Has public_key:",
    hasPublicKey,
  );

  return hasAddress && hasPublicKey;
}

/**
 * Validates whether a value is a valid PersonalServerOutput.
 *
 * @param value - The value to check
 * @returns True if the value matches the PersonalServerOutput structure
 * @example
 * ```typescript
 * const output = response.output;
 *
 * if (isPersonalServerOutput(output)) {
 *   console.log('User address:', output.user_address);
 *   console.log('Identity metadata:', output.identity.metadata);
 * }
 * ```
 */
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
 * const result = safeParseJSON(jsonStr, isPersonalServerOutput);
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
 * const output = parseReplicateOutput(response, isIdentityServerOutput);
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
