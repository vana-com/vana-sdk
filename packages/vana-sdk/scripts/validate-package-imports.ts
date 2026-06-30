#!/usr/bin/env tsx
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const imports = [
  "@opendatalabs/vana-sdk/protocol/personal-server-registration",
  "@opendatalabs/vana-sdk/protocol/personal-server-lite-owner-binding",
  "@opendatalabs/vana-sdk/account/personal-server-registration",
  "@opendatalabs/vana-sdk/account/personal-server-lite-owner-binding",
  "@opendatalabs/vana-sdk/browser",
  "@opendatalabs/vana-sdk/session-relay",
];

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function validateTypeScriptConsumer(consumerDir: string): void {
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify({ type: "module" }, null, 2),
  );
  writeFileSync(
    join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "Node16",
          moduleResolution: "Node16",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        include: ["index.ts"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(consumerDir, "index.ts"),
    [
      'import { createSessionRelayBuilderClient, SessionRelayError, type SessionRelayInitResult } from "@opendatalabs/vana-sdk/session-relay";',
      "",
      "const relay = createSessionRelayBuilderClient({",
      '  granteeAddress: "0x0000000000000000000000000000000000000000",',
      '  signMessage: async () => "0x00",',
      "});",
      "const initResult: Promise<SessionRelayInitResult> = relay.initSession({",
      '  scopes: ["test.scope"],',
      "});",
      "void initResult;",
      "void SessionRelayError;",
      "",
    ].join("\n"),
  );

  run(
    process.execPath,
    [
      join(process.cwd(), "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "-p",
      consumerDir,
    ],
    consumerDir,
  );
  console.log("✓ TypeScript consumer imports");
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

  validateTypeScriptConsumer(consumerDir);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
