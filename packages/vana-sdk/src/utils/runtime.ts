/**
 * Runtime environment detection utilities
 */

/**
 * Determines if the current environment is a browser
 *
 * @returns true if running in browser, false if in Node.js
 */
export function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.document !== "undefined"
  );
}

/**
 * Determines if the current environment is Node.js
 *
 * @returns true if running in Node.js, false if in browser
 */
export function isNode(): boolean {
  return !isBrowser();
}
