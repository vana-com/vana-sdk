/**
 * React hook for the browser side of the direct Data Portability flow.
 *
 * @remarks
 * `useDirectVanaConnect` is a thin `useSyncExternalStore` binding over the
 * framework-agnostic {@link createDirectConnectFlow} store. The browser never
 * sees the app private key and never chooses scopes — it only calls the app's
 * own backend routes via the injected transports.
 *
 * This module is browser-safe and imports nothing Node-only. `react` is a peer
 * dependency.
 *
 * @category Direct
 * @module direct/use-direct-vana-connect
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import {
  createDirectConnectFlow,
  type DirectConnectOptions,
  type DirectConnectState,
  type DirectConnectTransports,
} from "./connect-flow";

/** Options for {@link useDirectVanaConnect}: transports plus flow tunables. */
export type UseDirectVanaConnectOptions<T = unknown> =
  DirectConnectTransports<T> & DirectConnectOptions;

/** Return value of {@link useDirectVanaConnect}. */
export interface UseDirectVanaConnectResult<T = unknown> {
  /** Current flow state (`state.type` is `"idle"` until `start()` is called). */
  state: DirectConnectState<T>;
  /** Begin the connect flow (create request, open Vana, poll, read). */
  start: () => void;
  /** Reset back to `idle` and cancel any in-flight polling. */
  reset: () => void;
}

/**
 * Drive the two-tab connect flow from a React component.
 *
 * @param options - The `createRequest`/`getStatus`/`readResult` transports plus
 * optional polling/timeout tunables.
 * @returns `{ state, start, reset }`.
 *
 * @example
 * ```tsx
 * const connect = useDirectVanaConnect({
 *   createRequest: () => fetch("/api/vana/request", { method: "POST" }).then((r) => r.json()),
 *   getStatus: (id) => fetch(`/api/vana/status?requestId=${id}`).then((r) => r.json()),
 *   readResult: (id) => fetch(`/api/vana/data?requestId=${id}`).then((r) => r.json()),
 * });
 * return <button disabled={connect.state.type !== "idle"} onClick={connect.start}>Connect</button>;
 * ```
 */
export function useDirectVanaConnect<T = unknown>(
  options: UseDirectVanaConnectOptions<T>,
): UseDirectVanaConnectResult<T> {
  // Keep the latest options in a ref so the store reads current callbacks
  // without being recreated on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const flow = useMemo(
    () =>
      createDirectConnectFlow<T>(
        {
          createRequest: () => optionsRef.current.createRequest(),
          getStatus: (id) => optionsRef.current.getStatus(id),
          readResult: (id) => optionsRef.current.readResult(id),
        },
        {
          get pollIntervalMs() {
            return optionsRef.current.pollIntervalMs;
          },
          get timeoutMs() {
            return optionsRef.current.timeoutMs;
          },
          get openWindow() {
            return optionsRef.current.openWindow;
          },
        },
      ),
    // Created once per component instance; callbacks are read via optionsRef.
    [],
  );

  const state = useSyncExternalStore(
    flow.subscribe,
    flow.getState,
    flow.getState,
  );

  const start = useCallback(() => {
    void flow.start();
  }, [flow]);

  const reset = useCallback(() => {
    flow.reset();
  }, [flow]);

  return { state, start, reset };
}
