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

it("uses the latest custom installed-app navigator after a rerender", async () => {
  const installedAppUrl = "vana-dev://continue?id=dcrcont_hook";
  const staleNavigator = vi.fn();
  const latestNavigator = vi.fn();
  const options = {
    createRequest: async () => ({
      requestId: "dcr_hook",
      approvalUrl: "https://app.vana.org/data-connection-requests/dcr_hook",
      appAddress: "0xapp",
      installedAppUrl,
    }),
    getStatus: async () => ({ status: "pending" as const }),
    readResult: vi.fn(),
    openApprovalWindow: () => null,
    browserPlatformPolicy: { current: () => "mobile" as const },
  };

  useDirectVanaConnect({ ...options, navigateInstalledApp: staleNavigator });
  beginRender();
  const connect = useDirectVanaConnect({
    ...options,
    navigateInstalledApp: latestNavigator,
  });

  connect.start();
  await vi.waitFor(() => {
    expect(connect.retryOpen()).toBe(true);
  });

  expect(latestNavigator).toHaveBeenCalledWith(installedAppUrl);
  expect(staleNavigator).not.toHaveBeenCalled();
  connect.reset();
});
