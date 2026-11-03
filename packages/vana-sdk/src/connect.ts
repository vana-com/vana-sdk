/**
 * Connect entry point: the launcher for Vana's in-page connect sheet, its
 * chrome, and browser transports for a `createVanaConnectHandler` backend.
 *
 * @remarks
 * Browser-safe and framework-free. Most apps use the sheet through
 * `useVanaConnect` (or `createDirectConnectFlow` with
 * `presentation: "sheet"`) from `@opendatalabs/vana-sdk/react`, which wires
 * it to the request, the status poll and the read. The message protocol
 * alone, with no other code, is `@opendatalabs/vana-sdk/connect/protocol`.
 *
 * @example
 * ```typescript
 * import { connect } from "@opendatalabs/vana-sdk/connect";
 *
 * const sheet = connect.open({
 *   clientId: "my-app",
 *   appName: "My App",
 *   env: "production",
 *   getRequest: () =>
 *     fetch("/api/vana/request", { method: "POST", body: "{}" })
 *       .then((r) => r.json())
 *       .then((body) => body.embed),
 *   onEvent: (event) => console.log(event),
 * });
 * ```
 *
 * @category Connect
 * @module connect
 */

export {
  connect,
  open,
  openConnectSheet,
  type ConnectCloseReason,
  type ConnectEvent,
  type ConnectHandle,
  type ConnectOpenBaseOptions,
  type ConnectOpenOptions,
  type ConnectTarget,
} from "./connect/launcher";
export {
  parseOriginAllowlist,
  resolveVanaAccountOrigin,
  type ResolveVanaAccountOriginInput,
} from "./connect/account-origin";
export {
  createSheetChrome,
  DRAG_CLOSE_PX,
  MAX_SHEET_RATIO,
  RETURN_TAP_GUARD_MS,
  type CloseReason,
  type SheetChrome,
} from "./connect/chrome";
export {
  createVanaConnectTransports,
  VanaConnectHttpError,
  type VanaConnectConfig,
  type VanaConnectRequestResponse,
  type VanaConnectTransportOptions,
  type VanaConnectTransports,
} from "./connect/http-transports";
export * from "./connect/protocol";
