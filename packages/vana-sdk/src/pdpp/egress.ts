/**
 * PDPP client role: disclosure and training gates (spec-core
 * #independent-recipient-disclosure, #downstream-holders, #ai-training).
 *
 * @remarks
 * - Items 29–31, cases O1–O5, O8–O10: every outbound release of PDPP data or
 *   of anything derived from it goes through {@link PdppDisclosureGate}. The
 *   receiving party is classified by the operation:
 *   - `owner`: a destination the owner controls and designates (their own
 *     email, storage, device). Allowed within the grant's use terms (O8).
 *   - `acting_for_client`: a party registered for every contributing grant
 *     under the full flow-down and with no independent reuse (O5).
 *   - otherwise `independent`, including any party the owner directs to
 *     receive data for its own use (accountant, adviser, lender).
 *   Independent disclosure needs an expressly covering registered processing
 *   permission with valid authority under its defining profile. v0.1 registers
 *   none and this client supports none, so it is always refused: for records
 *   and every derivative (summary, score, embedding, shared link, tool-call
 *   argument, output), in every grant state (O1–O3). Purpose text, an owner
 *   instruction, a client claim, a positive assessment, an erasure or
 *   learned-parameter exception and token activity are recorded as cited and
 *   never treated as authority (O4, O9, O9a).
 * - Required by law (O10): only a binding obligation, only the defined
 *   subset, and a record of what was disclosed unless law prohibits it.
 * - Item 17: {@link checkTrainingUse} refuses AI training for every input;
 *   the legacy `ai_training` purpose code confers nothing.
 *
 * No gate proves the absence of other egress channels: an app must route
 * every outbound surface through it.
 *
 * @category PDPP
 */

import type { PdppGrantRef, PdppHeldDataManager, PdppUseRefusal } from "./held-data";
import {
  PDPP_AI_TRAINING_PERMISSION,
  PDPP_CLIENT_SUPPORTED_PROCESSING_PERMISSIONS,
  PDPP_LEGACY_AI_TRAINING_PURPOSE,
} from "./types";

/** What leaves the client. Derivatives are PDPP data too (spec-core #data-concepts). */
export type PdppDisclosureContent =
  | "records"
  | "summary"
  | "score"
  | "embedding"
  | "shared_link"
  | "tool_call_argument"
  | "output";

/** The receiving party, as the app describes it for this operation. */
export type PdppRecipient =
  | {
      kind: "owner_destination";
      /** e.g. `mailto:owner@example.com`, a storage URL. */
      destination: string;
      /** The owner controls this account, device or service. */
      ownerControlled: boolean;
      /** The owner designated it for receiving this data. */
      designatedByOwner: boolean;
    }
  | {
      kind: "party";
      /** Matches a {@link PdppDownstreamHolder} id registered for each contributing grant, if it acts for the client. */
      id: string;
      /** For this operation the party may use the data for its own purposes. */
      independentUse?: boolean;
    };

/** What the caller cites. Recorded; never authority (Client item 31). */
export interface PdppCitedBasis {
  purposeText?: string;
  ownerInstruction?: string;
  clientClaim?: string;
  positiveAssessment?: boolean;
  erasureException?: "non_identifiable" | "independent_acquisition" | "legal_retention";
  learnedParameterException?: boolean;
  tokenActive?: boolean;
  /** A processing permission identifier the caller relies on. */
  processingPermission?: string;
}

export interface PdppDisclosureRequest {
  recipient: PdppRecipient;
  /** Every grant whose held data contributed, directly or through derivatives. */
  inputs: PdppGrantRef[];
  content: PdppDisclosureContent;
  /** Purpose code of the use; defaults to each grant's approved purpose. */
  purpose?: string;
  cited?: PdppCitedBasis;
}

export type PdppRecipientClass = "owner" | "acting_for_client" | "independent";

export type PdppDisclosureRefusal =
  | "independent_recipient"
  | "processing_permission_unsupported"
  | "no_inputs"
  | PdppUseRefusal;

export type PdppDisclosureDecision =
  | { allowed: true; recipientClass: Exclude<PdppRecipientClass, "independent"> }
  | {
      allowed: false;
      recipientClass: PdppRecipientClass;
      reason: PdppDisclosureRefusal;
      grant?: PdppGrantRef;
    };

