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
    const openWindow = vi.fn();
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
    expect(flow.getState().type).toBe("awaiting_approval");
    expect(openWindow).toHaveBeenCalledWith(REQUEST.approvalUrl);

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

  it("errors when the request is denied", async () => {
    const h = makeHarness();
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => ({ status: "denied" }),
        readResult: vi.fn(),
      },
      {
        openWindow: vi.fn(),
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
        openWindow: vi.fn(),
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
        openWindow: vi.fn(),
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
        openWindow: vi.fn(),
        now: h.now,
        setTimeoutFn: h.setTimeoutFn,
        clearTimeoutFn: h.clearTimeoutFn,
      },
    );

    await flow.start();
    await flow.start();
    expect(createRequest).toHaveBeenCalledTimes(1);
  });
});
