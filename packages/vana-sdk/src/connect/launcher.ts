/**
 * Partner-side launcher for the Vana connect sheet.
 *
 * @remarks
 * `connect.open({ clientId, appName, getRequest, onEvent })` returns
 * `{ close, setRequestStatus, write }`. Only launcher, chrome and message
 * protocol live here. Identity, consent and signing live in the Vana-hosted
 * iframe and Vana's servers; no token ever crosses into the partner page.
 *
 * Most apps should not call this directly: `createDirectConnectFlow` (and
 * `useVanaConnect`) with `presentation: "sheet"` open it and wire it to the
 * request, the status poll and the read.
 *
 * Ported from `@vana-unity/connect-embed` with one addition: the version
 * handshake (`incompatible_version`).
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
  type ConnectProgressPhase,
  type ConnectRequest,
  DEFAULT_VANA_ORIGIN,
  MIN_SHEET_HEIGHT_PX,
  normalizeOrigin,
  type PartnerMessage,
  PROTOCOL_VERSION,
  parseSheetMessage,
  readIncompatibleVersion,
  type RequestStatus,
  type SheetErrorCode,
  type SheetMessage,
  sheetUrl,
} from "./protocol";

const DEFAULT_READY_TIMEOUT_MS = 10_000;

/** What the launcher reports to `onEvent`. */
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
  | "replaced"
  | "sheet";

/** Options for {@link open}. */
export interface ConnectOpenOptions {
  /** Chrome label only. Vana never trusts it; the sheet shows registered names. */
  appName: string;
  /** Registered embed client id. */
  clientId: string;
  /** Defaults to `document.body`. */
  container?: HTMLElement;
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
  /** Vana Account origin. Defaults to production (`https://account.vana.org`). */
  vanaOrigin?: string;
}

/** The open sheet. */
export interface ConnectHandle {
  /** Close the sheet; emits `close` with reason `"api"`. */
  close(): void;
  /** Report the request outcome the partner's backend observed. */
  setRequestStatus(status: RequestStatus): void;
  /**
   * Saves `data` to one scope this person approved in the sheet, through
   * their Vana Personal Server. Resolves false when refused or not approved.
   */
  write(scope: string, data: unknown): Promise<boolean>;
}

/** Closes the open sheet, if any. One sheet at a time. */
let closeCurrent: ((reason: ConnectCloseReason) => void) | null = null;

/**
 * Open the Vana connect sheet over the page. One sheet exists at a time;
 * opening another closes the first with reason `"replaced"`.
 *
 * @param options - Client id, app name, the request source and event sink.
 * @returns A handle to close the sheet, report status, and write.
 * @throws TypeError when `vanaOrigin` is not an http(s) origin.
 */
export function open(options: ConnectOpenOptions): ConnectHandle {
  const vanaOrigin = normalizeOrigin(options.vanaOrigin ?? DEFAULT_VANA_ORIGIN);
  if (!vanaOrigin) {
    throw new TypeError("vanaOrigin must be an http(s) origin");
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
  const pendingWrites = new Map<string, (ok: boolean) => void>();
  let writeCount = 0;

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
    for (const settle of pendingWrites.values()) {
      settle(false);
    }
    pendingWrites.clear();
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
      case "vana:write-result":
        pendingWrites.get(message.id)?.(message.ok);
        pendingWrites.delete(message.id);
        return;
      case "vana:close":
        close("sheet");
        return;
      case "vana:error":
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
    write(scope, data) {
      if (closed || !ready) {
        return Promise.resolve(false);
      }
      writeCount += 1;
      const id = `w${writeCount}`;
      return new Promise((resolve) => {
        pendingWrites.set(id, resolve);
        post({ data, id, scope, type: "vana:write", v: PROTOCOL_VERSION });
      });
    },
  };

  window.addEventListener("message", onMessage);
  document.addEventListener("keydown", onKeyDown);
  const readyTimer = window.setTimeout(() => {
    emit({ code: "frame_blocked", type: "error" });
    close("frame_blocked");
  }, options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);

  chrome = createSheetChrome({
    ariaLabel: `${options.appName} uses Vana`,
    container: options.container ?? document.body,
    onClose: close,
    src: sheetUrl({
      clientId: options.clientId,
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

/** Alias of {@link open}, for call sites where `open` would be ambiguous. */
export const openConnectSheet = open;

/** Namespace form: `connect.open(...)`. */
export const connect = { open } as const;
