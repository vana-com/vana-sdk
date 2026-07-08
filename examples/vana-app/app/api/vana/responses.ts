import {
  AccessNotApprovedError,
  PaymentRequiredError,
  PersonalServerReadError,
} from "@opendatalabs/vana-sdk/server";

export function missingRequestIdResponse(): Response {
  return Response.json(
    { error: "Missing requestId", code: "missing_request_id" },
    { status: 400 },
  );
}

const UPSTREAM_STATUS_RE = /Access request service error: (\d{3})/;

/**
 * Maps SDK errors to HTTP statuses a client can branch on, so a polling UI can
 * distinguish "keep waiting" (409) from "this request ID is wrong" (404) from
 * "something broke" (5xx).
 *
 * `mapNotFound` only makes sense for routes that look up an existing request by
 * ID (read/status): there, an upstream 404 means the request ID is unknown. The
 * creation route must leave it off — a 404 from the create endpoint is an
 * upstream/config failure, not a "request not found", and reporting it as
 * `request_not_found` would mislead the client.
 */
export function errorResponse(
  error: unknown,
  { mapNotFound = false }: { mapNotFound?: boolean } = {},
): Response {
  if (error instanceof AccessNotApprovedError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: 409 },
    );
  }
  if (error instanceof PaymentRequiredError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: 402 },
    );
  }
  if (error instanceof PersonalServerReadError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: 502 },
    );
  }

  const message = error instanceof Error ? error.message : "Unknown error";

  // The access-request client throws a plain Error carrying the upstream
  // status; on a by-ID route a 404 there means the request ID does not exist.
  const upstreamStatus = UPSTREAM_STATUS_RE.exec(message)?.[1];
  if (mapNotFound && upstreamStatus === "404") {
    return Response.json(
      { error: "Unknown request ID", code: "request_not_found" },
      { status: 404 },
    );
  }

  return Response.json({ error: message }, { status: 500 });
}
