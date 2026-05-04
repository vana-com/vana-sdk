import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";

import {
  StorageError,
  type StorageProvider,
  type StorageUploadResult,
  type StorageFile,
  type StorageListOptions,
  type StorageProviderConfig,
} from "../index";

/**
 * Configuration for {@link R2Storage}.
 *
 * @category Storage
 */
export interface R2Config {
  /** Cloudflare account ID. Used to derive the S3 endpoint when `endpoint` is not given. */
  accountId?: string;
  /**
   * Full S3 endpoint URL. Overrides `accountId`.
   *
   * Defaults to `https://{accountId}.r2.cloudflarestorage.com`.
   */
  endpoint?: string;
  /** R2 access key ID. */
  accessKeyId: string;
  /** R2 secret access key. */
  secretAccessKey: string;
  /** Bucket name. */
  bucket: string;
  /**
   * Public URL prefix used when constructing the URL returned by {@link R2Storage.upload}.
   *
   * If unset, defaults to `https://{bucket}.{accountId}.r2.dev` (R2's default public hostname).
   * Set this to a custom domain bound to the bucket if you have one.
   */
  publicUrl?: string;
  /**
   * S3 region. R2 expects `auto`; consumers can override for compatibility with other
   * S3-compatible stores reachable through the same code path.
   */
  region?: string;
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

const SERVICE = "s3";
const DEFAULT_REGION = "auto";

/**
 * Cloudflare R2 storage provider.
 *
 * @remarks
 * Uses R2's S3-compatible API with SigV4 signed `fetch` requests, so the same
 * implementation runs in browsers, Node.js, and Workers without pulling in
 * `@aws-sdk/client-s3`. Treats blobs as opaque - encryption, access control,
 * and per-tenant prefixing are out of scope and live in higher layers.
 *
 * The SDK exposes R2 as the recommended default backend. Other providers
 * (Pinata, IPFS, Google Drive, Dropbox, CallbackStorage) remain available for
 * teams that need IPFS semantics or user-owned storage.
 *
 * @category Storage
 *
 * @example
 * ```typescript
 * import { R2Storage, StorageManager } from "@opendatalabs/vana-sdk/node";
 *
 * const storage = new StorageManager();
 * storage.register(
 *   "r2",
 *   new R2Storage({
 *     accountId: process.env.R2_ACCOUNT_ID!,
 *     accessKeyId: process.env.R2_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
 *     bucket: process.env.R2_BUCKET!,
 *     publicUrl: "https://files.example.com",
 *   }),
 *   true,
 * );
 *
 * const result = await storage.upload(myBlob, "report.json");
 * console.log(result.url);
 * ```
 */
export class R2Storage implements StorageProvider {
  private readonly endpoint: string;
  private readonly publicUrl: string;
  private readonly region: string;
  private readonly bucket: string;

  constructor(private readonly config: R2Config) {
    if (!config.accessKeyId) {
      throw new StorageError(
        "R2 accessKeyId is required",
        "MISSING_ACCESS_KEY",
        "r2",
      );
    }
    if (!config.secretAccessKey) {
      throw new StorageError(
        "R2 secretAccessKey is required",
        "MISSING_SECRET_KEY",
        "r2",
      );
    }
    if (!config.bucket) {
      throw new StorageError("R2 bucket is required", "MISSING_BUCKET", "r2");
    }
    if (!config.endpoint && !config.accountId) {
      throw new StorageError(
        "R2 endpoint or accountId is required",
        "MISSING_ENDPOINT",
        "r2",
      );
    }

    this.bucket = config.bucket;
    this.region = config.region ?? DEFAULT_REGION;
    this.endpoint = (
      config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`
    ).replace(/\/$/, "");
    this.publicUrl = (
      config.publicUrl ?? `https://${config.bucket}.${config.accountId}.r2.dev`
    ).replace(/\/$/, "");
  }

  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    const key = filename ?? `vana-${Date.now()}-${randomSuffix()}.dat`;
    const body = new Uint8Array(await file.arrayBuffer());
    const contentType =
      file.type !== "" ? file.type : "application/octet-stream";

