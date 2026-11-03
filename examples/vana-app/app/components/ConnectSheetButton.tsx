"use client";

import { useVanaConnect } from "@opendatalabs/vana-sdk/react";

// The same flow as ConnectSpotifyButton, with Vana's in-page sheet in place
// of a tab and no transports to write: the routes come from
// app/api/vana/connect/[action]/route.ts.
export function ConnectSheetButton() {
  const { state, start, reset } = useVanaConnect({
    endpoint: "/api/vana/connect",
  });
  const busy = state.type === "creating" || state.type === "awaiting_approval";

  return (
    <section className="connect-panel" aria-label="Connect in a sheet">
      <div className="actions">
        <button
          disabled={busy || state.type === "reading"}
          onClick={start}
          type="button"
        >
          {busy ? "Connecting…" : "Connect in a Vana sheet"}
        </button>
        {state.type !== "idle" && (
          <button className="secondary" onClick={reset} type="button">
            Reset
          </button>
        )}
      </div>
      {state.type === "awaiting_approval" && state.popupBlocked && (
        <div className="notice">
          {state.sheetUnavailable
            ? `The sheet is unavailable here (${state.sheetUnavailable}). `
            : null}
          <a href={state.request.approvalUrl} rel="noreferrer" target="_blank">
            Open approval
          </a>
        </div>
      )}
      {state.type === "awaiting_approval" && state.sheet?.progress && (
        <div className="notice">Vana is collecting your data…</div>
      )}
      {state.type === "done" && (
        <div className="notice">Read {state.result.scope}.</div>
      )}
      {state.type === "error" && (
        <div className="notice error">{state.error.message}</div>
      )}
    </section>
  );
}
