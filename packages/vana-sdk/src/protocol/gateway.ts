export interface GatewayEnvelope<T> {
  data: T;
  proof: GatewayProof;
  /**
   * Cursor-based pagination metadata, present on list endpoints (e.g.
   * `GET /v1/data`). A sibling of `data`, not nested inside it — so callers
   * that need it must read the full envelope rather than going through
   * `unwrapEnvelope`, which intentionally returns only `data`.
   */
  pagination?: GatewayPagination;
}

export interface GatewayPagination {
  limit: number;
  hasMore: boolean;
  /**
   * Opaque cursor for the NEXT page; pass back as the `cursor` query param.
   * Null when there are no further pages.
   */
  nextCursor: string | null;
}

export interface GatewayProof {
  signature: string;
  timestamp: string;
  gatewayAddress: string;
  requestHash: string;
  responseHash: string;
  userSignature: string;
  status: string;
  chainBlockHeight: number;
}

export interface Builder {
  id: string;
  ownerAddress: string;
  granteeAddress: string;
  publicKey: string;
  appUrl: string;
  addedAt: string;
}

export interface Schema {
  id: string;
  ownerAddress: string;
  name: string;
  definitionUrl: string;
  scope: string;
  addedAt: string;
}

export interface ServerInfo {
  id: string;
  ownerAddress: string;
  serverAddress: string;
  publicKey: string;
  serverUrl: string;
  addedAt: string;
  // ISO timestamp when the grantor deregistered this server, null while
  // active. The gateway returns this on /v1/servers/:address GETs since
  // covering revocation in the response keeps the attestation hash
  // authoritative for both states.
  revokedAt: string | null;
}

// Fee annotation surfaced on every GET grant response. Amounts are decimal
// uint256 strings to match `/v1/escrow/pay`'s wire format. totalDue is a
// snapshot — the gateway re-resolves fees at pay time, so clients shouldn't
// cache this across requests.
export interface GatewayGrantFee {
  asset: string;
  registrationFee: string;
  dataAccessFee: string;
  totalDue: string;
}

// Lifecycle of a grant's on-chain settlement, tracked separately from the
// fee-payment lifecycle (paymentStatus). Driven by POST /v1/settle:
//   pending    — nothing on-chain yet
//   submitting — settle tx broadcast but receipt not yet observed
//   confirmed  — settle tx mined successfully
//   finalized  — finalized tip past the settle block, reorg-safe
//   reorged    — finalized observation reverted; back to 'pending' on next settle
export type GatewayGrantStatus =
  | "pending"
  | "submitting"
  | "confirmed"
  | "finalized"
  | "reorged";

export interface GatewayGrantResponse {
  id: string;
  grantorAddress: string;
  granteeId: string;
  scopes: string[];
  status: GatewayGrantStatus;
  addedAt: string;
  // Grantor-signed deadline. null = perpetual grant (signed value was 0).
  expiresAt: string | null;
  // Derived at read time from expiresAt vs the gateway's clock — a snapshot,
  // not a cached truth. Re-check against expiresAt locally if you care.
  expired: boolean;
  revokedAt: string | null;
  revocationSignature: string | null;
  // 'pending' until the grant registration fee is settled via /v1/escrow/pay.
  paymentStatus: "pending" | "paid";
  paidAt: string | null;
  paidBy: string | null;
  // Decimal-string uint256 monotonic nonce; advances on every state change.
  grantVersion: string;
  // Settle metadata — populated as the grant progresses through the chain
  // lifecycle. Null while `status === 'pending'`.
  settleTxHash: string | null;
  settleSubmittedAt: string | null;
  // Revocation metadata — populated independently when the grantor signs
  // and the gateway pushes a deregister tx.
  revocationTxHash: string | null;
  revocationSubmittedAt: string | null;
  fee: GatewayGrantFee;
}

export type GrantListItem = GatewayGrantResponse;

