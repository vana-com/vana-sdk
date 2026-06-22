/**
 * React entry point for the Vana SDK direct Data Portability flow.
 *
 * @remarks
 * Exposes {@link useDirectVanaConnect} (and the underlying framework-agnostic
 * connect-flow store) for browser apps. This entry point is browser-safe and
 * imports nothing Node-only. `react` is a peer dependency.
 *
 * @example
 * ```tsx
 * "use client";
 * import { useDirectVanaConnect } from "@opendatalabs/vana-sdk/react";
 *
 * export function ConnectNotesButton() {
 *   const connect = useDirectVanaConnect({
 *     createRequest: () => fetch("/api/vana/request", { method: "POST" }).then((r) => r.json()),
 *     getStatus: (id) => fetch(`/api/vana/status?requestId=${id}`).then((r) => r.json()),
 *     readResult: (id) => fetch(`/api/vana/data?requestId=${id}`).then((r) => r.json()),
 *   });
 *   return (
 *     <button disabled={connect.state.type !== "idle"} onClick={connect.start} type="button">
 *       {connect.state.type === "idle" ? "Connect Apple Notes" : "Connecting..."}
 *     </button>
 *   );
 * }
 * ```
 *
 * @category Direct
 * @module react
 */

export {
  useDirectVanaConnect,
  type UseDirectVanaConnectOptions,
  type UseDirectVanaConnectResult,
} from "./direct/use-direct-vana-connect";

// Framework-agnostic store (usable without React).
export {
  createDirectConnectFlow,
  type DirectConnectFlow,
  type DirectConnectState,
  type DirectConnectOptions,
  type DirectConnectTransports,
} from "./direct/connect-flow";

// Shared types useful when typing the transports.
export type {
  AccessRequest,
  AccessRequestStatus,
  AccessRequestStatusValue,
  ApprovedDataResult,
} from "./direct/types";
