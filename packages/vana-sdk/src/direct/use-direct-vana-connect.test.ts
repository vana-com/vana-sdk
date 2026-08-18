import { beforeEach, expect, it, vi } from "vitest";

const hookState = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>,
  memos: [] as unknown[],
  refCursor: 0,
  memoCursor: 0,
}));

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => {
    const index = hookState.memoCursor++;
    if (index === hookState.memos.length) {
      hookState.memos.push(factory());
    }
    return hookState.memos[index];
  },
  useRef: (value: unknown) => {
    const index = hookState.refCursor++;
    if (index === hookState.refs.length) {
      hookState.refs.push({ current: value });
    }
    return hookState.refs[index];
  },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
    getSnapshot(),
}));

import { useDirectVanaConnect } from "./use-direct-vana-connect";

function beginRender(): void {
  hookState.refCursor = 0;
  hookState.memoCursor = 0;
}

beforeEach(() => {
  hookState.refs = [];
  hookState.memos = [];
  beginRender();
});

it("uses the latest transports after a rerender and exposes ready_to_open on mobile", async () => {
  const mobileContinuationUrl =
    "https://open-dev.vana.org/continue#ticket_hook";
  const staleCreate = vi.fn(async () => ({
    requestId: "dcr_stale",
    approvalUrl: "https://app.vana.org/data-connection-requests/dcr_stale",
    appAddress: "0xapp",
    mobileContinuationUrl,
  }));
  const latestCreate = vi.fn(async () => ({
    requestId: "dcr_hook",
    approvalUrl: "https://app.vana.org/data-connection-requests/dcr_hook",
    appAddress: "0xapp",
    mobileContinuationUrl,
  }));
  const options = {
    getStatus: async () => ({ status: "pending" as const }),
    readResult: vi.fn(),
    openApprovalWindow: () => null,
    browserPlatformPolicy: { current: () => "mobile" as const },
  };

  useDirectVanaConnect({ ...options, createRequest: staleCreate });
  beginRender();
  const connect = useDirectVanaConnect({
    ...options,
    createRequest: latestCreate,
  });

  // The hook returns only the smaller start/reset/state surface.
  expect(Object.keys(connect).sort()).toEqual(["reset", "start", "state"]);

  connect.start();
  // The mocked useSyncExternalStore snapshots state at render time, so re-render
  // to observe the flow advancing to the mobile-deep ready_to_open state.
  let rerendered = connect;
  await vi.waitFor(() => {
    beginRender();
    rerendered = useDirectVanaConnect({
      ...options,
      createRequest: latestCreate,
    });
    expect(rerendered.state.type).toBe("ready_to_open");
  });

  expect(latestCreate).toHaveBeenCalledTimes(1);
  expect(staleCreate).not.toHaveBeenCalled();
  if (rerendered.state.type === "ready_to_open") {
    expect(rerendered.state.mobileContinuationUrl).toBe(mobileContinuationUrl);
  }
  rerendered.reset();
});