// Mirror of a DataRegistryV2 row as the gateway exposes it. `id` is the
// deterministic `keccak256(abi.encode(owner, scope))` dataPointId — the same
// value the contract uses as its primary key. `expectedVersion` is the latest
// version the gateway has accepted; the on-chain row may be one version behind
// while a settle is still pending. The gateway response intentionally drops
// `status` from the body — read it from the on-chain contract when you need
// the canonical lifecycle state.
export interface DataPointRecord {
  id: string;
  ownerAddress: string;
  scope: string;
  dataHash: string;
  metadataHash: string;
  // Decimal-string uint256.
  expectedVersion: string;
  // ISO 8601 timestamp of the most recent gateway-side upsert.
  addedAt: string;
}

export interface DataPointListResult {
  dataPoints: DataPointRecord[];
  cursor: string | null;
}

export interface ListDataPointsOptions {
  /**
   * Only return rows added at or after this ISO 8601 timestamp. Used by sync
   * loops that want incremental tails — pass the last seen `addedAt`.
   */
  since?: string;
  /** Page size. Capped at 1000 by the gateway. */
  limit?: number;
}

// grantVersion and expiresAt are decimal-string uint256s — same wire format
// the gateway expects. The caller is responsible for converting their bigint
// to a decimal string and for signing GRANT_REGISTRATION_TYPES with matching
// bigint values.
export interface CreateGrantParams {
  grantorAddress: string;
  granteeId: string;
  scopes: string[];
  grantVersion: string;
  expiresAt: string;
  signature: string;
}

export interface RevokeGrantParams {
  grantId: string;
  grantorAddress: string;
  grantVersion: string;
  signature: string;
}

export interface RegisterServerParams {
  ownerAddress: string;
  serverAddress: string;
  publicKey: string;
  serverUrl: string;
  signature: string;
}

export interface RegisterServerResult {
  serverId?: string;
  alreadyRegistered: boolean;
}

export interface RegisterBuilderParams {
  ownerAddress: string;
  // Wallet the builder authenticates to the Personal Server with. The
  // builderId is deterministically derived from (owner, grantee, publicKey,
  // appUrl) so this triple pins the on-chain identity.
  granteeAddress: string;
  publicKey: string;
  appUrl: string;
  signature: string;
}

export interface RegisterBuilderResult {
  builderId?: string;
  alreadyRegistered: boolean;
}

// AddData on DataRegistryV2. dataHash + metadataHash are bytes32 commitments
// to the off-chain payload + its metadata. expectedVersion is a CAS knob —
// the gateway/contract rejects on 409 if a higher version is already stored,
// and the error body surfaces `currentExpectedVersion` so callers can re-sign.
export interface RegisterDataPointParams {
  ownerAddress: string;
  scope: string;
  dataHash: string;
  metadataHash: string;
  expectedVersion: string;
  signature: string;
}

export interface RegisterDataPointResult {
  dataPointId?: string;
  expectedVersion?: string;
}

// ── Escrow / data-access payment path ───────────────────────────────────────
// /v1/escrow/pay debits the payer's escrow balance for a payable op. For a
// grant: opType = 'grant', opId = the bytes32 grantId. amount, paymentNonce,
// and asset are decimal-uint256 strings on the wire. The signature is the
// raw EIP-712 hex of GENERIC_PAYMENT_TYPES against escrowPaymentDomain.

// A server-signed delivery receipt attached to a data-access payment. The
// signature is over RECORD_DATA_ACCESS_TYPES against dataRegistryDomain; the
// signer must be a personal server the data point's owner has registered as
// trusted. The gateway re-uses this signature verbatim on-chain in the next
// /v1/settle pass via DataRegistryV2.recordDataAccess, where `recordId`
// dedupes via `_usedRecordIds`.
export interface AccessRecord {
  dataPointId: string;
  // Decimal-string uint256 — the data point version being attested to.
  version: string;
  // Must equal the enclosing payment's payerAddress (the gateway enforces).
  accessor: string;
  recordId: string;
  signature: string;
}

export interface PayForOperationParams {
  payerAddress: string;
  opType: string;
  opId: string;
  asset: string;
  amount: string;
  // Per-payer monotonic; (payer, nonce, kind) must be unique. The gateway
  // returns 409 if reused — bump and re-sign.
  paymentNonce: string;
  signature: string;
  // Optional: attach a server-signed access record so the next /v1/settle
  // pass submits a recordDataAccess tx alongside the payment settlement.
  // Required for data-access payments (the second-and-onward payments per
  // grant) that want their on-chain `totalAccesses` counter to advance.
  accessRecord?: AccessRecord;
}

