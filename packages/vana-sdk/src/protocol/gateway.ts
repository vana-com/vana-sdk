export interface GatewayEnvelope<T> {
  data: T;
  proof: GatewayProof;
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

export interface GatewayGrantResponse {
  id: string;
  grantorAddress: string;
  granteeId: string;
  scopes: string[];
  status: "pending" | "confirmed";
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
  fee: GatewayGrantFee;
}

export type GrantListItem = GatewayGrantResponse;

export interface FileRecord {
  fileId: string;
  owner: string;
  url: string;
  schemaId: string;
  createdAt: string;
}

export interface FileListResult {
  files: FileRecord[];
  cursor: string | null;
}

interface GatewayFileRecord {
  id?: string;
  fileId?: string;
  ownerAddress?: string;
  owner?: string;
  url: string;
  schemaId: string;
  addedAt?: string;
  createdAt?: string;
}

export interface RegisterFileParams {
  ownerAddress: string;
  url: string;
  schemaId: string;
  signature: string;
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

// ── Escrow / data-access payment path ───────────────────────────────────────
// /v1/escrow/pay debits the payer's escrow balance for a payable op. For a
// grant: opType = 'grant', opId = the bytes32 grantId. amount, paymentNonce,
// and asset are decimal-uint256 strings on the wire. The signature is the
// raw EIP-712 hex of GENERIC_PAYMENT_TYPES against escrowPaymentDomain.

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
  getFile(fileId: string): Promise<FileRecord | null>;
  listFilesSince(owner: string, cursor: string | null): Promise<FileListResult>;
  getSchema(schemaId: string): Promise<Schema | null>;
  registerServer(params: RegisterServerParams): Promise<RegisterServerResult>;
  registerFile(params: RegisterFileParams): Promise<{ fileId?: string }>;
  createGrant(params: CreateGrantParams): Promise<{ grantId?: string }>;
  revokeGrant(params: RevokeGrantParams): Promise<void>;
  getEscrowBalance(account: string): Promise<EscrowBalance>;
  submitEscrowDeposit(params: SubmitDepositParams): Promise<DepositState>;
  payForOperation(
    params: PayForOperationParams,
  ): Promise<PayForOperationResult>;
}

export function createGatewayClient(baseUrl: string): GatewayClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function unwrapEnvelope<T>(res: Response): Promise<T> {
    const envelope = (await res.json()) as GatewayEnvelope<T>;
    return envelope.data;
  }

  function normalizeFileRecord(record: GatewayFileRecord): FileRecord {
    return {
      fileId: record.fileId ?? record.id ?? "",
      owner: record.owner ?? record.ownerAddress ?? "",
      url: record.url,
      schemaId: record.schemaId,
      createdAt: record.createdAt ?? record.addedAt ?? "",
    };
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

    async getFile(fileId: string): Promise<FileRecord | null> {
      const res = await fetch(`${base}/v1/files/${fileId}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return normalizeFileRecord(await unwrapEnvelope<GatewayFileRecord>(res));
    },

    async listFilesSince(
      owner: string,
      cursor: string | null,
    ): Promise<FileListResult> {
      const params = new URLSearchParams({ user: owner });
      if (cursor !== null) {
        params.set("since", cursor);
      }
      const res = await fetch(`${base}/v1/files?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      const data = await unwrapEnvelope<{
        files: GatewayFileRecord[];
        cursor: string | null;
      }>(res);
      return {
        files: data.files.map(normalizeFileRecord),
        cursor: data.cursor,
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

    async registerFile(
      params: RegisterFileParams,
    ): Promise<{ fileId?: string }> {
      const res = await fetch(`${base}/v1/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${params.signature}`,
        },
        body: JSON.stringify({
          ownerAddress: params.ownerAddress,
          url: params.url,
          schemaId: params.schemaId,
        }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        return {
          fileId: getMutationId(body as Record<string, unknown>, "fileId"),
        };
      }
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      const body = await res.json();
      return {
        fileId: getMutationId(body as Record<string, unknown>, "fileId"),
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
      const res = await fetch(`${base}/v1/escrow/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${params.signature}`,
        },
        body: JSON.stringify({
          payerAddress: params.payerAddress,
          opType: params.opType,
          opId: params.opId,
          asset: params.asset,
          amount: params.amount,
          paymentNonce: params.paymentNonce,
        }),
      });
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as PayForOperationResult;
    },
  };
}
