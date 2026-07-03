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
 */
export function errorResponse(error: unknown): Response {
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
  // status; a 404 there means the request ID does not exist.
  const upstreamStatus = UPSTREAM_STATUS_RE.exec(message)?.[1];
  if (upstreamStatus === "404") {
    return Response.json(
      { error: "Unknown request ID", code: "request_not_found" },
      { status: 404 },
    );
  }

  return Response.json({ error: message }, { status: 500 });
}
