import { describe, it, expect, vi } from "vitest";
import { createDirectConnectFlow } from "./connect-flow";
import type {
  AccessRequest,
  AccessRequestStatus,
  ApprovedDataResult,
} from "./types";

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
    const openWindow = vi.fn(() => win.handle);
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
        openWindow,
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
    expect(openWindow).toHaveBeenCalledWith();
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
        openWindow: () => makeWindow().handle,
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
        openWindow: () => makeWindow().handle,
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

  it("times out when approval never arrives", async () => {
    const h = makeHarness();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openWindow: () => makeWindow().handle,
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

  it("reset returns to idle and cancels polling", async () => {
    const h = makeHarness();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => pendingStatus(),
        readResult: vi.fn(),
      },
      {
        openWindow: () => makeWindow().handle,
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
        openWindow: () => makeWindow().handle,
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
    const openWindow = vi.fn(() => win.handle);

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
        openWindow,
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
    expect(openWindow).toHaveBeenCalledTimes(1);
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
        openWindow: () => null,
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
      { openWindow: () => win.handle },
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
        openWindow: () => win.handle,
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
});
