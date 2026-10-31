/**
 * Partner-side launcher for the Vana connect sheet.
 *
 * @remarks
 * `connect.open({ clientId, appName, env, getRequest, onEvent, display? })` returns
 * `{ close, setRequestStatus }`. Only launcher, chrome and message
 * protocol live here. Identity, consent and signing live in the Vana-hosted
 * iframe and Vana's servers; no token ever crosses into the partner page.
 *
 * Most apps should not call this directly: `createDirectConnectFlow` (and
 * `useVanaConnect`) with `presentation: "sheet"` open it and wire it to the
 * request, the status poll and the read.
 *
 * Ported from `@vana-unity/connect-embed` with two differences: the version
 * handshake (`incompatible_version`), and no default Vana origin (pass `env`
 * or `vanaOrigin`).
 *
 * `connected` means the person approved; it is not delivery. Treat the data
 * as delivered only once your backend's status poll and read say so (the
 * connect flow's `done`).
 *
 * @category Connect
 * @module connect/launcher
 */

import {
  type CloseReason,
  createSheetChrome,
  type SheetChrome,
} from "./chrome";
import {
  type ConnectCompletion,
  type ConnectDisplay,
  type ConnectProgressPhase,
  type ConnectRequest,
  clientCheckUrl,
  DEFAULT_CONNECT_DISPLAY,
  MIN_SHEET_HEIGHT_PX,
  normalizeOrigin,
  type PartnerMessage,
  PROTOCOL_VERSION,
  parseClientCheck,
  parseSheetMessage,
  readConnectDisplay,
  readIncompatibleVersion,
  type RequestStatus,
  type SheetErrorCode,
  type SheetMessage,
  sheetUrl,
  VANA_ACCOUNT_ORIGINS,
  type VanaConnectEnv,
} from "./protocol";

const DEFAULT_READY_TIMEOUT_MS = 10_000;

/**
 * What the launcher reports to `onEvent`.
 *
 * @remarks
 * `connected` is approval, not delivery: data is delivered only when the
 * partner's backend reads it. The sheet sends no terminal "delivered" event
 * today; the connect flow settles from the status poll instead.
 */
export type ConnectEvent =
  | { type: "ready" }
  | { type: "signed-in" }
  | { completion: ConnectCompletion; status: "approved"; type: "connected" }
  | { phase: ConnectProgressPhase; type: "progress" }
  | { reason: ConnectCloseReason; type: "close" }
  | { code: SheetErrorCode | "request_failed"; type: "error" };

/** Every close says why, so a sheet never disappears unexplained. */
export type ConnectCloseReason =
  | CloseReason
  | "api"
  | "escape"
  | "frame_blocked"
  | "incompatible_version"
  | "origin_not_registered"
  | "replaced"
  | "sheet";

/**
 * Which Vana Account serves the sheet: an environment, or an exact origin
 * (resolve preview origins with `resolveVanaAccountOrigin`). Required, so a
 * dev app never silently frames production.
 */
export type ConnectTarget =
  | {
      /** Vana deployment; the sheet comes from `VANA_ACCOUNT_ORIGINS[env]`. */
      env: VanaConnectEnv;
      vanaOrigin?: undefined;
    }
  | {
      /** Vana Account origin. */
      vanaOrigin: string;
      env?: undefined;
    };

/** Options for {@link open}, besides the {@link ConnectTarget}. */
export interface ConnectOpenBaseOptions {
  /** Chrome label only. Vana never trusts it; the sheet shows registered names. */
  appName: string;
  /** Registered embed client id. */
  clientId: string;
  /** Defaults to `document.body`. */
  container?: HTMLElement;
  /**
   * `sheet` (the default) is a bottom sheet over your page. `fullscreen` fills
   * this window, for a window that holds nothing else, such as a small popup
   * you opened yourself: close that window on the `close` event.
   */
  display?: ConnectDisplay;
  /**
   * Called when the sheet asks for the request (after sign-in). The partner's
   * backend creates the request or re-signs its short-lived read capability.
   */
  getRequest: () => Promise<ConnectRequest>;
  onEvent?: (event: ConnectEvent) => void;
  /**
   * CSP-blocked frames still fire `load`, so only `vana:ready` proves the
   * sheet runs. Without it by this deadline the sheet closes with
   * `frame_blocked`.
   */
  readyTimeoutMs?: number;
}

