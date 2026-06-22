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

/** Tunables for the connect flow. */
export interface DirectConnectOptions {
  /** Status poll interval in ms. Defaults to 1500. */
  pollIntervalMs?: number;
  /** Overall timeout in ms before giving up. Defaults to 300000 (5 min). */
  timeoutMs?: number;
  /** Opens the approval URL. Defaults to `window.open`. Injectable for tests. */
  openWindow?: (url: string) => void;
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
  | { type: "awaiting_approval"; request: AccessRequest }
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
  const openWindow =
    options.openWindow ??
    ((url: string) => {
      if (typeof window !== "undefined" && window.open) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
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

    if (status.status === "approved") {
      clearPoll();
      await readAndFinish(request);
      return;
    }
    if (status.status === "denied" || status.status === "expired") {
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
      setState({ type: "creating" });

      let request: AccessRequest;
      try {
        request = await transports.createRequest();
      } catch (err) {
        running = false;
        setState({ type: "error", error: toError(err) });
        return;
      }
      if (!running) return;

      setState({ type: "awaiting_approval", request });
      openWindow(request.approvalUrl);

      const deadline = now() + timeoutMs;
      scheduleNextPoll(request, deadline);
    },

    reset(): void {
      running = false;
      clearPoll();
      setState({ type: "idle" });
    },
  };
}
