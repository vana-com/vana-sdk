/**
 * Framework-agnostic connect-flow state machine for the browser two-tab helper.
 *
 * @remarks
 * This is the testable core behind {@link useDirectVanaConnect}. It is pure
 * TypeScript (no React, no DOM-only APIs beyond an injectable window opener and
 * timers) so the full flow — create request, open Vana, poll status, read data —
 * can be exercised in a Node test environment.
 *
 * The React hook is a thin `useSyncExternalStore` binding over this store.
 *
 * @category Direct
 * @module direct/connect-flow
 */

import type {
  AccessRequest,
  AccessRequestStatus,
  AccessRequestStatusValue,
  ApprovedDataResult,
} from "./types";

/**
 * Caller-supplied transports. These typically `fetch` the app's own backend
 * routes, which in turn delegate to a {@link DirectDataController}.
 */
export interface DirectConnectTransports<T = unknown> {
  /** Ask the backend to create an access request. */
  createRequest: () => Promise<AccessRequest>;
  /** Ask the backend for the current status of a request. */
  getStatus: (requestId: string) => Promise<AccessRequestStatus>;
  /** Ask the backend to read the approved data. */
  readResult: (requestId: string) => Promise<ApprovedDataResult<T>>;
}

/**
 * A handle to a tab opened synchronously under the user's click gesture.
 *
 * @remarks
 * The flow opens this tab *before* it knows the approval URL (popup blockers
 * only allow `window.open()` during the click's transient activation), then
 * navigates it once `createRequest` resolves.
 */
export interface ConnectWindow {
  /** Point the already-open tab at the approval URL. */
  navigate(url: string): void;
  /** Close the tab (used to clean up an un-navigated tab on failure/reset). */
  close(): void;
}

