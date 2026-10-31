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
 *   const { state, start } = connect;
 *   return (
 *     <div>
 *       <button disabled={state.type !== "idle"} onClick={start} type="button">
 *         {state.type === "idle" ? "Connect Apple Notes" : "Connecting..."}
 *       </button>
 *       {state.type === "awaiting_approval" && (
 *         // Fallback link: if the browser blocked the approval popup, the user
 *         // can still open it manually instead of the flow silently hanging.
 *         <a href={state.request.approvalUrl} target="_blank" rel="noreferrer">
 *           {state.popupBlocked ? "Popup blocked — open approval" : "Open approval"}
 *         </a>
 *       )}
 *       {state.type === "ready_to_open" && (
 *         // Mobile deep Direct: render the HTTPS continuation as a primary tap.
 *         // The SDK keeps polling in this tab; if the tab is lost, restart.
 *         <a href={state.mobileContinuationUrl} target="_blank" rel="noreferrer">
 *           Open Vana
 *         </a>
 *       )}
 *     </div>
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

// Zero-transport hook for a `createVanaConnectHandler` backend; presents
// approval in Vana's in-page sheet by default.
export {
  useVanaConnect,
  type UseVanaConnectOptions,
  type UseVanaConnectResult,
} from "./direct/use-vana-connect";
export {
  createVanaConnectTransports,
  VanaConnectHttpError,
  type VanaConnectConfig,
  type VanaConnectTransportOptions,
  type VanaConnectTransports,
} from "./connect/http-transports";
export type {
  ConnectCompletion,
  ConnectEvent,
  ConnectProgressPhase,
  RequestAuthorization,
  SheetErrorCode,
} from "./connect";

// Framework-agnostic store (usable without React).
export {
  createDirectConnectFlow,
  type DirectConnectPresentation,
  type DirectConnectSheetOptions,
  type DirectConnectSheetState,
  type ConnectWindow,
  type DirectBrowserPlatform,
  type DirectBrowserPlatformPolicy,
  type DirectConnectFlow,
  type DirectConnectRetryOutcome,
  type DirectConnectState,
  type DirectConnectOptions,
  type DirectConnectTransports,
} from "./direct/connect-flow";

// Shared types useful when typing the transports.
export type {
  ForegroundDelivery,
  AccessRequest,
  AccessRequestStatus,
  AccessRequestStatusValue,
  ApprovedDataResult,
} from "./direct/types";
