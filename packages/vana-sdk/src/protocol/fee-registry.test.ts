import { describe, expect, it, vi } from "vitest";
import { keccak256, stringToHex, type PublicClient } from "viem";

import { FEE_REGISTRY_ABI, getFee, getOpFee } from "./fee-registry";
import type { DataPortabilityGatewayConfig } from "./eip712";

const FEE_REGISTRY_ADDRESS = "0x6666666666666666666666666666666666666666";

const CONFIG: DataPortabilityGatewayConfig = {
  chainId: 14800,
  contracts: {
    dataRegistry: "0x1111111111111111111111111111111111111111",
    dataPortabilityPermissions: "0x2222222222222222222222222222222222222222",
    dataPortabilityServer: "0x3333333333333333333333333333333333333333",
    dataPortabilityGrantees: "0x4444444444444444444444444444444444444444",
    dataPortabilityEscrow: "0x5555555555555555555555555555555555555555",
    feeRegistry: FEE_REGISTRY_ADDRESS,
  },
};

const PAYEE_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PAYEE_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NATIVE = "0x0000000000000000000000000000000000000000";
const ERC20 = "0xcccccccccccccccccccccccccccccccccccccccc";

// Stand-in for a viem PublicClient. We only need readContract; the helper
// doesn't touch the rest of the surface.
function mockClient(
  fees: Record<
    string,
    { amount: bigint; asset: string; payee: string; enabled: boolean }
  >,
): PublicClient {
  const readContract = vi.fn(async (req: Record<string, unknown>) => {
    if (req["functionName"] === "operationKey") {
      const args = req["args"] as [string];
      return keccak256(stringToHex(args[0]));
    }
    if (req["functionName"] === "fees") {
      const args = req["args"] as [string];
      // Match by recomputing keys from each known name.
      for (const [name, entry] of Object.entries(fees)) {
        if (keccak256(stringToHex(name)) === args[0]) return entry;
      }
      throw new Error(`unexpected fees() key: ${args[0]}`);
    }
    throw new Error(`unexpected call: ${String(req["functionName"])}`);
  });
  return { readContract } as unknown as PublicClient;
}

describe("FeeRegistry adapter", () => {
  it("reads one fee kind end-to-end and resolves the on-chain bytes32 key", async () => {
    const client = mockClient({
      registration: {
        amount: 10_000_000_000_000_000n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
    });
    await expect(getFee(client, CONFIG, "registration")).resolves.toEqual({
      amount: 10_000_000_000_000_000n,
      asset: NATIVE,
      payee: PAYEE_A,
      enabled: true,
    });
    // Verify the contract address + ABI shape the SDK uses match what the
    // gateway expects — any drift here would mean the gateway resolves a
    // different fee than the SDK and /v1/escrow/pay rejects the amount.
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: FEE_REGISTRY_ADDRESS,
        abi: FEE_REGISTRY_ABI,
        functionName: "operationKey",
        args: ["registration"],
      }),
    );
  });

  it("honors custom operation names for chains where the deployer renamed them", async () => {
    const client = mockClient({
      "registration.v2": {
        amount: 1n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
    });
    await expect(
      getFee(client, CONFIG, "registration", {
        registrationOpName: "registration.v2",
      }),
    ).resolves.toMatchObject({ amount: 1n });
  });

  it("throws when the fee is disabled — operator never called setFeeByName", async () => {
    const client = mockClient({
      registration: {
        amount: 0n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: false,
      },
    });
    await expect(getFee(client, CONFIG, "registration")).rejects.toThrow(
      /not enabled/,
    );
  });

  it("throws when the payee is the zero address — settle pre-flight would revert", async () => {
    const client = mockClient({
      data_access: { amount: 1n, asset: NATIVE, payee: NATIVE, enabled: true },
    });
    await expect(getFee(client, CONFIG, "data_access")).rejects.toThrow(
      /zero-address payee/,
    );
  });

  it("getOpFee combines both kinds when they share an asset", async () => {
    const client = mockClient({
      registration: {
        amount: 10n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
      data_access: { amount: 1n, asset: NATIVE, payee: PAYEE_B, enabled: true },
    });
    await expect(getOpFee(client, CONFIG)).resolves.toEqual({
      asset: NATIVE,
      registrationFee: 10n,
      dataAccessFee: 1n,
      registrationPayee: PAYEE_A,
      dataAccessPayee: PAYEE_B,
    });
  });

  it("getOpFee throws when the two kinds disagree on asset", async () => {
    // The pay handler takes a single `asset` on the payload — a registration
    // fee in NATIVE plus a data-access fee in ERC20 has no way to settle in
    // one signed payment. Catch the misconfig before signing.
    const client = mockClient({
      registration: {
        amount: 10n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
      data_access: { amount: 1n, asset: ERC20, payee: PAYEE_B, enabled: true },
    });
    await expect(getOpFee(client, CONFIG)).rejects.toThrow(/asset mismatch/);
  });
});
