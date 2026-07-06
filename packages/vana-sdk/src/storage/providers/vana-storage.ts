import {
  StorageError,
  type StorageProvider,
  type StorageUploadResult,
  type StorageFile,
  type StorageListOptions,
  type StorageProviderConfig,
} from "../index";
import {
  buildWeb3SignedHeader,
  type Web3SignedSignFn,
} from "../../auth/web3-signed-builder";

const DEFAULT_ENDPOINT = "https://storage.vana.org";
const LEGACY_BLOB_PATH_PREFIX = "/v1/blobs";
const DEFAULT_TOKEN_TTL_SECONDS = 300;
const MAX_UPLOAD_ATTEMPTS = 4;
const MAX_RATE_LIMIT_DELAY_MS = 30_000;

/**
 * Wallet-style signer used by {@link VanaStorage} to authenticate every
 * request. For Personal Server flows this can be a registered server wallet
 * signing requests for the owner's storage namespace.
 *
 * @category Storage
 */
export interface VanaStorageSigner {
  /** EIP-191 address (`0x...`). */
  address: `0x${string}`;
  /** EIP-191 personal_sign callback (e.g. viem `account.signMessage`). */
  signMessage: Web3SignedSignFn;
}

/**
 * Configuration for {@link VanaStorage}.
 *
 * @category Storage
 */
export interface VanaStorageConfig {
  /**
   * Base URL of the vana-storage Worker. Defaults to `https://storage.vana.org`.
   *
   * This selects the storage endpoint and is independent of {@link chainId}.
   */
  endpoint?: string;
  /**
   * Numeric chain ID (e.g. `1480` for Vana mainnet, `14800` for Moksha) that
   * scopes blob paths.
   *
   * When set, uploads use chain-scoped routes
   * (`/v1/chains/{chainId}/blobs/...`) so data for different chains under the
   * same owner/scope/timestamp never collides. Reads and deletes must use the
   * same chain-scoped namespace; legacy blobs should be migrated or re-collected
   * rather than read through an ambiguous fallback. When omitted, the provider
   * preserves the legacy `/v1/blobs/...` routes and behavior.
   *
   * Chain ID is orthogonal to {@link endpoint}: `endpoint` picks the storage
   * host, `chainId` picks the chain namespace within that host.
   */
  chainId?: number;
  /**
   * Wallet signer used to authenticate writes and reads.
   */
  signer: VanaStorageSigner;
  /**
   * Owner namespace under which blobs are stored. Defaults to the signer address.
   */
  ownerAddress?: `0x${string}`;
  /**
   * Optional `fetch` implementation. Defaults to the global `fetch`.
   * Useful for tests and for environments that need a custom HTTP client.
   */
  fetchImpl?: typeof fetch;
}

interface VanaStorageUploadResponse {
  key: string;
  url: string;
  etag: string;
  size: number;
}

/**
 * Storage provider that talks to the vana-storage Worker
 * (`https://storage.vana.org` by default). All requests are authenticated
 * with Web3Signed headers signed by the configured wallet.
 *
 * @remarks
 * Filenames passed to {@link VanaStorage.upload} must be of the form
 * `"{scope}/{collectedAt}"` (e.g. `"instagram.profile/2026-05-08T20:00:00.000Z"`).
 * The owner address is prepended automatically to produce the canonical
 * blob path `/v1/blobs/{owner}/{scope}/{collectedAt}`.
 *
 * When {@link VanaStorageConfig.chainId} is set, paths are chain-scoped as
 * `/v1/chains/{chainId}/blobs/{owner}/{scope}/{collectedAt}` so different chains
 * never collide on the same host. The Web3Signed audience remains the endpoint
 * origin regardless of chain ID.
 *
 * @category Storage
 *
 * @example
 * ```typescript
 * import { privateKeyToAccount } from "viem/accounts";
 * import { VanaStorage } from "@opendatalabs/vana-sdk/node";
 *
 * const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
 * const storage = new VanaStorage({
 *   signer: {
 *     address: account.address,
 *     signMessage: (msg) => account.signMessage({ message: msg }),
 *   },
 * });
 *
 * const result = await storage.upload(
 *   new Blob([ciphertext]),
 *   "instagram.profile/2026-05-08T20:00:00.000Z",
 * );
 * ```
 */