/** Options for {@link open}. */
export type ConnectOpenOptions = ConnectOpenBaseOptions & ConnectTarget;

/** The open sheet. */
export interface ConnectHandle {
  /** Close the sheet; emits `close` with reason `"api"`. */
  close(): void;
  /** Report the request outcome the partner's backend observed. */
  setRequestStatus(status: RequestStatus): void;
}

/** Closes the open sheet, if any. One sheet at a time. */
let closeCurrent: ((reason: ConnectCloseReason) => void) | null = null;

/**
 * Open the Vana connect sheet over the page. One sheet exists at a time;
 * opening another closes the first with reason `"replaced"`.
 *
 * @param options - Client id, app name, the request source and event sink.
 * @remarks
 * Alongside framing, it asks Vana (`GET /api/embed/connect/client`, no
 * credentials, no cache) whether this page's origin is registered for the
 * client id, and closes with `origin_not_registered` on a definite no. If
 * that check cannot be answered, the ready deadline decides.
 *
 * @param options - Client id, app name, Vana target, the request source and
 * event sink.
 * @returns A handle to close the sheet and report status.
 * @throws TypeError when neither (or both) of `env` and `vanaOrigin` is
 * given, `vanaOrigin` is not an http(s) origin, or `display` is not a known
 * display.
 */