/** One gate decision, for the adapter-observed audit trail. Identifiers only. */
export interface PdppDisclosureLogEntry {
  at: string;
  recipient: string;
  recipientClass: PdppRecipientClass;
  content: PdppDisclosureContent | "required_by_law";
  inputs: PdppGrantRef[];
  released: boolean;
  reason?: string;
  cited?: PdppCitedBasis;
}

/** A required-by-law disclosure record (spec-core #independent-recipient-disclosure). */
export interface PdppLegalDisclosureRecord {
  at: string;
  recipient: string;
  legalObligation: string;
  records: Array<{ instanceId: string; id: string }>;
  fields: string[];
  inputs: PdppGrantRef[];
}

/** A binding legal obligation and the exact subset it requires. */
export interface PdppLegalObligation {
  /** True only for a disclosure the law requires; a merely permitted one is refused. */
  binding: boolean;
  /** The obligation, e.g. "court order 2026-123 under …". */
  legalObligation: string;
  recipient: string;
  /** The records the obligation requires, by `instance_id` and `id`. */
  records: Array<{ instanceId: string; id: string }>;
  /** The top-level fields the obligation requires. */
  fields: string[];
  /** Law prohibits keeping a record of this disclosure. */
  recordProhibited?: boolean;
}

export class PdppDisclosureRefusedError extends Error {
  constructor(readonly decision: Extract<PdppDisclosureDecision, { allowed: false }>) {
    super(`PDPP disclosure refused: ${decision.reason} (${decision.recipientClass})`);
    this.name = "PdppDisclosureRefusedError";
  }
}

const recipientLabel = (r: PdppRecipient) =>
  r.kind === "owner_destination" ? `owner:${r.destination}` : `party:${r.id}`;

export class PdppDisclosureGate {
  private readonly entries: PdppDisclosureLogEntry[] = [];
  private readonly legal: PdppLegalDisclosureRecord[] = [];

  constructor(private readonly manager: PdppHeldDataManager) {}

  /** Classify the receiving party for this operation (Client item 30). */
  classify(request: Pick<PdppDisclosureRequest, "recipient" | "inputs">): PdppRecipientClass {
    const r = request.recipient;
    if (r.kind === "owner_destination") {
      return r.ownerControlled && r.designatedByOwner ? "owner" : "independent";
    }
    if (r.independentUse === true) return "independent";
    // Acts for the client only when registered under the flow-down for every
    // contributing grant; registration already refuses independent reuse.
    const actsForClient =
      request.inputs.length > 0 &&
      request.inputs.every((ref) => this.manager.downstreamHolder(ref, r.id) !== undefined);
    return actsForClient ? "acting_for_client" : "independent";
  }

  /** Decide without releasing. */
  decide(request: PdppDisclosureRequest): PdppDisclosureDecision {
    const recipientClass = this.classify(request);
    if (request.inputs.length === 0) {
      // Unknown lineage: fail closed.
      return { allowed: false, recipientClass, reason: "no_inputs" };
    }
    if (recipientClass === "independent") {
      const permission = request.cited?.processingPermission;
      return {
        allowed: false,
        recipientClass,
        reason:
          permission !== undefined && !PDPP_CLIENT_SUPPORTED_PROCESSING_PERMISSIONS.includes(permission)
            ? "processing_permission_unsupported"
            : "independent_recipient",
      };
    }
    // The owner and parties acting for the client receive only within use terms (O8, O5).
    for (const ref of request.inputs) {
      const use = this.manager.checkUse(ref, request.purpose !== undefined ? { purpose: request.purpose } : {});
      if (!use.allowed) return { allowed: false, recipientClass, reason: use.reason, grant: ref };
    }
    return { allowed: true, recipientClass };
  }

  /**
   * Release `payload` through `send` only if the gate allows it. The refusal
   * is thrown before `send` runs, so nothing reaches the sink.
   */
  async release<T, R>(
    request: PdppDisclosureRequest,
    payload: T,
    send: (payload: T) => R | Promise<R>,
  ): Promise<R> {
    const decision = this.decide(request);
    this.log(request, decision);
    if (!decision.allowed) throw new PdppDisclosureRefusedError(decision);
    return send(payload);
  }

