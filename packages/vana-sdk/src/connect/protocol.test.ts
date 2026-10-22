import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  isRequestId,
  parsePartnerMessage,
  parseSheetMessage,
  readIncompatibleVersion,
  sheetUrl,
  vanaConnectCsp,
} from "./protocol";

const request = {
  authorization: {
    appAddress: `0x${"a".repeat(40)}`,
    signature: `0x${"b".repeat(130)}`,
    timestamp: "1767225600000",
  },
  id: "dcr_123",
};

describe("parseSheetMessage", () => {
  it("accepts the current protocol's messages", () => {
    expect(
      parseSheetMessage({ height: 420, type: "vana:resize", v: 1 }),
    ).toEqual({ height: 420, type: "vana:resize", v: PROTOCOL_VERSION });
    expect(
      parseSheetMessage({
        completion: "remote_collect",
        status: "approved",
        type: "vana:connected",
        v: 1,
      }),
    ).toEqual({
      completion: "remote_collect",
      status: "approved",
      type: "vana:connected",
      v: 1,
    });
    expect(
      parseSheetMessage({
        completion: "in_browser",
        status: "approved",
        type: "vana:connected",
        v: 1,
      }),
    ).toMatchObject({ completion: "in_browser" });
    expect(
      parseSheetMessage({
        id: "w1",
        ok: true,
        type: "vana:write-result",
        v: 1,
      }),
    ).toEqual({ id: "w1", ok: true, type: "vana:write-result", v: 1 });
  });

  it("reads the coarse collection progress and nothing finer", () => {
    expect(
      parseSheetMessage({
        phase: "collecting",
        source: "chatgpt",
        type: "vana:progress",
        v: 1,
      }),
    ).toEqual({ phase: "collecting", type: "vana:progress", v: 1 });
    expect(
      parseSheetMessage({ phase: "chatgpt", type: "vana:progress", v: 1 }),
    ).toBeNull();
  });

  it("drops extra fields so nothing unvetted reaches the partner handler", () => {
    expect(
      parseSheetMessage({ token: "secret", type: "vana:signed-in", v: 1 }),
    ).toEqual({ type: "vana:signed-in", v: 1 });
  });

  it.each([
    ["another version", { type: "vana:ready", v: 2 }],
    ["an unknown type", { type: "vana:token", v: 1 }],
    ["a non-numeric height", { height: "999", type: "vana:resize", v: 1 }],
    ["an error without a code", { type: "vana:error", v: 1 }],
    [
      "a connection without a completion",
      { status: "approved", type: "vana:connected", v: 1 },
    ],
    [
      "the retired app handoff completion",
      { completion: "app", status: "approved", type: "vana:connected", v: 1 },
    ],
    ["a non-object", "vana:ready"],
    ["a fractional version", { type: "vana:ready", v: 1.5 }],
  ])("rejects %s", (_label, data) => {
    expect(parseSheetMessage(data)).toBeNull();
  });

  it("reads an error code it does not know as a sheet failure, so it is never lost", () => {
    expect(
      parseSheetMessage({ code: "quota_exceeded", type: "vana:error", v: 1 }),
    ).toEqual({ code: "sheet_failed", type: "vana:error", v: 1 });
    expect(
      parseSheetMessage({
        code: "incompatible_version",
        type: "vana:error",
        v: 1,
      }),
    ).toEqual({ code: "incompatible_version", type: "vana:error", v: 1 });
  });
});

describe("version handshake", () => {
  it("puts the version the launcher speaks in the sheet URL", () => {
    const url = new URL(
      sheetUrl({
        clientId: "lorebook",
        partnerOrigin: "https://lorebook.example",
        vanaOrigin: "https://account.vana.org",
      }),
    );
    expect(url.searchParams.get("v")).toBe(String(PROTOCOL_VERSION));
  });

  it("flags a sheet that is up at a version this SDK cannot speak", () => {
    expect(readIncompatibleVersion({ type: "vana:ready", v: 2 })).toBe(2);
    expect(
      readIncompatibleVersion({ code: "x", type: "vana:error", v: 0 }),
    ).toBe(0);
  });

  it("does not flag a supported version or other messages", () => {
    expect(readIncompatibleVersion({ type: "vana:ready", v: 1 })).toBeNull();
    expect(readIncompatibleVersion({ type: "vana:resize", v: 2 })).toBeNull();
    expect(readIncompatibleVersion({ type: "vana:ready" })).toBeNull();
    expect(readIncompatibleVersion("vana:ready")).toBeNull();
  });
});

describe("isRequestId", () => {
  it("accepts only ids that cannot change the signed path", () => {
    expect(isRequestId("dcr_AbC-123")).toBe(true);
    for (const bad of ["", "../admin", "dcr 1", "dcr/1", "a".repeat(129), 7]) {
      expect(isRequestId(bad)).toBe(false);
    }
  });
});

describe("vanaConnectCsp", () => {
  it("allows framing the environment's Vana Account", () => {
    expect(vanaConnectCsp()).toEqual({
      "frame-src": ["https://account.vana.org"],
    });
    expect(vanaConnectCsp("dev")).toEqual({
      "frame-src": ["https://account-dev.vana.org"],
    });
    expect(
      vanaConnectCsp({ accountOrigin: "http://localhost:3084/embed" }),
    ).toEqual({ "frame-src": ["http://localhost:3084"] });
  });

  it("refuses a non-http origin", () => {
    expect(() => vanaConnectCsp({ accountOrigin: "javascript:x" })).toThrow(
      TypeError,
    );
  });
});

describe("parsePartnerMessage", () => {
  it("accepts a well-formed request", () => {
    expect(
      parsePartnerMessage({ request, type: "vana:request", v: 1 }),
    ).toEqual({ request, type: "vana:request", v: 1 });
  });

  it.each([
    [
      "a malformed signature",
      {
        ...request,
        authorization: { ...request.authorization, signature: "0x12" },
      },
    ],
    [
      "a malformed app address",
      {
        ...request,
        authorization: { ...request.authorization, appAddress: "0xnope" },
      },
    ],
    ["a path-like id", { ...request, id: "../admin" }],
  ])("rejects a request with %s", (_label, bad) => {
    expect(
      parsePartnerMessage({ request: bad, type: "vana:request", v: 1 }),
    ).toBeNull();
  });

  it("rejects an unknown request status", () => {
    expect(
      parsePartnerMessage({
        status: "hacked",
        type: "vana:request-status",
        v: 1,
      }),
    ).toBeNull();
  });

  it("accepts a write to a well-formed scope only", () => {
    expect(
      parsePartnerMessage({
        data: { city: "Lisbon" },
        id: "w1",
        scope: "vana.profile",
        type: "vana:write",
        v: 1,
      }),
    ).toEqual({
      data: { city: "Lisbon" },
      id: "w1",
      scope: "vana.profile",
      type: "vana:write",
      v: 1,
    });
    expect(
      parsePartnerMessage({
        data: {},
        id: "w1",
        scope: "profile",
        type: "vana:write",
        v: 1,
      }),
    ).toBeNull();
  });
});

describe("connect/protocol entry point", () => {
  it("imports nothing, so non-SDK consumers can take it alone", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./protocol.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(|\bimport\(/);
  });
});
