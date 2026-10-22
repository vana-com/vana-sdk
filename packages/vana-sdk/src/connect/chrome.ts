/**
 * Sheet chrome for the Vana connect sheet: scrim, bottom sheet and drag
 * handle, in a Shadow DOM root.
 *
 * @remarks
 * Ported unchanged from `@vana-unity/connect-embed`. See the layout notes
 * below.
 *
 * @category Connect
 * @module connect/chrome
 */

// Sheet chrome: scrim, bottom sheet, drag handle. Lives in a Shadow DOM root
// so partner CSS cannot restyle it, and the partner cannot reach the iframe's
// document (cross-origin) through it.
//
//   host (partner DOM)
//   └─ #shadow-root
//      ├─ .scrim                 click closes
//      └─ .sheet                 top = viewport − (handle + content)
//         ├─ .handle             drag down to close (above the frame, never over it)
//         └─ iframe              fixed height = cap; the unused part sits below
//                                the viewport
//
// Nothing overlaps or clips the iframe. IntersectionObserver v2 inside the
// sheet reports it "not visible" when anything covers or clips it, and the
// consent step waits for real visibility. The part of the frame below the
// viewport is simply off screen, which does not count as occlusion.

const SHEET_RADIUS_PX = 28;
const SHEET_MAX_WIDTH_PX = 480;
const HANDLE_STRIP_PX = 20;
const INITIAL_CONTENT_PX = 320;
const TRANSITION_MS = 280;
const SHEET_BACKGROUND = "#f4f4f4";

/** Drag the handle this far down to dismiss. */
export const DRAG_CLOSE_PX = 120;

/** The sheet never covers more of the viewport than this. */
export const MAX_SHEET_RATIO = 0.92;

const STYLES = `
:host { all: initial; }
.scrim {
  position: fixed; inset: 0; z-index: 2147483646;
  background: rgb(0 0 0 / 0.4);
  opacity: 0; transition: opacity ${TRANSITION_MS}ms ease;
}
.sheet {
  position: fixed; left: 0; right: 0; z-index: 2147483647;
  margin: 0 auto; max-width: ${SHEET_MAX_WIDTH_PX}px;
  top: 100vh;
  transition: top ${TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet.dragging { transition: none; }
.handle {
  height: ${HANDLE_STRIP_PX}px;
  display: flex; justify-content: center; align-items: center;
  background: ${SHEET_BACKGROUND};
  border-radius: ${SHEET_RADIUS_PX}px ${SHEET_RADIUS_PX}px 0 0;
  touch-action: none; cursor: grab;
}
.handle::before {
  content: ""; width: 36px; height: 5px; border-radius: 3px;
  background: rgb(0 0 0 / 0.18);
}
iframe {
  display: block; width: 100%; border: 0;
  background: ${SHEET_BACKGROUND};
}
.open .scrim { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .scrim, .sheet { transition: none; }
}
`;

export type CloseReason = "drag" | "scrim";

export interface SheetChrome {
  host: HTMLElement;
  iframe: HTMLIFrameElement;
  remove(): void;
  setContentHeight(px: number): void;
  show(): void;
}