export function open(options: ConnectOpenOptions): ConnectHandle {
  const vanaOrigin = resolveTarget(options);
  const display = readConnectDisplay(
    options.display ?? DEFAULT_CONNECT_DISPLAY,
  );
  if (!display) {
    throw new TypeError('display must be "sheet" or "fullscreen"');
  }
  closeCurrent?.("replaced");

  const emit = (event: ConnectEvent) => options.onEvent?.(event);
  const previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const previousOverflow = document.body.style.overflow;
  let closed = false;
  let ready = false;
  /** Latest status reported before the sheet was ready, sent on ready. */
  let pendingStatus: RequestStatus | null = null;
  let chrome: SheetChrome | null = null;

  const post = (message: PartnerMessage) => {
    chrome?.iframe.contentWindow?.postMessage(message, vanaOrigin);
  };

  const close = (reason: ConnectCloseReason) => {
    if (closed) {
      return;
    }
    closed = true;
    window.clearTimeout(readyTimer);
    window.removeEventListener("message", onMessage);
    document.removeEventListener("keydown", onKeyDown);
    chrome?.remove();
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus();
    if (closeCurrent === close) {
      closeCurrent = null;
    }
    emit({ reason, type: "close" });
  };

  const requestFromPartner = () => {
    options.getRequest().then(
      (request) => {
        if (!closed) {
          post({ request, type: "vana:request", v: PROTOCOL_VERSION });
        }
      },
      () => {
        if (!closed) {
          emit({ code: "request_failed", type: "error" });
        }
      },
    );
  };

  const handleSheetMessage = (message: SheetMessage) => {
    switch (message.type) {
      case "vana:ready":
        // A sheet that mounts twice (strict-mode dev builds) says ready twice.
        if (ready) {
          return;
        }
        window.clearTimeout(readyTimer);
        ready = true;
        if (pendingStatus) {
          post({
            status: pendingStatus,
            type: "vana:request-status",
            v: PROTOCOL_VERSION,
          });
          pendingStatus = null;
        }
        emit({ type: "ready" });
        return;
      case "vana:resize":
        if (message.height >= MIN_SHEET_HEIGHT_PX) {
          chrome?.setContentHeight(message.height);
        }
        return;
      case "vana:signed-in":
        emit({ type: "signed-in" });
        return;
      case "vana:request-needed":
        requestFromPartner();
        return;
      case "vana:connected":
        emit({
          completion: message.completion,
          status: message.status,
          type: "connected",
        });
        return;
      case "vana:progress":
        emit({ phase: message.phase, type: "progress" });
        return;
      case "vana:close":
        close("sheet");
        return;
      case "vana:error":
        // The frame runs, so it is not blocked; the sheet stays open to say why.
        window.clearTimeout(readyTimer);
        emit({ code: message.code, type: "error" });
        return;
      default:
        return;
    }
  };

  function onMessage(event: MessageEvent) {
    if (
      event.origin !== vanaOrigin ||
      !chrome ||
      event.source !== chrome.iframe.contentWindow
    ) {
      return;
    }
    // A sheet at a version this launcher cannot speak is up but unusable:
    // say so, rather than waiting out the ready timeout as "frame_blocked".
    if (readIncompatibleVersion(event.data) !== null) {
      emit({ code: "incompatible_version", type: "error" });
      close("incompatible_version");
      return;
    }
    const message = parseSheetMessage(event.data);
    if (message) {
      handleSheetMessage(message);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      close("escape");
    }
  }

  const handle: ConnectHandle = {
    close: () => {
      close("api");
    },
    setRequestStatus(status) {
      // Before ready the frame still holds about:blank; posting would be lost.
      if (!ready) {
        pendingStatus = status;
        return;
      }
      post({ status, type: "vana:request-status", v: PROTOCOL_VERSION });
    },
  };

  window.addEventListener("message", onMessage);
  document.addEventListener("keydown", onKeyDown);
  const readyTimer = window.setTimeout(() => {
    emit({ code: "frame_blocked", type: "error" });
    close("frame_blocked");
  }, options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);

  checkClient(
    clientCheckUrl({
      clientId: options.clientId,
      partnerOrigin: window.location.origin,
      vanaOrigin,
    }),
    () => {
      if (!(closed || ready)) {
        emit({ code: "origin_not_registered", type: "error" });
        close("origin_not_registered");
      }
    },
  );

  chrome = createSheetChrome({
    ariaLabel: `${options.appName} uses Vana`,
    container: options.container ?? document.body,
    display,
    onClose: close,
    src: sheetUrl({
      clientId: options.clientId,
      display,
      partnerOrigin: window.location.origin,
      vanaOrigin,
    }),
  });
  document.body.style.overflow = "hidden";
  chrome.show();
  chrome.iframe.focus();

  closeCurrent = close;
  return handle;
}

function resolveTarget(target: ConnectTarget): string {
  const { env, vanaOrigin } = target as {
    env?: unknown;
    vanaOrigin?: unknown;
  };
  if ((env === undefined) === (vanaOrigin === undefined)) {
    throw new TypeError("Pass exactly one of env and vanaOrigin");
  }
  if (env !== undefined) {
    if (env !== "production" && env !== "dev") {
      throw new TypeError('env must be "production" or "dev"');
    }
    return VANA_ACCOUNT_ORIGINS[env];
  }
  const origin =
    typeof vanaOrigin === "string" ? normalizeOrigin(vanaOrigin) : null;
  if (!origin) {
    throw new TypeError("vanaOrigin must be an http(s) origin");
  }
  return origin;
}

/**
 * Ask Vana whether this page may frame the sheet, alongside framing it, and
 * call `onRefused` only on a definite no. Any failure to ask leaves the ready
 * deadline to decide, so the check can only end the sheet sooner.
 */
function checkClient(url: string, onRefused: () => void): void {
  if (typeof fetch !== "function") {
    return;
  }
  fetch(url, { cache: "no-store", credentials: "omit" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => {
      if (parseClientCheck(body)?.registered === false) {
        onRefused();
      }
    })
    .catch(() => undefined);
}

/** Alias of {@link open}, for call sites where `open` would be ambiguous. */
export const openConnectSheet = open;

/** Namespace form: `connect.open(...)`. */
export const connect = { open } as const;
