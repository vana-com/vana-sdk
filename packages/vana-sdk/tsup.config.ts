import { defineConfig } from "tsup";

// This configuration object is a template for platform-specific builds.
// We will call tsup from the command line with specific entry points.
export default defineConfig((options) => ({
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  // Exclude Node.js-specific dependencies from browser builds
  external: options.platform === "browser" ? ["eccrypto"] : [],
}));