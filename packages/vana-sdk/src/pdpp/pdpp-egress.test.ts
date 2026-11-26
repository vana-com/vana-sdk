import { describe, it, expect } from "vitest";
import {
  PDPP_AI_TRAINING_PERMISSION,
  PDPP_DATA_ACCESS_TYPE,
  PDPP_LEGACY_AI_TRAINING_PURPOSE,
  PdppDisclosureGate,
  PdppDisclosureRefusedError,
  PdppHeldDataManager,
  PdppIndependentRecipientError,
  assertTrainingPermitted,
  buildDataAccessDetail,
  checkTrainingUse,
  type PdppDisclosureContent,
  type PdppDisclosureRequest,
  type PdppGrant,
  type PdppGrantRef,
} from "./index";

const ISSUER = "https://ps.example";
const T0 = Date.parse("2026-11-01T00:00:00Z");

function grant(overrides: Partial<PdppGrant> = {}): PdppGrant {
  return {
    version: "0.1.0",
    grant_id: "grt_1",
    issued_at: "2026-11-01T00:00:00Z",
    subject: { id: "sub" },
    client: { client_id: "https://app.example/client" },
    source: { kind: "connector", id: "https://registry.pdpp.dev/sources/bank" },
    source_declaration: { version: "rev1" },
    purpose_code: "https://pdpp.dev/purpose/analytics",
    access_mode: "continuous",
    streams: [{ name: "transactions", instance_ids: ["inst_A"], fields: ["id", "amount"], required_fields: ["id"] }],
    ...overrides,
  };
}

function setup(g: PdppGrant = grant()) {
  let t = T0;
  const clock = { now: () => t, advance: (d: number) => (t += d) };
  const manager = new PdppHeldDataManager({ now: clock.now });
  const ref: PdppGrantRef = { issuer: ISSUER, grantId: g.grant_id };
  manager.recordTokenResponse({ issuer: ISSUER, grant: g });
  manager.recordAcquisition(ref, g);
  const gate = new PdppDisclosureGate(manager);
  const sink: unknown[] = [];
  const send = (payload: unknown) => {
    sink.push(payload);
    return "sent";
  };
  return { clock, manager, ref, gate, sink, send, grant: g };
}

const lender = { kind: "party" as const, id: "lender.example" };
const flowDown = { purposeAndRetention: true, heldDataDuties: true, trainingRestriction: true, independentReuse: false };

