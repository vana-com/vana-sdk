/**
 * Single source of truth for public API entry points.
 * These are the ONLY files consumers should import directly.
 */

export const NODE_ENTRY_POINTS = [
  "src/index.node.ts",
  "src/node.ts",
  "src/chains.node.ts",
  "src/platform.node.ts",
  // Direct Data Controller (server-side; owns the app private key).
  "src/server.ts",
];

export const BROWSER_ENTRY_POINTS = [
  "src/index.browser.ts",
  "src/browser.ts",
  "src/chains.browser.ts",
  "src/platform.browser.ts",
  // Direct Vana connect React hook (browser-safe).
  "src/react.ts",
];

// Environment-agnostic entry points (resolve conditionally based on platform)
export const CONDITIONAL_ENTRY_POINTS = ["src/chains.ts", "src/platform.ts"];

// All approved entry points (normalized without src/ and .ts)
export const ALL_ENTRY_POINTS = [
  ...new Set([
    ...NODE_ENTRY_POINTS.map((e) => e.replace("src/", "").replace(".ts", "")),
    ...BROWSER_ENTRY_POINTS.map((e) =>
      e.replace("src/", "").replace(".ts", ""),
    ),
    ...CONDITIONAL_ENTRY_POINTS.map((e) =>
      e.replace("src/", "").replace(".ts", ""),
    ),
  ]),
];
