#!/usr/bin/env tsx
/**
 * Validates that only approved entry points are exposed in package.json exports.
 * This ensures architectural boundaries are maintained.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { ALL_ENTRY_POINTS as APPROVED_ENTRY_POINTS } from "./entry-points";

function validateEntryPoints(): void {
  const pkgPath = join(process.cwd(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  const violations: string[] = [];

  // Check main/types fields
  if (pkg.main && !pkg.main.includes("index.node")) {
    violations.push(`Main field points to non-standard entry: ${pkg.main}`);
  }

  // Check exports field
  if (pkg.exports) {
    for (const [exportPath] of Object.entries(pkg.exports)) {
      // Skip wildcard exports - those are for internal use
      if (exportPath.includes("*")) continue;

      // Remove leading "./" and trailing extensions
      const cleanPath = exportPath
        .replace(/^\.?\/?/, "")
        .replace(/\.[^.]+$/, "");

      // Empty string means root export (".")
      if (cleanPath === "" || cleanPath === ".") continue;

      // Check if this export is in our approved list
      if (!APPROVED_ENTRY_POINTS.includes(cleanPath)) {
        violations.push(`Unapproved export path: "${exportPath}"`);
      }
    }
  }

  // Check that all approved entry points exist as source files
  for (const entryPoint of APPROVED_ENTRY_POINTS) {
    const srcPath = join(process.cwd(), "src", `${entryPoint}.ts`);
    if (!existsSync(srcPath)) {
      violations.push(`Missing source file for entry point: ${entryPoint}.ts`);
    }
  }

  // Report results
  if (violations.length > 0) {
    console.error("❌ Entry point validation failed:\n");
    violations.forEach((v) => {
      console.error(`  - ${v}`);
    });
    console.error("\nOnly the following entry points should be exposed:");
    APPROVED_ENTRY_POINTS.forEach((ep) => {
      console.error(`  - ${ep}`);
    });
    process.exit(1);
  } else {
    console.log("✅ Entry points validated successfully");
    console.log(`  ✓ ${APPROVED_ENTRY_POINTS.length} approved entry points`);
    console.log("  ✓ No unauthorized exports in package.json");
  }
}

validateEntryPoints();