describe("independent-recipient disclosure (Client items 29, 30, 31)", () => {
  it("O1: an active analytics grant does not let records reach an independent recipient", async () => {
    const { gate, ref, sink, send } = setup();
    const request: PdppDisclosureRequest = { recipient: lender, inputs: [ref], content: "records" };
    expect(gate.classify(request)).toBe("independent");
    await expect(gate.release(request, [{ id: "t1", amount: 10 }], send)).rejects.toBeInstanceOf(PdppDisclosureRefusedError);
    expect(sink).toEqual([]);
    expect(gate.decisions().at(-1)).toMatchObject({ released: false, reason: "independent_recipient", recipientClass: "independent" });
  });

  it.each<PdppDisclosureContent>(["summary", "score", "embedding", "shared_link", "tool_call_argument", "output"])(
    "O2: a %s derived from the records is refused to an independent recipient",
    async (content) => {
      const { gate, ref, sink, send } = setup();
      await expect(gate.release({ recipient: lender, inputs: [ref], content }, { derived: true }, send)).rejects.toThrow(
        /independent_recipient/,
      );
      expect(sink).toEqual([]);
    },
  );

  it("O3: expiry with keep, a closed single_use window, an active token and a fresh positive assessment authorize nothing", async () => {
    const expired = setup(grant({ expires_at: new Date(T0 + 1000).toISOString() }));
    expired.clock.advance(2000);
    expect(expired.manager.hasEnded(expired.ref)).toBe(true);
    const singleUse = setup(grant({ grant_id: "grt_su", access_mode: "single_use" }));
    const attempt = singleUse.manager.beginAttempt(singleUse.ref);
    await singleUse.manager.recordAnswer(singleUse.ref, attempt, {
      grant_id: "grt_su",
      assessed_at: new Date(T0 + 5).toISOString(),
      read_state: "window_closed",
      held_data: "permitted",
    });
    for (const { gate, ref, sink, send } of [expired, singleUse]) {
      await expect(
        gate.release(
          { recipient: lender, inputs: [ref], content: "records", cited: { tokenActive: true, positiveAssessment: true } },
          [{ id: "t1" }],
          send,
        ),
      ).rejects.toBeInstanceOf(PdppDisclosureRefusedError);
      expect(sink).toEqual([]);
    }
  });

  it("O4: purpose text, a client claim and an owner instruction to send do not authorize it; an owner-named adviser is independent", async () => {
    const g = grant({ purpose_code: "https://app.example/purpose/advice", purpose_description: "We send your data to your named adviser" });
    const { gate, ref, sink, send } = setup(g);
    const cited = {
      purposeText: g.purpose_description!,
      clientClaim: "the adviser deletes data after 30 days",
      ownerInstruction: "send my transactions to my adviser",
    };
    await expect(
      gate.release({ recipient: { kind: "party", id: "adviser.example" }, inputs: [ref], content: "records", cited }, [], send),
    ).rejects.toThrow(PdppDisclosureRefusedError);
    // A destination the owner names but a third party controls is not the owner.
    const adviserInbox = { kind: "owner_destination" as const, destination: "mailto:adviser@firm.example", ownerControlled: false, designatedByOwner: true };
    expect(gate.classify({ recipient: adviserInbox, inputs: [ref] })).toBe("independent");
    await expect(gate.release({ recipient: adviserInbox, inputs: [ref], content: "summary", cited }, [], send)).rejects.toThrow();
    expect(sink).toEqual([]);
    expect(gate.decisions().every((d) => !d.released)).toBe(true);
    expect(gate.decisions()[0]!.cited).toEqual(cited);
  });

  it("O5: a party acting only for the client under flow-down is not an independent recipient; an independent-reuse right makes it one", async () => {
    const { gate, ref, manager, sink, send } = setup();
    manager.registerDownstreamHolder(ref, { id: "storage.example", terms: flowDown, relayErasure: () => undefined });
    const storage = { kind: "party" as const, id: "storage.example" };
    expect(gate.classify({ recipient: storage, inputs: [ref] })).toBe("acting_for_client");
    await expect(gate.release({ recipient: storage, inputs: [ref], content: "records" }, ["r"], send)).resolves.toBe("sent");
    // The same party, used for its own purposes in this operation.
    await expect(
      gate.release({ recipient: { ...storage, independentUse: true }, inputs: [ref], content: "records" }, ["r"], send),
    ).rejects.toThrow(/independent_recipient/);
    expect(() =>
      { manager.registerDownstreamHolder(ref, { id: "llm.example", terms: { ...flowDown, independentReuse: true }, relayErasure: () => undefined }); },
    ).toThrow(PdppIndependentRecipientError);
    expect(sink).toEqual([["r"]]);
  });

  it("O5: a party registered for only one of two contributing grants is independent for the mixed output", () => {
    const { gate, ref, manager } = setup();
    const other: PdppGrantRef = { issuer: ISSUER, grantId: "grt_2" };
    manager.recordTokenResponse({ issuer: ISSUER, grant: grant({ grant_id: "grt_2" }) });
    manager.registerDownstreamHolder(ref, { id: "storage.example", terms: flowDown, relayErasure: () => undefined });
    expect(gate.classify({ recipient: { kind: "party", id: "storage.example" }, inputs: [ref, other] })).toBe("independent");
  });

  it("O7 (client side): a detail asking for an unsupported processing permission is never sent", () => {
    expect(() =>
      buildDataAccessDetail({
        source: { id: "s" },
        purpose_code: "https://pdpp.dev/purpose/analytics",
        access_mode: "single_use",
        streams: [{ name: "a", fields: ["*"] }],
        processing_permissions: ["urn:example:processing:independent-disclosure"],
      }),
    ).toThrow(/not supported/);
  });

  it("O8: returning data to an owner-controlled destination the owner designated is allowed within the use terms", async () => {
    const { gate, ref, manager, sink, send } = setup();
    const ownerMail = { kind: "owner_destination" as const, destination: "mailto:owner@example.com", ownerControlled: true, designatedByOwner: true };
    await expect(gate.release({ recipient: ownerMail, inputs: [ref], content: "summary" }, "summary", send)).resolves.toBe("sent");
    // Existing erasure limits still apply.
    await manager.ownerChoseDelete(ref);
    await expect(gate.release({ recipient: ownerMail, inputs: [ref], content: "summary" }, "summary", send)).rejects.toThrow(/erased/);
    expect(sink).toEqual(["summary"]);
  });

  it("O8: a purpose other than the approved one is refused even to the owner", () => {
    const { gate, ref } = setup();
    const ownerMail = { kind: "owner_destination" as const, destination: "mailto:owner@example.com", ownerControlled: true, designatedByOwner: true };
    expect(gate.decide({ recipient: ownerMail, inputs: [ref], content: "records", purpose: "https://pdpp.dev/purpose/research" })).toMatchObject({
      allowed: false,
      reason: "purpose_not_approved",
    });
  });

  it("O9: citing the non-identifiable erasure exception does not authorize independent release", async () => {
    const { gate, ref, sink, send } = setup();
    await expect(
      gate.release({ recipient: lender, inputs: [ref], content: "output", cited: { erasureException: "non_identifiable" } }, {}, send),
    ).rejects.toThrow(PdppDisclosureRefusedError);
    expect(sink).toEqual([]);
  });

  it("O9a (not applicable until a profile is registered): citing the learned-parameter exception changes nothing", () => {
    const { gate, ref } = setup();
    expect(gate.decide({ recipient: lender, inputs: [ref], content: "output", cited: { learnedParameterException: true } })).toMatchObject({
      allowed: false,
    });
  });

  it("Client 29: citing a processing permission the client does not support is refused as unsupported", () => {
    const { gate, ref } = setup();
    expect(
      gate.decide({ recipient: lender, inputs: [ref], content: "records", cited: { processingPermission: "https://pdpp.dev/processing/disclose" } }),
    ).toMatchObject({ allowed: false, reason: "processing_permission_unsupported" });
  });

  it("Client 30: unknown lineage fails closed", () => {
    const { gate } = setup();
    const ownerMail = { kind: "owner_destination" as const, destination: "mailto:o@example.com", ownerControlled: true, designatedByOwner: true };
    expect(gate.decide({ recipient: ownerMail, inputs: [], content: "summary" })).toMatchObject({ allowed: false, reason: "no_inputs" });
  });

  it("O10: a binding legal obligation releases only the defined subset and is recorded", async () => {
    const { gate, ref } = setup();
    const sent: unknown[] = [];
    const records = [
      { instanceId: "inst_A", id: "t1", data: { id: "t1", amount: 10, memo: "rent" } },
      { instanceId: "inst_A", id: "t2", data: { id: "t2", amount: 99, memo: "private" } },
    ];
    await gate.releaseRequiredByLaw({
      obligation: {
        binding: true,
        legalObligation: "court order 2026-123",
        recipient: "court.example",
        records: [{ instanceId: "inst_A", id: "t1" }],
        fields: ["id", "amount"],
      },
      inputs: [ref],
      records,
      send: (subset) => void sent.push(subset),
    });
    expect(sent).toEqual([[{ instanceId: "inst_A", id: "t1", data: { id: "t1", amount: 10 } }]]);
    expect(gate.legalDisclosures()).toEqual([
      {
        at: new Date(T0).toISOString(),
        recipient: "court.example",
        legalObligation: "court order 2026-123",
        records: [{ instanceId: "inst_A", id: "t1" }],
        fields: ["id", "amount"],
        inputs: [ref],
      },
    ]);
  });

  it("O10: a merely permitted disclosure is refused, and a prohibited record is not kept", async () => {
    const { gate, ref } = setup();
    const sent: unknown[] = [];
    const base = { legalObligation: "x", recipient: "agency.example", records: [{ instanceId: "inst_A", id: "t1" }], fields: ["id"] };
    await expect(
      gate.releaseRequiredByLaw({ obligation: { ...base, binding: false }, inputs: [ref], records: [], send: (s) => void sent.push(s) }),
    ).rejects.toBeInstanceOf(PdppDisclosureRefusedError);
    expect(sent).toEqual([]);
    await gate.releaseRequiredByLaw({
      obligation: { ...base, binding: true, recordProhibited: true },
      inputs: [ref],
      records: [{ instanceId: "inst_A", id: "t1", data: { id: "t1" } }],
      send: (s) => void sent.push(s),
    });
    expect(gate.legalDisclosures()).toEqual([]);
  });
});

