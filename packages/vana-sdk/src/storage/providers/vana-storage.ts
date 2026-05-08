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

const DEFAULT_ENDPOINT = "https://storage.vana.com";
const BLOB_PATH_PREFIX = "/v1/blobs";
const DEFAULT_TOKEN_TTL_SECONDS = 300;

/**
 * Wallet-style signer used by {@link VanaStorage} to authenticate every
 * request. The address becomes the namespace owner under which blobs are
 * stored — vana-storage will reject writes/reads where the recovered signer
 * does not match the path owner.
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
   * Base URL of the vana-storage Worker. Defaults to `https://storage.vana.com`.
   */
  endpoint?: string;
  /**
   * Wallet signer used to authenticate writes and reads. The signer's address
   * becomes the namespace owner under which blobs are stored.
   */
  signer: VanaStorageSigner;
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
 * (`https://storage.vana.com` by default). All requests are authenticated
 * with Web3Signed headers signed by the configured wallet.
 *
 * @remarks
 * Filenames passed to {@link VanaStorage.upload} must be of the form
 * `"{scope}/{collectedAt}"` (e.g. `"instagram.profile/2026-05-08T20:00:00.000Z"`).
 * The signer's address is prepended automatically to produce the canonical
 * blob path `/v1/blobs/{owner}/{scope}/{collectedAt}`.
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
  private readonly signer: VanaStorageSigner;
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
    this.signer = config.signer;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Upload an encrypted blob to vana-storage.
   *
   * @param file - The blob to upload.
   * @param filename - Required relative key in the form `"{scope}/{collectedAt}"`.
   *   The signer address is prepended automatically.
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
    const path = `${BLOB_PATH_PREFIX}/${this.signer.address.toLowerCase()}/${subpath}`;
    const body = new Uint8Array(await file.arrayBuffer());
    const contentType =
      file.type !== "" ? file.type : "application/octet-stream";

    const header = await this.signRequest("PUT", path, body);

    let response: Response;
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

    if (!response.ok) {
      throw new StorageError(
        `vana-storage upload failed: ${response.status} ${response.statusText} - ${await safeText(response)}`,
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
    return parsed.pathname;
  }
}

function encodeRelativePath(filename: string): string {
  const parts = filename.split("/").filter((p) => p.length > 0);
  if (parts.length < 2) {
    throw new StorageError(
      `filename must contain at least '{scope}/{collectedAt}', got '${filename}'`,
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

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