export class VanaStorage implements StorageProvider {
  private readonly endpoint: string;
  private readonly chainId?: number;
  private readonly blobPathPrefix: string;
  private readonly signer: VanaStorageSigner;
  private readonly ownerAddress: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: VanaStorageConfig) {
    if (!config?.signer?.address || !config?.signer?.signMessage) {
      throw new StorageError(
        "VanaStorage requires a signer with address and signMessage",
        "MISSING_SIGNER",
        "vana-storage",
      );
    }
    this.endpoint = (config.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
    if (config.chainId !== undefined && !isValidChainId(config.chainId)) {
      throw new StorageError(
        `Unsupported vana-storage chainId '${String(config.chainId)}'`,
        "INVALID_CHAIN_ID",
        "vana-storage",
      );
    }
    this.chainId = config.chainId;
    this.blobPathPrefix =
      this.chainId !== undefined
        ? `/v1/chains/${this.chainId}/blobs`
        : LEGACY_BLOB_PATH_PREFIX;
    this.signer = config.signer;
    this.ownerAddress = (
      config.ownerAddress ?? config.signer.address
    ).toLowerCase();
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Upload an encrypted blob to vana-storage.
   *
   * @param file - The blob to upload.
   * @param filename - Required relative key in the form `"{scope}/{collectedAt}"`.
   *   The owner address is prepended automatically.
   */
  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    if (!filename) {
      throw new StorageError(
        "VanaStorage.upload requires a filename of the form '{scope}/{collectedAt}'",
        "MISSING_FILENAME",
        "vana-storage",
      );
    }

    const subpath = encodeRelativePath(filename);
    const path = `${this.blobPathPrefix}/${this.ownerAddress}/${subpath}`;
    const body = new Uint8Array(await file.arrayBuffer());
    const contentType =
      file.type !== "" ? file.type : "application/octet-stream";

    const header = await this.signRequest("PUT", path, body);

    let response: Response | null = null;
    let responseText = "";
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      try {
        response = await this.fetchImpl(`${this.endpoint}${path}`, {
          method: "PUT",
          headers: {
            authorization: header,
            "content-type": contentType,
          },
          body,
        });
      } catch (cause) {
        throw new StorageError(
          `vana-storage upload network error: ${describe(cause)}`,
          "UPLOAD_ERROR",
          "vana-storage",
          { cause: cause instanceof Error ? cause : undefined },
        );
      }

      if (response.ok) {
        break;
      }

      responseText = await safeText(response);
      if (response.status === 429 && attempt < MAX_UPLOAD_ATTEMPTS) {
        const delayMs = retryDelayMs(response, responseText);
        if (delayMs > 0) {
          await sleep(delayMs);
        }
        continue;
      }

      throw new StorageError(
        `vana-storage upload failed: ${response.status} ${response.statusText} - ${responseText}`,
        "UPLOAD_FAILED",
        "vana-storage",
      );
    }

    if (!response?.ok) {
      throw new StorageError(
        `vana-storage upload failed after ${MAX_UPLOAD_ATTEMPTS} attempts - ${responseText}`,
        "UPLOAD_FAILED",
        "vana-storage",
      );
    }

    const result = (await response.json()) as VanaStorageUploadResponse;
    return {
      url: result.url,
      size: result.size,
      contentType,
      metadata: { key: result.key, etag: result.etag },
    };
  }

  /**
   * Download a blob by URL. The URL must point at a path under this
   * provider's endpoint.
   */
  async download(url: string): Promise<Blob> {
    const path = this.pathFromUrl(url);
    const header = await this.signRequest("GET", path);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.endpoint}${path}`, {
        method: "GET",
        headers: { authorization: header },
      });
    } catch (cause) {
      throw new StorageError(
        `vana-storage download network error: ${describe(cause)}`,
        "DOWNLOAD_ERROR",
        "vana-storage",
        { cause: cause instanceof Error ? cause : undefined },
      );
    }

    if (!response.ok) {
      throw new StorageError(
        `vana-storage download failed: ${response.status} ${response.statusText}`,
        "DOWNLOAD_FAILED",
        "vana-storage",
      );
    }

    return await response.blob();
  }

  /**
   * Listing is not supported by vana-storage — file discovery is handled by
   * the Gateway DataRegistry, not the storage layer.
   */
  async list(_options?: StorageListOptions): Promise<StorageFile[]> {
    throw new StorageError(
      "list is not supported by vana-storage; query the Gateway DataRegistry instead",
      "NOT_IMPLEMENTED",
      "vana-storage",
    );
  }

  async delete(url: string): Promise<boolean> {
    const path = this.pathFromUrl(url);
    const header = await this.signRequest("DELETE", path);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.endpoint}${path}`, {
        method: "DELETE",
        headers: { authorization: header },
      });
    } catch (cause) {
      throw new StorageError(
        `vana-storage delete network error: ${describe(cause)}`,
        "DELETE_ERROR",
        "vana-storage",
        { cause: cause instanceof Error ? cause : undefined },
      );
    }

    if (response.status === 404) return false;
    if (!response.ok) {
      throw new StorageError(
        `vana-storage delete failed: ${response.status} ${response.statusText}`,
        "DELETE_FAILED",
        "vana-storage",
      );
    }
    return true;
  }

  getConfig(): StorageProviderConfig {
    return {
      name: "vana-storage",
      type: "vana-storage",
      requiresAuth: true,
      features: {
        upload: true,
        download: true,
        list: false,
        delete: true,
      },
    };
  }

  private async signRequest(
    method: "GET" | "PUT" | "DELETE",
    path: string,
    body?: Uint8Array,
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return buildWeb3SignedHeader({
      signMessage: this.signer.signMessage,
      aud: this.endpoint,
      method,
      uri: path,
      iat: now,
      exp: now + DEFAULT_TOKEN_TTL_SECONDS,
      ...(body !== undefined && body.length > 0 && { body }),
    });
  }

  private pathFromUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new StorageError(
        `Invalid URL: ${url}`,
        "INVALID_URL",
        "vana-storage",
      );
    }
    const expectedHost = new URL(this.endpoint).host;
    if (parsed.host !== expectedHost) {
      throw new StorageError(
        `URL host '${parsed.host}' does not match storage endpoint '${expectedHost}'`,
        "INVALID_URL",
        "vana-storage",
      );
    }
    // Restrict to a blob path for this owner so a caller cannot induce this
    // wallet to sign arbitrary same-host paths.
    const route = parseBlobPath(parsed.pathname);
    if (!route || route.owner.toLowerCase() !== this.ownerAddress) {
      throw new StorageError(
        `URL path '${parsed.pathname}' must be ${this.blobPathPrefix}/${this.ownerAddress}/{scope}/{collectedAt}`,
        "INVALID_URL",
        "vana-storage",
      );
    }
    // A provider must only sign requests for its configured namespace. Chain
    // mode is strict: old legacy blobs should be migrated or re-collected
    // rather than read through a second ambiguous path.
    if (route.chainId !== this.chainId) {
      throw new StorageError(
        `URL chainId '${route.chainId ?? "legacy"}' does not match provider chainId '${this.chainId ?? "legacy"}'`,
        "INVALID_URL",
        "vana-storage",
      );
    }
    return parsed.pathname;
  }
}

