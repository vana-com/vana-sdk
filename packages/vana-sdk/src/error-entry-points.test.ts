import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";

describe("built error entry points", () => {
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
});
