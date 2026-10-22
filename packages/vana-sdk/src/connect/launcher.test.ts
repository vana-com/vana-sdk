// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ConnectEvent, type ConnectHandle, open } from "./launcher";
import {
  type ConnectRequest,
  PROTOCOL_VERSION,
  VANA_ACCOUNT_ORIGINS,
} from "./protocol";
import { MAX_SHEET_RATIO, sheetTopPx } from "./chrome";

const VANA = "https://account.example";
const REQUEST: ConnectRequest = {
  authorization: {
    appAddress: `0x${"a".repeat(40)}`,
    signature: `0x${"b".repeat(130)}`,
    timestamp: "1767225600000",
  },
  id: "dcr_123",
};

interface Harness {
  events: ConnectEvent[];
  frameWindow: { postMessage: ReturnType<typeof vi.fn> };
  handle: ConnectHandle;
  iframe: HTMLIFrameElement;
  send: (data: unknown, from?: { origin?: string; source?: unknown }) => void;
}

function mount(
  overrides: { getRequest?: () => Promise<ConnectRequest> } = {},
): Harness {
  const events: ConnectEvent[] = [];
  const handle = open({
    appName: "Example App",
    clientId: "example-app",
    getRequest: overrides.getRequest ?? (() => Promise.resolve(REQUEST)),
    onEvent: (event) => events.push(event),
    vanaOrigin: VANA,
  });
  const host = document.querySelector<HTMLElement>("[data-vana-connect]");
  const iframe = host?.shadowRoot?.querySelector("iframe");
  if (!iframe) {
    throw new Error("sheet iframe not mounted");
  }
  const frameWindow = { postMessage: vi.fn() };
  Object.defineProperty(iframe, "contentWindow", { value: frameWindow });
  const send: Harness["send"] = (data, from = {}) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: from.origin ?? VANA,
        source: (from.source ?? frameWindow) as MessageEventSource,
      }),
    );
  };
  return { events, frameWindow, handle, iframe, send };
}

function mountedSheets(): number {
  return document.querySelectorAll("[data-vana-connect]").length;
}

/** Vana's answer to the launcher's client check. */
function clientCheckAnswers(
  answer: () => Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(answer);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  clientCheckAnswers(async () => Response.json({ registered: true }));
});

