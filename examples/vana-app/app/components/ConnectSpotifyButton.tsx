"use client";

import { useMemo } from "react";
import {
  useDirectVanaConnect,
  type AccessRequest,
  type AccessRequestStatus,
  type ApprovedDataResult,
} from "@opendatalabs/vana-sdk/react";

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return body as T;
}

function previewData(data: unknown): unknown {
  if (Array.isArray(data)) return data.slice(0, 3);
  if (!data || typeof data !== "object") return data;

  const record = data as Record<string, unknown>;
  const arrayField = firstArrayField(record);
  if (arrayField) {
    const [field, values] = arrayField;
    return { ...record, [field]: values.slice(0, 3) };
  }
  return data;
}

function payloadSummary(data: unknown): string {
  if (Array.isArray(data)) return `${data.length} records`;
  if (!data || typeof data !== "object") return "1 value";

  const record = data as Record<string, unknown>;
  const arrayField = firstArrayField(record);
  if (arrayField) return `${arrayField[1].length} ${arrayField[0]}`;
  return `${Object.keys(record).length} top-level fields`;
}

function firstArrayField(
  record: Record<string, unknown>,
): [string, unknown[]] | undefined {
  for (const [field, value] of Object.entries(record)) {
    if (Array.isArray(value)) return [field, value];
  }
  return undefined;
}

function stateLabel(stateType: string): string {
  switch (stateType) {
    case "creating":
      return "Creating access request";
    case "awaiting_approval":
      return "Waiting for approval";
    case "reading":
      return "Reading approved data";
    case "done":
      return "Data ready";
    case "error":
      return "Needs attention";
    default:
      return "Ready";
  }
}

export function ConnectSpotifyButton() {
  const connect = useDirectVanaConnect({
    createRequest: () =>
      readJson<AccessRequest>("/api/vana/request", {
        method: "POST",
      }),
    getStatus: (requestId) =>
      readJson<AccessRequestStatus>(
        `/api/vana/status?requestId=${encodeURIComponent(requestId)}`,
      ),
    readResult: (requestId) =>
      readJson<ApprovedDataResult<unknown>>(
        `/api/vana/data?requestId=${encodeURIComponent(requestId)}`,
      ),
    pollIntervalMs: 800,
  });

  const result = connect.state.type === "done" ? connect.state.result : null;
  const preview = useMemo(
    () =>
      result
        ? JSON.stringify(
            {
              scope: result.scope,
              data: previewData(result.data),
              payment: result.payment,
            },
            null,
            2,
          )
        : "",
    [result],
  );

  const canStart =
    connect.state.type === "idle" ||
    connect.state.type === "done" ||
    connect.state.type === "error";

  return (
    <section className="connect-panel" aria-labelledby="connect-title">
      <div className="connect-header">
        <div>
          <p className="eyebrow">Example app</p>
          <h1 id="connect-title">Spotify Taste</h1>
        </div>
        <span className={`status-pill status-${connect.state.type}`}>
          {stateLabel(connect.state.type)}
        </span>
      </div>

      <p className="lede">
        Request a Spotify data grant, poll for approval, then read the approved
        payload through the app backend.
      </p>

      <div className="actions">
        <button disabled={!canStart} onClick={connect.start} type="button">
          {connect.state.type === "done" ? "Run again" : "Connect Spotify"}
        </button>
        {connect.state.type !== "idle" && (
          <button className="secondary" onClick={connect.reset} type="button">
            Reset
          </button>
        )}
      </div>

      {connect.state.type === "awaiting_approval" && (
        <div className="notice">
          <strong>Approval request:</strong> {connect.state.request.requestId}
          {connect.state.popupBlocked && (
            <a
              href={connect.state.request.approvalUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open approval
            </a>
          )}
        </div>
      )}

      {connect.state.type === "reading" && (
        <div className="notice">
          Reading request {connect.state.request.requestId}
        </div>
      )}

      {connect.state.type === "error" && (
        <div className="notice error">{connect.state.error.message}</div>
      )}

      {result && (
        <div className="result">
          <div className="result-summary">
            <span>Scope</span>
            <strong>{result.scope}</strong>
            <span>Payload</span>
            <strong>{payloadSummary(result.data)}</strong>
            <span>Payment</span>
            <strong>{result.payment ? "settled" : "not required"}</strong>
          </div>
          <pre>{preview}</pre>
        </div>
      )}
    </section>
  );
}