    try {
      const signed = await this.signRequest({
        method: "PUT",
        path: `/${this.bucket}/${encodePath(key)}`,
        body,
        extraHeaders: { "content-type": contentType },
      });

      const response = await fetch(signed.url, {
        method: "PUT",
        headers: signed.headers,
        body,
      });

      if (!response.ok) {
        throw new StorageError(
          `R2 upload failed: ${response.status} ${response.statusText} - ${await safeText(response)}`,
          "UPLOAD_FAILED",
          "r2",
        );
      }

      return {
        url: `${this.publicUrl}/${encodePath(key)}`,
        size: file.size,
        contentType,
      };
    } catch (error) {
      throw wrapError(error, "UPLOAD_ERROR", "r2");
    }
  }

  async download(url: string): Promise<Blob> {
    const key = this.extractKey(url);
    if (!key) {
      throw new StorageError(
        `Could not extract object key from URL: ${url}`,
        "INVALID_URL",
        "r2",
      );
    }

    try {
      const signed = await this.signRequest({
        method: "GET",
        path: `/${this.bucket}/${encodePath(key)}`,
      });

      const response = await fetch(signed.url, {
        method: "GET",
        headers: signed.headers,
      });

      if (!response.ok) {
        throw new StorageError(
          `R2 download failed: ${response.status} ${response.statusText}`,
          "DOWNLOAD_FAILED",
          "r2",
        );
      }

      return await response.blob();
    } catch (error) {
      throw wrapError(error, "DOWNLOAD_ERROR", "r2");
    }
  }

  async list(options?: StorageListOptions): Promise<StorageFile[]> {
    try {
      const params = new URLSearchParams({ "list-type": "2" });
      if (options?.namePattern) {
        params.set("prefix", options.namePattern);
      }
      if (options?.limit !== undefined) {
        params.set("max-keys", String(options.limit));
      }
      if (options?.offset !== undefined) {
        params.set("continuation-token", String(options.offset));
      }

      const signed = await this.signRequest({
        method: "GET",
        path: `/${this.bucket}`,
        query: params,
      });

      const response = await fetch(signed.url, {
        method: "GET",
        headers: signed.headers,
      });

      if (!response.ok) {
        throw new StorageError(
          `R2 list failed: ${response.status} ${response.statusText}`,
          "LIST_FAILED",
          "r2",
        );
      }

      const xml = await response.text();
      return parseListObjects(xml).map((obj) => ({
        id: obj.key,
        name: obj.key,
        url: `${this.publicUrl}/${encodePath(obj.key)}`,
        size: obj.size,
        contentType: "application/octet-stream",
        createdAt: obj.lastModified,
      }));
    } catch (error) {
      throw wrapError(error, "LIST_ERROR", "r2");
    }
  }

  async delete(url: string): Promise<boolean> {
    const key = this.extractKey(url);
    if (!key) {
      throw new StorageError(
        `Could not extract object key from URL: ${url}`,
        "INVALID_URL",
        "r2",
      );
    }

    try {
      const signed = await this.signRequest({
        method: "DELETE",
        path: `/${this.bucket}/${encodePath(key)}`,
      });

      const response = await fetch(signed.url, {
        method: "DELETE",
        headers: signed.headers,
      });

      if (!response.ok && response.status !== 204) {
        throw new StorageError(
          `R2 delete failed: ${response.status} ${response.statusText}`,
          "DELETE_FAILED",
          "r2",
        );
      }

      return true;
    } catch (error) {
      throw wrapError(error, "DELETE_ERROR", "r2");
    }
  }

  getConfig(): StorageProviderConfig {
    return {
      name: "Cloudflare R2",
      type: "r2",
      requiresAuth: true,
      features: {
        upload: true,
        download: true,
        list: true,
        delete: true,
      },
    };
  }

