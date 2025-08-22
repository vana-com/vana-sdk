import { defineConfig } from "tsup";

// This configuration object is a template for platform-specific builds.
// We will call tsup from the command line with specific entry points.
export default defineConfig((options) => ({
  splitting: false,
  sourcemap: true,
  clean: false,
  dts: true,
  bundle: false,
  loader: {
    ".json": "copy",
  },
  external: [
    // Node-specific dependencies that should not be bundled
    // secp256k1 is a native module that should be externalized for Node builds
    ...(options.platform === "node" ? ["secp256k1"] : []),
  ],
}));
