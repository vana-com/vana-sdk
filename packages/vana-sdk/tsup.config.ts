import { defineConfig } from "tsup";

// Node.js build configuration
// Entry points are defined in scripts/entry-points.ts
export default defineConfig({
  entry: [
    "src/**/*.ts",
    "src/**/*.json",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/tests/**",
    "!src/**/*.browser.ts", // Exclude browser files from Node build
  ],

  format: ["esm", "cjs"],
  platform: "node",
  target: "node22",

  bundle: false, // Unbundled for tree-shaking
  dts: false, // We'll generate types separately with tsc

  splitting: false,
  sourcemap: true,
  clean: false,
  outDir: "dist",

  loader: {
    ".json": "copy",
  },

  external: ["secp256k1"],
});
