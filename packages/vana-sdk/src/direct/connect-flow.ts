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
import { normalizeMobileContinuationUrl } from "./types";

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

/** Browser class used only to choose the destination returned by Vana. */
export type DirectBrowserPlatform = "desktop" | "mobile";

/** Injectable browser-platform policy; it never asserts whether an app exists. */
export interface DirectBrowserPlatformPolicy {
  current(): DirectBrowserPlatform;
}

/** Tunables for the connect flow. */
export interface DirectConnectOptions {
  /** Status poll interval in ms. Defaults to 1500. */
  pollIntervalMs?: number;
  /**
   * Overall timeout in ms before giving up. Defaults to 300000 (5 min).
   * Used only when the access request does not carry an authoritative
   * `expiresAt` value.
   */
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
  /** SDK-owned mobile/desktop policy. Injectable for deterministic tests. */
  browserPlatformPolicy?: DirectBrowserPlatformPolicy;
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
 *
 * Desktop and light-data requests move through `"awaiting_approval"` (Vana Web
 * opens in a popup). A deep Direct request on a mobile browser moves through
 * `"ready_to_open"` instead: the SDK exposes a plain HTTPS
 * `mobileContinuationUrl` for the UI to render as a primary "Open Vana" link,
 * never launching it automatically, and keeps polling in memory.
 */
export type DirectConnectState<T = unknown> =
  | { type: "idle" }
  | { type: "creating" }
  | {
      type: "awaiting_approval";
      request: AccessRequest;
      /**
       * `true` when the popup was blocked. The UI should render the universal
       * HTTPS `request.approvalUrl` as a manual "Open approval" link.
       */
      popupBlocked: boolean;
    }
  | {
      type: "ready_to_open";
      request: AccessRequest;
      /**
       * Validated HTTPS continuation URL the mobile UI renders as the primary
       * "Open Vana" tap. Polling continues while it is shown; its embedded
       * ticket may rotate to a fresh URL between polls.
       */
      mobileContinuationUrl: string;
    }
  | { type: "reading"; request: AccessRequest }
  | { type: "done"; result: ApprovedDataResult<T> }
  | { type: "error"; error: Error };

/** Whether an explicit read retry reused consent or started fresh approval. */
export type DirectConnectRetryOutcome =
  | "retried_existing_grant"
  | "fresh_approval_required";

/** The store returned by {@link createDirectConnectFlow}. */
export interface DirectConnectFlow<T = unknown> {
  /** Current state. */
  getState(): DirectConnectState<T>;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Begin the flow. No-op if already running. */
  start(): Promise<void>;
  /**
   * Retry a failed read, reusing a still-live approved request when possible.
   *
   * @remarks
   * This explicit path avoids the observed double-approval symptom where
   * "Try that again" minted a new request after a transient read failure.
   * The return value tells callers whether existing consent was reused or a
   * fresh approval was required.
   */
  retryRead(): Promise<DirectConnectRetryOutcome>;
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

const MOBILE_USER_AGENT =
  /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i;

function defaultBrowserPlatformPolicy(): DirectBrowserPlatformPolicy {
  return {
    current() {
      if (typeof navigator === "undefined") return "desktop";
      const isTouchCapableIpad =
        navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      return MOBILE_USER_AGENT.test(navigator.userAgent) || isTouchCapableIpad
        ? "mobile"
        : "desktop";
    },
  };
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
  // `openApprovalWindow` and `browserPlatformPolicy` are resolved lazily at
  // start() (see below) so options swapped in after construction are still
  // honoured — matching the latest-callback pattern the React hook uses for its
  // transports.
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
  // Retained only after status proved this request had a read-ready grant.
  // A retry rechecks that status before trusting the prior consent.
  let approvedRequest: AccessRequest | null = null;
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
      state.type === "ready_to_open" ||
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

  function requestDeadline(request: AccessRequest): number {
    if (request.expiresAt !== undefined) {
      const expiresAt = Date.parse(request.expiresAt);
      if (Number.isFinite(expiresAt)) return expiresAt;
    }
    return now() + timeoutMs;
  }

  /**
   * Enter the polling loop from the given initial state (either
   * `awaiting_approval` for desktop/light or `ready_to_open` for mobile-deep).
   * Errors out immediately if the request has already expired.
   */
  function startPolling(
    request: AccessRequest,
    initialState: DirectConnectState<T>,
  ): void {
    setState(initialState);
    const deadline = requestDeadline(request);
    if (now() >= deadline) {
      running = false;
      setState({
        type: "error",
        error: new Error("Access request expired"),
      });
      return;
    }
    scheduleNextPoll(request, deadline);
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

    // A pending deep-mobile status may rotate the continuation ticket. Adopt a
    // fresh, still-valid URL so the rendered "Open Vana" link always points at a
    // live ticket; ignore it on the desktop/light path.
    if (status.status === "pending" && state.type === "ready_to_open") {
      const refreshed = normalizeMobileContinuationUrl(
        status.mobileContinuationUrl,
      );
      if (refreshed && refreshed !== state.mobileContinuationUrl) {
        request = { ...request, mobileContinuationUrl: refreshed };
        setState({
          type: "ready_to_open",
          request,
          mobileContinuationUrl: refreshed,
        });
      }
    }

    if (isReadReadyStatus(status.status)) {
      clearPoll();
      approvedRequest = request;
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

  const flow: DirectConnectFlow<T> = {
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
      // start() deliberately keeps its established first-run semantics: every
      // explicit start creates a request. Only retryRead() may reuse consent.
      approvedRequest = null;
      const runId = ++activeRunId;
      // Read the platform policy at start time, like openApprovalWindow below,
      // so a policy swapped in after construction (a React rerender forwards
      // options through a ref) still decides this run's destination.
      const browserPlatform = (
        options.browserPlatformPolicy ?? defaultBrowserPlatformPolicy()
      ).current();

      // Desktop preserves the pre-mobile synchronous popup contract: open a
      // blank tab while the click's transient activation is live, then navigate
      // it once createRequest returns the approval URL (BUI-622). Mobile never
      // creates that transient tab; deep requests expose one explicit HTTPS
      // link, while light requests retain the manual approvalUrl fallback.
      // Read the opener option at start time so a swapped-in custom opener is
      // still honored for desktop flows.
      const approvalWindow =
        browserPlatform === "desktop"
          ? (options.openApprovalWindow ?? defaultOpenApprovalWindow)()
          : null;
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
      // Re-validate the continuation URL at the SDK boundary (defense in depth
      // for custom transports that bypass the default client).
      request = {
        ...request,
        mobileContinuationUrl: normalizeMobileContinuationUrl(
          request.mobileContinuationUrl,
        ),
      };

      // The SDK owns only the small mobile-versus-desktop destination choice.
      // A deep Direct request on mobile carries a validated continuation URL;
      // desktop keeps its popup contract, while mobile light exposes the HTTPS
      // approval URL as the existing manual fallback without opening a tab.
      const mobileContinuationUrl =
        browserPlatform === "mobile"
          ? request.mobileContinuationUrl
          : undefined;

      if (mobileContinuationUrl) {
        // Do not auto-launch: DCR creation is async, so the original Connect
        // gesture can no longer be trusted to retain iOS user activation. Let
        // the UI render an explicit primary "Open Vana" link; polling continues
        // in this tab.
        startPolling(request, {
          type: "ready_to_open",
          request,
          mobileContinuationUrl,
        });
        return;
      }

      // Desktop/light: navigate the synchronously-opened tab to the HTTPS
      // approval URL. `approvalWindow === null` means the popup was blocked;
      // surface it so the UI renders request.approvalUrl as a visible manual
      // "Open approval" link instead of hanging. We poll either way, so a manual
      // open still resolves the flow, and the timeout still bounds the wait.
      if (approvalWindow) {
        approvalWindow.navigate(request.approvalUrl);
        // Hand the tab off to the user; we no longer own/close it.
        openedWindow = null;
      }
      startPolling(request, {
        type: "awaiting_approval",
        request,
        popupBlocked: approvalWindow === null,
      });
    },

    async retryRead(): Promise<DirectConnectRetryOutcome> {
      if (running || isRunningPhase()) {
        throw new Error(
          "Cannot retry a read while the connect flow is running",
        );
      }

      const request = approvedRequest;
      const parsedExpiry = request?.expiresAt
        ? Date.parse(request.expiresAt)
        : Number.NaN;
      const requestExpired =
        Number.isFinite(parsedExpiry) && now() >= parsedExpiry;

      if (request && !requestExpired) {
        running = true;
        const runId = ++activeRunId;
        let status: AccessRequestStatus;
        try {
          status = await transports.getStatus(request.requestId);
        } catch (err) {
          if (runId !== activeRunId) {
            throw new Error("Read retry was superseded");
          }
          running = false;
          const error = toError(err);
          setState({ type: "error", error });
          throw error;
        }
        if (runId !== activeRunId) {
          throw new Error("Read retry was superseded");
        }
        if (isReadReadyStatus(status.status)) {
          await readAndFinish(request);
          return "retried_existing_grant";
        }
        running = false;
      }

      approvedRequest = null;
      await flow.start();
      return "fresh_approval_required";
    },

    reset(): void {
      running = false;
      approvedRequest = null;
      // Invalidate any in-flight start() so a late createRequest can't clobber
      // a subsequent run.
      activeRunId++;
      clearPoll();
      closeUnnavigatedWindow();
      setState({ type: "idle" });
    },
  };

  return flow;
}
