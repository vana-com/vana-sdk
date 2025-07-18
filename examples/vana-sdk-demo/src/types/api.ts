/**
 * API response types for the Vana SDK demo application
 * These types ensure type safety for internal API routes
 */

import type {
  APIResponse,
  ReplicateAPIResponse,
  IdentityServerOutput,
  PersonalServerOutput,
} from "@opendatalabs/vana-sdk";
import { PersonalServerIdentity } from "@opendatalabs/vana-sdk";

/**
 * Internal API Endpoints Response Types
 */

/** Response from /api/trusted-server */
export type TrustedServerAPIResponse = APIResponse<ReplicateAPIResponse>;

/** Response from /api/trusted-server/setup */
export type TrustedServerIdentityAPIResponse =
  APIResponse<PersonalServerIdentity>;

/** Response from /api/trusted-server/poll */
export type TrustedServerPollAPIResponse = APIResponse<ReplicateAPIResponse>;

/** Response from /api/identity */
export type IdentityAPIResponse = APIResponse<{
  userAddress: string;
  publicKey: string;
}>;

/** Response from /api/ipfs/upload */
export type IPFSUploadAPIResponse = APIResponse<{
  url: string;
  ipfsHash: string;
  size: number;
}>;

/** Response from /api/relay */
export type RelayAPIResponse = APIResponse<{
  transactionHash: string;
  status: string;
}>;

/** Response from /api/relay/addFile */
export type RelayAddFileAPIResponse = APIResponse<{
  fileId: number;
  transactionHash: string;
  success: boolean;
}>;

/**
 * Typed Server Discovery Data
 * Used for the server discovery UI feature
 */

/** Server information discovered from the API */
export interface DiscoveredServerInfo {
  /** Server ID (EVM address) */
  serverId: string;
  /** Server URL for API calls */
  serverUrl: string;
  /** Human-readable server name */
  name: string;
  /** Server's public key for encryption (optional) */
  publicKey?: string;
}

/**
 * Parsed Output Types
 * These represent the parsed JSON output from Replicate responses
 */

/** Parsed output from trusted server setup */
export interface ParsedTrustedServerOutput extends IdentityServerOutput {
  /** Additional server metadata */
  metadata?: Record<string, unknown>;
}

/** Parsed output from personal server */
export interface ParsedPersonalServerOutput extends PersonalServerOutput {
  /** Additional identity metadata */
  additionalData?: Record<string, unknown>;
}

/**
 * Type Guards for Runtime Validation
 */

/** Type guard to check if response is TrustedServerAPIResponse */
export function isTrustedServerAPIResponse(
  value: unknown,
): value is TrustedServerAPIResponse {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  if (typeof obj.success !== "boolean") return false;

  if ("data" in obj && obj.data !== null) {
    if (typeof obj.data !== "object") return false;
    const data = obj.data as Record<string, unknown>;
    if (!("id" in data) || !("status" in data)) return false;
  }

  return true;
}

/** Type guard to check if response is IdentityAPIResponse */
export function isIdentityAPIResponse(
  value: unknown,
): value is IdentityAPIResponse {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  if (typeof obj.success !== "boolean") return false;

  if ("data" in obj && obj.data !== null) {
    if (typeof obj.data !== "object") return false;
    const data = obj.data as Record<string, unknown>;
    if (!("userAddress" in data) || !("publicKey" in data)) return false;
  }

  return true;
}

/** Type guard to check if value is DiscoveredServerInfo */
export function isDiscoveredServerInfo(
  value: unknown,
): value is DiscoveredServerInfo {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  return (
    "serverId" in obj &&
    "serverUrl" in obj &&
    "name" in obj &&
    typeof obj.serverId === "string" &&
    typeof obj.serverUrl === "string" &&
    typeof obj.name === "string"
  );
}

/**
 * Utility Functions for API Responses
 */

/** Safely parse API response with type validation */
export async function safeParseAPIResponse<T>(
  response: Response,
  typeGuard: (value: unknown) => value is T,
): Promise<T | null> {
  try {
    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    return typeGuard(json) ? json : null;
  } catch {
    return null;
  }
}

/** Extract and parse Replicate output with type safety */
export function extractReplicateOutput<T>(
  apiResponse: TrustedServerAPIResponse,
  typeGuard: (value: unknown) => value is T,
): T | null {
  console.debug("🔍 Extract: API response success:", apiResponse.success);
  console.debug("🔍 Extract: Has data:", !!apiResponse.data);
  console.debug("🔍 Extract: Has output:", !!apiResponse.data?.output);

  if (!apiResponse.success || !apiResponse.data?.output) {
    console.debug("🔍 Extract: Early return - missing success/data/output");
    return null;
  }

  const output = apiResponse.data.output;
  console.debug("🔍 Extract: Output type:", typeof output);
  console.debug("🔍 Extract: Output content:", output);

  // Handle JSON string output
  if (typeof output === "string") {
    console.debug("🔍 Extract: Parsing JSON string...");
    try {
      const parsed = JSON.parse(output);
      console.debug("🔍 Extract: Parsed JSON:", parsed);
      const isValid = typeGuard(parsed);
      console.debug("🔍 Extract: Type guard result:", isValid);
      return isValid ? parsed : null;
    } catch (error) {
      console.debug("🔍 Extract: JSON parse error:", error);
      return null;
    }
  }

  // Handle already parsed output
  console.debug("🔍 Extract: Checking already parsed output...");
  const isValid = typeGuard(output);
  console.debug("🔍 Extract: Type guard result for parsed:", isValid);
  return isValid ? output : null;
}
