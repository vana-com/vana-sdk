#!/usr/bin/env tsx
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type Violation = {
  file: string;
  match: string;
};

const DIST_DIR = join(process.cwd(), "dist");
const FORBIDDEN_PATTERNS = [
  /\bfrom\s+["'](?:\.\.\/)+crypto["']/g,
  /\bfrom\s+["']crypto["']/g,
  /\brequire\s*\(\s*["'](?:\.\.\/)+crypto["']\s*\)/g,
  /\brequire\s*\(\s*["']crypto["']\s*\)/g,
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      yield* walk(path);
      continue;
    }
    if (
      (path.endsWith(".js") || path.endsWith(".cjs")) &&
      !path.endsWith(".map")
    ) {
      yield path;
    }
  }
}

function validateNodeBuiltinsOutput(): void {
  const violations: Violation[] = [];

  for (const file of walk(DIST_DIR)) {
    const content = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        violations.push({
          file: relative(process.cwd(), file),
          match: match[0],
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error("Node builtin import validation failed:\n");
    for (const violation of violations) {
      console.error(`  ${violation.file}: ${violation.match}`);
    }
    console.error(
      "\nUse node:crypto for Node builtin imports in published output.",
    );
    process.exit(1);
  }

  console.log("Node builtin imports validated");
}

validateNodeBuiltinsOutput();
