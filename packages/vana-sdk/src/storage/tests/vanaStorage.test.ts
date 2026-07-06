import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { VanaStorage } from "../providers/vana-storage";
import { StorageError } from "../index";
import { parseWeb3SignedHeader } from "../../auth/web3-signed";

const TEST_PK = `0x${"a".repeat(64)}` as `0x${string}`;
const ENDPOINT = "https://storage.example.com";
const OWNER_ADDRESS = "0x0000000000000000000000000000000000000001" as const;

function makeSigner() {
  const account = privateKeyToAccount(TEST_PK);
  return {
    address: account.address,
    signMessage: (msg: string) => account.signMessage({ message: msg }),
  };
}

function makeStorage(fetchImpl: Mock) {
  return new VanaStorage({
    endpoint: ENDPOINT,
    signer: makeSigner(),
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

function jsonResponse(body: unknown, status = 200, statusText?: string) {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

describe("VanaStorage", () => {
  describe("constructor", () => {
    it("requires a signer", () => {
      expect(
        () =>
          new VanaStorage({
            // @ts-expect-error - intentionally invalid
            signer: undefined,
          }),
      ).toThrow(StorageError);
    });

    it("defaults endpoint to https://storage.vana.org", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({
          key: "0x.../scope/at",
          url: "https://storage.vana.org/v1/blobs/0x.../scope/at",
          etag: "etag",
          size: 5,
        }),
      );
      const storage = new VanaStorage({
        signer: makeSigner(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      await storage.upload(
        new Blob([new Uint8Array([1, 2, 3, 4, 5])]),
        "scope/at",
      );
      const [calledUrl, init] = fetchImpl.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toMatch(/^https:\/\/storage\.vana\.org\//);
      // The signed `aud` claim must use the new origin too — otherwise
      // worker-side audience checks would still expect the legacy host.
      const headers = init.headers as Record<string, string>;
      const parsed = parseWeb3SignedHeader(headers["authorization"]);
      expect(parsed.payload.aud).toBe("https://storage.vana.org");
    });

    it("trims trailing slashes from endpoint", () => {
      const storage = new VanaStorage({
        endpoint: "https://storage.example.com///",
        signer: makeSigner(),
      });
      expect(storage.getConfig().name).toBe("vana-storage");
    });
  });

  describe("upload", () => {
    let mockFetch: Mock;
    let storage: VanaStorage;
    let signerAddress: string;

    beforeEach(() => {
      mockFetch = vi.fn();
      storage = makeStorage(mockFetch);
      signerAddress = makeSigner().address.toLowerCase();
    });

    it("requires a filename", async () => {
      await expect(
        storage.upload(new Blob([new Uint8Array([1])])),
      ).rejects.toThrow(StorageError);
    });

    it("rejects filenames that don't have exactly two segments", async () => {
      await expect(
        storage.upload(new Blob([new Uint8Array([1])]), "scope-only"),
      ).rejects.toThrow(/exactly '\{scope\}\/\{collectedAt\}'/);
      await expect(
        storage.upload(
          new Blob([new Uint8Array([1])]),
          "scope/collectedAt/extra",
        ),
      ).rejects.toThrow(/exactly '\{scope\}\/\{collectedAt\}'/);
    });

    it("rejects filenames with empty or traversal segments", async () => {
      await expect(
        storage.upload(new Blob([new Uint8Array([1])]), "/at"),
      ).rejects.toThrow(/non-empty/);
      await expect(
        storage.upload(new Blob([new Uint8Array([1])]), "scope/"),
      ).rejects.toThrow(/non-empty/);
      await expect(
        storage.upload(new Blob([new Uint8Array([1])]), "../at"),
      ).rejects.toThrow(/non-empty/);
      await expect(
        storage.upload(new Blob([new Uint8Array([1])]), "scope/.."),
      ).rejects.toThrow(/non-empty/);
      await expect(
        storage.upload(new Blob([new Uint8Array([1])]), "./at"),
      ).rejects.toThrow(/non-empty/);
    });

    it("PUTs to /v1/blobs/{owner}/{scope}/{collectedAt} with Web3Signed auth", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          key: `${signerAddress}/instagram.profile/2026-05-08T20:00:00.000Z`,
          url: `${ENDPOINT}/v1/blobs/${signerAddress}/instagram.profile/2026-05-08T20:00:00.000Z`,
          etag: "etag-1",
          size: 4,
        }),
      );

      const result = await storage.upload(
        new Blob([new Uint8Array([1, 2, 3, 4])], {
          type: "application/octet-stream",
        }),
        "instagram.profile/2026-05-08T20:00:00.000Z",
      );

      const [calledUrl, init] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toBe(
        `${ENDPOINT}/v1/blobs/${signerAddress}/instagram.profile/2026-05-08T20%3A00%3A00.000Z`,
      );
      expect(init.method).toBe("PUT");
      const headers = init.headers as Record<string, string>;
      expect(headers["authorization"]).toMatch(/^Web3Signed /);

      const parsed = parseWeb3SignedHeader(headers["authorization"]);
      expect(parsed.payload.method).toBe("PUT");
      expect(parsed.payload.aud).toBe(ENDPOINT);
      expect(parsed.payload.bodyHash).toMatch(/^sha256:/);

      expect(result.url).toBe(
        `${ENDPOINT}/v1/blobs/${signerAddress}/instagram.profile/2026-05-08T20:00:00.000Z`,
      );
      expect(result.size).toBe(4);
      expect(result.contentType).toBe("application/octet-stream");
      expect(result.metadata).toMatchObject({ etag: "etag-1" });
    });

    it("uses the configured owner namespace when signer is a registered server", async () => {
      const ownerLower = OWNER_ADDRESS.toLowerCase();
      storage = new VanaStorage({
        endpoint: ENDPOINT,
        ownerAddress: OWNER_ADDRESS,
        signer: makeSigner(),
        fetchImpl: mockFetch as unknown as typeof fetch,
      });
      mockFetch.mockResolvedValue(
        jsonResponse({
          key: `${ownerLower}/instagram.profile/2026-05-08T20:00:00.000Z`,
          url: `${ENDPOINT}/v1/blobs/${ownerLower}/instagram.profile/2026-05-08T20:00:00.000Z`,
          etag: "etag-owner",
          size: 4,
        }),
      );

      await storage.upload(
        new Blob([new Uint8Array([1, 2, 3, 4])]),
        "instagram.profile/2026-05-08T20:00:00.000Z",
      );

      const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(
        `${ENDPOINT}/v1/blobs/${ownerLower}/instagram.profile/2026-05-08T20%3A00%3A00.000Z`,
      );
    });

    it("throws StorageError on non-2xx upload response", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "FORBIDDEN" }, 403, "Forbidden"),
      );
      await expect(
        storage.upload(new Blob([new Uint8Array([1])]), "scope/at"),
      ).rejects.toThrow(/upload failed/i);
    });

    it("retries upload when vana-storage returns RATE_LIMITED with retryAfter", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse(
            {
              error: "RATE_LIMITED",
              message: "Rate limit exceeded",
              retryAfter: 0,
            },
            429,
            "Too Many Requests",
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            key: `${signerAddress}/scope/at`,
            url: `${ENDPOINT}/v1/blobs/${signerAddress}/scope/at`,
            etag: "etag-retry",
            size: 1,
          }),
        );

      const result = await storage.upload(
        new Blob([new Uint8Array([1])]),
        "scope/at",
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.metadata).toMatchObject({ etag: "etag-retry" });
    });

    it("honors Retry-After headers when retrying upload rate limits", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
            status: 429,
            statusText: "Too Many Requests",
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "0",
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            key: `${signerAddress}/scope/at`,
            url: `${ENDPOINT}/v1/blobs/${signerAddress}/scope/at`,
            etag: "etag-header",
            size: 1,
          }),
        );

      const result = await storage.upload(
        new Blob([new Uint8Array([1])]),
        "scope/at",
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.metadata).toMatchObject({ etag: "etag-header" });
    });

    it("wraps fetch errors as StorageError(UPLOAD_ERROR)", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
      await expect(
        storage.upload(new Blob([new Uint8Array([1])]), "scope/at"),
      ).rejects.toMatchObject({ code: "UPLOAD_ERROR" });
    });
  });

  describe("download", () => {
    let mockFetch: Mock;
    let storage: VanaStorage;
    let signerAddress: string;

    beforeEach(() => {
      mockFetch = vi.fn();
      storage = makeStorage(mockFetch);
      signerAddress = makeSigner().address.toLowerCase();
    });

    it("GETs the blob with Web3Signed auth", async () => {
      const ciphertext = new Uint8Array([10, 20, 30]);
      mockFetch.mockResolvedValue(new Response(ciphertext, { status: 200 }));
      const url = `${ENDPOINT}/v1/blobs/${signerAddress}/scope/at`;
      const blob = await storage.download(url);

      const [calledUrl, init] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toBe(url);
      expect(init.method).toBe("GET");
      const headers = init.headers as Record<string, string>;
      expect(headers["authorization"]).toMatch(/^Web3Signed /);

      const buf = new Uint8Array(await blob.arrayBuffer());
      expect(Array.from(buf)).toEqual([10, 20, 30]);
    });

    it("downloads from the configured owner namespace when signer differs", async () => {
      const ownerLower = OWNER_ADDRESS.toLowerCase();
      storage = new VanaStorage({
        endpoint: ENDPOINT,
        ownerAddress: OWNER_ADDRESS,
        signer: makeSigner(),
        fetchImpl: mockFetch as unknown as typeof fetch,
      });
      const ciphertext = new Uint8Array([10, 20, 30]);
      mockFetch.mockResolvedValue(new Response(ciphertext, { status: 200 }));
      const url = `${ENDPOINT}/v1/blobs/${ownerLower}/scope/at`;

      const blob = await storage.download(url);

      const [calledUrl, init] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(calledUrl).toBe(url);
      expect(init.method).toBe("GET");
      const buf = new Uint8Array(await blob.arrayBuffer());
      expect(Array.from(buf)).toEqual([10, 20, 30]);
    });

    it("rejects URLs from other hosts", async () => {
      await expect(
        storage.download("https://evil.example.com/v1/blobs/x/y/z"),
      ).rejects.toThrow(/does not match storage endpoint/);
    });

    it("rejects malformed URLs", async () => {
      await expect(storage.download("not-a-url")).rejects.toThrow(StorageError);
    });

    it("rejects same-host URLs outside /v1/blobs/{signer}/...", async () => {
      const ownerLower = signerAddress;
      // Wrong path prefix
      await expect(
        storage.download(`${ENDPOINT}/v1/usage/${ownerLower}/scope/at`),
      ).rejects.toThrow(/must be \/v1\/blobs/);
      // Wrong owner
      await expect(
        storage.download(
          `${ENDPOINT}/v1/blobs/0x0000000000000000000000000000000000000001/scope/at`,
        ),
      ).rejects.toThrow(/must be \/v1\/blobs/);
      // Too few segments
      await expect(
        storage.download(`${ENDPOINT}/v1/blobs/${ownerLower}/scope`),
      ).rejects.toThrow(/must be \/v1\/blobs/);
      // Path traversal in scope/collectedAt
      await expect(
        storage.download(`${ENDPOINT}/v1/blobs/${ownerLower}/../at`),
      ).rejects.toThrow();
    });

    it("throws StorageError on non-2xx download response", async () => {
      mockFetch.mockResolvedValue(new Response("", { status: 404 }));
      await expect(
        storage.download(`${ENDPOINT}/v1/blobs/${signerAddress}/scope/at`),
      ).rejects.toThrow(/download failed/i);
    });
  });

  describe("delete", () => {
    let mockFetch: Mock;
    let storage: VanaStorage;
    let signerAddress: string;

    beforeEach(() => {
      mockFetch = vi.fn();
      storage = makeStorage(mockFetch);
      signerAddress = makeSigner().address.toLowerCase();
    });

    it("DELETEs with Web3Signed auth and returns true on 2xx", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));
      const ok = await storage.delete(
        `${ENDPOINT}/v1/blobs/${signerAddress}/scope/at`,
      );
      expect(ok).toBe(true);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("DELETE");
      const headers = init.headers as Record<string, string>;
      expect(headers["authorization"]).toMatch(/^Web3Signed /);
    });

    it("returns false on 404", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
      const ok = await storage.delete(
        `${ENDPOINT}/v1/blobs/${signerAddress}/scope/at`,
      );
      expect(ok).toBe(false);
    });

    it("throws on other non-2xx responses", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 500 }));
      await expect(
        storage.delete(`${ENDPOINT}/v1/blobs/${signerAddress}/scope/at`),
      ).rejects.toThrow(/delete failed/i);
    });
  });

  describe("list", () => {
    it("throws NOT_IMPLEMENTED", async () => {
      const storage = new VanaStorage({
        endpoint: ENDPOINT,
        signer: makeSigner(),
        fetchImpl: vi.fn() as unknown as typeof fetch,
      });
      await expect(storage.list()).rejects.toMatchObject({
        code: "NOT_IMPLEMENTED",
      });
    });
  });

  describe("network-scoped storage", () => {
    let mockFetch: Mock;
    let signerAddress: string;

    beforeEach(() => {
      mockFetch = vi.fn();
      signerAddress = makeSigner().address.toLowerCase();
    });

    function makeNetworkStorage(network: "mainnet" | "moksha") {
      return new VanaStorage({
        endpoint: ENDPOINT,
        network,
        signer: makeSigner(),
        fetchImpl: mockFetch as unknown as typeof fetch,
      });
    }

    it("rejects unsupported network values at construction", () => {
      expect(
        () =>
          new VanaStorage({
            endpoint: ENDPOINT,
            // @ts-expect-error - runtime JS callers can still pass bad strings
            network: "testnet",
            signer: makeSigner(),
            fetchImpl: mockFetch as unknown as typeof fetch,
          }),
      ).toThrow(/Unsupported vana-storage network 'testnet'/);
    });

    it("uploads to /v1/networks/{network}/blobs/... when network is set", async () => {
      const storage = makeNetworkStorage("moksha");
      mockFetch.mockResolvedValue(
        jsonResponse({
          key: `networks/moksha/${signerAddress}/scope/at`,
          url: `${ENDPOINT}/v1/networks/moksha/blobs/${signerAddress}/scope/at`,
          etag: "etag-net",
          size: 1,
        }),
      );

      await storage.upload(new Blob([new Uint8Array([1])]), "scope/at");

      const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(
        `${ENDPOINT}/v1/networks/moksha/blobs/${signerAddress}/scope/at`,
      );
    });

    it("keeps the Web3Signed audience as the endpoint origin, not the network", async () => {
      const storage = makeNetworkStorage("mainnet");
      mockFetch.mockResolvedValue(
        jsonResponse({
          key: `networks/mainnet/${signerAddress}/scope/at`,
          url: `${ENDPOINT}/v1/networks/mainnet/blobs/${signerAddress}/scope/at`,
          etag: "etag-aud",
          size: 1,
        }),
      );

      await storage.upload(new Blob([new Uint8Array([1])]), "scope/at");

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      const parsed = parseWeb3SignedHeader(headers["authorization"]);
      expect(parsed.payload.aud).toBe(ENDPOINT);
      expect(parsed.payload.uri).toBe(
        `/v1/networks/mainnet/blobs/${signerAddress}/scope/at`,
      );
    });

    it("moksha and mainnet produce distinct paths for the same owner/scope/timestamp", async () => {
      const respond = () =>
        mockFetch.mockResolvedValueOnce(
          jsonResponse({ key: "k", url: `${ENDPOINT}/x`, etag: "e", size: 1 }),
        );

      respond();
      await makeNetworkStorage("moksha").upload(
        new Blob([new Uint8Array([1])]),
        "scope/at",
      );
      respond();
      await makeNetworkStorage("mainnet").upload(
        new Blob([new Uint8Array([1])]),
        "scope/at",
      );

      const [mokshaUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
      const [mainnetUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(mokshaUrl).toContain(`/v1/networks/moksha/blobs/`);
      expect(mainnetUrl).toContain(`/v1/networks/mainnet/blobs/`);
      expect(mokshaUrl).not.toBe(mainnetUrl);
    });

    it("downloads and deletes network-scoped URLs on the same endpoint", async () => {
      const storage = makeNetworkStorage("moksha");
      const url = `${ENDPOINT}/v1/networks/moksha/blobs/${signerAddress}/scope/at`;

      mockFetch.mockResolvedValueOnce(
        new Response(new Uint8Array([9]), { status: 200 }),
      );
      const blob = await storage.download(url);
      expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([9]);

      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
      expect(await storage.delete(url)).toBe(true);

      const [downloadUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
      const [deleteUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(downloadUrl).toBe(url);
      expect(deleteUrl).toBe(url);
    });

    it("rejects a mainnet-scoped URL when configured for moksha", async () => {
      const storage = makeNetworkStorage("moksha");
      await expect(
        storage.download(
          `${ENDPOINT}/v1/networks/mainnet/blobs/${signerAddress}/scope/at`,
        ),
      ).rejects.toThrow(/does not match provider network/);
    });

    it("rejects a moksha-scoped URL when configured for mainnet", async () => {
      const storage = makeNetworkStorage("mainnet");
      await expect(
        storage.delete(
          `${ENDPOINT}/v1/networks/moksha/blobs/${signerAddress}/scope/at`,
        ),
      ).rejects.toThrow(/does not match provider network/);
    });

    it("accepts a legacy unscoped URL when configured for a network (migration)", async () => {
      const storage = makeNetworkStorage("moksha");
      const url = `${ENDPOINT}/v1/blobs/${signerAddress}/scope/at`;

      mockFetch.mockResolvedValueOnce(
        new Response(new Uint8Array([7]), { status: 200 }),
      );
      const blob = await storage.download(url);
      expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([7]);

      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
      expect(await storage.delete(url)).toBe(true);

      const [downloadUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
      const [deleteUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(downloadUrl).toBe(url);
      expect(deleteUrl).toBe(url);
    });

    it("rejects an unknown network segment", async () => {
      const storage = makeNetworkStorage("moksha");
      await expect(
        storage.download(
          `${ENDPOINT}/v1/networks/testnet/blobs/${signerAddress}/scope/at`,
        ),
      ).rejects.toThrow(/must be \/v1\/networks\/moksha\/blobs/);
    });

    it("legacy (unscoped) provider rejects network-scoped URLs", async () => {
      const storage = makeStorage(mockFetch);
      await expect(
        storage.download(
          `${ENDPOINT}/v1/networks/moksha/blobs/${signerAddress}/scope/at`,
        ),
      ).rejects.toThrow(/does not match provider network/);
    });
  });

  describe("getConfig", () => {
    it("reports auth required and list disabled", () => {
      const storage = new VanaStorage({
        endpoint: ENDPOINT,
        signer: makeSigner(),
      });
      const cfg = storage.getConfig();
      expect(cfg.name).toBe("vana-storage");
      expect(cfg.requiresAuth).toBe(true);
      expect(cfg.features.list).toBe(false);
      expect(cfg.features.upload).toBe(true);
      expect(cfg.features.download).toBe(true);
      expect(cfg.features.delete).toBe(true);
    });
  });
});
