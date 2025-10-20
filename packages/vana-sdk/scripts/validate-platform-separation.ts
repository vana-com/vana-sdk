#!/usr/bin/env tsx
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

type Violation = {
  file: string;
  issue: string;
};

const NODE_ONLY = [
  "fs",
  "path",
  "crypto",
  "stream",
  "buffer",
  "secp256k1",
  "child_process",
];
const BROWSER_ONLY = ["@noble/secp256k1"];

function* walkSync(dir: string): Generator<string> {
  const files = readdirSync(dir);
  for (const file of files) {
    const path = join(dir, file);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (
        !path.includes("node_modules") &&
        !path.includes("__tests__") &&
        !path.includes("tests")
      ) {
        yield* walkSync(path);
      }
    } else if (
      path.endsWith(".ts") &&
      !path.includes(".test.") &&
      !path.includes(".spec.")
    ) {
      yield path;
    }
  }
}

function checkImports(
  file: string,
  content: string,
  forbidden: string[],
  type: string,
): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<string>();

  // Multiple regex patterns to catch different import styles
  const patterns = [
    /import\s+.*?\s+from\s+["']([^"']+)["']/g,
    /import\s*\(["']([^"']+)["']\)/g,
    /require\s*\(["']([^"']+)["']\)/g,
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const importPath = match[1];
      for (const pkg of forbidden) {
        if (importPath === pkg || importPath.startsWith(pkg + "/")) {
          const key = `${file}:${pkg}`;
          if (!seen.has(key)) {
            seen.add(key);
            violations.push({
              file: relative(process.cwd(), file),
              issue: `${type} file imports forbidden package: ${pkg}`,
            });
          }
        }
      }
    }
  }

  return violations;
}

async function validate(): Promise<void> {
  const violations: Violation[] = [];
  const srcPath = join(process.cwd(), "src");

  for (const file of walkSync(srcPath)) {
    const content = readFileSync(file, "utf-8");

    // Check browser files
    if (file.includes(".browser.")) {
      violations.push(...checkImports(file, content, NODE_ONLY, "Browser"));
    }

    // Check node files
    if (file.includes(".node.")) {
      violations.push(...checkImports(file, content, BROWSER_ONLY, "Node"));
    }

    // Check cross-platform imports in platform-specific files
    if (file.includes("/platform/browser")) {
      violations.push(
        ...checkImports(file, content, NODE_ONLY, "Browser platform"),
      );
    }

    if (file.includes("/platform/node")) {
      violations.push(
        ...checkImports(file, content, BROWSER_ONLY, "Node platform"),
      );
    }
  }

  // Verify exports exist
  const pkgJson = JSON.parse(readFileSync("package.json", "utf-8"));
  const exports = pkgJson.exports ?? {};

  // Check main entry points exist
  const criticalExports = [
    ".",
    "./browser",
    "./node",
    "./chains",
    "./platform",
  ];
  for (const exp of criticalExports) {
    if (!exports[exp]) {
      violations.push({
        file: "package.json",
        issue: `Missing critical export: ${exp}`,
      });
    }
  }

  // Report
  if (violations.length > 0) {
    console.error("❌ Platform separation violations found:\n");
    violations.forEach((v) => {
      console.error(`  ${v.file}: ${v.issue}`);
    });
    process.exit(1);
  } else {
    console.log("✅ Platform separation validated - no violations found");
    console.log("  ✓ Browser files don't import Node modules");
    console.log("  ✓ Node files don't import browser-only modules");
    console.log("  ✓ Package exports are properly defined");
  }
}

validate().catch((err) => {
  console.error("Validation error:", err);
  process.exit(1);
});
