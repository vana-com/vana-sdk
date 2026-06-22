import { describe, expect, it, vi } from "vitest";
import { keccak256, stringToHex, type Address, type PublicClient } from "viem";

import {
  FEE_REGISTRY_ABI,
  REGISTRATION_KIND_FOR_OP,
  getFee,
  getOpFee,
  type FeeKind,
} from "./fee-registry";

const FEE_REGISTRY_ADDRESS =
  "0x6666666666666666666666666666666666666666" as Address;

const PAYEE_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PAYEE_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NATIVE = "0x0000000000000000000000000000000000000000";
const ERC20 = "0xcccccccccccccccccccccccccccccccccccccccc";

// Stand-in for a viem PublicClient. The helper only touches `readContract`;
// nothing else of the surface is needed.
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
      for (const [name, entry] of Object.entries(fees)) {
        if (keccak256(stringToHex(name)) === args[0]) return entry;
      }
      // Unset keys return the all-zero default — matches the on-chain
      // FeeRegistry's "no entry → enabled=false, amount=0" semantics.
      return { amount: 0n, asset: NATIVE, payee: NATIVE, enabled: false };
    }
    throw new Error(`unexpected call: ${String(req["functionName"])}`);
  });
  return { readContract } as unknown as PublicClient;
}

describe("FeeRegistry adapter", () => {
  it("REGISTRATION_KIND_FOR_OP maps the four user-facing opTypes to fee kinds", () => {
    expect(REGISTRATION_KIND_FOR_OP).toEqual({
      grant: "grant_registration",
      data: "data_registration",
      server: "server_registration",
      builder: "builder_registration",
    } satisfies Record<string, FeeKind>);
  });

  it("reads one fee kind end-to-end against the on-chain bytes32 key", async () => {
    const client = mockClient({
      grant_registration: {
        amount: 10_000_000_000_000_000n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
    });
    await expect(
      getFee(client, FEE_REGISTRY_ADDRESS, "grant_registration"),
    ).resolves.toEqual({
      amount: 10_000_000_000_000_000n,
      asset: NATIVE,
      payee: PAYEE_A,
      enabled: true,
    });
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: FEE_REGISTRY_ADDRESS,
        abi: FEE_REGISTRY_ABI,
        functionName: "operationKey",
        args: ["grant_registration"],
      }),
    );
  });

  it("honors custom operation names for chains where the deployer renamed them", async () => {
    const client = mockClient({
      "grant_registration.v2": {
        amount: 1n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
    });
    await expect(
      getFee(client, FEE_REGISTRY_ADDRESS, "grant_registration", {
        grantRegistrationOpName: "grant_registration.v2",
      }),
    ).resolves.toMatchObject({ amount: 1n });
  });

  it("returns disabled fees without throwing — disabled is a valid steady state", async () => {
    // Previously this threw "not enabled"; now the gateway treats disabled
    // entries as "no payment required for this kind" and the SDK must
    // surface that without forcing callers into try/catch.
    const client = mockClient({
      grant_registration: {
        amount: 0n,
        asset: NATIVE,
        payee: NATIVE,
        enabled: false,
      },
    });
    await expect(
      getFee(client, FEE_REGISTRY_ADDRESS, "grant_registration"),
    ).resolves.toEqual({
      amount: 0n,
      asset: NATIVE,
      payee: NATIVE,
      enabled: false,
    });
  });

  it("throws when an ENABLED fee has a zero-address payee", async () => {
    // Disabled + zero payee is fine (the fee never lands as a SettleOp).
    // Enabled + zero payee is a misconfig the contract's settle pre-flight
    // would reject anyway — surface it early.
    const client = mockClient({
      data_access: { amount: 1n, asset: NATIVE, payee: NATIVE, enabled: true },
    });
    await expect(
      getFee(client, FEE_REGISTRY_ADDRESS, "data_access"),
    ).rejects.toThrow(/zero-address payee/);
  });

  it("getOpFee('grant') combines registration + data_access with enabled flags", async () => {
    const client = mockClient({
      grant_registration: {
        amount: 10n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
      data_access: { amount: 1n, asset: NATIVE, payee: PAYEE_B, enabled: true },
    });
    await expect(
      getOpFee(client, FEE_REGISTRY_ADDRESS, "grant"),
    ).resolves.toEqual({
      asset: NATIVE,
      registrationFee: 10n,
      dataAccessFee: 1n,
      registrationEnabled: true,
      dataAccessEnabled: true,
      registrationPayee: PAYEE_A,
      dataAccessPayee: PAYEE_B,
    });
  });

  it("getOpFee zeros disabled components without throwing", async () => {
    // Both kinds disabled → totalDue = 0, gateway 'Payment not required'.
    // Callers detect by checking either *Enabled flag or seeing zero amounts.
    const client = mockClient({});
    const fee = await getOpFee(client, FEE_REGISTRY_ADDRESS, "grant");
    expect(fee.registrationEnabled).toBe(false);
    expect(fee.dataAccessEnabled).toBe(false);
    expect(fee.registrationFee).toBe(0n);
    expect(fee.dataAccessFee).toBe(0n);
    expect(fee.registrationPayee).toBe(NATIVE);
    expect(fee.dataAccessPayee).toBe(NATIVE);
  });

  it("getOpFee for non-grant opTypes never reads data_access", async () => {
    // Server/builder/data-point ops have a single registration fee — the
    // data_access surcharge only applies to grants. We assert this by
    // making data_access cause an error if anyone reads it.
    const client = mockClient({
      server_registration: {
        amount: 5n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
    });
    const fee = await getOpFee(client, FEE_REGISTRY_ADDRESS, "server");
    expect(fee).toEqual({
      asset: NATIVE,
      registrationFee: 5n,
      dataAccessFee: 0n,
      registrationEnabled: true,
      dataAccessEnabled: false,
      registrationPayee: PAYEE_A,
      dataAccessPayee: NATIVE,
    });
    // Verify data_access was not queried — the mock would have returned a
    // disabled stub anyway, but we want to confirm the optimization.
    expect(client.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["data_access"],
      }),
    );
  });

  it("getOpFee throws asset mismatch ONLY when both kinds are enabled", async () => {
    // The pay handler takes a single `asset` on the payload, so a
    // disagreement between two enabled kinds is an unsignable payment.
    const client = mockClient({
      grant_registration: {
        amount: 10n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
      data_access: { amount: 1n, asset: ERC20, payee: PAYEE_B, enabled: true },
    });
    await expect(
      getOpFee(client, FEE_REGISTRY_ADDRESS, "grant"),
    ).rejects.toThrow(/asset mismatch/);
  });

  it("getOpFee tolerates asset 'mismatch' when one kind is disabled", async () => {
    // Disabled fees never settle, so their asset is moot. Don't block the
    // caller on what's effectively an inactive value.
    const client = mockClient({
      grant_registration: {
        amount: 10n,
        asset: NATIVE,
        payee: PAYEE_A,
        enabled: true,
      },
      data_access: {
        amount: 1n,
        asset: ERC20,
        payee: PAYEE_B,
        enabled: false,
      },
    });
    const fee = await getOpFee(client, FEE_REGISTRY_ADDRESS, "grant");
    expect(fee.asset).toBe(NATIVE);
    expect(fee.dataAccessEnabled).toBe(false);
    expect(fee.dataAccessFee).toBe(0n);
  });

  it("getOpFee throws on unknown opType", async () => {
    const client = mockClient({});
    await expect(
      getOpFee(client, FEE_REGISTRY_ADDRESS, "schema"),
    ).rejects.toThrow(/unknown opType "schema"/);
  });
});
