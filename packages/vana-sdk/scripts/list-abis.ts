#!/usr/bin/env node
/**
 * Helper script to list all available ABI modules and their exports
 * This makes authoring contract-event-mappings.json easier
 */

import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = dirname(currentFilename);

const ABIS_DIR = join(currentDirname, "..", "src", "generated", "abi");

/**
 * Lists all available ABI modules and their exported functions.
 *
 * @remarks
 * Scans the generated ABI directory and displays module names with their
 * exported ABI arrays, making it easier to author contract-event-mappings.json
 */
async function listABIs() {
  console.log("Available ABI modules:\n");
  console.log("=".repeat(80));

  const files = readdirSync(ABIS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort();

  for (const file of files) {
    const modulePath = join(ABIS_DIR, file);
    const relativePath = `src/generated/abi/${file}`;

    try {
      // Read the file to find exports
      const content = readFileSync(modulePath, "utf-8");
      const exportMatches = content.matchAll(/export\s+const\s+(\w+ABI)\s*=/g);
      const exports = Array.from(exportMatches).map((m) => m[1]);

      if (exports.length > 0) {
        console.log(`Module: ${relativePath}`);
        console.log(`Exports: ${exports.join(", ")}`);
        console.log();
      }
    } catch (error) {
      console.warn(`Could not analyze ${file}: ${String(error)}`);
    }
  }

  console.log("=".repeat(80));
  console.log("\nExample usage in contract-event-mappings.json:");
  console.log(
    JSON.stringify(
      {
        contracts: {
          YourContract: {
            abiModule: "src/generated/abi/YourContractImplementation.ts",
            abiExport: "YourContractImplementationABI",
            functions: {
              someFunction: ["SomeEvent"],
            },
          },
        },
      },
      null,
      2,
    ),
  );
}

listABIs().catch(console.error);
