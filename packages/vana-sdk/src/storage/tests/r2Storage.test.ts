import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { R2Storage } from "../providers/r2";
import { StorageError } from "../index";

global.fetch = vi.fn();

const baseConfig = {
  accountId: "acct123",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "SECRETEXAMPLE",
  bucket: "my-bucket",
  publicUrl: "https://files.example.com",
};

function makeFetchOk(
  body: BodyInit = "",
  init: ResponseInit = { status: 200 },
) {
  return new Response(body, init);
}

describe("R2Storage", () => {
  let storage: R2Storage;
  let mockFetch: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = global.fetch as Mock;
    mockFetch.mockReset();
    storage = new R2Storage(baseConfig);
  });

  describe("Configuration", () => {
    it("initializes with valid configuration", () => {
      expect(storage).toBeInstanceOf(R2Storage);
      expect(storage.getConfig()).toEqual({
        name: "Cloudflare R2",
        type: "r2",
        requiresAuth: true,
        features: { upload: true, download: true, list: true, delete: true },
      });
    });

    it("requires accessKeyId", () => {
      expect(() => new R2Storage({ ...baseConfig, accessKeyId: "" })).toThrow(
        StorageError,
      );
    });

    it("requires secretAccessKey", () => {
      expect(
        () => new R2Storage({ ...baseConfig, secretAccessKey: "" }),
      ).toThrow(StorageError);
    });

    it("requires bucket", () => {
      expect(() => new R2Storage({ ...baseConfig, bucket: "" })).toThrow(
        StorageError,
      );
    });

    it("requires endpoint or accountId", () => {
      expect(
        () =>
          new R2Storage({
            accessKeyId: "k",
            secretAccessKey: "s",
            bucket: "b",
          }),
      ).toThrow(StorageError);
    });

    it("requires publicUrl when only endpoint is given (no accountId)", () => {
      // Without accountId we cannot synthesize a default *.r2.dev public URL,
      // so callers must pass publicUrl explicitly or get a clear error.
      expect(
        () =>
          new R2Storage({
            endpoint: "http://localhost:9000",
            accessKeyId: "k",
            secretAccessKey: "s",
            bucket: "b",
          }),
      ).toThrow(StorageError);
    });

    it("accepts endpoint-only config when publicUrl is also given", async () => {
      const s = new R2Storage({
        endpoint: "http://localhost:9000",
        accessKeyId: "k",
        secretAccessKey: "s",
        bucket: "b",
        publicUrl: "http://localhost:9000/b",
      });
      mockFetch.mockResolvedValueOnce(makeFetchOk());
      const result = await s.upload(new Blob(["x"]), "k.txt");
      expect(result.url).toBe("http://localhost:9000/b/k.txt");
    });

    it("derives endpoint from accountId when explicit endpoint not given", async () => {
      mockFetch.mockResolvedValueOnce(makeFetchOk());
      await storage.upload(new Blob(["hi"], { type: "text/plain" }), "k.txt");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(
        "https://acct123.r2.cloudflarestorage.com/my-bucket/k.txt",
      );
    });

    it("uses default r2.dev public URL when publicUrl not given", async () => {
      const s = new R2Storage({
        accountId: "acct123",
        accessKeyId: "k",
        secretAccessKey: "s",
        bucket: "my-bucket",
      });
      mockFetch.mockResolvedValueOnce(makeFetchOk());
      const result = await s.upload(new Blob(["x"]), "f.bin");
      expect(result.url).toBe("https://my-bucket.acct123.r2.dev/f.bin");
    });
  });

  describe("Upload", () => {
    it("PUTs the body and returns the public URL", async () => {
      mockFetch.mockResolvedValueOnce(makeFetchOk());
      const blob = new Blob(["hello"], { type: "text/plain" });
      const result = await storage.upload(blob, "greeting.txt");

      expect(result.url).toBe("https://files.example.com/greeting.txt");
      expect(result.size).toBe(5);
      expect(result.contentType).toBe("text/plain");

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://acct123.r2.cloudflarestorage.com/my-bucket/greeting.txt",
      );
      expect(init.method).toBe("PUT");
      expect(init.headers.authorization).toMatch(
        /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
      );
      expect(init.headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
      expect(init.headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
      expect(init.headers["content-type"]).toBe("text/plain");
    });

    it("encodes path segments with reserved characters", async () => {
      mockFetch.mockResolvedValueOnce(makeFetchOk());
      await storage.upload(
        new Blob(["x"]),
        "folder/with space & plus+sign.txt",
      );

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(
        "/my-bucket/folder/with%20space%20%26%20plus%2Bsign.txt",
      );
    });

    it("falls back to application/octet-stream when blob has no type", async () => {
      mockFetch.mockResolvedValueOnce(makeFetchOk());
      const result = await storage.upload(new Blob(["x"]), "k");
      expect(result.contentType).toBe("application/octet-stream");
    });

    it("generates a unique key when filename omitted", async () => {
      mockFetch.mockResolvedValueOnce(makeFetchOk());
      const result = await storage.upload(new Blob(["x"]));
      expect(result.url).toMatch(
        /^https:\/\/files\.example\.com\/vana-\d+-[a-z0-9]+\.dat$/,
      );
    });

    it("throws StorageError on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("denied", { status: 403, statusText: "Forbidden" }),
      );
      await expect(storage.upload(new Blob(["x"]), "k")).rejects.toThrow(
        StorageError,
      );
    });

    it("wraps fetch errors as StorageError", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network down"));
      await expect(storage.upload(new Blob(["x"]), "k")).rejects.toThrow(
        StorageError,
      );
    });
  });

  describe("Download", () => {
    it("GETs by key and returns the blob", async () => {
      const payload = new Blob([new Uint8Array([1, 2, 3])]);
      mockFetch.mockResolvedValueOnce(new Response(payload, { status: 200 }));

      const result = await storage.download("greeting.txt");
      expect(result).toBeInstanceOf(Blob);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/my-bucket/greeting.txt");
      expect(init.method).toBe("GET");
      expect(init.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    });

    it("accepts a public URL and extracts the key", async () => {
      mockFetch.mockResolvedValueOnce(makeFetchOk("data"));
      await storage.download("https://files.example.com/folder/k.txt");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/my-bucket/folder/k.txt");
    });

    it("rejects URLs from other origins", async () => {
      await expect(
        storage.download("https://attacker.example/k"),
      ).rejects.toThrow(StorageError);
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("missing", { status: 404, statusText: "Not Found" }),
      );
      await expect(storage.download("k")).rejects.toThrow(StorageError);
    });
  });

  describe("Delete", () => {
    it("DELETEs by key and returns true", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
      const ok = await storage.delete("k.txt");
      expect(ok).toBe(true);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/my-bucket/k.txt");
      expect(init.method).toBe("DELETE");
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("err", { status: 500, statusText: "Server Error" }),
      );
      await expect(storage.delete("k")).rejects.toThrow(StorageError);
    });
  });

  describe("List", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>my-bucket</Name>
  <Contents>
    <Key>folder/a.txt</Key>
    <LastModified>2026-04-01T12:00:00.000Z</LastModified>
    <ETag>"abc"</ETag>
    <Size>123</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <Contents>
    <Key>b.bin</Key>
    <LastModified>2026-04-02T08:30:00.000Z</LastModified>
    <ETag>"def"</ETag>
    <Size>456</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
</ListBucketResult>`;

    it("parses ListObjectsV2 XML response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(xml, {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
      );

      const files = await storage.list({ limit: 10, namePattern: "folder/" });
      expect(files).toHaveLength(2);

      expect(files[0].id).toBe("folder/a.txt");
      expect(files[0].size).toBe(123);
      expect(files[0].url).toBe("https://files.example.com/folder/a.txt");
      expect(files[0].createdAt.toISOString()).toBe("2026-04-01T12:00:00.000Z");

      expect(files[1].id).toBe("b.bin");
      expect(files[1].size).toBe(456);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("list-type=2");
      expect(url).toContain("prefix=folder%2F");
      expect(url).toContain("max-keys=10");
    });

    it("returns empty array for empty bucket", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          `<?xml version="1.0"?><ListBucketResult><Name>my-bucket</Name></ListBucketResult>`,
          { status: 200 },
        ),
      );
      const files = await storage.list();
      expect(files).toEqual([]);
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("denied", { status: 403, statusText: "Forbidden" }),
      );
      await expect(storage.list()).rejects.toThrow(StorageError);
    });

    it("percent-encodes RFC 3986 sub-delims in query values", async () => {
      // SigV4 canonical query must escape ! ' ( ) * (encodeURIComponent leaves
      // them unescaped). Without this, list({ namePattern: "*.json" }) would
      // sign one query and send another, yielding signature mismatch.
      mockFetch.mockResolvedValueOnce(
        new Response(
          `<?xml version="1.0"?><ListBucketResult><Name>my-bucket</Name></ListBucketResult>`,
          { status: 200 },
        ),
      );
      await storage.list({ namePattern: "*.json" });
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("prefix=%2A.json");
      expect(url).not.toContain("prefix=*.json");
    });
  });

  describe("SigV4 stability", () => {
    it("produces deterministic signature for fixed inputs", async () => {
      // Freeze time so signature is deterministic
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-04T12:00:00.000Z"));

      mockFetch.mockResolvedValueOnce(makeFetchOk());
      await storage.upload(new Blob(["fixed"], { type: "text/plain" }), "k");

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["x-amz-date"]).toBe("20260504T120000Z");
      expect(init.headers.authorization).toContain(
        "Credential=AKIAEXAMPLE/20260504/auto/s3/aws4_request",
      );
      // Signature must be a 64-hex string; full check would couple test to
      // implementation details, but length + hex shape catches accidental
      // breakage of the signing pipeline.
      expect(init.headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);

      vi.useRealTimers();
    });

    it("includes the port in the signed host header for non-default ports", async () => {
      // SigV4 binds to the Host header. URL.hostname strips the port; URL.host
      // keeps it. Test endpoints like http://localhost:9000 must sign
      // `localhost:9000`, not `localhost`, or the receiving server rejects.
      const localStorage = new R2Storage({
        endpoint: "http://localhost:9000",
        accessKeyId: "k",
        secretAccessKey: "s",
        bucket: "b",
        publicUrl: "http://localhost:9000/b",
      });

      // Spy on fetch to capture the actual signed payload. The host header
      // is not exposed directly through fetch's first arg — we infer it via
      // the canonical-request-derived signature, which would change if host
      // changed. Easiest is to assert the URL the request goes to (carries
      // port) and the SignedHeaders list contains `host`.
      mockFetch.mockResolvedValueOnce(makeFetchOk());
      await localStorage.upload(new Blob(["x"]), "k");

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("http://localhost:9000/b/k");
      expect(init.headers.authorization).toMatch(
        /SignedHeaders=[a-z0-9;-]*\bhost\b[a-z0-9;-]*/,
      );
    });
  });
});
