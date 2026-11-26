/**
 * PDPP Core v0.1.0 wire types the client role reads.
 *
 * @remarks
 * Only the members this client acts on are typed. Every Core JSON object may
 * carry members the client does not recognize; they are kept as unknown and
 * never cause a parse failure (spec-core §8 "Response forward compatibility",
 * Client item 15).
 *
 * @category PDPP
 */

/** The Core data-access detail type (spec-core §6). */
export const PDPP_DATA_ACCESS_TYPE = "https://pdpp.dev/data-access";

/** The lifecycle recovery detail type (spec-core #lifecycle-recovery). */
export const PDPP_GRANT_LIFECYCLE_TYPE = "https://pdpp.dev/grant-lifecycle";

/** The one processing permission Core defines; reserved and unsupported in v0.1 (spec-core #ai-training). */
export const PDPP_AI_TRAINING_PERMISSION = "https://pdpp.dev/processing/ai_training";

/** The legacy purpose code; it confers no AI training authority (Client item 17). */
export const PDPP_LEGACY_AI_TRAINING_PURPOSE = "https://pdpp.dev/purpose/ai_training";

/**
 * Processing permissions this client can exercise. Empty: v0.1 registers no
 * supported permission, so no client holds training or independent-disclosure
 * authority (spec-core #processing-permissions).
 */
export const PDPP_CLIENT_SUPPORTED_PROCESSING_PERMISSIONS: readonly string[] = [];

/** Purpose codes registered in spec-core Appendix A. */
export const PDPP_APPENDIX_A_PURPOSES: readonly string[] = [
  "https://pdpp.dev/purpose/agent_context",
  "https://pdpp.dev/purpose/ai_training",
  "https://pdpp.dev/purpose/analytics",
  "https://pdpp.dev/purpose/export",
  "https://pdpp.dev/purpose/personalization",
  "https://pdpp.dev/purpose/research",
];

/** One stream in a selection request (spec-core §6 "Stream selection parameters"). */
export interface PdppStreamRequest {
  name: string;
  /** Explicit fields, or `["*"]`. A request MUST carry `fields` or `view` (spec-core L1210). */
  fields?: string[];
  view?: string;
  necessity?: "required" | "optional";
  instance_ids?: string[];
  time_range?: { since?: string; until?: string };
  resources?: string[];
}

/** A Core `data-access` authorization detail (RFC 9396). */
export interface PdppDataAccessDetail {
  type: typeof PDPP_DATA_ACCESS_TYPE;
  source: { id: string };
  purpose_code: string;
  purpose_description?: string;
  access_mode: "single_use" | "continuous";
  streams?: PdppStreamRequest[];
  selection_preset?: string;
  retention?: { max_duration: string; on_expiry: "delete" | "anonymize" };
  /** Client item 18: only permissions the AS advertises; this client supports none. */
  processing_permissions?: string[];
}

/** StreamGrant (spec-core §7 "StreamGrant fields"). */
export interface PdppStreamGrant {
  name: string;
  instance_ids: string[];
  fields: string[];
  required_fields: string[];
  sort_field?: string;
  time_constraint?: {
    field: string;
    type: "date" | "date-time";
    since?: string;
    until?: string;
  };
  resources?: string[];
  [member: string]: unknown;
}

/** Grant (spec-core §7 "Grant fields"). */
export interface PdppGrant {
  version: string;
  grant_id: string;
  issued_at: string;
  subject: { id: string };
  client: { client_id: string; client_display?: unknown };
  source: { kind: string; id: string };
  source_declaration: { version: string };
  purpose_code: string;
  purpose_description?: string;
  access_mode: "single_use" | "continuous";
  processing_permissions?: string[];
  streams: PdppStreamGrant[];
  retention?: { max_duration: string; on_expiry: "delete" | "anonymize" };
  expires_at?: string;
  [member: string]: unknown;
}

/** One record or tombstone served by a Core RS (spec-core §4 "Response records"). */
export interface PdppRecord {
  object: "record";
  id: string;
  instance_id: string;
  stream: string;
  /** The projected record. Not a full stream record (Client item 14). */
  data?: Record<string, unknown>;
  deleted?: boolean;
  [member: string]: unknown;
}

/** A list or `changes_since` page (spec-core §8 "List records"). */
export interface PdppRecordPage {
  object: "list";
  has_more: boolean;
  next_cursor?: string;
  next_changes_since?: string;
  data: PdppRecord[];
  [member: string]: unknown;
}