/** Tunables for the connect flow. */
export interface DirectConnectOptions {
  /** Status poll interval in ms. Defaults to 1500. */
  pollIntervalMs?: number;
  /** Overall timeout in ms before giving up. Defaults to 300000 (5 min). */
  timeoutMs?: number;
  /**
   * Synchronously open a blank tab under the click's transient activation and
   * return a handle to navigate later, or `null` if the browser blocked it.
   * Defaults to `window.open("", "_blank")` (with `opener` severed). Injectable
   * for tests.
   *
   * @remarks
   * Renamed from the pre-3.8 `openWindow?: (url) => void`. The old contract was
   * the BUI-622 bug itself (it was called with the URL *after* an `await`, so
   * the popup blocker suppressed it); it cannot be preserved while fixing the
   * bug. Custom openers must now open synchronously and return a navigable
   * handle.
   */
  openApprovalWindow?: () => ConnectWindow | null;
  /** `setTimeout`. Injectable for tests. Defaults to `globalThis.setTimeout`. */
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  /** `clearTimeout`. Injectable for tests. Defaults to `globalThis.clearTimeout`. */
  clearTimeoutFn?: (handle: unknown) => void;
  /** Clock source in ms. Injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Discriminated connect-flow state.
 *
 * @remarks
 * `type` matches the builder guide: it starts at `"idle"` and is non-idle while
 * connecting. The intermediate phases give richer UIs something to render.
 */
export type DirectConnectState<T = unknown> =
  | { type: "idle" }
  | { type: "creating" }
  | {
      type: "awaiting_approval";
      request: AccessRequest;
      /**
       * `true` when the browser blocked the approval popup. The UI should
       * render `request.approvalUrl` as a visible "Open approval" link so the
       * user can open it manually instead of the flow silently hanging.
       */
      popupBlocked: boolean;
    }
  | { type: "reading"; request: AccessRequest }
  | { type: "done"; result: ApprovedDataResult<T> }
  | { type: "error"; error: Error };

/** The store returned by {@link createDirectConnectFlow}. */
export interface DirectConnectFlow<T = unknown> {
  /** Current state. */
  getState(): DirectConnectState<T>;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Begin the flow. No-op if already running. */
  start(): Promise<void>;
  /** Reset to `idle` and stop any in-flight polling. */
  reset(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 300_000;

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function isReadReadyStatus(status: AccessRequestStatusValue): boolean {
  return status === "approved" || status === "ready_for_read";
}

/**
 * Default {@link DirectConnectOptions.openApprovalWindow}: open a blank tab
 * synchronously (inside the click gesture) and return a handle to navigate
 * once the approval URL is known. Returns `null` when blocked or non-DOM.
 */
function defaultOpenApprovalWindow(): ConnectWindow | null {
  if (typeof window === "undefined" || !window.open) return null;
  // We can't pass the "noopener"/"noreferrer" feature string here: it makes
  // window.open() return null, which would throw away the handle we need to
  // navigate later. So we open plain and re-create both protections by hand.
  const opened = window.open("", "_blank");
  if (!opened) return null;
  // Sever the opener link while the tab is still about:blank, so the approval
  // page can't reach back into the app (reverse tab-nabbing).
  try {
    opened.opener = null;
  } catch {
    // Some environments make `opener` read-only; best-effort only.
  }
  return {
    navigate(url: string) {
      // Restore the no-referrer protection the old "noreferrer" feature gave:
      // tag the blank document so the upcoming navigation sends no Referer to
      // the approval page (best-effort; the blank doc is same-origin here).
      try {
        const meta = opened.document.createElement("meta");
        meta.name = "referrer";
        meta.content = "no-referrer";
        (opened.document.head ?? opened.document.documentElement)?.appendChild(
          meta,
        );
      } catch {
        // Cross-origin/unavailable document: skip, navigation still proceeds.
      }
      opened.location.href = url;
    },
    close() {
      opened.close();
    },
  };
}

/**
 * Create a connect-flow store.
 *
 * @param transports - Backend transports (`createRequest`, `getStatus`, `readResult`).
 * @param options - Polling/timeout tunables and injectable side effects.
 * @returns A {@link DirectConnectFlow} store.
 */
export function createDirectConnectFlow<T = unknown>(
  transports: DirectConnectTransports<T>,
  options: DirectConnectOptions = {},
): DirectConnectFlow<T> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Resolved lazily at start() (see below) so a custom opener swapped in after
  // construction is still honoured — matching the latest-callback pattern the
  // React hook uses for its transports.
  const setTimeoutFn =
    options.setTimeoutFn ??
    ((cb: () => void, ms: number) => globalThis.setTimeout(cb, ms));
  const clearTimeoutFn =
    options.clearTimeoutFn ??
    ((handle: unknown) => {
      globalThis.clearTimeout(handle as never);
    });
  const now = options.now ?? (() => Date.now());

  let state: DirectConnectState<T> = { type: "idle" };
  const listeners = new Set<() => void>();
  let pollHandle: unknown = null;
  let running = false;
  // Monotonic id for the current start() invocation. reset() (and an
  // immediately following start()) bumps it, so a previous run whose async
  // createRequest is still in flight can detect it has been superseded and
  // avoid touching shared state / the newer run's tab.
  let activeRunId = 0;
  // Holds the tab we opened only while it is still blank (un-navigated). Once
  // navigated to the approval URL we drop the reference so reset/cleanup never
  // closes the live approval tab the user is interacting with.
  let openedWindow: ConnectWindow | null = null;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function setState(next: DirectConnectState<T>): void {
    state = next;
    emit();
  }

  function clearPoll(): void {
    if (pollHandle !== null) {
      clearTimeoutFn(pollHandle);
      pollHandle = null;
    }
  }

  /** Close the opened tab if it is still blank (never navigated). */
  function closeUnnavigatedWindow(): void {
    if (openedWindow) {
      openedWindow.close();
      openedWindow = null;
    }
  }

  function isRunningPhase(): boolean {
    return (
      state.type === "creating" ||
      state.type === "awaiting_approval" ||
      state.type === "reading"
    );
  }

  async function readAndFinish(request: AccessRequest): Promise<void> {
    setState({ type: "reading", request });
    try {
      const result = await transports.readResult(request.requestId);
      if (!running) return;
      setState({ type: "done", result });
    } catch (err) {
      if (!running) return;
      setState({ type: "error", error: toError(err) });
    } finally {
      running = false;
    }
  }

  function scheduleNextPoll(request: AccessRequest, deadline: number): void {
    pollHandle = setTimeoutFn(() => {
      void poll(request, deadline);
    }, pollIntervalMs);
  }

  async function poll(request: AccessRequest, deadline: number): Promise<void> {
    if (!running) return;
    if (now() >= deadline) {
      running = false;
      setState({
        type: "error",
        error: new Error("Timed out waiting for approval"),
      });
      return;
    }
    let status: AccessRequestStatus;
    try {
      status = await transports.getStatus(request.requestId);
    } catch (err) {
      if (!running) return;
      running = false;
      setState({ type: "error", error: toError(err) });
      return;
    }
    if (!running) return;

    if (isReadReadyStatus(status.status)) {
      clearPoll();
      await readAndFinish(request);
      return;
    }
    if (
      status.status === "completed" ||
      status.status === "denied" ||
      status.status === "expired"
    ) {
      running = false;
      setState({
        type: "error",
        error: new Error(`Access request ${status.status}`),
      });
      return;
    }
    scheduleNextPoll(request, deadline);
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async start(): Promise<void> {
      if (running || isRunningPhase()) return;
      running = true;
      const runId = ++activeRunId;

      // Open the approval tab *synchronously*, while the click's transient
      // activation is still live. The approval URL isn't known yet (it comes
      // from createRequest below), so open a blank tab now and navigate it
      // once the URL arrives. Opening *after* the await — as this flow used to
      // — runs outside the gesture, so the browser suppresses it as an
      // unsolicited popup and the flow stalls forever (BUI-622).
      // Read the opener option *now* (not at construction) so a custom opener
      // swapped in after the flow was created is still used.
      const openApprovalWindow =
        options.openApprovalWindow ?? defaultOpenApprovalWindow;
      const approvalWindow = openApprovalWindow();
      openedWindow = approvalWindow;

      setState({ type: "creating" });

      let request: AccessRequest;
      try {
        request = await transports.createRequest();
      } catch (err) {
        // If we were superseded (reset, possibly + a newer start()) while this
        // request was in flight, only clean up our own tab — never the shared
        // state or the newer run's window.
        if (runId !== activeRunId) {
          approvalWindow?.close();
          return;
        }
        running = false;
        closeUnnavigatedWindow();
        setState({ type: "error", error: toError(err) });
        return;
      }
      if (runId !== activeRunId) {
        approvalWindow?.close();
        return;
      }

      if (approvalWindow) {
        approvalWindow.navigate(request.approvalUrl);
        // Hand the tab off to the user; we no longer own/close it.
        openedWindow = null;
      }
      // `approvalWindow === null` means the popup was blocked. Surface it so
      // the UI renders request.approvalUrl as a visible "Open approval" link
      // instead of hanging. We poll either way, so a manual open still
      // resolves the flow, and the timeout still bounds the wait.
      setState({
        type: "awaiting_approval",
        request,
        popupBlocked: approvalWindow === null,
      });

      const deadline = now() + timeoutMs;
      scheduleNextPoll(request, deadline);
    },

    reset(): void {
      running = false;
      // Invalidate any in-flight start() so a late createRequest can't clobber
      // a subsequent run.
      activeRunId++;
      clearPoll();
      closeUnnavigatedWindow();
      setState({ type: "idle" });
    },
  };
}
