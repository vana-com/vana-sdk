import { defineConfig } from "tsup";

// This configuration object is a template for platform-specific builds.
// We will call tsup from the command line with specific entry points.
export default defineConfig((options) => ({
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  external: [
    // Only mark Node-specific deps as external for Node builds
    ...(options.platform === "node" ? ["eccrypto"] : []),
    // Only mark browser-specific deps as external for browser builds
    ...(options.platform === "browser" ? ["eccrypto-js"] : []),
  ],
}));
