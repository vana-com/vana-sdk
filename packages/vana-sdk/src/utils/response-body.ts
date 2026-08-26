/**
 * Tolerant JSON body readers for `fetch` responses.
 *
 * A response body can legitimately be empty (204), non-JSON (an HTML error
 * page from a proxy), or JSON that is not an object (`null`, an array, a
 * string). Every SDK code path that indexes into a parsed body must go
 * through these helpers so those shapes degrade to "no fields" instead of a
 * `TypeError` that bypasses the typed error the caller expects.
 *
 * @internal
 */

/** The one method the readers need, so custom fetch shims qualify too. */
export type JsonBodySource = Pick<Response, "json">;

/** True for a non-null, non-array object -- the only shape safe to index. */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the body as JSON. Resolves `null` when the body is empty or not
 * valid JSON. Never throws.
 */
export async function readJsonValue(res: JsonBodySource): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Parse the body as JSON and return it only when it is a plain object;
 * every other shape (empty, non-JSON, `null`, array, primitive) becomes `{}`.
 * Never throws.
 */
export async function readJsonObject(
  res: JsonBodySource,
): Promise<Record<string, unknown>> {
  const value = await readJsonValue(res);
  return isPlainObject(value) ? value : {};
}