interface ParsedBlobRoute {
  chainId?: number;
  owner: string;
  scope: string;
  collectedAt: string;
}

function isValidChainId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Parse a storage blob pathname into structured route info, or `null` when the
 * path is neither the legacy nor the chain-scoped blob shape. Traversal
 * segments (`.` / `..`) are rejected as invalid.
 */
function parseBlobPath(pathname: string): ParsedBlobRoute | null {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  const isTraversal = (s: string): boolean => s === "." || s === "..";

  // Legacy: /v1/blobs/{owner}/{scope}/{collectedAt}
  if (
    segments.length === 5 &&
    segments[0] === "v1" &&
    segments[1] === "blobs"
  ) {
    const [, , owner, scope, collectedAt] = segments as [
      string,
      string,
      string,
      string,
      string,
    ];
    if (isTraversal(scope) || isTraversal(collectedAt)) return null;
    return { owner, scope, collectedAt };
  }

  // Chain-scoped: /v1/chains/{chainId}/blobs/{owner}/{scope}/{collectedAt}
  if (
    segments.length === 7 &&
    segments[0] === "v1" &&
    segments[1] === "chains" &&
    segments[3] === "blobs"
  ) {
    const [, , chainIdSegment, , owner, scope, collectedAt] = segments as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    if (!/^[0-9]+$/.test(chainIdSegment)) return null;
    const chainId = Number(chainIdSegment);
    if (!isValidChainId(chainId)) return null;
    if (isTraversal(scope) || isTraversal(collectedAt)) return null;
    return { chainId, owner, scope, collectedAt };
  }

  return null;
}

function encodeRelativePath(filename: string): string {
  const parts = filename.split("/");
  if (
    parts.length !== 2 ||
    parts.some((p) => p.length === 0 || p === "." || p === "..")
  ) {
    throw new StorageError(
      `filename must be exactly '{scope}/{collectedAt}' with non-empty segments, got '${filename}'`,
      "INVALID_FILENAME",
      "vana-storage",
    );
  }
  return parts.map((p) => encodeURIComponent(p)).join("/");
}

function describe(value: unknown): string {
  if (value instanceof Error) return value.message;
  return String(value);
}

function retryDelayMs(response: Response, responseText: string): number {
  const headerDelayMs = parseRetryAfterHeaderMs(
    response.headers.get("retry-after"),
  );
  if (headerDelayMs !== null) {
    return clampRateLimitDelay(headerDelayMs);
  }

  return clampRateLimitDelay(parseRetryAfterBodyMs(responseText) ?? 0);
}

function parseRetryAfterHeaderMs(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

function parseRetryAfterBodyMs(responseText: string): number | null {
  if (!responseText) return null;

  try {
    const parsed = JSON.parse(responseText) as { retryAfter?: unknown };
    const seconds = Number(parsed.retryAfter);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  } catch {
    return null;
  }
}

function clampRateLimitDelay(delayMs: number): number {
  return Math.min(Math.max(0, delayMs), MAX_RATE_LIMIT_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
