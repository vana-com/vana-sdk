import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDirectConnectFlow,
  type DirectConnectSheetOptions,
  type DirectConnectTransports,
} from "./connect-flow";
import type {
  ConnectEvent,
  ConnectHandle,
  ConnectOpenOptions,
} from "../connect/launcher";
import type { RequestAuthorization } from "../connect/protocol";
import type { AccessRequest, AccessRequestStatus } from "./types";

const REQUEST: AccessRequest = {
  requestId: "dcr_1",
  approvalUrl: "https://app.vana.org/data-connection-requests/dcr_1?mode=page",
  appAddress: "0xapp",
};
const AUTHORIZATION: RequestAuthorization = {
  appAddress: `0x${"a".repeat(40)}`,
  signature: `0x${"b".repeat(130)}`,
  timestamp: "1767225600000",
};
const PENDING: AccessRequestStatus = { status: "pending" };
const APPROVED: AccessRequestStatus = {
  status: "approved",
  grantId: "0xgrant",
  personalServerUrl: "https://ps.example",
  scope: "spotify.savedTracks",
};

/** A stand-in for the launcher, driven by the test like the real sheet. */
function fakeSheet() {
  let options: ConnectOpenOptions | null = null;
  const handle = {
    close: vi.fn(() => options?.onEvent?.({ reason: "api", type: "close" })),
    setRequestStatus: vi.fn(),
    write: vi.fn(async () => true),
  } satisfies ConnectHandle;
  return {
    handle,
    open: vi.fn((next: ConnectOpenOptions) => {
      options = next;
      return handle;
    }),
    options: () => {
      if (!options) throw new Error("sheet not opened");
      return options;
    },
    emit: (event: ConnectEvent) => options?.onEvent?.(event),
  };
}

