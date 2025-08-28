import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

// Browser build configuration
// Entry points are defined in scripts/entry-points.ts

// Plugin to prevent Node modules in browser builds
const browserOptimizationPlugin: Plugin = {
  name: "browser-optimization",
  setup(build) {
    build.onResolve({ filter: /^secp256k1$/ }, () => {
      return { path: "secp256k1", external: true };
    });
    build.onResolve({ filter: /^crypto$/ }, () => {
      return { path: "crypto", external: true };
    });
  },
};

// Simple browser build configuration
export default defineConfig({
  entry: [
    "src/**/*.ts",
    "src/**/*.json",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/tests/**",
    "!src/**/*.node.ts", // Exclude Node-specific files
  ],

  format: ["esm"],
  platform: "browser",
  target: "es2022",

  bundle: false, // Unbundled for tree-shaking
  dts: false, // We'll generate types separately with tsc

  splitting: false,
  sourcemap: true,
  clean: false,
  outDir: "dist",

  loader: {
    ".json": "copy",
  },

  esbuildPlugins: [browserOptimizationPlugin],
  external: ["secp256k1", "crypto"],

  define: {
    "process.browser": "true",
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