export interface PayForOperationResult {
  opType: string;
  opId: string;
  payerAddress: string;
  asset: string;
  amount: string;
  // Echoes how the gateway split this payment. `registrationPaid` is true on
  // the first payment for a grant (which bundles both fees) and false on
  // subsequent data-access-only payments. Off-chain ledger state only — the
  // on-chain settlement of the registration is tracked by the grant's
  // `status` field, not this flag.
  breakdown: {
    registrationFee: string;
    dataAccessFee: string;
    registrationPaid: boolean;
  };
  paymentNonce: string;
  paidAt: string;
}

// ── Settle / reconcile ──────────────────────────────────────────────────────
// POST /v1/settle drains pending-on-chain rows (grants, servers, data points,
// access records) to the relayer, then promotes 'submitting' → 'confirmed'
// and 'confirmed' → 'finalized' for previously-submitted rows. One call does
// all three; the response surfaces each phase's outcomes.

// The four op-types the settle endpoint knows about. Kept as a union so
// callers can narrow inside the discriminated SettleItem shape.
export type SettleOpType = "grant" | "server" | "data" | "access";

export type SettleItem =
  | {
      opType: SettleOpType;
      opId: string;
      // 'confirmed' when the submit function waited for the receipt and it
      // mined (registerAndSettle path); 'submitting' when only the tx was
      // sent (no receipt wait).
      status: "submitting" | "confirmed";
      settleTxHash: string | null;
      settleSubmittedAt: string | null;
      // Block height the tx mined in; only set when status === 'confirmed'.
      chainBlockHeight: string | null;
      revocationTxHash: string | null;
      revocationSubmittedAt: string | null;
      // True while lib/settle.ts is in placeholder mode for this row's pass.
      placeholder: boolean;
    }
  | {
      opType: SettleOpType;
      opId: string;
      status: "skipped";
      reason: string;
    }
  | {
      opType: SettleOpType;
      opId: string;
      status: "failed";
      error: string;
    };

// Outcome of the housekeeping pass that retries earlier `submitting` rows
// whose receipt arrived after the prior /v1/settle's wait budget elapsed.
export interface SettlePromoteResult {
  opType: SettleOpType;
  opId: string;
  status: "confirmed" | "failed" | "pending" | "skipped";
  txHash: string;
  chainBlockHeight: string | null;
  reason?: string;
}

// Outcome of the reconcile pass that advances 'confirmed' → 'finalized' once
// the chain's finalized tip catches up past the tx's block (or reverts to
// 'pending' on reorg detection).
export interface SettleReconcileItem {
  opId: string;
  status: "finalized" | "reorged" | "unchanged";
  chainBlockHeight: string | null;
  settleTxHash: string | null;
  reason?: string;
}

export interface SettleParams {
  // Per-phase cap. Bounded by MAX_LIMIT on the gateway side; omit to use
  // the gateway's default BATCH_LIMIT.
  limit?: number;
}

export interface SettleResult {
  scanned: number;
  submitted: number;
  confirmed: number;
  skipped: number;
  failed: number;
  items: SettleItem[];
  promoted: { count: number; items: SettlePromoteResult[] };
  reconciled: {
    scanned: number;
    finalized: number;
    reorged: number;
    unchanged: number;
    items: SettleReconcileItem[];
  };
  // Present only when the gateway is configured for paced submission —
  // spreads work across several blocks within one /v1/settle invocation.
  paced?: { iterations: number };
}