function viewportPx(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

function capPx(): number {
  return Math.round(viewportPx() * MAX_SHEET_RATIO);
}

/** Places the sheet so exactly `content` px of the frame show above the fold. */
function placeSheet(sheet: HTMLElement, content: number): void {
  sheet.style.top = `${sheetTopPx(viewportPx(), content)}px`;
}

/**
 * Where the sheet's top edge goes so `content` px of the frame show, capped
 * at {@link MAX_SHEET_RATIO} of the viewport.
 *
 * @param viewport - Viewport height in px.
 * @param content - Content height the sheet reported, in px.
 * @returns The sheet's `top`, in whole px.
 */
export function sheetTopPx(viewport: number, content: number): number {
  const cap = Math.round(viewport * MAX_SHEET_RATIO);
  const visible = Math.min(content, cap - HANDLE_STRIP_PX);
  // Whole pixels: a fractional offset blurs the framed text.
  return Math.round(viewport - HANDLE_STRIP_PX - visible);
}

/** Scrim taps this soon after the page returns to view are ignored. */
export const RETURN_TAP_GUARD_MS = 500;

/**
 * Return-to-view handling, isolated so it can change on its own.
 *
 * Root cause of the spike's "blank sheet" (scratchpad blank-render notes): not
 * a paint failure. Returning from the Google popup tab, a stray tap landed on
 * the scrim and silently closed the sheet; a headless-Chrome harness artefact
 * looked similar. So: taps on the scrim right after the page regains
 * visibility or focus are ignored, heights reported while hidden are dropped,
 * and the last good height is re-applied on return. The iframe keeps a fixed
 * viewport (the cap) and only the sheet's position animates, so measuring
 * content inside the frame never resizes the frame itself.
 */
function installReturnGuard(
  sheet: HTMLElement,
  iframe: HTMLIFrameElement,
  state: { lastHeight: number | null; returnedAt: number; shown: boolean },
): () => void {
  const fitIframe = () => {
    iframe.style.height = `${capPx() - HANDLE_STRIP_PX}px`;
    if (state.shown) {
      placeSheet(sheet, state.lastHeight ?? INITIAL_CONTENT_PX);
    }
  };
  const onReturn = () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    state.returnedAt = performance.now();
    fitIframe();
  };
  fitIframe();
  window.addEventListener("resize", fitIframe);
  window.visualViewport?.addEventListener("resize", fitIframe);
  document.addEventListener("visibilitychange", onReturn);
  window.addEventListener("focus", onReturn);
  return () => {
    window.removeEventListener("resize", fitIframe);
    window.visualViewport?.removeEventListener("resize", fitIframe);
    document.removeEventListener("visibilitychange", onReturn);
    window.removeEventListener("focus", onReturn);
    sheet.style.transform = "";
  };
}

function installDragToClose(
  sheet: HTMLElement,
  handle: HTMLElement,
  onClose: (reason: CloseReason) => void,
): void {
  let startY: number | null = null;
  handle.addEventListener("pointerdown", (event) => {
    startY = event.clientY;
    handle.setPointerCapture?.(event.pointerId);
    sheet.classList.add("dragging");
  });
  handle.addEventListener("pointermove", (event) => {
    if (startY === null) {
      return;
    }
    const dy = Math.max(0, event.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = (event: PointerEvent) => {
    if (startY === null) {
      return;
    }
    const dy = event.clientY - startY;
    startY = null;
    sheet.classList.remove("dragging");
    sheet.style.transform = "";
    if (dy > DRAG_CLOSE_PX) {
      onClose("drag");
    }
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

export function createSheetChrome(input: {
  ariaLabel: string;
  container: HTMLElement;
  onClose: (reason: CloseReason) => void;
  src: string;
}): SheetChrome {
  const returnState = {
    lastHeight: null as number | null,
    returnedAt: 0,
    shown: false,
  };
  const host = document.createElement("div");
  host.setAttribute("data-vana-connect", "");
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;

  const frame = document.createElement("div");
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.setAttribute("data-slot", "scrim");
  scrim.addEventListener("click", () => {
    if (performance.now() - returnState.returnedAt < RETURN_TAP_GUARD_MS) {
      return;
    }
    input.onClose("scrim");
  });

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", input.ariaLabel);

  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
  );
  iframe.setAttribute(
    "allow",
    "otp-credentials; publickey-credentials-get; clipboard-write",
  );
  iframe.setAttribute("title", "Vana");
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.src = input.src;

  const handle = document.createElement("div");
  handle.className = "handle";
  handle.setAttribute("aria-hidden", "true");

  sheet.append(handle, iframe);
  frame.append(scrim, sheet);
  root.append(style, frame);
  input.container.append(host);

  const removeReturnGuard = installReturnGuard(sheet, iframe, returnState);
  installDragToClose(sheet, handle, input.onClose);

  return {
    host,
    iframe,
    remove() {
      removeReturnGuard();
      host.remove();
    },
    setContentHeight(px) {
      // A hidden page can report a throttled frame's height; keep the last good one.
      if (document.visibilityState !== "visible") {
        return;
      }
      returnState.lastHeight = px;
      if (returnState.shown) {
        placeSheet(sheet, px);
      }
    },
    show() {
      // Next frame, so the closed state paints first and the sheet slides in.
      requestAnimationFrame(() => {
        returnState.shown = true;
        frame.classList.add("open");
        placeSheet(sheet, returnState.lastHeight ?? INITIAL_CONTENT_PX);
      });
    },
  };
}