  /**
   * Extract the object key from a URL. Accepts public URLs minted by `upload()`
   * as well as raw keys for callers that already track them out-of-band.
   *
   * @internal
   */
  private extractKey(urlOrKey: string): string | null {
    if (urlOrKey.startsWith(this.publicUrl + "/")) {
      return decodeURIComponent(urlOrKey.slice(this.publicUrl.length + 1));
    }
    if (urlOrKey.startsWith(this.endpoint + "/")) {
      const rest = urlOrKey.slice(this.endpoint.length + 1);
      const slash = rest.indexOf("/");
      return slash === -1 ? null : decodeURIComponent(rest.slice(slash + 1));
    }
    if (!urlOrKey.includes("://")) {
      return urlOrKey;
    }
    return null;
  }

  private async signRequest(req: {
    method: string;
    path: string;
    query?: URLSearchParams;
    body?: Uint8Array;
    extraHeaders?: Record<string, string>;
  }): Promise<SignedRequest> {
    const { hostname } = new URL(this.endpoint);
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = req.body ? toHex(sha256(req.body)) : EMPTY_PAYLOAD_HASH;

    const canonicalQuery = req.query ? canonicalizeQuery(req.query) : "";

    const headers: Record<string, string> = {
      host: hostname,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...(req.extraHeaders ?? {}),
    };

    const sortedHeaderNames = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonicalHeaders =
      sortedHeaderNames
        .map((h) => `${h}:${headers[h].trim().replace(/\s+/g, " ")}`)
        .join("\n") + "\n";
    const signedHeaders = sortedHeaderNames.join(";");

    const canonicalRequest = [
      req.method,
      req.path,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/${SERVICE}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      toHex(sha256(new TextEncoder().encode(canonicalRequest))),
    ].join("\n");

    const signingKey = deriveSigningKey(
      this.config.secretAccessKey,
      dateStamp,
      this.region,
      SERVICE,
    );
    const signature = toHex(
      hmac(sha256, signingKey, new TextEncoder().encode(stringToSign)),
    );

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const url =
      this.endpoint +
      req.path +
      (canonicalQuery !== "" ? `?${canonicalQuery}` : "");

    return { url, headers };
  }
}

const EMPTY_PAYLOAD_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function deriveSigningKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Uint8Array {
  const enc = new TextEncoder();
  const kDate = hmac(
    sha256,
    enc.encode(`AWS4${secret}`),
    enc.encode(dateStamp),
  );
  const kRegion = hmac(sha256, kDate, enc.encode(region));
  const kService = hmac(sha256, kRegion, enc.encode(service));
  return hmac(sha256, kService, enc.encode("aws4_request"));
}

function formatAmzDate(date: Date): string {
  // YYYYMMDDTHHMMSSZ
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d+/, "");
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

/**
 * Encode each path segment per AWS canonical-URI rules. Slashes between segments
 * are preserved; everything else (including `+`, `=`, etc.) is percent-encoded.
 */
function encodePath(key: string): string {
  return key
    .split("/")
    .map((seg) =>
      encodeURIComponent(seg).replace(
        /[!'()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      ),
    )
    .join("/");
}

function canonicalizeQuery(params: URLSearchParams): string {
  const entries: [string, string][] = [];
  for (const [k, v] of params.entries()) {
    entries.push([k, v]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

interface ListObject {
  key: string;
  size: number;
  lastModified: Date;
}

function parseListObjects(xml: string): ListObject[] {
  const out: ListObject[] = [];
  const contentsRe = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;
  while ((match = contentsRe.exec(xml)) !== null) {
    const block = match[1];
    const key = matchTag(block, "Key");
    const size = matchTag(block, "Size");
    const lastModified = matchTag(block, "LastModified");
    if (key === null) {
      continue;
    }
    out.push({
      key: decodeXmlEntities(key),
      size: size !== null ? parseInt(size, 10) || 0 : 0,
      lastModified:
        lastModified !== null ? new Date(lastModified) : new Date(0),
    });
  }
  return out;
}

function matchTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = re.exec(block);
  return m === null ? null : m[1];
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function wrapError(error: unknown, code: string, provider: string): Error {
  if (error instanceof StorageError) {
    return error;
  }
  return new StorageError(
    `R2 error: ${error instanceof Error ? error.message : "Unknown error"}`,
    code,
    provider,
  );
}
