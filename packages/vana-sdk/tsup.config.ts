import { defineConfig } from "tsup";

export default defineConfig([
  // Node.js build configuration
  {
    entry: {
      "index.node": "src/index.node.ts",
    },
    format: ["esm", "cjs"],
    platform: "node",
    target: "node18",
    outDir: "dist",
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: [
      "viem",
      "ethers",
      "@openpgp/web-stream-tools",
      "openpgp",
      "jose",
      "crypto",
      "stream",
      "buffer",
      "process",
      "util",
      "events",
    ],
    esbuildOptions(options) {
      options.conditions = ["node"];
    },
    outExtension({ format }) {
      return {
        js: format === "esm" ? ".js" : ".cjs",
      };
    },
  },
  // Browser build configuration
  {
    entry: {
      "index.browser": "src/index.browser.ts",
    },
    format: ["esm", "cjs"],
    platform: "browser",
    target: "es2020",
    outDir: "dist",
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false, // Don't clean since Node build runs first
    external: [
      "viem",
      "ethers",
      "@openpgp/web-stream-tools",
      "openpgp",
      "jose",
    ],
    esbuildOptions(options) {
      options.conditions = ["browser"];
      // Replace eccrypto with eccrypto-js for browser compatibility
      options.alias = {
        ...options.alias,
        eccrypto: "eccrypto-js",
      };
    },
    outExtension({ format }) {
      return {
        js: format === "esm" ? ".js" : ".cjs",
      };
    },
  },
  // Additional exports (chains, types, errors, etc.)
  {
    entry: {
      index: "src/index.ts",
      chains: "src/chains/index.ts",
      types: "src/types/index.ts",
      errors: "src/errors.ts",
      platform: "src/platform/index.ts",
    },
    format: ["esm", "cjs"],
    platform: "node", // Set to node since platform index includes node adapters
    target: "node18",
    outDir: "dist",
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    external: [
      "viem",
      "ethers",
      "@openpgp/web-stream-tools",
      "openpgp",
      "jose",
      "crypto",
      "stream",
      "buffer",
      "process",
      "util",
      "events",
    ],
    esbuildOptions(options) {
      options.conditions = ["node"];
      // Also replace eccrypto with eccrypto-js for universal builds that might run in browser
      options.alias = {
        ...options.alias,
        eccrypto: "eccrypto-js",
      };
    },
    outExtension({ format }) {
      return {
        js: format === "esm" ? ".js" : ".cjs",
      };
    },
  },
]);
