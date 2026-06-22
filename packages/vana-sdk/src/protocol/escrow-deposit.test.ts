import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import {
  ESCROW_DEPOSIT_ABI,
  buildDepositNativeRequest,
  buildDepositTokenRequest,
  encodeDepositNativeData,
  encodeDepositTokenData,
  escrowContractAddress,
} from "./escrow-deposit";
import type { DataPortabilityGatewayConfig } from "./eip712";

const CONFIG: DataPortabilityGatewayConfig = {
  chainId: 14800,
  contracts: {
    dataRegistry: "0x1111111111111111111111111111111111111111",
    dataPortabilityPermissions: "0x2222222222222222222222222222222222222222",
    dataPortabilityServer: "0x3333333333333333333333333333333333333333",
    dataPortabilityGrantees: "0x4444444444444444444444444444444444444444",
    dataPortabilityEscrow: "0x5555555555555555555555555555555555555555",
    feeRegistry: "0x6666666666666666666666666666666666666666",
  },
};

const ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const TOKEN = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

describe("Escrow deposit primitives", () => {
  it("resolves the escrow contract address from the gateway config", () => {
    expect(escrowContractAddress(CONFIG)).toBe(
      CONFIG.contracts.dataPortabilityEscrow,
    );
  });

  function decodedArgs(data: `0x${string}`) {
    const decoded = decodeFunctionData({ abi: ESCROW_DEPOSIT_ABI, data });
    // viem returns args with EIP-55 checksummed addresses; the protocol
    // only commits to the lowercase byte pattern, so compare case-insensitive.
    return {
      functionName: decoded.functionName,
      args: decoded.args.map((arg) =>
        typeof arg === "string" ? arg.toLowerCase() : arg,
      ),
    };
  }

  it("round-trips depositNative calldata", () => {
    expect(decodedArgs(encodeDepositNativeData({ account: ACCOUNT }))).toEqual({
      functionName: "depositNative",
      args: [ACCOUNT],
    });
  });

  it("round-trips depositToken calldata", () => {
    const data = encodeDepositTokenData({
      account: ACCOUNT,
      token: TOKEN,
      amount: 1_000_000_000_000_000_000n,
    });
    expect(decodedArgs(data)).toEqual({
      functionName: "depositToken",
      args: [ACCOUNT, TOKEN, 1_000_000_000_000_000_000n],
    });
  });

  it("builds a native-VANA deposit request with amount in `value`", () => {
    const req = buildDepositNativeRequest(CONFIG, {
      account: ACCOUNT,
      amount: 5_000_000_000_000_000_000n,
    });
    expect(req.to).toBe(CONFIG.contracts.dataPortabilityEscrow);
    expect(req.value).toBe(5_000_000_000_000_000_000n);
    // The encoded calldata commits to the credited account, not msg.sender —
    // a third party can fund someone else's escrow.
    expect(decodedArgs(req.data)).toEqual({
      functionName: "depositNative",
      args: [ACCOUNT],
    });
  });

  it("builds an ERC-20 deposit request with no `value`", () => {
    const req = buildDepositTokenRequest(CONFIG, {
      account: ACCOUNT,
      token: TOKEN,
      amount: 42n,
    });
    expect(req.to).toBe(CONFIG.contracts.dataPortabilityEscrow);
    // value must be omitted — the amount is on the token contract, not the
    // escrow's payable receive. Sending `value` here would revert.
    expect(req.value).toBeUndefined();
    expect(decodedArgs(req.data)).toEqual({
      functionName: "depositToken",
      args: [ACCOUNT, TOKEN, 42n],
    });
  });
});
