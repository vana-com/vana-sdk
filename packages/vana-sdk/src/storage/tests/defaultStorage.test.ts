import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { createVanaStorageProvider } from "../default";

const TEST_PK = `0x${"a".repeat(64)}` as `0x${string}`;
const account = privateKeyToAccount(TEST_PK);

describe("createVanaStorageProvider", () => {
  it("creates the SDK default vana-storage provider", () => {
    const provider = createVanaStorageProvider({
      endpoint: "https://storage.example.com",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      signer: {
        address: account.address,
        signMessage: (message) => account.signMessage({ message }),
      },
    });

    expect(provider.getConfig()).toMatchObject({
      type: "vana-storage",
      features: { upload: true, download: true, list: false },
    });
  });
});