describe("AI training (Client item 17)", () => {
  it("Client 17: no input may be used for training; the legacy ai_training purpose confers nothing", () => {
    const ordinary = setup();
    const legacy = setup(grant({ grant_id: "grt_legacy", purpose_code: PDPP_LEGACY_AI_TRAINING_PURPOSE }));
    const result = checkTrainingUse(legacy.manager, [legacy.ref]);
    expect(result).toEqual({
      allowed: false,
      refusals: [{ grant: legacy.ref, reason: "no_training_permission", legacyPurpose: true }],
    });
    expect(checkTrainingUse(ordinary.manager, [ordinary.ref]).allowed).toBe(false);
    expect(() => assertTrainingPermitted(ordinary.manager, [ordinary.ref])).toThrow(/training refused/);
  });

  it("Client 17: even a grant carrying the reserved training permission gives no valid authority (no registered profile)", () => {
    const g = grant({ grant_id: "grt_train", processing_permissions: [PDPP_AI_TRAINING_PERMISSION], expires_at: "2027-01-01T00:00:00Z" });
    const { manager, ref } = setup(g);
    const unknown: PdppGrantRef = { issuer: ISSUER, grantId: "never-seen" };
    expect(checkTrainingUse(manager, [ref, unknown]).refusals.map((r) => r.reason)).toEqual([
      "training_permission_unsupported",
      "unknown_input",
    ]);
    expect(() =>
      buildDataAccessDetail({
        source: { id: "s" },
        purpose_code: "https://pdpp.dev/purpose/personalization",
        purpose_description: "Train an on-device model",
        access_mode: "single_use",
        streams: [{ name: "a", fields: ["*"] }],
        processing_permissions: [PDPP_AI_TRAINING_PERMISSION],
      }),
    ).toThrow(/not supported/);
  });

  it("Client 17 / 24: a party acting for the client must accept the training restriction", () => {
    const { manager, ref } = setup();
    expect(() =>
      { manager.registerDownstreamHolder(ref, { id: "ml.example", terms: { ...flowDown, trainingRestriction: false }, relayErasure: () => undefined }); },
    ).toThrow(/training restriction/);
    expect(PDPP_DATA_ACCESS_TYPE).toBe("https://pdpp.dev/data-access");
  });
});