function setup(
  statuses: AccessRequestStatus[] = [APPROVED],
  sheetOverrides: Partial<DirectConnectSheetOptions> = {},
) {
  vi.useFakeTimers();
  const sheet = fakeSheet();
  const transports = {
    createRequest: vi.fn(async () => REQUEST),
    getStatus: vi.fn(async () => statuses.shift() ?? PENDING),
    readResult: vi.fn(async () => ({ scope: "spotify.savedTracks", data: 42 })),
    authorizeRequest: vi.fn(async () => AUTHORIZATION),
  } satisfies DirectConnectTransports<number>;
  const flow = createDirectConnectFlow<number>(transports, {
    presentation: "sheet",
    pollIntervalMs: 1000,
    sheet: {
      clientId: "lorebook",
      appName: "Lorebook",
      accountOrigin: "https://account-dev.vana.org",
      open: sheet.open,
      ...sheetOverrides,
    },
  });
  return { flow, sheet, transports };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createDirectConnectFlow with presentation: "sheet"', () => {
  it("opens Vana's sheet for the registered client and creates the request alongside it", async () => {
    const { flow, sheet, transports } = setup();

    await flow.start();

    expect(sheet.open).toHaveBeenCalledTimes(1);
    expect(sheet.options()).toMatchObject({
      appName: "Lorebook",
      clientId: "lorebook",
      vanaOrigin: "https://account-dev.vana.org",
    });
    expect(transports.createRequest).toHaveBeenCalledTimes(1);
    expect(flow.getState()).toEqual({
      type: "awaiting_approval",
      request: REQUEST,
      popupBlocked: false,
      sheet: { open: true },
    });
    flow.reset();
  });

  it("answers each of the sheet's asks with a fresh signature for the same request", async () => {
    const { flow, sheet, transports } = setup([]);
    await flow.start();

    await expect(sheet.options().getRequest()).resolves.toEqual({
      id: "dcr_1",
      authorization: AUTHORIZATION,
    });
    await sheet.options().getRequest();

    expect(transports.authorizeRequest).toHaveBeenCalledTimes(2);
    expect(transports.authorizeRequest).toHaveBeenCalledWith("dcr_1");
    expect(transports.createRequest).toHaveBeenCalledTimes(1);
    flow.reset();
  });

  it("answers an ask that arrives before the request exists with that same request", async () => {
    const { flow, sheet, transports } = setup([]);
    let resolveCreate: (request: AccessRequest) => void = () => undefined;
    transports.createRequest.mockImplementationOnce(
      () =>
        new Promise<AccessRequest>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const started = flow.start();
    await vi.waitFor(() => {
      expect(sheet.open).toHaveBeenCalled();
    });
    const asked = sheet.options().getRequest();
    expect(flow.getState().type).toBe("creating");
    resolveCreate(REQUEST);

    await expect(asked).resolves.toEqual({
      id: "dcr_1",
      authorization: AUTHORIZATION,
    });
    await started;
    expect(transports.createRequest).toHaveBeenCalledTimes(1);
    expect(flow.getState()).toMatchObject({
      type: "awaiting_approval",
      request: REQUEST,
    });
    flow.reset();
  });

  it("reads once approved, tells the sheet, and closes it after it shows the finish", async () => {
    const { flow, sheet, transports } = setup([
      { status: "pending" },
      APPROVED,
    ]);
    await flow.start();
    sheet.emit({
      completion: "in_browser",
      status: "approved",
      type: "connected",
    });
    expect(flow.getState()).toMatchObject({
      sheet: { completion: "in_browser", open: true },
    });

    await vi.advanceTimersByTimeAsync(2000);

    expect(transports.readResult).toHaveBeenCalledWith("dcr_1");
    expect(flow.getState()).toEqual({
      type: "done",
      result: { scope: "spotify.savedTracks", data: 42 },
    });
    expect(sheet.handle.setRequestStatus).toHaveBeenCalledWith("completed");
    expect(sheet.handle.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(sheet.handle.close).toHaveBeenCalledTimes(1);
    expect(flow.getState().type).toBe("done");
  });

  it("keeps the sheet open after the read when asked, so the app can write", async () => {
    const { flow, sheet } = setup([APPROVED], { closeAfterDoneMs: null });
    await flow.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(flow.getState().type).toBe("done");
    expect(sheet.handle.close).not.toHaveBeenCalled();
    await expect(flow.write("lorebook.notes", { a: 1 })).resolves.toBe(true);
    expect(sheet.handle.write).toHaveBeenCalledWith("lorebook.notes", { a: 1 });
  });

  it("returns to idle when the person closes the sheet before approving", async () => {
    const { flow, sheet, transports } = setup([]);
    await flow.start();

    sheet.emit({ reason: "scrim", type: "close" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(flow.getState()).toEqual({ type: "idle" });
    expect(transports.getStatus).not.toHaveBeenCalled();
    await expect(flow.write("lorebook.notes", {})).resolves.toBe(false);
  });

  it("keeps waiting for the data when the person closes the sheet after approving", async () => {
    const { flow, sheet, transports } = setup([
      { status: "pending" },
      APPROVED,
    ]);
    await flow.start();
    sheet.emit({
      completion: "in_browser",
      status: "approved",
      type: "connected",
    });

    sheet.emit({ reason: "drag", type: "close" });
    expect(flow.getState()).toMatchObject({
      type: "awaiting_approval",
      sheet: { open: false, completion: "in_browser" },
    });
    await vi.advanceTimersByTimeAsync(2000);

    expect(transports.readResult).toHaveBeenCalled();
    expect(flow.getState().type).toBe("done");
  });

  it.each([
    "frame_blocked",
    "origin_not_registered",
    "incompatible_version",
  ] as const)(
    "falls back to the approval link when the sheet reports %s",
    async (code) => {
      const { flow, sheet } = setup([]);
      await flow.start();

      sheet.emit({ code, type: "error" });

      expect(sheet.handle.close).toHaveBeenCalled();
      expect(flow.getState()).toEqual({
        type: "awaiting_approval",
        request: REQUEST,
        popupBlocked: true,
        sheetUnavailable: code,
      });
      flow.reset();
    },
  );

  it("leaves a failure the sheet shows on screen, then errors when the person closes it", async () => {
    const { flow, sheet } = setup([]);
    await flow.start();

    sheet.emit({ code: "personal_server_unsupported", type: "error" });
    expect(sheet.handle.close).not.toHaveBeenCalled();
    expect(flow.getState()).toMatchObject({
      sheet: { error: "personal_server_unsupported" },
    });

    sheet.emit({ reason: "sheet", type: "close" });
    const state = flow.getState();
    expect(state.type).toBe("error");
    if (state.type === "error") {
      expect(state.error.message).toContain("personal_server_unsupported");
    }
  });

  it("tells the sheet when the request is denied", async () => {
    const { flow, sheet } = setup([{ status: "denied" }]);
    await flow.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(sheet.handle.setRequestStatus).toHaveBeenCalledWith("denied");
    expect(flow.getState().type).toBe("error");
  });

  it("errors, and closes the sheet, when the backend cannot sign for it", async () => {
    const { flow, sheet } = setup([]);
    await flow.start();

    sheet.emit({ code: "request_failed", type: "error" });

    expect(sheet.handle.close).toHaveBeenCalled();
    expect(flow.getState().type).toBe("error");
  });

  it("errors when the request cannot be created", async () => {
    const { flow, sheet, transports } = setup();
    transports.createRequest.mockRejectedValueOnce(new Error("backend down"));

    await flow.start();

    expect(sheet.handle.close).toHaveBeenCalled();
    const state = flow.getState();
    expect(state.type === "error" && state.error.message).toBe("backend down");
  });

  it("closes the sheet on reset and ignores what it says afterwards", async () => {
    const { flow, sheet } = setup([]);
    await flow.start();

    flow.reset();
    sheet.emit({
      completion: "in_browser",
      status: "approved",
      type: "connected",
    });

    expect(sheet.handle.close).toHaveBeenCalledTimes(1);
    expect(flow.getState()).toEqual({ type: "idle" });
  });

  it("loads sheet settings at start", async () => {
    vi.useFakeTimers();
    const sheet = fakeSheet();
    const loader = vi.fn(async () => ({
      clientId: "lorebook",
      appName: "Lorebook",
      open: sheet.open,
    }));
    const flow = createDirectConnectFlow(
      {
        createRequest: async () => REQUEST,
        getStatus: async () => ({ status: "pending" }),
        readResult: vi.fn(),
        authorizeRequest: async () => AUTHORIZATION,
      },
      { presentation: "sheet", sheet: loader },
    );

    await flow.start();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(sheet.open).toHaveBeenCalledTimes(1);
    flow.reset();
  });

  it("refuses to start without a way to sign for the sheet", async () => {
    const flow = createDirectConnectFlow(
      {
        createRequest: vi.fn(async () => REQUEST),
        getStatus: vi.fn(),
        readResult: vi.fn(),
      },
      {
        presentation: "sheet",
        sheet: { clientId: "x", appName: "X", open: vi.fn() },
      },
    );

    await flow.start();

    const state = flow.getState();
    expect(state.type === "error" && state.error.message).toMatch(
      /authorizeRequest/,
    );
  });
});