// /v1/escrow/balance?account=... — pure read. Returns finalized balances by
// asset, plus the lifecycle breakdown of deposits.
export interface EscrowBalanceEntry {
  asset: string;
  // Gross credited deposits for (account, asset). Decremented only when the
  // reconcile pass marks a payment finalized — NOT on /v1/escrow/pay.
  balance: string;
  // Sum of claimedAmount for deposits still in 'submitted' status — surfaced
  // separately so clients don't conflate "credited" with "deposit announced
  // but not yet confirmed."
  pendingAmount: string;
  // Sum of payments.amount for (account, asset) regardless of settled status —
  // mirrors the /v1/escrow/pay handler's soft-lock counter. Subtract from
  // `balance` to see how much the payer can still authorise.
  authorizedAmount: string;
  // `max(balance − authorizedAmount, 0)`. The headroom a payer has against
  // the soft-lock before /v1/escrow/pay starts returning 402.
  availableAmount: string;
  updatedAt: string | null;
}

export interface EscrowDepositSubmitted {
  txHash: string;
  submittedAt: string;
  claimedAsset: string;
  claimedAmount: string;
}

export interface EscrowDepositFinalized {
  txHash: string;
  finalizedAt: string | null;
  blockNumber: string | null;
  claimedAsset: string;
  claimedAmount: string;
}

export interface EscrowDepositFailed {
  txHash: string;
  submittedAt: string;
  claimedAsset: string;
  claimedAmount: string;
  lastError: string | null;
}

export interface EscrowBalance {
  account: string;
  balances: EscrowBalanceEntry[];
  deposits: {
    submitted: EscrowDepositSubmitted[];
    finalized: EscrowDepositFinalized[];
    failed: EscrowDepositFailed[];
  };
}

// /v1/escrow/deposit announces an on-chain deposit tx so the gateway can
// reconcile it into the payer's balance. The gateway extracts the credited
// account from calldata — no off-chain claim about who paid.
export interface SubmitDepositParams {
  txHash: string;
}

export interface DepositState {
  txHash: string;
  account: string;
  // 'submitted' | 'finalized' | 'failed' — kept open since the gateway adds
  // states (e.g. 'orphaned') as the deposit flow evolves.
  status: string;
  blockNumber: string | null;
  submittedAt: string;
  finalizedAt: string | null;
  lastError: string | null;
}

export interface GatewayClient {
  isRegisteredBuilder(address: string): Promise<boolean>;
  getBuilder(address: string): Promise<Builder | null>;
  getGrant(grantId: string): Promise<GatewayGrantResponse | null>;
  listGrantsByUser(userAddress: string): Promise<GrantListItem[]>;
  getSchemaForScope(scope: string): Promise<Schema | null>;
  getServer(address: string): Promise<ServerInfo | null>;
  /**
   * Fetch a single data point by its deterministic id (keccak256 of (owner, scope)).
   * Returns null on 404. The gateway omits `status` from the response body — read it
   * from the on-chain DataRegistryV2 contract when you need the canonical lifecycle state.
   */
  getDataPoint(dataPointId: string): Promise<DataPointRecord | null>;
  /**
   * Page through an owner's data points. Cursor is opaque; pass `null` for the first
   * page and feed back `result.cursor` until it returns null.
   */
  listDataPointsByOwner(
    owner: string,
    cursor: string | null,
    options?: ListDataPointsOptions,
  ): Promise<DataPointListResult>;
  getSchema(schemaId: string): Promise<Schema | null>;
  registerServer(params: RegisterServerParams): Promise<RegisterServerResult>;
  registerBuilder(
    params: RegisterBuilderParams,
  ): Promise<RegisterBuilderResult>;
  registerDataPoint(
    params: RegisterDataPointParams,
  ): Promise<RegisterDataPointResult>;
  createGrant(params: CreateGrantParams): Promise<{ grantId?: string }>;
  revokeGrant(params: RevokeGrantParams): Promise<void>;
  getEscrowBalance(account: string): Promise<EscrowBalance>;
  submitEscrowDeposit(params: SubmitDepositParams): Promise<DepositState>;
  payForOperation(
    params: PayForOperationParams,
  ): Promise<PayForOperationResult>;
  settle(params?: SettleParams): Promise<SettleResult>;
}

