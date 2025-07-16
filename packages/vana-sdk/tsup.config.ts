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
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
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
    format: ["esm"],
    platform: "browser",
    target: "es2020",
    outDir: "dist",
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: false, // Don't clean since Node build runs first
    treeshake: true,
    external: [
      "viem",
      "ethers",
      "@openpgp/web-stream-tools",
      "openpgp",
      "jose",
    ],
    define: { 
      "process.env.NODE_ENV": `"production"`,
      // Prevent any Node.js globals from being referenced
      "global": "globalThis",
    },
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
      chains: "src/chains/index.ts",
      types: "src/types/index.ts",
      errors: "src/errors.ts",
    },
    format: ["esm", "cjs"],
    platform: "neutral",
    target: "node18",
    outDir: "dist",
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    external: [
      "viem",
      "ethers",
      "@openpgp/web-stream-tools",
      "openpgp",
      "jose",
    ],
    outExtension({ format }) {
      return {
        js: format === "esm" ? ".js" : ".cjs",
      };
    },
  },
  // Platform-specific exports (Node.js)
  {
    entry: {
      "platform/node": "src/platform/node.ts",
      "platform/index": "src/platform/index.ts",
    },
    format: ["esm", "cjs"],
    platform: "node",
    target: "node18",
    outDir: "dist",
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
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
  // Platform-specific exports (Browser)
  {
    entry: {
      "platform/browser": "src/platform/browser.ts",
      "platform/interface": "src/platform/interface.ts",
    },
    format: ["esm", "cjs"],
    platform: "browser",
    target: "es2020",
    outDir: "dist",
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    external: [
      "viem",
      "ethers",
      "@openpgp/web-stream-tools",
      "openpgp",
      "jose",
    ],
    esbuildOptions(options) {
      options.conditions = ["browser"];
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
