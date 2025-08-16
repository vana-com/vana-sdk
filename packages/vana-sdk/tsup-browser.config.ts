import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

// Custom plugin to redirect eccrypto-js imports to browser-compatible versions
const eccryptoBrowserPlugin: Plugin = {
  name: "eccrypto-browser",
  setup(build) {
    // Redirect Node.js specific modules to browser versions
    build.onResolve({ filter: /eccrypto-js\/dist\/cjs\/lib\/node/ }, () => {
      return { path: require.resolve("eccrypto-js/dist/cjs/lib/browser") };
    });
    
    build.onResolve({ filter: /eccrypto-js\/dist\/cjs\/lib\/secp256k1/ }, () => {
      return { path: require.resolve("eccrypto-js/dist/cjs/lib/elliptic") };
    });
    
    // Prevent Node.js crypto from being imported
    build.onResolve({ filter: /^crypto$/ }, (args) => {
      if (args.importer.includes("eccrypto-js")) {
        return { path: "crypto", external: true };
      }
    });
  },
};

export default defineConfig({
  entry: ["src/index.browser.ts"],
  format: ["esm"],
  target: "es2020",
  platform: "browser",
  splitting: false,
  sourcemap: true,
  clean: false,
  dts: true,
  outDir: "dist",
  esbuildPlugins: [eccryptoBrowserPlugin],
  // Don't externalize eccrypto-js for browser builds
  external: [],
  // Define process.browser to help with environment detection
  define: {
    "process.browser": "true",
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});