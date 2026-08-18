import { expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useRef: (value: unknown) => ({ current: value }),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
    getSnapshot(),
}));

import { useDirectVanaConnect } from "./use-direct-vana-connect";

it("forwards custom installed-app navigation through the React hook", async () => {
  const installedAppUrl = "vana-dev://continue?id=dcrcont_hook";
  const navigateInstalledApp = vi.fn();
  const connect = useDirectVanaConnect({
    createRequest: async () => ({
      requestId: "dcr_hook",
      approvalUrl: "https://app.vana.org/data-connection-requests/dcr_hook",
      appAddress: "0xapp",
      installedAppUrl,
    }),
    getStatus: async () => ({ status: "pending" }),
    readResult: vi.fn(),
    openApprovalWindow: () => null,
    browserPlatformPolicy: { current: () => "mobile" },
    navigateInstalledApp,
  });

  connect.start();
  await vi.waitFor(() => {
    expect(connect.retryOpen()).toBe(true);
  });

  expect(navigateInstalledApp).toHaveBeenCalledWith(installedAppUrl);
  connect.reset();
});
