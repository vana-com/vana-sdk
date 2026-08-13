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
  "@opendatalabs/vana-sdk/server",
  "@opendatalabs/vana-sdk/direct/escrow-payment",
  "@opendatalabs/vana-sdk/direct/personal-server-read",
  "@opendatalabs/vana-sdk/browser",
  "@opendatalabs/vana-sdk/session-relay",
];

const browserBlockedImports = [
  "@opendatalabs/vana-sdk/direct/escrow-payment",
  "@opendatalabs/vana-sdk/direct/personal-server-read",
];

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function validateBrowserBlockedImport(specifier: string, cwd: string): void {
  try {
    run(
      "node",
      [
        "--conditions=browser",
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(specifier)})`,
      ],
      cwd,
    );
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "";
    const stdout =
      error && typeof error === "object" && "stdout" in error
        ? String(error.stdout)
        : "";
    const output = `${stderr}\n${stdout}`;

    if (
      output.includes("ERR_PACKAGE_PATH_NOT_EXPORTED") ||
      output.includes("Package subpath")
    ) {
      console.log(`✓ browser condition blocks ${specifier}`);
      return;
    }

    throw error;
  }

  throw new Error(`Browser condition unexpectedly resolved ${specifier}`);
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
      'import { buildEscrowPaymentHeader, type EscrowPaymentConfig, type EscrowPaymentHeaderConfig, type SignTypedDataFn } from "@opendatalabs/vana-sdk/server";',
      'import { buildEscrowPaymentHeader as buildDirectEscrowPaymentHeader } from "@opendatalabs/vana-sdk/direct/escrow-payment";',
      'import { readPersonalServerData } from "@opendatalabs/vana-sdk/direct/personal-server-read";',
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
      'const signTypedData = (async () => "0x00") as SignTypedDataFn;',
      "const headerConfig = {",
      '  escrowContract: "0x0000000000000000000000000000000000000001",',
      "  chainId: 14800,",
      "  signTypedData,",
      "} satisfies EscrowPaymentHeaderConfig;",
      "const legacyConfig = {",
      "  ...headerConfig,",
      '  client: {} as EscrowPaymentConfig["client"],',
      "} satisfies EscrowPaymentConfig;",
      'const headerOnlyInput: Parameters<typeof buildEscrowPaymentHeader>[0]["config"] =',
      "  headerConfig;",
      'const legacyInput: Parameters<typeof buildEscrowPaymentHeader>[0]["config"] =',
      "  legacyConfig;",
      "void headerOnlyInput;",
      "void legacyInput;",
      "void buildDirectEscrowPaymentHeader;",
      "void readPersonalServerData;",
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

  for (const specifier of browserBlockedImports) {
    validateBrowserBlockedImport(specifier, consumerDir);
  }

  validateTypeScriptConsumer(consumerDir);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
