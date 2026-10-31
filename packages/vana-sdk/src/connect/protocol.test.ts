import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  clientCheckUrl,
  isRequestId,
  parseClientCheck,
  parsePartnerMessage,
  parseSheetMessage,
  readConnectDisplay,
  readIncompatibleVersion,
  SHEET_QUERY,
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
    [
      "the retired write result",
      { id: "w1", ok: true, type: "vana:write-result", v: 1 },
    ],
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

  it("names Vana's own misconfiguration apart from a sheet failure", () => {
    expect(
      parseSheetMessage({ code: "vana_unavailable", type: "vana:error", v: 1 }),
    ).toEqual({ code: "vana_unavailable", type: "vana:error", v: 1 });
  });
});

describe("client check", () => {
  it("asks the Vana origin about this client id and partner origin", () => {
    const url = new URL(
      clientCheckUrl({
        clientId: "example-app",
        partnerOrigin: "https://partner.example",
        vanaOrigin: "https://account.vana.org/ignored",
      }),
    );
    expect(url.origin).toBe("https://account.vana.org");
    expect(url.pathname).toBe("/api/embed/connect/client");
    expect(url.searchParams.get("client_id")).toBe("example-app");
    expect(url.searchParams.get("origin")).toBe("https://partner.example");
  });

  it("reads only a boolean registered", () => {
    expect(parseClientCheck({ registered: false, extra: 1 })).toEqual({
      registered: false,
    });
    expect(parseClientCheck({ registered: true })).toEqual({
      registered: true,
    });
    for (const bad of [null, [], "yes", { registered: "false" }, {}]) {
      expect(parseClientCheck(bad)).toBeNull();
    }
  });
});

describe("version handshake", () => {
  it("puts the version the launcher speaks in the sheet URL", () => {
    const url = new URL(
      sheetUrl({
        clientId: "example-app",
        partnerOrigin: "https://partner.example",
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
  it("allows framing and the client check for the environment's Vana Account", () => {
    expect(vanaConnectCsp("production")).toEqual({
      "connect-src": ["https://account.vana.org"],
      "frame-src": ["https://account.vana.org"],
    });
    expect(vanaConnectCsp("dev")).toEqual({
      "connect-src": ["https://account-dev.vana.org"],
      "frame-src": ["https://account-dev.vana.org"],
    });
    expect(
      vanaConnectCsp({ accountOrigin: "http://localhost:3084/embed" }),
    ).toEqual({
      "connect-src": ["http://localhost:3084"],
      "frame-src": ["http://localhost:3084"],
    });
  });

  it("has no default target and refuses anything but an environment or http(s) origin", () => {
    expect(() => (vanaConnectCsp as (t?: unknown) => unknown)()).toThrow(
      TypeError,
    );
    expect(() => vanaConnectCsp("staging" as never)).toThrow(TypeError);
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

  it("rejects the retired partner write", () => {
    expect(
      parsePartnerMessage({
        data: { city: "Lisbon" },
        id: "w1",
        scope: "vana.profile",
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

describe("display", () => {
  const input = {
    clientId: "example-app",
    partnerOrigin: "https://partner.example",
    vanaOrigin: "https://account.example",
  };

  it("leaves the default out of the sheet's URL, so it stays what it was", () => {
    const bare = sheetUrl(input);
    expect(sheetUrl({ ...input, display: "sheet" })).toBe(bare);
    expect(new URL(bare).searchParams.has(SHEET_QUERY.display)).toBe(false);
  });

  it("round-trips a non-default display through the URL", () => {
    const url = new URL(sheetUrl({ ...input, display: "fullscreen" }));
    expect(readConnectDisplay(url.searchParams.get(SHEET_QUERY.display))).toBe(
      "fullscreen",
    );
  });

  it.each([null, undefined, "", "popup", "SHEET", 1, {}])(
    "reads %j as no display",
    (value) => {
      expect(readConnectDisplay(value)).toBeNull();
    },
  );
});
