/**
 * Reader for the error bodies a Personal Server (or the gateway) answers
 * with. Protocol errors use `{ error: { code, errorCode, message, details? } }`;
 * contract-level rejections use `{ error: "CODE", message }`; the gateway
 * uses `{ success: false, error: "<message>", code: "CODE" }` with lineage
 * detail fields (`unknown`, `scope`, `sourceScope`) at the top level; older
 * clients saw `{ code, message }`. All four are accepted.
 *
 * @internal
 */

export interface PersonalServerErrorBody {
  errorCode: string | null;
  message: string | null;
  details?: Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Read a non-2xx response body; never throws. */
export async function readPersonalServerErrorBody(
  response: Response,
): Promise<PersonalServerErrorBody> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { errorCode: null, message: null };
  }
  if (!isRecord(body)) return { errorCode: null, message: null };
  const nested = isRecord(body.error) ? body.error : null;
  // Gateway bodies are `{ success: false, error: <message>, code: <CODE> }`;
  // the Personal Server's contract rejections are `{ error: <CODE>, message }`.
  const gatewayShape =
    typeof body.error === "string" && typeof body.code === "string";
  const code =
    nested?.errorCode ??
    nested?.code ??
    body.errorCode ??
    (gatewayShape ? body.code : undefined) ??
    (typeof body.error === "string" ? body.error : undefined) ??
    body.code;
  const message =
    nested?.message ?? body.message ?? (gatewayShape ? body.error : undefined);
  // Gateway lineage rejections carry their detail fields at the top level.
  const gatewayDetails: Record<string, unknown> = {};
  for (const key of ["unknown", "scope", "sourceScope"]) {
    if (gatewayShape && body[key] !== undefined) gatewayDetails[key] = body[key];
  }
  const details =
    nested?.details ??
    body.details ??
    (Object.keys(gatewayDetails).length > 0 ? gatewayDetails : undefined);
  return {
    errorCode: typeof code === "string" ? code : null,
    message: typeof message === "string" ? message : null,
    ...(isRecord(details) ? { details } : {}),
  };
}
