#!/usr/bin/env tsx
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const specifierPattern =
  /(\bfrom\s*["']|import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["'])/g;

function collectJsFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...collectJsFiles(path));
      continue;
    }

    if (path.endsWith(".js")) {
      files.push(path);
    }
  }

  return files;
}

function hasExplicitTarget(specifier: string): boolean {
  const extension = extname(specifier);
  return extension !== "";
}

function resolveEsmTarget(importer: string, specifier: string): string | null {
  if (hasExplicitTarget(specifier)) {
    return null;
  }

  const basePath = resolve(dirname(importer), specifier);
  if (existsSync(`${basePath}.js`)) {
    return `${specifier}.js`;
  }

  if (existsSync(join(basePath, "index.js"))) {
    return `${specifier}/index.js`;
  }

  return null;
}

if (!existsSync(distDir)) {
  throw new Error(
    "dist directory does not exist. Run the build before fixing ESM imports.",
  );
}

let filesChanged = 0;
let importsChanged = 0;

for (const file of collectJsFiles(distDir)) {
  const original = readFileSync(file, "utf8");
  let fileImportsChanged = 0;

  const updated = original.replace(
    specifierPattern,
    (match, prefix: string, specifier: string, suffix: string) => {
      const target = resolveEsmTarget(file, specifier);
      if (!target) {
        return match;
      }

      fileImportsChanged += 1;
      return `${prefix}${target}${suffix}`;
    },
  );

  if (updated !== original) {
    writeFileSync(file, updated);
    filesChanged += 1;
    importsChanged += fileImportsChanged;
  }
}

console.log(
  `Fixed ${importsChanged} ESM import specifier${importsChanged === 1 ? "" : "s"} in ${filesChanged} file${filesChanged === 1 ? "" : "s"} under ${relative(process.cwd(), distDir)}`,
);
