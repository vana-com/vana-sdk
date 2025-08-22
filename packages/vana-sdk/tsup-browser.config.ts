import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

// Plugin to handle platform-specific modules for browser builds
const browserOptimizationPlugin: Plugin = {
  name: "browser-optimization",
  setup(build) {
    // Exclude Node.js native secp256k1 from browser builds
    build.onResolve({ filter: /^secp256k1$/ }, () => {
      return { path: "secp256k1", external: true };
    });

    // Prevent Node.js crypto from being imported
    build.onResolve({ filter: /^crypto$/ }, () => {
      return { path: "crypto", external: true };
    });
  },
};

export default defineConfig({
  entry: [
    "src/**/*.ts",
    "src/**/*.json",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/tests/**",
  ],
  format: ["esm"],
  target: "es2020",
  platform: "browser",
  splitting: false,
  sourcemap: true,
  clean: false,
  dts: true,
  outDir: "dist",
  bundle: false,
  loader: {
    ".json": "copy",
  },
  esbuildPlugins: [browserOptimizationPlugin],
  // External modules that shouldn't be bundled for browsers
  external: ["secp256k1", "crypto"],
  // Define process.browser to help with environment detection
  define: {
    "process.browser": "true",
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
