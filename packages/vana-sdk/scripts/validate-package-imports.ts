#!/usr/bin/env tsx
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const imports = [
  "@opendatalabs/vana-sdk/protocol/personal-server-registration",
  "@opendatalabs/vana-sdk/account/personal-server-registration",
  "@opendatalabs/vana-sdk/browser",
];

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const tempDir = mkdtempSync(join(tmpdir(), "vana-sdk-package-imports-"));

try {
  const packOutput = run(
    "npm",
    ["pack", "--pack-destination", tempDir],
    process.cwd(),
  );
  const tarball = join(tempDir, packOutput.trim().split(/\r?\n/).at(-1) ?? "");
  const consumerDir = join(tempDir, "consumer");

  run("npm", ["init", "-y"], tempDir);
  run(
    "npm",
    ["install", "--prefix", consumerDir, "--no-audit", "--no-fund", tarball],
    tempDir,
  );

  for (const specifier of imports) {
    run(
      "node",
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(specifier)})`,
      ],
      consumerDir,
    );
    console.log(`✓ ${specifier}`);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
