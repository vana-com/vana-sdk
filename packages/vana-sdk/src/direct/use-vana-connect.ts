/**
 * `useVanaConnect`: the connect flow against a `createVanaConnectHandler`
 * backend, with no transports to write.
 *
 * @remarks
 * A thin layer over {@link useDirectVanaConnect}: it builds the HTTP
 * transports for `endpoint` and, for `presentation: "sheet"` (the default),
 * reads the sheet's client id, app name and Vana Account origin from
 * `GET {endpoint}/config`. When the backend has no sheet client id, it uses
 * the tab presentation.
 *
 * @category Direct
 * @module direct/use-vana-connect
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createVanaConnectTransports,
  type VanaConnectConfig,
  type VanaConnectTransports,
} from "../connect/http-transports";
import type {
  DirectConnectOptions,
  DirectConnectPresentation,
  DirectConnectSheetOptions,
  DirectConnectTransports,
} from "./connect-flow";
import {
  useDirectVanaConnect,
  type UseDirectVanaConnectResult,
} from "./use-direct-vana-connect";

/** Options for {@link useVanaConnect}. */
export interface UseVanaConnectOptions<T = unknown> extends Omit<
  DirectConnectOptions,
  "presentation" | "sheet"
> {
  /** Base path of the handler's routes. Defaults to `"/api/vana"`. */
  endpoint?: string;
  /** Defaults to `"sheet"`; uses `"tab"` when the backend has no client id. */
  presentation?: DirectConnectPresentation;
  /** Overrides for what `GET config` reports, plus sheet tunables. */
  sheet?: Partial<DirectConnectSheetOptions>;
  /** Replace individual transports (for example a custom read). */
  transports?: Partial<DirectConnectTransports<T>>;
  /** `fetch` for the default transports. */
  fetch?: typeof fetch;
}

/** Return value of {@link useVanaConnect}. */
export interface UseVanaConnectResult<
  T = unknown,
> extends UseDirectVanaConnectResult<T> {
  /** The backend's config once loaded, else `null`. */
  config: VanaConnectConfig | null;
}

function sheetFromConfig(
  config: VanaConnectConfig,
  overrides: Partial<DirectConnectSheetOptions> | undefined,
): DirectConnectSheetOptions {
  const clientId = overrides?.clientId ?? config.clientId;
  if (!clientId) {
    throw new Error(
      "The Vana connect backend has no sheet clientId; pass clientId to createVanaConnectHandler",
    );
  }
  return {
    ...overrides,
    clientId,
    appName: overrides?.appName ?? config.appName,
    accountOrigin: overrides?.accountOrigin ?? config.accountOrigin,
  };
}

/**
 * Connect with Vana from a React component, against the routes
 * `createVanaConnectHandler` serves.
 *
 * @example
 * ```tsx
 * "use client";
 * import { useVanaConnect } from "@opendatalabs/vana-sdk/react";
 *
 * export function ConnectButton() {
 *   const { state, start } = useVanaConnect<MyData>({ endpoint: "/api/vana" });
 *   if (state.type === "done") return <pre>{JSON.stringify(state.result.data)}</pre>;
 *   return (
 *     <button disabled={state.type !== "idle" && state.type !== "error"} onClick={start}>
 *       Connect with Vana
 *     </button>
 *   );
 * }
 * ```
 *
 * @param options - Endpoint, presentation and flow tunables.
 * @returns The flow state and actions, plus the loaded backend config.
 */
export function useVanaConnect<T = unknown>(
  options: UseVanaConnectOptions<T> = {},
): UseVanaConnectResult<T> {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const http = useMemo<VanaConnectTransports<T>>(
    () =>
      createVanaConnectTransports<T>({
        endpoint: options.endpoint,
        fetch: options.fetch,
      }),
    [options.endpoint, options.fetch],
  );
  const [config, setConfig] = useState<VanaConnectConfig | null>(null);
  const wantsSheet = (options.presentation ?? "sheet") === "sheet";

  useEffect(() => {
    if (!wantsSheet) return;
    let live = true;
    http.getConfig().then(
      (loaded) => {
        if (live) setConfig(loaded);
      },
      () => {
        // Retried by the sheet loader at start().
      },
    );
    return () => {
      live = false;
    };
  }, [http, wantsSheet]);

  const presentation: DirectConnectPresentation =
    wantsSheet &&
    (config === null || config.clientId || options.sheet?.clientId)
      ? "sheet"
      : "tab";

  const custom = options.transports;
  const connect = useDirectVanaConnect<T>({
    ...options,
    createRequest: custom?.createRequest ?? (() => http.createRequest()),
    getStatus: custom?.getStatus ?? ((id) => http.getStatus(id)),
    readResult: custom?.readResult ?? ((id) => http.readResult(id)),
    authorizeRequest:
      custom?.authorizeRequest ?? ((id) => http.authorizeRequest(id)),
    presentation,
    sheet: async () =>
      sheetFromConfig(await http.getConfig(), optionsRef.current.sheet),
  });

  return { ...connect, config };
}
