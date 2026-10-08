import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";

describe("built ESM module specifiers", () => {
  // Node's ESM loader does not guess extensions, so every relative import in
  // dist must name a file that exists (`./x.js`, `./dir/index.js`).
  it("every relative import in dist names an existing file", () => {
    const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
    const specifier = /(?:\bfrom\s*|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;
    const unresolved: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const file = join(dir, entry);
        if (statSync(file).isDirectory()) {
          walk(file);
        } else if (file.endsWith(".js")) {
          for (const match of readFileSync(file, "utf8").matchAll(specifier)) {
            const target = resolve(dirname(file), match[1]!);
            if (!existsSync(target) || !statSync(target).isFile()) {
              unresolved.push(`${relative(distDir, file)} -> ${match[1]}`);
            }
          }
        }
      }
    };
    walk(distDir);
    expect(unresolved).toEqual([]);
  });

  it("loads protocol/jobs-client.js with the Node ESM loader", () => {
    const url = new URL("../dist/protocol/jobs-client.js", import.meta.url)
      .href;
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `const m = await import(${JSON.stringify(url)}); if (typeof m.createJobsClient !== "function") throw new Error("createJobsClient missing");`,
      ],
      { stdio: "pipe" },
    );
  });
});

describe("built error entry points", () => {
  it.each(["index.node.js", "index.browser.js"])(
    "%s resolves every auth error with the Node ESM loader",
    (entryPoint) => {
      const entryUrl = new URL(`../dist/${entryPoint}`, import.meta.url).href;
      const authErrorsUrl = new URL("../dist/auth/errors.js", import.meta.url)
        .href;
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          [
            `const root = await import(${JSON.stringify(entryUrl)});`,
            `const auth = await import(${JSON.stringify(authErrorsUrl)});`,
            "for (const name of ['MissingAuthError', 'InvalidSignatureError', 'ExpiredTokenError']) {",
            "  if (root[name] !== auth[name]) throw new Error(`${name} does not share its auth module identity`);",
            "}",
          ].join("\n"),
        ],
        { stdio: "pipe" },
      );
    },
  );

  it.each(["index.node.js", "index.browser.js"])(
    "%s shares jobs error constructors with the errors module",
    async (entryPoint) => {
      const root = (await import(
        /* @vite-ignore */ new URL(`../dist/${entryPoint}`, import.meta.url)
          .href
      )) as typeof import("./index.node");
      const errors = (await import(
        /* @vite-ignore */ new URL("../dist/errors.js", import.meta.url).href
      )) as typeof import("./errors");

      const rootExports = root as unknown as Record<string, unknown>;
      for (const [name, errorClass] of Object.entries(errors)) {
        expect(rootExports[name], name).toBe(errorClass);
      }
    },
  );

  it("recognizes jobs-client errors through the root constructor", async () => {
    const root = (await import(
      /* @vite-ignore */ new URL("../dist/index.node.js", import.meta.url).href
    )) as typeof import("./index.node");
    const jobsClient = (await import(
      /* @vite-ignore */ new URL(
        "../dist/protocol/jobs-client.js",
        import.meta.url,
      ).href
    )) as typeof import("./protocol/jobs-client");
    const client = jobsClient.createJobsClient({
      gatewayUrl: "https://gateway.test",
      chainId: 1,
      builderPrivateKey: `0x${"01".repeat(32)}` as Hex,
      fetch: async () => new Response(),
    });

    const error = await client
      .waitForJob("job-1", { timeoutMs: 0 })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(root.JobTimeoutError);
  });

  it("recognizes CommonJS jobs-client errors through the CommonJS root", () => {
    const require = createRequire(import.meta.url);
    const root = require(
      fileURLToPath(new URL("../dist/index.node.cjs", import.meta.url)),
    ) as typeof import("./index.node");
    const jobsClient = require(
      fileURLToPath(
        new URL("../dist/protocol/jobs-client.cjs", import.meta.url),
      ),
    ) as typeof import("./protocol/jobs-client");
    const client = jobsClient.createJobsClient({
      gatewayUrl: "https://gateway.test",
      chainId: 1,
      builderPrivateKey: `0x${"01".repeat(32)}` as Hex,
      fetch: async () => new Response(),
    });

    return expect(
      client.waitForJob("job-1", { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(root.JobTimeoutError);
  });

  it("shares auth error constructors through the CommonJS root", () => {
    const require = createRequire(import.meta.url);
    const root = require(
      fileURLToPath(new URL("../dist/index.node.cjs", import.meta.url)),
    ) as typeof import("./index.node");
    const auth = require(
      fileURLToPath(new URL("../dist/auth/errors.cjs", import.meta.url)),
    ) as typeof import("./auth/errors");

    expect(root.MissingAuthError).toBe(auth.MissingAuthError);
    expect(root.InvalidSignatureError).toBe(auth.InvalidSignatureError);
    expect(root.ExpiredTokenError).toBe(auth.ExpiredTokenError);
  });
});
