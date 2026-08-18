import { describe, it, expect, vi } from "vitest";
import { createDirectConnectFlow } from "./connect-flow";
import { normalizeMobileContinuationUrl } from "./types";
import type { DirectConnectOptions } from "./connect-flow";
import type {
  AccessRequest,
  AccessRequestStatus,
  ApprovedDataResult,
} from "./types";

const MOBILE_CONTINUATION_URL = "https://open-dev.vana.org/continue#ticket_1";

const REQUEST: AccessRequest = {
  requestId: "dcr_1",
  approvalUrl: "https://app.vana.org/data-connection-requests/dcr_1?mode=page",
  appAddress: "0xapp",
};

/**
 * A controllable timer + clock so polling is deterministic. `tick()` runs the
 * single pending timer (the flow only ever schedules one at a time) after
 * letting any pending microtasks settle.
 */
function makeHarness() {
  let pending: (() => void) | null = null;
  let clock = 0;
  return {
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    setTimeoutFn: (cb: () => void) => {
      pending = cb;
      return 1;
    },
    clearTimeoutFn: () => {
      pending = null;
    },
    async tick() {
      // Let in-flight promises resolve, then fire the scheduled poll.
      await Promise.resolve();
      const cb = pending;
      pending = null;
      cb?.();
      await Promise.resolve();
    },
    hasPending: () => pending !== null,
  };
}

/** A spyable {@link ConnectWindow} handle for asserting open/navigate/close. */
function makeWindow() {
  const navigate = vi.fn();
  const close = vi.fn();
  return { handle: { navigate, close }, navigate, close };
}

function pendingStatus(): AccessRequestStatus {
  return { status: "pending" };
}
function approvedStatus(): AccessRequestStatus {
  return {
    status: "approved",
    personalServerUrl: "https://ps.example.com",
    grantId: "0xgrant",
    scope: "icloud_notes.notes",
  };
}
function readyForReadStatus(): AccessRequestStatus {
  return {
    ...approvedStatus(),
    status: "ready_for_read",
  };
}

