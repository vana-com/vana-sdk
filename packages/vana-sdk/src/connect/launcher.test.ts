// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ConnectEvent, type ConnectHandle, open } from "./launcher";
import { type ConnectRequest, PROTOCOL_VERSION } from "./protocol";
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
    appName: "Hokemon",
    clientId: "hokemon",
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

afterEach(() => {
  for (const node of document.querySelectorAll("[data-vana-connect]")) {
    node.remove();
  }
  vi.useRealTimers();
});

describe("connect.open", () => {
  it("frames the registered client's sheet with the partner origin and sandbox", () => {
    const { handle, iframe } = mount();
    const url = new URL(iframe.src);

    expect(url.origin).toBe(VANA);
    expect(url.pathname).toBe("/embed/connect");
    expect(url.searchParams.get("client_id")).toBe("hokemon");
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

  it("rejects an origin that is not http(s)", () => {
    expect(() =>
      open({
        appName: "Hokemon",
        clientId: "hokemon",
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

  it("resolves a write with the sheet's verdict, posted only to the Vana origin", async () => {
    const { frameWindow, handle, send } = mount();
    send({ type: "vana:ready", v: PROTOCOL_VERSION });

    const result = handle.write("vana.profile", { city: "Lisbon" });
    const [posted, targetOrigin] =
      frameWindow.postMessage.mock.calls.at(-1) ?? [];
    expect(posted).toMatchObject({
      data: { city: "Lisbon" },
      scope: "vana.profile",
      type: "vana:write",
    });
    expect(targetOrigin).toBe(VANA);

    send({
      id: posted.id,
      ok: true,
      type: "vana:write-result",
      v: PROTOCOL_VERSION,
    });
    await expect(result).resolves.toBe(true);
    handle.close();
  });

  it("refuses a write before the sheet is ready and settles pending writes on close", async () => {
    const { handle, send } = mount();
    await expect(handle.write("vana.profile", {})).resolves.toBe(false);

    send({ type: "vana:ready", v: PROTOCOL_VERSION });
    const pending = handle.write("vana.profile", {});
    handle.close();
    await expect(pending).resolves.toBe(false);
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
      appName: "Hokemon",
      clientId: "hokemon",
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
