import { describe, expect, it } from "vitest";

import { createVanaStorageProvider } from "../default";

describe("createVanaStorageProvider", () => {
  it("creates the SDK default storage provider from R2 env", () => {
    const provider = createVanaStorageProvider({
      env: {
        R2_ACCOUNT_ID: "acct",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET: "bucket",
      },
    });

    expect(provider.getConfig()).toMatchObject({
      type: "r2",
      features: { upload: true, download: true },
    });
  });
});
