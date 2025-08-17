/**
 * Provides diagnostic warnings for SDK configuration and environment issues.
 *
 * @remarks
 * Warnings are deduplicated by message and can be silenced via
 * the VANA_SDK_SILENCE_WARNINGS environment variable.
 *
 * @category Diagnostics
 */

/** Tracks seen warning messages to prevent duplicate output. */
const seen = new Set<string>();

/** Checks if warnings are silenced via environment variable. */
const SILENCE =
  typeof process !== "undefined" &&
  process?.env?.VANA_SDK_SILENCE_WARNINGS === "1";

/**
 * Emits a warning message once per unique message content.
 *
 * @remarks
 * Warnings are automatically prefixed with "[vana-sdk]" and deduplicated.
 * Set `VANA_SDK_SILENCE_WARNINGS=1` to disable all warnings.
 *
 * @param msg - Warning message components to display.
 *
 * @example
 * ```typescript
 * warnOnce("AES-256-CBC not available.", "ECIES will fail.");
 * ```
 */
export function warnOnce(...msg: unknown[]): void {
  if (SILENCE) return;
  const key = msg.join(" ");
  if (seen.has(key)) return;
  seen.add(key);
  console.warn("[vana-sdk]", ...msg);
}
