import { describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, recoverMessageAddress } from "viem";
import { mokshaTestnet } from "../chains";
import { WriteRequestError } from "../errors";
import { resolveWriteSigner } from "./write-signer";

const account = privateKeyToAccount(generatePrivateKey());

describe("resolveWriteSigner", () => {
  it("wraps a viem LocalAccount", async () => {
    const signer = resolveWriteSigner(account);
    expect(signer.address).toBe(account.address);
    const signature = await signer.signMessage("payload");
    expect(await recoverMessageAddress({ message: "payload", signature })).toBe(
      account.address,
    );
  });

  it("wraps a real viem createWalletClient with a hoisted account", async () => {
    const client = createWalletClient({
      account,
      chain: mokshaTestnet,
      transport: http("http://127.0.0.1:1"),
    });
    const signer = resolveWriteSigner(client);
    expect(signer.address).toBe(account.address);
    const signature = await signer.signMessage("payload");
    expect(await recoverMessageAddress({ message: "payload", signature })).toBe(
      account.address,
    );
  });

  it("wraps a real viem createWalletClient without an account via the account option", async () => {
    const client = createWalletClient({
      chain: mokshaTestnet,
      transport: http("http://127.0.0.1:1"),
    });
    const signer = resolveWriteSigner(client, { account });
    expect(signer.address).toBe(account.address);
    const signature = await signer.signMessage("payload");
    expect(await recoverMessageAddress({ message: "payload", signature })).toBe(
      account.address,
    );
    expect(() => resolveWriteSigner(client)).toThrow(WriteRequestError);
  });

  it("wraps a viem WalletClient with a hoisted account", async () => {
    const signMessage = vi.fn(
      async (args: { account: unknown; message: string }) =>
        account.signMessage({ message: args.message }),
    );
    const signer = resolveWriteSigner({
      type: "walletClient",
      account,
      signMessage,
    });
    expect(signer.address).toBe(account.address);
    await signer.signMessage("m");
    expect(signMessage).toHaveBeenCalledWith({ account, message: "m" });
  });

  it("uses the account option for a WalletClient without one", async () => {
    const signMessage = vi.fn(async () => "0xsig" as `0x${string}`);
    const signer = resolveWriteSigner(
      { type: "walletClient", signMessage },
      { account: account.address },
    );
    expect(signer.address).toBe(account.address);
    await signer.signMessage("m");
    expect(signMessage).toHaveBeenCalledWith({
      account: account.address,
      message: "m",
    });
  });

  it("rejects a WalletClient with no account at all", () => {
    expect(() =>
      resolveWriteSigner({
        type: "walletClient",
        signMessage: async () => "0x" as `0x${string}`,
      }),
    ).toThrow(WriteRequestError);
  });

  it("passes a bare { signMessage } through unchanged", () => {
    const signer = { signMessage: async () => "0x" as `0x${string}` };
    expect(resolveWriteSigner(signer)).toBe(signer);
  });

  it("rejects objects without signMessage", () => {
    expect(() =>
      resolveWriteSigner(
        {} as unknown as Parameters<typeof resolveWriteSigner>[0],
      ),
    ).toThrow(WriteRequestError);
  });
});