afterEach(() => {
  for (const node of document.querySelectorAll("[data-vana-connect]")) {
    node.remove();
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connect.open", () => {
  it("frames the registered client's sheet with the partner origin and sandbox", () => {
    const { handle, iframe } = mount();
    const url = new URL(iframe.src);

    expect(url.origin).toBe(VANA);
    expect(url.pathname).toBe("/embed/connect");
    expect(url.searchParams.get("client_id")).toBe("example-app");
    expect(url.searchParams.get("origin")).toBe(window.location.origin);
    expect(iframe.getAttribute("sandbox")?.split(" ").sort()).toEqual(
      [
        "allow-forms",
        "allow-popups",
        "allow-popups-to-escape-sandbox",
        "allow-same-origin",
        "allow-scripts",
      ].sort(),
    );
    handle.close();
  });

  it("frames the environment's Vana Account when given env instead of an origin", () => {
    const handle = open({
      appName: "Example",
      clientId: "example",
      env: "dev",
      getRequest: () => Promise.resolve(REQUEST),
    });
    const iframe = document
      .querySelector<HTMLElement>("[data-vana-connect]")
      ?.shadowRoot?.querySelector("iframe");
    expect(new URL(iframe?.src ?? "").origin).toBe(VANA_ACCOUNT_ORIGINS.dev);
    handle.close();
  });

  it("refuses to guess a Vana Account: neither or both of env and vanaOrigin throws", () => {
    const base = {
      appName: "Example",
      clientId: "example",
      getRequest: () => Promise.resolve(REQUEST),
    };
    expect(() => open(base as never)).toThrow(TypeError);
    expect(() =>
      open({ ...base, env: "dev", vanaOrigin: VANA } as never),
    ).toThrow(TypeError);
    expect(() => open({ ...base, env: "staging" } as never)).toThrow(TypeError);
    expect(mountedSheets()).toBe(0);
  });

  it("rejects an origin that is not http(s)", () => {
    expect(() =>
      open({
        appName: "Example App",
        clientId: "example-app",
        getRequest: () => Promise.resolve(REQUEST),
        vanaOrigin: "javascript:alert(1)",
      }),
    ).toThrow(TypeError);
  });

  it("ignores messages from another origin or another window", () => {
    const { events, handle, send } = mount();

    send(
      { type: "vana:signed-in", v: PROTOCOL_VERSION },
      { origin: "https://evil.example" },
    );
    send({ type: "vana:signed-in", v: PROTOCOL_VERSION }, { source: window });
    expect(events).toEqual([]);

    send({ type: "vana:signed-in", v: PROTOCOL_VERSION });
    expect(events).toEqual([{ type: "signed-in" }]);
    handle.close();
  });

  it("answers request-needed with the partner's request, posted only to the Vana origin", async () => {
    const getRequest = vi.fn(() => Promise.resolve(REQUEST));
    const { frameWindow, handle, send } = mount({ getRequest });

    send({ type: "vana:request-needed", v: PROTOCOL_VERSION });
    await vi.waitFor(() => {
      expect(frameWindow.postMessage).toHaveBeenCalled();
    });

    expect(getRequest).toHaveBeenCalledTimes(1);
    expect(frameWindow.postMessage).toHaveBeenCalledWith(
      { request: REQUEST, type: "vana:request", v: PROTOCOL_VERSION },
      VANA,
    );
    handle.close();
  });

  it("reports a failed request without closing the sheet", async () => {
    const { events, handle, send } = mount({
      getRequest: () => Promise.reject(new Error("backend down")),
    });

    send({ type: "vana:request-needed", v: PROTOCOL_VERSION });
    await vi.waitFor(() => {
      expect(events).toContainEqual({ code: "request_failed", type: "error" });
    });
    expect(mountedSheets()).toBe(1);
    handle.close();
  });

  it("reports ready once however often the sheet says it", () => {
    const { events, handle, send } = mount();

    send({ type: "vana:ready", v: PROTOCOL_VERSION });
    send({ type: "vana:ready", v: PROTOCOL_VERSION });

    expect(events).toEqual([{ type: "ready" }]);
    handle.close();
  });

  it("holds a request status reported early until the sheet is ready", () => {
    const { frameWindow, handle, send } = mount();

    handle.setRequestStatus("completed");
    expect(frameWindow.postMessage).not.toHaveBeenCalled();

    send({ type: "vana:ready", v: PROTOCOL_VERSION });
    expect(frameWindow.postMessage).toHaveBeenCalledWith(
      { status: "completed", type: "vana:request-status", v: PROTOCOL_VERSION },
      VANA,
    );
    handle.close();
  });

  it("reports how an approved request will get its data", () => {
    const { events, handle, send } = mount();

    send({
      completion: "remote_collect",
      status: "approved",
      type: "vana:connected",
      v: PROTOCOL_VERSION,
    });

    expect(events).toEqual([
      { completion: "remote_collect", status: "approved", type: "connected" },
    ]);
    handle.close();
  });

  it("passes on the coarse collection progress", () => {
    const { events, handle, send } = mount();

    send({ phase: "collecting", type: "vana:progress", v: PROTOCOL_VERSION });
    send({ phase: "writing", type: "vana:progress", v: PROTOCOL_VERSION });

    expect(events).toEqual([
      { phase: "collecting", type: "progress" },
      { phase: "writing", type: "progress" },
    ]);
    handle.close();
  });

  it("closes with frame_blocked when the sheet never reports ready", () => {
    vi.useFakeTimers();
    const events: ConnectEvent[] = [];
    open({
      appName: "Example App",
      clientId: "example-app",
      getRequest: () => Promise.resolve(REQUEST),
      onEvent: (event) => events.push(event),
      readyTimeoutMs: 1000,
      vanaOrigin: VANA,
    });

    vi.advanceTimersByTime(1000);

    expect(events).toEqual([
      { code: "frame_blocked", type: "error" },
      { reason: "frame_blocked", type: "close" },
    ]);
    expect(mountedSheets()).toBe(0);
  });

  it("asks Vana whether this origin is registered, without credentials", async () => {
    const fetchMock = clientCheckAnswers(async () =>
      Response.json({ registered: true }),
    );
    const { events, handle } = mount();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    // Let the answer reach the launcher before checking it kept the sheet.
    await fetchMock.mock.results[0]?.value;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const asked = new URL(String(url));
    expect(asked.origin).toBe(VANA);
    expect(asked.pathname).toBe("/api/embed/connect/client");
    expect(asked.searchParams.get("client_id")).toBe("example-app");
    expect(asked.searchParams.get("origin")).toBe(window.location.origin);
    expect(init).toMatchObject({ cache: "no-store", credentials: "omit" });
    expect(events).toEqual([]);
    expect(mountedSheets()).toBe(1);
    handle.close();
  });

  it("closes at once with origin_not_registered when Vana says this origin is not registered", async () => {
    clientCheckAnswers(async () => Response.json({ registered: false }));
    const { events } = mount();

    await vi.waitFor(() => {
      expect(events).toEqual([
        { code: "origin_not_registered", type: "error" },
        { reason: "origin_not_registered", type: "close" },
      ]);
    });
    expect(mountedSheets()).toBe(0);
  });

  it("leaves the ready deadline to decide when the check cannot be answered", async () => {
    vi.useFakeTimers();
    clientCheckAnswers(() => Promise.reject(new TypeError("offline")));
    const events: ConnectEvent[] = [];
    open({
      appName: "Example App",
      clientId: "example-app",
      getRequest: () => Promise.resolve(REQUEST),
      onEvent: (event) => events.push(event),
      readyTimeoutMs: 1000,
      vanaOrigin: VANA,
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual([
      { code: "frame_blocked", type: "error" },
      { reason: "frame_blocked", type: "close" },
    ]);
  });

  it("keeps a sheet that reports Vana unavailable open, without timing out", () => {
    vi.useFakeTimers();
    const { events, handle, send } = mount();

    send({ code: "vana_unavailable", type: "vana:error", v: PROTOCOL_VERSION });
    vi.advanceTimersByTime(60_000);

    expect(events).toEqual([{ code: "vana_unavailable", type: "error" }]);
    expect(mountedSheets()).toBe(1);
    handle.close();
  });

  it("does not time out once the sheet is ready", () => {
    vi.useFakeTimers();
    const { events, handle, send } = mount();

    send({ type: "vana:ready", v: PROTOCOL_VERSION });
    vi.advanceTimersByTime(60_000);

    expect(events).toEqual([{ type: "ready" }]);
    handle.close();
  });

  it("restores scroll and focus and reports close exactly once", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    document.body.style.overflow = "auto";

    const { events, handle, send } = mount();
    expect(document.body.style.overflow).toBe("hidden"); // class-assertion-ok: the partner page scroll lock is the launcher contract

    send({ type: "vana:close", v: PROTOCOL_VERSION });
    handle.close();

    expect(events.filter((event) => event.type === "close")).toEqual([
      { reason: "sheet", type: "close" },
    ]);
    expect(mountedSheets()).toBe(0);
    expect(document.body.style.overflow).toBe("auto"); // class-assertion-ok: restoring the partner scroll state is the launcher contract
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("ignores a scrim tap right after the page returns to view", () => {
    // Regression: returning from the Google popup tab, a stray tap closed the
    // sheet silently and looked like a blank render.
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "Date"] });
    const { events, handle } = mount();
    const scrim = document
      .querySelector<HTMLElement>("[data-vana-connect]")
      ?.shadowRoot?.querySelector<HTMLElement>('[data-slot="scrim"]');
    if (!scrim) {
      throw new Error("scrim not mounted");
    }

    window.dispatchEvent(new Event("focus"));
    scrim.click();
    expect(events).toEqual([]);

    vi.advanceTimersByTime(600);
    scrim.click();
    expect(events).toEqual([{ reason: "scrim", type: "close" }]);
    handle.close();
  });

  it("closes with incompatible_version when the sheet speaks another protocol version", () => {
    const { events, send } = mount();

    send({ type: "vana:ready", v: PROTOCOL_VERSION + 1 });

    expect(events).toEqual([
      { code: "incompatible_version", type: "error" },
      { reason: "incompatible_version", type: "close" },
    ]);
    expect(mountedSheets()).toBe(0);
  });

  it("ignores an incompatible version claimed by another window on the Vana origin", () => {
    const { events, handle, send } = mount();

    send({ type: "vana:ready", v: PROTOCOL_VERSION + 1 }, { source: window });

    expect(events).toEqual([]);
    expect(mountedSheets()).toBe(1);
    handle.close();
  });

  it("ignores an incompatible version claimed by another origin", () => {
    const { events, handle, send } = mount();

    send(
      { type: "vana:ready", v: PROTOCOL_VERSION + 1 },
      { origin: "https://evil.example" },
    );

    expect(events).toEqual([]);
    expect(mountedSheets()).toBe(1);
    handle.close();
  });

  it("replaces an open sheet instead of stacking a second one", () => {
    const first = mount();
    const second = mount();

    expect(first.events).toEqual([{ reason: "replaced", type: "close" }]);
    expect(mountedSheets()).toBe(1);
    second.handle.close();
  });
});

describe("sheetTopPx", () => {
  it("shows exactly the reported content, in whole pixels", () => {
    // 20 px handle strip above the content.
    expect(sheetTopPx(800, 400)).toBe(380);
    expect(Number.isInteger(sheetTopPx(801.5, 333.3))).toBe(true);
  });

  it("never lets the sheet cover more than its share of the viewport", () => {
    const top = sheetTopPx(800, 100_000);
    expect(top).toBe(800 - Math.round(800 * MAX_SHEET_RATIO));
    expect(top).toBeGreaterThan(0);
  });
});
