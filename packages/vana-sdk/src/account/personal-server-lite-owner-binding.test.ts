import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { signPersonalServerLiteOwnerBindingWithAccountClient } from "./personal-server-lite-owner-binding";
import type { AccountPersonalServerLiteOwnerBindingError } from "./personal-server-lite-owner-binding";

const OWNER_ADDRESS = "0x2ab394e4be7c43ac360d226a31e1c90bc01aafa1" as Address;
const LOWER_OWNER_ADDRESS = "0x2ab394e4be7c43ac360d226a31e1c90bc01aafa1";
const SIGNATURE = `0x${"cc".repeat(65)}` as const;

describe("Account PS Lite owner-binding integration", () => {
  it("gets the Account wallet and signs the PS Lite owner-binding message", async () => {
    const client = {
      getAddress: vi.fn().mockResolvedValue(OWNER_ADDRESS),
      signMessage: vi.fn().mockResolvedValue(SIGNATURE),
    };

    const result = await signPersonalServerLiteOwnerBindingWithAccountClient({
      client,
    });

    const message = `vana.account.v1:ps-lite-owner:${LOWER_OWNER_ADDRESS}`;
    expect(client.signMessage).toHaveBeenCalledWith({ message });
    expect(result).toEqual({
      signature: SIGNATURE,
      signerAddress: OWNER_ADDRESS,
      message,
      purpose: "ps-lite-owner",
    });
  });

  it("uses a typed Account error when Account has no wallet", async () => {
    const client = {
      getAddress: vi.fn().mockResolvedValue(null),
      signMessage: vi.fn(),
    };

    await expect(
      signPersonalServerLiteOwnerBindingWithAccountClient({ client }),
    ).rejects.toMatchObject({
      name: "AccountPersonalServerLiteOwnerBindingError",
      code: "account_address_required",
    } satisfies Partial<AccountPersonalServerLiteOwnerBindingError>);
  });

  it("preserves wallet rejection codes", async () => {
    const rejection = Object.assign(new Error("User rejected request"), {
      code: 4001,
    });
    const client = {
      getAddress: vi.fn().mockResolvedValue(OWNER_ADDRESS),
      signMessage: vi.fn().mockRejectedValue(rejection),
    };

    await expect(
      signPersonalServerLiteOwnerBindingWithAccountClient({ client }),
    ).rejects.toMatchObject({
      name: "AccountPersonalServerLiteOwnerBindingError",
      code: 4001,
      message: "User rejected request",
      details: rejection,
    } satisfies Partial<AccountPersonalServerLiteOwnerBindingError>);
  });
});
