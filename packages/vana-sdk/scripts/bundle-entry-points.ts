import { build } from "esbuild";
import { dirname, relative, resolve, sep } from "node:path";
import type { Plugin } from "esbuild";

const sourceRoot = resolve("src");

function sharedErrorsPlugin(extension: ".js" | ".cjs"): Plugin {
  return {
    name: "shared-errors",
    setup(build) {
      build.onResolve(
        { filter: /^(?:\.\.?\/)+(?:[^/]+\/)*errors$/ },
        (args) => {
          const sourcePath = resolve(dirname(args.importer), args.path);
          const outputSubpath = relative(sourceRoot, sourcePath)
            .split(sep)
            .join("/");
          if (outputSubpath.startsWith("../")) {
            throw new Error(`Error module is outside src: ${sourcePath}`);
          }
          return {
            path: `./${outputSubpath}${extension}`,
            external: true,
          };
        },
      );
    },
  };
}

await build({
  entryPoints: ["src/index.node.ts"],
  outfile: "dist/index.node.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  packages: "external",
  plugins: [sharedErrorsPlugin(".js")],
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
  plugins: [sharedErrorsPlugin(".cjs")],
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
  plugins: [sharedErrorsPlugin(".js")],
  define: {
    "process.browser": "true",
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