export function createGatewayClient(baseUrl: string): GatewayClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function unwrapEnvelope<T>(res: Response): Promise<T> {
    const envelope = (await res.json()) as GatewayEnvelope<T>;
    return envelope.data;
  }

  function getMutationId(
    body: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = body[key] ?? body["id"];
    return typeof value === "string" ? value : undefined;
  }

  return {
    async isRegisteredBuilder(address: string): Promise<boolean> {
      const builder = await this.getBuilder(address);
      return builder !== null;
    },

    async getBuilder(address: string): Promise<Builder | null> {
      const res = await fetch(`${base}/v1/builders/${address}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return unwrapEnvelope<Builder>(res);
    },

    async getGrant(grantId: string): Promise<GatewayGrantResponse | null> {
      const res = await fetch(`${base}/v1/grants/${grantId}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return unwrapEnvelope<GatewayGrantResponse>(res);
    },

    async listGrantsByUser(userAddress: string): Promise<GrantListItem[]> {
      const res = await fetch(`${base}/v1/grants?user=${userAddress}`);
      if (res.status === 404) return [];
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return unwrapEnvelope<GrantListItem[]>(res);
    },

    async getSchemaForScope(scope: string): Promise<Schema | null> {
      const res = await fetch(`${base}/v1/schemas?scope=${scope}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return unwrapEnvelope<Schema>(res);
    },

    async getServer(address: string): Promise<ServerInfo | null> {
      const res = await fetch(`${base}/v1/servers/${address}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return unwrapEnvelope<ServerInfo>(res);
    },

    async getDataPoint(dataPointId: string): Promise<DataPointRecord | null> {
      const res = await fetch(`${base}/v1/data/${dataPointId}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return unwrapEnvelope<DataPointRecord>(res);
    },

    async listDataPointsByOwner(
      owner: string,
      cursor: string | null,
      options?: ListDataPointsOptions,
    ): Promise<DataPointListResult> {
      const params = new URLSearchParams({ user: owner });
      if (cursor !== null) {
        params.set("cursor", cursor);
      }
      if (options?.since) {
        params.set("since", options.since);
      }
      if (options?.limit !== undefined) {
        params.set("limit", String(options.limit));
      }
      const res = await fetch(`${base}/v1/data?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      // Next-page cursor lives in the envelope's `pagination.nextCursor`
      // (a sibling of `data`), so read the full envelope rather than going
      // through `unwrapEnvelope`, which returns only `data`.
      const envelope = (await res.json()) as GatewayEnvelope<{
        dataPoints: DataPointRecord[];
      }>;
      const nextCursor =
        envelope.pagination?.hasMore === false
          ? null
          : (envelope.pagination?.nextCursor ?? null);
      return {
        dataPoints: envelope.data.dataPoints,
        cursor: nextCursor,
      };
    },

    async getSchema(schemaId: string): Promise<Schema | null> {
      const res = await fetch(`${base}/v1/schemas/${schemaId}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return unwrapEnvelope<Schema>(res);
    },

    async registerServer(
      params: RegisterServerParams,
    ): Promise<RegisterServerResult> {
      const res = await fetch(`${base}/v1/servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${params.signature}`,
        },
        body: JSON.stringify({
          ownerAddress: params.ownerAddress,
          serverAddress: params.serverAddress,
          publicKey: params.publicKey,
          serverUrl: params.serverUrl,
        }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        return {
          serverId: getMutationId(body as Record<string, unknown>, "serverId"),
          alreadyRegistered: true,
        };
      }
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      const body = await res.json().catch(() => ({}));
      return {
        serverId: getMutationId(body as Record<string, unknown>, "serverId"),
        alreadyRegistered: false,
      };
    },

    async registerBuilder(
      params: RegisterBuilderParams,
    ): Promise<RegisterBuilderResult> {
      const res = await fetch(`${base}/v1/builders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${params.signature}`,
        },
        body: JSON.stringify({
          ownerAddress: params.ownerAddress,
          granteeAddress: params.granteeAddress,
          publicKey: params.publicKey,
          appUrl: params.appUrl,
        }),
      });
      // 409 is idempotent — the gateway's current 409 body doesn't include
      // the builderId, but we tolerate it in case that changes (mirrors the
      // registerServer / createGrant shape).
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        return {
          builderId: getMutationId(
            body as Record<string, unknown>,
            "builderId",
          ),
          alreadyRegistered: true,
        };
      }
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      const body = await res.json().catch(() => ({}));
      return {
        builderId: getMutationId(body as Record<string, unknown>, "builderId"),
        alreadyRegistered: false,
      };
    },

    async registerDataPoint(
      params: RegisterDataPointParams,
    ): Promise<RegisterDataPointResult> {
      const res = await fetch(`${base}/v1/data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${params.signature}`,
        },
        body: JSON.stringify({
          ownerAddress: params.ownerAddress,
          scope: params.scope,
          dataHash: params.dataHash,
          metadataHash: params.metadataHash,
          expectedVersion: params.expectedVersion,
        }),
      });
      // 409 is a real failure here (stale CAS), not an idempotent replay —
      // surface the gateway's error message verbatim so the caller knows
      // what `currentExpectedVersion` to re-sign against.
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const detail = body.error ?? res.statusText;
        throw new Error(`Gateway error: ${res.status} ${detail}`);
      }
      const body = (await res.json().catch(() => ({}))) as {
        dataPointId?: string;
        expectedVersion?: string;
      };
      return {
        dataPointId: getMutationId(
          body as Record<string, unknown>,
          "dataPointId",
        ),
        expectedVersion: body.expectedVersion,
      };
    },

    async createGrant(
      params: CreateGrantParams,
    ): Promise<{ grantId?: string }> {
      const res = await fetch(`${base}/v1/grants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${params.signature}`,
        },
        body: JSON.stringify({
          grantorAddress: params.grantorAddress,
          granteeId: params.granteeId,
          scopes: params.scopes,
          grantVersion: params.grantVersion,
          expiresAt: params.expiresAt,
        }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        return {
          grantId: getMutationId(body as Record<string, unknown>, "grantId"),
        };
      }
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      const body = await res.json();
      return {
        grantId: getMutationId(body as Record<string, unknown>, "grantId"),
      };
    },

    async revokeGrant(params: RevokeGrantParams): Promise<void> {
      const res = await fetch(`${base}/v1/grants/${params.grantId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${params.signature}`,
        },
        body: JSON.stringify({
          grantorAddress: params.grantorAddress,
          grantVersion: params.grantVersion,
        }),
      });
      if (res.status === 409) return;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
    },

    async getEscrowBalance(account: string): Promise<EscrowBalance> {
      const res = await fetch(`${base}/v1/escrow/balance?account=${account}`);
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      // Unlike the rest of /v1, the balance endpoint returns the body
      // directly (no GatewayEnvelope wrap) — it's a pure read with no
      // gateway-signed attestation. See data-gateway api/v1/escrow/balance.ts.
      return (await res.json()) as EscrowBalance;
    },

    async submitEscrowDeposit(
      params: SubmitDepositParams,
    ): Promise<DepositState> {
      const res = await fetch(`${base}/v1/escrow/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: params.txHash }),
      });
      // The gateway returns 202 for "accepted (still confirming)" and 200 for
      // duplicate idempotent replays. Both carry the deposit's current state.
      if (res.status !== 200 && res.status !== 202) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as DepositState;
    },

    async payForOperation(
      params: PayForOperationParams,
    ): Promise<PayForOperationResult> {
      // Build the body without the accessRecord key when absent so the
      // gateway's "missing optional" branch matches the no-receipt case
      // exactly (an explicit `accessRecord: undefined` would JSON-serialize
      // to nothing — same result — but keeping it conditional makes wire
      // traces easier to read).
      const body: Record<string, unknown> = {
        payerAddress: params.payerAddress,
        opType: params.opType,
        opId: params.opId,
        asset: params.asset,
        amount: params.amount,
        paymentNonce: params.paymentNonce,
      };
      if (params.accessRecord) {
        body["accessRecord"] = params.accessRecord;
      }
      const res = await fetch(`${base}/v1/escrow/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${params.signature}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as PayForOperationResult;
    },

    async settle(params?: SettleParams): Promise<SettleResult> {
      const res = await fetch(`${base}/v1/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The gateway accepts an empty body; only `limit` is recognised.
        // Always send a JSON body so the gateway's req.body shape parse
        // doesn't have to deal with an undefined.
        body: JSON.stringify(params ?? {}),
      });
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as SettleResult;
    },
  };
}
