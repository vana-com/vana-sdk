/**
 * Reader for the error bodies a Personal Server (or the gateway) answers
 * with. Protocol errors use `{ error: { code, errorCode, message, details? } }`;
 * contract-level rejections use `{ error: "CODE", message }`; older clients
 * saw `{ code, message }`. All three are accepted.
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
  const code =
    nested?.errorCode ??
    nested?.code ??
    (typeof body.error === "string" ? body.error : body.errorCode) ??
    body.code;
  const message = nested?.message ?? body.message;
  const details = nested?.details ?? body.details;
  return {
    errorCode: typeof code === "string" ? code : null,
    message: typeof message === "string" ? message : null,
    ...(isRecord(details) ? { details } : {}),
  };
}