  /**
   * A disclosure that applicable law requires (case O10). Releases only the
   * obligation's records and fields, and records the disclosure unless law
   * prohibits the record. A merely permitted disclosure is refused. Confers no
   * processing permission and changes no other duty.
   */
  async releaseRequiredByLaw<R>(input: {
    obligation: PdppLegalObligation;
    inputs: PdppGrantRef[];
    records: Array<{ instanceId: string; id: string; data: Record<string, unknown> }>;
    send: (subset: Array<{ instanceId: string; id: string; data: Record<string, unknown> }>) => R | Promise<R>;
  }): Promise<R> {
    const o = input.obligation;
    const at = new Date(this.manager.now()).toISOString();
    if (o.binding !== true) {
      const decision = {
        allowed: false as const,
        recipientClass: "independent" as const,
        reason: "independent_recipient" as const,
      };
      this.entries.push({
        at,
        recipient: o.recipient,
        recipientClass: "independent",
        content: "required_by_law",
        inputs: input.inputs,
        released: false,
        reason: "not a binding legal obligation",
      });
      throw new PdppDisclosureRefusedError(decision);
    }
    const wanted = new Set(o.records.map((r) => `${r.instanceId}\u0000${r.id}`));
    const subset = input.records
      .filter((r) => wanted.has(`${r.instanceId}\u0000${r.id}`))
      .map((r) => ({
        instanceId: r.instanceId,
        id: r.id,
        data: Object.fromEntries(Object.entries(r.data).filter(([k]) => o.fields.includes(k))),
      }));
    const result = await input.send(subset);
    this.entries.push({
      at,
      recipient: o.recipient,
      recipientClass: "independent",
      content: "required_by_law",
      inputs: input.inputs,
      released: true,
    });
    if (!o.recordProhibited) {
      this.legal.push({
        at,
        recipient: o.recipient,
        legalObligation: o.legalObligation,
        records: subset.map((r) => ({ instanceId: r.instanceId, id: r.id })),
        fields: [...o.fields],
        inputs: input.inputs,
      });
    }
    return result;
  }

  /** Every gate decision (adapter-observed release decisions). */
  decisions(): ReadonlyArray<PdppDisclosureLogEntry> {
    return this.entries;
  }

  private log(request: PdppDisclosureRequest, decision: PdppDisclosureDecision): void {
    this.entries.push({
      at: new Date(this.manager.now()).toISOString(),
      recipient: recipientLabel(request.recipient),
      recipientClass: decision.recipientClass,
      content: request.content,
      inputs: request.inputs,
      released: decision.allowed,
      ...(!decision.allowed && { reason: decision.reason }),
      ...(request.cited && { cited: request.cited }),
    });
  }

  /** Required-by-law disclosure records (identifiers and fields, not data). */
  legalDisclosures(): ReadonlyArray<PdppLegalDisclosureRecord> {
    return this.legal;
  }
}

export type PdppTrainingRefusal =
  | "no_training_permission"
  | "training_permission_unsupported"
  | "unknown_input";

/**
 * Client item 17: AI training on PDPP inputs needs covering training
 * permission and valid processing authority for every contributing input.
 * No defining profile is registered, so no grant can carry valid authority:
 * every input is refused. The legacy purpose code confers nothing.
 */
export function checkTrainingUse(
  manager: PdppHeldDataManager,
  inputs: PdppGrantRef[],
): {
  allowed: false;
  refusals: Array<{ grant: PdppGrantRef; reason: PdppTrainingRefusal; legacyPurpose: boolean }>;
} {
  const refusals = inputs.map((grant) => {
    const g = manager.grantOf(grant);
    const legacyPurpose = g?.purpose_code === PDPP_LEGACY_AI_TRAINING_PURPOSE;
    const reason: PdppTrainingRefusal = !g
      ? "unknown_input"
      : g.processing_permissions?.includes(PDPP_AI_TRAINING_PERMISSION)
        ? "training_permission_unsupported"
        : "no_training_permission";
    return { grant, reason, legacyPurpose };
  });
  return { allowed: false, refusals };
}

/** Throwing form of {@link checkTrainingUse}, for training pipelines. */
export function assertTrainingPermitted(manager: PdppHeldDataManager, inputs: PdppGrantRef[]): never {
  const result = checkTrainingUse(manager, inputs);
  const first = result.refusals[0];
  throw new Error(
    `PDPP AI training refused${first ? ` for grant ${first.grant.grantId}: ${first.reason}` : ": no inputs"}`,
  );
}
