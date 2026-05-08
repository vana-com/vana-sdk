import { build } from "esbuild";

await build({
  entryPoints: ["src/index.node.ts"],
  outfile: "dist/index.node.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  packages: "external",
});

await build({
  entryPoints: ["src/index.node.ts"],
  outfile: "dist/index.node.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  packages: "external",
});

await build({
  entryPoints: ["src/index.browser.ts"],
  outfile: "dist/index.browser.js",
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "esm",
  sourcemap: true,
  packages: "external",
  external: ["crypto", "secp256k1"],
  define: {
    "process.browser": "true",
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
