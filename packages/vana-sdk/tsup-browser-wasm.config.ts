import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

// Plugin to handle WASM modules for browser builds
const browserWASMPlugin: Plugin = {
  name: "browser-wasm",
  setup(build) {
    // Exclude Node.js native secp256k1 from browser builds
    build.onResolve({ filter: /^secp256k1$/ }, () => {
      return { path: "secp256k1", external: true };
    });

    // Handle WASM files
    build.onLoad({ filter: /\.wasm$/ }, async (args) => {
      const fs = await import("fs");
      const wasm = await fs.promises.readFile(args.path);
      const base64 = wasm.toString("base64");

      return {
        contents: `export default "${base64}";`,
        loader: "js",
      };
    });
  },
};

export default defineConfig({
  entry: ["src/index.browser-wasm.ts"],
  format: ["esm"],
  target: "es2020",
  platform: "browser",
  splitting: false,
  sourcemap: true,
  clean: false,
  dts: true,
  outDir: "dist",
  esbuildPlugins: [browserWASMPlugin],
  // External modules that shouldn't be bundled for browsers
  external: ["secp256k1", "crypto"],
  // Define process.browser to help with environment detection
  define: {
    "process.browser": "true",
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
