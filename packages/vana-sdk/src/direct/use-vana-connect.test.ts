import { beforeEach, expect, it, vi } from "vitest";

const hookState = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void>,
}));

// Minimal render model: each hook call takes the next slot; effects run when
// the test calls `flushEffects`.
vi.mock("react", () => {
  const slot = <T>(init: () => T): { index: number; value: T } => {
    const index = hookState.cursor++;
    if (index === hookState.slots.length) hookState.slots.push(init());
    return { index, value: hookState.slots[index] as T };
  };
  return {
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => slot(factory).value,
    useRef: (value: unknown) => slot(() => ({ current: value })).value,
    useState: (initial: unknown) => {
      const { index, value } = slot(() => initial);
      return [
        value,
        (next: unknown) => {
          hookState.slots[index] = next;
        },
      ];
    },
    useEffect: (effect: () => void) => {
      slot(() => null);
      hookState.effects.push(effect);
    },
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
      getSnapshot(),
  };
});

import { useVanaConnect } from "./use-vana-connect";
import type { ConnectHandle, ConnectOpenOptions } from "../connect/launcher";

function render<T>(hook: () => T): T {
  hookState.cursor = 0;
  hookState.effects = [];
  return hook();
}

async function flushEffects(): Promise<void> {
  for (const effect of hookState.effects) effect();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function backend(clientId: string | null) {
  return vi.fn(async (url: string) => {
    const body = url.endsWith("/config")
      ? {
          protocolVersion: 1,
          env: "dev",
          clientId,
          appName: "Example App",
          accountOrigin: "https://account-dev.vana.org",
        }
      : url.endsWith("/request")
        ? {
            request: {
              requestId: "dcr_1",
              approvalUrl:
                "https://app-dev.vana.org/data-connection-requests/dcr_1",
              appAddress: "0xapp",
            },
            embed: null,
          }
        : { status: "pending" };
    return new Response(JSON.stringify(body));
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  hookState.slots = [];
});

it("opens the sheet with what the backend's config reports", async () => {
  const open = vi.fn(
    (_options: ConnectOpenOptions): ConnectHandle => ({
      close: vi.fn(),
      setRequestStatus: vi.fn(),
    }),
  );
  const options = { fetch: backend("example-app"), sheet: { open } };

  render(() => useVanaConnect(options));
  await flushEffects();
  const connect = render(() => useVanaConnect(options));
  expect(connect.config?.clientId).toBe("example-app");

  connect.start();
  await vi.waitFor(() => {
    expect(open).toHaveBeenCalledTimes(1);
  });
  expect(open.mock.calls[0][0]).toMatchObject({
    clientId: "example-app",
    appName: "Example App",
    vanaOrigin: "https://account-dev.vana.org",
  });
  connect.reset();
});

it("uses the tab when the backend has no sheet client id", async () => {
  const open = vi.fn();
  const options = {
    fetch: backend(null),
    sheet: { open },
    openApprovalWindow: () => null,
    browserPlatformPolicy: { current: () => "desktop" as const },
  };

  render(() => useVanaConnect(options));
  await flushEffects();
  const connect = render(() => useVanaConnect(options));
  connect.start();

  await vi.waitFor(() => {
    const state = render(() => useVanaConnect(options)).state;
    expect(state).toMatchObject({
      type: "awaiting_approval",
      popupBlocked: true,
    });
  });
  expect(open).not.toHaveBeenCalled();
  connect.reset();
});
