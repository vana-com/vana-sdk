export function missingRequestIdResponse(): Response {
  return Response.json({ error: "Missing requestId" }, { status: 400 });
}

export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unknown error";
  return Response.json({ error: message }, { status: 500 });
}
