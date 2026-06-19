import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import {
  buildPersonalServerLiteOwnerBindingMessage,
  buildPersonalServerLiteOwnerBindingSignature,
  createViemPersonalServerLiteOwnerBindingSigner,
  PERSONAL_SERVER_LITE_OWNER_BINDING_PREFIX,
  PERSONAL_SERVER_LITE_OWNER_BINDING_PURPOSE,
} from "./owner-binding";

const OWNER_ADDRESS = "0x2ab394e4be7c43ac360d226a31e1c90bc01aafa1" as Address;
const LOWER_OWNER_ADDRESS = "0x2ab394e4be7c43ac360d226a31e1c90bc01aafa1";
const SIGNATURE = `0x${"bb".repeat(65)}` as const;

describe("PS Lite owner-binding helpers", () => {
  it("builds the stable owner-binding message expected by PS Lite", () => {
    expect(PERSONAL_SERVER_LITE_OWNER_BINDING_PREFIX).toBe(
      "vana.ps-lite.owner-binding.v1:ps-lite-owner:",
    );
    expect(buildPersonalServerLiteOwnerBindingMessage(OWNER_ADDRESS)).toBe(
      `vana.ps-lite.owner-binding.v1:ps-lite-owner:${LOWER_OWNER_ADDRESS}`,
    );
  });

  it("rejects invalid owner addresses", () => {
    expect(() =>
      buildPersonalServerLiteOwnerBindingMessage("not-an-address" as never),
    ).toThrow("ownerAddress must be a valid EVM address");
  });

  it("signs the owner-binding message with a generic signer", async () => {
    const signer = {
      address: OWNER_ADDRESS,
      signMessage: vi.fn().mockResolvedValue(SIGNATURE),
    };

    const result = await buildPersonalServerLiteOwnerBindingSignature({
      signer,
    });

    const message = `vana.ps-lite.owner-binding.v1:ps-lite-owner:${LOWER_OWNER_ADDRESS}`;
    expect(signer.signMessage).toHaveBeenCalledWith({ message });
    expect(result).toEqual({
      signature: SIGNATURE,
      signerAddress: OWNER_ADDRESS,
      message,
      purpose: PERSONAL_SERVER_LITE_OWNER_BINDING_PURPOSE,
    });
  });

  it("adapts viem wallet clients without hiding the explicit account", async () => {
    const walletClient = {
      signMessage: vi.fn().mockResolvedValue(SIGNATURE),
    };
    const signer = createViemPersonalServerLiteOwnerBindingSigner(
      walletClient,
      { account: OWNER_ADDRESS },
    );

    const message = buildPersonalServerLiteOwnerBindingMessage(OWNER_ADDRESS);
    await signer.signMessage({ message });

    expect(signer.address).toBe(OWNER_ADDRESS);
    expect(walletClient.signMessage).toHaveBeenCalledWith({
      account: OWNER_ADDRESS,
      message,
    });
  });
});