describe("createDirectConnectFlow", () => {
  it("validates the mobile continuation URL strictly at the SDK boundary", () => {
    expect(normalizeMobileContinuationUrl(MOBILE_CONTINUATION_URL)).toBe(
      MOBILE_CONTINUATION_URL,
    );
    expect(
      normalizeMobileContinuationUrl("https://open.vana.org/continue#t_prod"),
    ).toBe("https://open.vana.org/continue#t_prod");
    // Env pins the allowed host.
    expect(
      normalizeMobileContinuationUrl(MOBILE_CONTINUATION_URL, "production"),
    ).toBeUndefined();
    expect(normalizeMobileContinuationUrl(MOBILE_CONTINUATION_URL, "dev")).toBe(
      MOBILE_CONTINUATION_URL,
    );
    for (const invalid of [
      "http://open.vana.org/continue#ticket_1",
      "https://open.vana.org/continue",
      "https://open.vana.org/continue#",
      "https://open.vana.org/other#ticket_1",
      "https://app.vana.org/continue#ticket_1",
      "https://open.vana.org:8443/continue#ticket_1",
      "https://user@open.vana.org/continue#ticket_1",
      "https://open.vana.org/continue?x=1#ticket_1",
      "https://open.vana.org/continue#ticket_1/../evil",
      "javascript:alert(document.domain)",
      "vana-dev://continue?id=1",
    ]) {
      expect(normalizeMobileContinuationUrl(invalid)).toBeUndefined();
    }
  });

  it("exposes ready_to_open with a plain URL on mobile-deep without opening the tab", async () => {
    const h = makeHarness();
    const openApprovalWindow = vi.fn(() => makeWindow().handle);
    let resolveCreate!: (request: AccessRequest) => void;
    const flow = createDirectConnectFlow(
      {
        createRequest: () =>
          new Promise<AccessRequest>((resolve) => {
            resolveCreate = resolve;
          }),
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow,
        browserPlatformPolicy: { current: () => "mobile" },
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    const start = flow.start();

    // Mobile must not create even a transient blank tab while DCR creation is
    // pending (the simulator treats that as a competing launch surface).
    expect(openApprovalWindow).not.toHaveBeenCalled();
    resolveCreate({
      ...REQUEST,
      mobileContinuationUrl: MOBILE_CONTINUATION_URL,
    });
    await start;

    // The URL is not launched automatically — the UI renders it as a primary
    // "Open Vana" link.
    expect(openApprovalWindow).not.toHaveBeenCalled();
    const state = flow.getState();
    expect(state.type).toBe("ready_to_open");
    if (state.type === "ready_to_open") {
      expect(state.mobileContinuationUrl).toBe(MOBILE_CONTINUATION_URL);
      expect(state.request.approvalUrl).toBe(REQUEST.approvalUrl);
    }
    // Polling continues in memory.
    expect(h.hasPending()).toBe(true);
  });

  it("treats touch-capable MacIntel Safari as mobile for the continuation URL", async () => {
    const h = makeHarness();
    const openApprovalWindow = vi.fn(() => makeWindow().handle);
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });

    try {
      const flow = createDirectConnectFlow(
        {
          createRequest: async () => ({
            ...REQUEST,
            mobileContinuationUrl: MOBILE_CONTINUATION_URL,
          }),
          getStatus: async () => pendingStatus(),
          readResult: vi.fn(),
        },
        {
          openApprovalWindow,
          now: h.now,
          setTimeoutFn: h.setTimeoutFn,
          clearTimeoutFn: h.clearTimeoutFn,
        },
      );

      await flow.start();

      expect(openApprovalWindow).not.toHaveBeenCalled();
      expect(flow.getState()).toMatchObject({
        type: "ready_to_open",
        mobileContinuationUrl: MOBILE_CONTINUATION_URL,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not open a popup on mobile light requests", async () => {
    const h = makeHarness();
    const openApprovalWindow = vi.fn(() => makeWindow().handle);
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow,
        browserPlatformPolicy: { current: () => "mobile" },
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();

    expect(openApprovalWindow).not.toHaveBeenCalled();
    expect(flow.getState()).toMatchObject({
      type: "awaiting_approval",
      popupBlocked: true,
      request: { approvalUrl: REQUEST.approvalUrl },
    });
  });

  it("keeps the desktop popup contract when the request carries a continuation URL", async () => {
    const h = makeHarness();
    const win = makeWindow();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => ({
          ...REQUEST,
          mobileContinuationUrl: MOBILE_CONTINUATION_URL,
        }),
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => win.handle,
        browserPlatformPolicy: { current: () => "desktop" },
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();

    // Desktop never uses the continuation URL: the popup is navigated to the
    // HTTPS approval URL exactly as in the pre-mobile contract.
    expect(win.navigate).toHaveBeenCalledWith(REQUEST.approvalUrl);
    expect(win.close).not.toHaveBeenCalled();
    expect(flow.getState()).toMatchObject({
      type: "awaiting_approval",
      popupBlocked: false,
    });
  });

  it("adopts a rotated continuation ticket from a pending status poll", async () => {
    const h = makeHarness();
    const rotated = "https://open-dev.vana.org/continue#ticket_rotated";
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => ({
          ...REQUEST,
          mobileContinuationUrl: MOBILE_CONTINUATION_URL,
        }),
        getStatus: async () => ({
          status: "pending",
          mobileContinuationUrl: rotated,
        }),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => null,
        browserPlatformPolicy: { current: () => "mobile" },
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    expect(flow.getState()).toMatchObject({
      type: "ready_to_open",
      mobileContinuationUrl: MOBILE_CONTINUATION_URL,
    });

    await h.tick();
    expect(flow.getState()).toMatchObject({
      type: "ready_to_open",
      mobileContinuationUrl: rotated,
    });
  });

  it("sanitizes a continuation URL from custom create and status transports", async () => {
    const h = makeHarness();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => ({
          ...REQUEST,
          mobileContinuationUrl: "vana-dev://continue?id=2",
        }),
        getStatus: async () => ({
          status: "pending",
          mobileContinuationUrl: "http://open.vana.org/continue#ticket_x",
        }),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => null,
        browserPlatformPolicy: { current: () => "mobile" },
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    // An invalid create URL means no mobile-deep destination: fall back to the
    // desktop/light awaiting_approval path with the manual approval URL.
    await flow.start();
    let state = flow.getState();
    expect(state.type).toBe("awaiting_approval");
    if (state.type === "awaiting_approval") {
      expect(state.request.mobileContinuationUrl).toBeUndefined();
    }

    // A subsequent invalid status URL is ignored; the flow keeps polling.
    await h.tick();
    expect(flow.getState().type).toBe("awaiting_approval");
  });

  it("errors on start when a mobile-deep request has already expired", async () => {
    const h = makeHarness();
    const getStatus = vi.fn(async () => pendingStatus());
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => ({
          ...REQUEST,
          mobileContinuationUrl: MOBILE_CONTINUATION_URL,
          expiresAt: new Date(-1).toISOString(),
        }),
        getStatus,
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => null,
        browserPlatformPolicy: { current: () => "mobile" },
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    const state = flow.getState();
    expect(state.type).toBe("error");
    if (state.type === "error") {
      expect(state.error.message).toMatch(/expired/);
    }
    expect(getStatus).not.toHaveBeenCalled();
    expect(h.hasPending()).toBe(false);
  });

  it("starts idle", () => {
    const flow = createDirectConnectFlow({
      createRequest: vi.fn(),
      getStatus: vi.fn(),
      readResult: vi.fn(),
    });
    expect(flow.getState().type).toBe("idle");
  });

  it("walks create -> awaiting_approval -> reading -> done", async () => {
    const h = makeHarness();
    const win = makeWindow();
    const openApprovalWindow = vi.fn(() => win.handle);
    const result: ApprovedDataResult = {
      scope: "icloud_notes.notes",
      data: [{ note: "hi" }],
    };

    const getStatus = vi
      .fn<(id: string) => Promise<AccessRequestStatus>>()
      .mockResolvedValueOnce(pendingStatus())
      .mockResolvedValueOnce(approvedStatus());

    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus,
        readResult: async () => result,
      },
      {
        openApprovalWindow,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    const states: string[] = [];
    flow.subscribe(() => states.push(flow.getState().type));

    await flow.start();
    const awaiting = flow.getState();
    expect(awaiting.type).toBe("awaiting_approval");
    if (awaiting.type === "awaiting_approval") {
      expect(awaiting.popupBlocked).toBe(false);
    }
    // The tab is opened with no args (synchronously, under the gesture) and
    // navigated to the approval URL only once createRequest has resolved.
    expect(openApprovalWindow).toHaveBeenCalledWith();
    expect(win.navigate).toHaveBeenCalledWith(REQUEST.approvalUrl);

    // First poll: still pending -> reschedules.
    await h.tick();
    expect(flow.getState().type).toBe("awaiting_approval");

    // Second poll: approved -> reads and finishes.
    await h.tick();
    const final = flow.getState();
    expect(final.type).toBe("done");
    if (final.type === "done") {
      expect(final.result).toEqual(result);
    }

    expect(states).toContain("creating");
    expect(states).toContain("reading");
    expect(states).toContain("done");
  });

  it("surfaces a createRequest failure as an error state", async () => {
    const flow = createDirectConnectFlow({
      createRequest: async () => {
        throw new Error("backend down");
      },
      getStatus: vi.fn(),
      readResult: vi.fn(),
    });

    await flow.start();
    const state = flow.getState();
    expect(state.type).toBe("error");
    if (state.type === "error") {
      expect(state.error.message).toBe("backend down");
    }
  });

  it("reads when status is ready_for_read", async () => {
    const h = makeHarness();
    const result: ApprovedDataResult = {
      scope: "icloud_notes.notes",
      data: [{ note: "hi" }],
    };
    const readResult = vi.fn(async () => result);
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => readyForReadStatus(),
        readResult,
      },
      {
        openApprovalWindow: () => makeWindow().handle,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    await h.tick();

    expect(readResult).toHaveBeenCalledWith("dcr_1");
    expect(flow.getState().type).toBe("done");
  });

  it("errors when the request is denied", async () => {
    const h = makeHarness();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => ({ status: "denied" }),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => makeWindow().handle,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    await h.tick();
    const state = flow.getState();
    expect(state.type).toBe("error");
    if (state.type === "error") {
      expect(state.error.message).toMatch(/denied/);
    }
  });

  it("errors when the request is already completed", async () => {
    const h = makeHarness();
    const readResult = vi.fn();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => ({ status: "completed" }),
        readResult,
      },
      {
        openApprovalWindow: () => makeWindow().handle,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    await h.tick();

    const state = flow.getState();
    expect(state.type).toBe("error");
    if (state.type === "error") {
      expect(state.error.message).toMatch(/completed/);
    }
    expect(readResult).not.toHaveBeenCalled();
    expect(h.hasPending()).toBe(false);
  });

  it("times out when approval never arrives", async () => {
    const h = makeHarness();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => makeWindow().handle,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
        timeoutMs: 1000,
      },
    );

    await flow.start();
    // Push the clock past the deadline, then let the poll observe it.
    h.advance(2000);
    await h.tick();

    const state = flow.getState();
    expect(state.type).toBe("error");
    if (state.type === "error") {
      expect(state.error.message).toMatch(/Timed out/);
    }
  });

  it("preserves the five-minute default when the request has no expiry", async () => {
    const h = makeHarness();
    const getStatus = vi.fn(async () => pendingStatus());
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus,
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => makeWindow().handle,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    h.advance(300_001);
    await h.tick();

    expect(flow.getState().type).toBe("error");
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("polls beyond five minutes when bounded by server expiry", async () => {
    const h = makeHarness();
    const request: AccessRequest = {
      ...REQUEST,
      expiresAt: new Date(3_600_000).toISOString(),
    };
    const result: ApprovedDataResult = {
      scope: "icloud_notes.notes",
      data: [],
    };
    const getStatus = vi
      .fn<(id: string) => Promise<AccessRequestStatus>>()
      .mockResolvedValueOnce(pendingStatus())
      .mockResolvedValueOnce(approvedStatus());
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => request,
        getStatus,
        readResult: async () => result,
      },
      {
        openApprovalWindow: () => makeWindow().handle,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    h.advance(300_001);
    await h.tick();
    expect(flow.getState().type).toBe("awaiting_approval");

    await h.tick();
    expect(flow.getState().type).toBe("done");
  });

  it("reset returns to idle and cancels polling", async () => {
    const h = makeHarness();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => makeWindow().handle,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    expect(h.hasPending()).toBe(true);
    flow.reset();
    expect(flow.getState().type).toBe("idle");
    expect(h.hasPending()).toBe(false);
  });

  it("ignores start() while already running", async () => {
    const h = makeHarness();
    const createRequest = vi.fn(async () => REQUEST);
    const flow = createDirectConnectFlow(
      {
        createRequest,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => makeWindow().handle,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    await flow.start();
    expect(createRequest).toHaveBeenCalledTimes(1);
  });

  it("opens the tab synchronously, before createRequest resolves (BUI-622)", async () => {
    const h = makeHarness();
    const win = makeWindow();
    const openApprovalWindow = vi.fn(() => win.handle);

    // createRequest stays pending until we resolve it by hand.
    let resolveCreate!: (req: AccessRequest) => void;
    const createRequest = vi.fn(
      () =>
        new Promise<AccessRequest>((res) => {
          resolveCreate = res;
        }),
    );

    const flow = createDirectConnectFlow(
      {
        createRequest,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    // Start the flow but do NOT await it: createRequest is still pending.
    const startPromise = flow.start();
    // The tab must already be open — synchronously, under the click gesture —
    // even though createRequest has not resolved. Opening it only after the
    // await is exactly the popup-blocker bug this regression guards against.
    expect(openApprovalWindow).toHaveBeenCalledTimes(1);
    expect(win.navigate).not.toHaveBeenCalled();

    resolveCreate(REQUEST);
    await startPromise;
    // Now that the URL is known, the already-open tab is navigated to it.
    expect(win.navigate).toHaveBeenCalledWith(REQUEST.approvalUrl);
  });

  it("surfaces popupBlocked when the popup is blocked, and still resolves via manual open", async () => {
    const h = makeHarness();
    const result: ApprovedDataResult = {
      scope: "icloud_notes.notes",
      data: [],
    };
    const getStatus = vi
      .fn<(id: string) => Promise<AccessRequestStatus>>()
      .mockResolvedValueOnce(pendingStatus())
      .mockResolvedValueOnce(approvedStatus());

    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus,
        readResult: async () => result,
      },
      {
        // Browser blocked the popup.
        openApprovalWindow: () => null,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    const awaiting = flow.getState();
    expect(awaiting.type).toBe("awaiting_approval");
    if (awaiting.type === "awaiting_approval") {
      expect(awaiting.popupBlocked).toBe(true);
      // The approval URL is still exposed so the UI can render a manual link.
      expect(awaiting.request.approvalUrl).toBe(REQUEST.approvalUrl);
    }

    // Polling keeps running, so a manual open + approval still drives to done
    // — never a perpetual silent pending poll.
    await h.tick();
    await h.tick();
    expect(flow.getState().type).toBe("done");
  });

  it("closes the un-navigated tab when createRequest fails", async () => {
    const win = makeWindow();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => {
          throw new Error("backend down");
        },
        getStatus: vi.fn(),
        readResult: vi.fn(),
      },
      { openApprovalWindow: () => win.handle },
    );

    await flow.start();
    expect(flow.getState().type).toBe("error");
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it("does not close the approval tab once it has been navigated", async () => {
    const h = makeHarness();
    const win = makeWindow();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow: () => win.handle,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    expect(win.navigate).toHaveBeenCalledWith(REQUEST.approvalUrl);
    // Reset after the tab was handed off must not yank the live approval tab.
    flow.reset();
    expect(win.close).not.toHaveBeenCalled();
  });

  it("a superseded run's late createRequest does not clobber the newer run", async () => {
    const h = makeHarness();
    const winA = makeWindow();
    const winB = makeWindow();
    // Hand out winA to the first run, winB to the second.
    const openApprovalWindow = vi
      .fn<() => typeof winA.handle>()
      .mockReturnValueOnce(winA.handle)
      .mockReturnValueOnce(winB.handle);

    // Run A's createRequest stays pending until we settle it by hand.
    let rejectA!: (err: Error) => void;
    const createRequest = vi
      .fn<() => Promise<AccessRequest>>()
      .mockImplementationOnce(
        () =>
          new Promise<AccessRequest>((_res, rej) => {
            rejectA = rej;
          }),
      )
      .mockImplementationOnce(async () => REQUEST);

    const flow = createDirectConnectFlow(
      {
        createRequest,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openApprovalWindow,
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    // Run A: opens winA, then parks on createRequest.
    const runA = flow.start();
    expect(openApprovalWindow).toHaveBeenCalledTimes(1);

    // Cancel A and immediately start B (opens winB, parks on its own request).
    flow.reset();
    const runB = flow.start();
    expect(openApprovalWindow).toHaveBeenCalledTimes(2);

    // Now A's request finally rejects — it must NOT close winB or set error.
    rejectA(new Error("backend down"));
    await runA;
    await runB;

    expect(winB.close).not.toHaveBeenCalled();
    // B is unaffected: it walked to awaiting_approval and navigated winB.
    const state = flow.getState();
    expect(state.type).toBe("awaiting_approval");
    expect(winB.navigate).toHaveBeenCalledWith(REQUEST.approvalUrl);
  });

  it("default opener opens blank, severs opener, sets no-referrer, then navigates", async () => {
    const h = makeHarness();
    const appended: Array<{ name?: string; content?: string }> = [];
    const head = { appendChild: (el: { name?: string }) => appended.push(el) };
    const fakeTab = {
      location: { href: "" },
      opener: {} as unknown,
      close: vi.fn(),
      document: {
        head,
        documentElement: head,
        createElement: () => ({}) as Record<string, unknown>,
      },
    };
    const open = vi.fn(() => fakeTab);
    vi.stubGlobal("window", { open });

    try {
      // No openApprovalWindow injected -> exercises the real default factory.
      const flow = createDirectConnectFlow(
        {
          createRequest: async () => REQUEST,
          getStatus: async () => pendingStatus(),
          readResult: vi.fn(),
        },
        {
          now: h.now,
          setTimeoutFn: h.setTimeoutFn,
          clearTimeoutFn: h.clearTimeoutFn,
        },
      );

      await flow.start();

      // Opened blank with exactly two args — no "noopener"/"noreferrer" feature
      // string, which would force window.open() to return null and lose the handle.
      expect(open).toHaveBeenCalledWith("", "_blank");
      expect(open.mock.calls[0]).toHaveLength(2);
      // Opener severed so the approval page can't reach back into the app.
      expect(fakeTab.opener).toBeNull();
      // A no-referrer meta was injected before navigation (restores the privacy
      // the old "noreferrer" feature gave).
      const meta = appended.find((el) => el.name === "referrer");
      expect(meta?.content).toBe("no-referrer");
      // And the already-open tab is navigated to the approval URL.
      expect(fakeTab.location.href).toBe(REQUEST.approvalUrl);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads a custom opener swapped in after the flow was created", async () => {
    const h = makeHarness();
    const winLate = makeWindow();
    const options: DirectConnectOptions = {
      now: h.now,
      setTimeoutFn: h.setTimeoutFn,
      clearTimeoutFn: h.clearTimeoutFn,
    };

    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      options,
    );

    // Swap the opener in AFTER construction — start() must read the latest.
    options.openApprovalWindow = () => winLate.handle;

    await flow.start();
    expect(winLate.navigate).toHaveBeenCalledWith(REQUEST.approvalUrl);
  });

  it("reads a browser platform policy swapped in after the flow was created", async () => {
    const h = makeHarness();
    const openApprovalWindow = vi.fn(() => makeWindow().handle);
    const options: DirectConnectOptions = {
      openApprovalWindow,
      browserPlatformPolicy: { current: () => "desktop" },
      now: h.now,
      setTimeoutFn: h.setTimeoutFn,
      clearTimeoutFn: h.clearTimeoutFn,
    };

    const flow = createDirectConnectFlow(
      {
        createRequest: async () => ({
          ...REQUEST,
          mobileContinuationUrl: MOBILE_CONTINUATION_URL,
        }),
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      options,
    );

    // A rerender forwards a new policy AFTER construction (the React hook reads
    // options through a ref); start() must take the mobile path, not the popup.
    options.browserPlatformPolicy = { current: () => "mobile" };

    await flow.start();
    expect(openApprovalWindow).not.toHaveBeenCalled();
    const state = flow.getState();
    expect(state.type).toBe("ready_to_open");
    if (state.type !== "ready_to_open") throw new Error("expected mobile path");
    expect(state.mobileContinuationUrl).toBe(MOBILE_CONTINUATION_URL);
  });
});
