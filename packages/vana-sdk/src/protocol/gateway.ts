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

export interface GatewayGrantResponse {
  id: string;
  grantorAddress: string;
  granteeId: string;
  grant: string;
  fileIds: string[];
  status: "pending" | "confirmed";
  addedAt: string;
  revokedAt: string | null;
  revocationSignature: string | null;
}

export interface GrantListItem {
  id: string;
  grantorAddress: string;
  granteeId: string;
  grant: string;
  fileIds: string[];
  status: "pending" | "confirmed";
  addedAt: string;
  revokedAt: string | null;
  revocationSignature: string | null;
}

export interface FileRecord {
  fileId: string;
  owner: string;
  url: string;
  schemaId: string;
  createdAt: string;
  /**
   * Soft-deletion timestamp (ISO 8601), or null if the file is active. Always present
   * (`normalizeFileRecord` populates it); non-null only when the gateway returns deletion state
   * (e.g. listed with `includeDeleted`). Drives the PS sync delete-reconciliation.
   */
  deletedAt: string | null;
}

export interface FileListResult {
  files: FileRecord[];
  cursor: string | null;
}

export interface ListFilesOptions {
  /**
   * Include soft-deleted files in the result (each carries a non-null `deletedAt`). Default false.
   * Used by the PS sync download worker to reconcile deletions of files it already holds locally.
   */
  includeDeleted?: boolean;
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
  deletedAt?: string | null;
}

export interface RegisterFileParams {
  ownerAddress: string;
  url: string;
  schemaId: string;
  signature: string;
}

export interface CreateGrantParams {
  grantorAddress: string;
  granteeId: string;
  grant: string;
  fileIds: string[];
  signature: string;
}

export interface RevokeGrantParams {
  grantId: string;
  grantorAddress: string;
  signature: string;
}

export interface DeleteFileParams {
  fileId: string;
  ownerAddress: string;
  /** EIP-712 FileDeletion signature, signed by the owner or the owner's registered server. */
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

export interface GatewayClient {
  isRegisteredBuilder(address: string): Promise<boolean>;
  getBuilder(address: string): Promise<Builder | null>;
  getGrant(grantId: string): Promise<GatewayGrantResponse | null>;
  listGrantsByUser(userAddress: string): Promise<GrantListItem[]>;
  getSchemaForScope(scope: string): Promise<Schema | null>;
  getServer(address: string): Promise<ServerInfo | null>;
  getFile(fileId: string): Promise<FileRecord | null>;
  listFilesSince(
    owner: string,
    cursor: string | null,
    options?: ListFilesOptions,
  ): Promise<FileListResult>;
  getSchema(schemaId: string): Promise<Schema | null>;
  registerServer(params: RegisterServerParams): Promise<RegisterServerResult>;
  registerFile(params: RegisterFileParams): Promise<{ fileId?: string }>;
  createGrant(params: CreateGrantParams): Promise<{ grantId?: string }>;
  revokeGrant(params: RevokeGrantParams): Promise<void>;
  /**
   * Soft-deletes (de-registers) a file at the gateway. Resolves on 200 and on 409
   * (already deleted) — 409 is treated as idempotent success. Other non-2xx, including
   * 404 (file not registered), throw; the PS delete cascade decides whether a 404 is
   * benign (blob already gone) or a hard failure.
   */
  deleteFile(params: DeleteFileParams): Promise<void>;
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
      deletedAt: record.deletedAt ?? null,
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
      options?: ListFilesOptions,
    ): Promise<FileListResult> {
      const params = new URLSearchParams({ user: owner });
      if (cursor !== null) {
        params.set("since", cursor);
      }
      if (options?.includeDeleted) {
        params.set("includeDeleted", "true");
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
          grant: params.grant,
          fileIds: params.fileIds,
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
        }),
      });
      if (res.status === 409) return;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
    },

    async deleteFile(params: DeleteFileParams): Promise<void> {
      const res = await fetch(`${base}/v1/files/${params.fileId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Web3Signed ${params.signature}`,
        },
        body: JSON.stringify({
          ownerAddress: params.ownerAddress,
        }),
      });
      // 409 = already deleted; treat as success (idempotent), same as revokeGrant.
      if (res.status === 409) return;
      if (!res.ok) {
        throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
      }
    },
  };
}
