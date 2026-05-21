import { verifyTypedData } from "viem";
import {
  GRANT_REGISTRATION_TYPES,
  grantRegistrationDomain,
  type DataPortabilityGatewayConfig,
} from "./eip712";

export interface VerifyGrantRegistrationInput {
  gatewayConfig: DataPortabilityGatewayConfig;
  grantorAddress: `0x${string}`;
  granteeId: `0x${string}`;
  scopes: string[];
  // Decimal-string uint256 is the wire format; bigint/number are accepted
  // for ergonomics. Must be >= 1 (first registration uses 1; each override
  // strictly increases it — see GRANT_REGISTRATION_TYPES).
  grantVersion: bigint | number | string;
  // Unix seconds. 0 = no expiry. Anything > 0 is enforced against nowSeconds.
  expiresAt: bigint | number | string;
  signature: `0x${string}`;
  nowSeconds?: number;
}

export type VerifyGrantRegistrationResult =
  | {
      valid: true;
      grantorAddress: `0x${string}`;
      granteeId: `0x${string}`;
      scopes: string[];
      grantVersion: string;
      expiresAt: string;
    }
  | {
      valid: false;
      error: string;
    };

function isHexString(value: unknown): value is `0x${string}` {
  return typeof value === "string" && value.startsWith("0x");
}

export function isDataPortabilityGatewayConfig(
  value: unknown,
): value is DataPortabilityGatewayConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const config = value as Record<string, unknown>;
  const contracts = config["contracts"];
  if (
    typeof config["chainId"] !== "number" ||
    !Number.isInteger(config["chainId"]) ||
    config["chainId"] <= 0 ||
    contracts === null ||
    typeof contracts !== "object" ||
    Array.isArray(contracts)
  ) {
    return false;
  }
  const c = contracts as Record<string, unknown>;
  return (
    isHexString(c["dataRegistry"]) &&
    isHexString(c["dataPortabilityPermissions"]) &&
    isHexString(c["dataPortabilityServer"]) &&
    isHexString(c["dataPortabilityGrantees"]) &&
    isHexString(c["dataPortabilityEscrow"])
  );
}

function toUint256(value: bigint | number | string): bigint | null {
  try {
    const big = typeof value === "bigint" ? value : BigInt(value);
    if (big < 0n) return null;
    return big;
  } catch {
    return null;
  }
}

export async function verifyGrantRegistration(
  input: VerifyGrantRegistrationInput,
): Promise<VerifyGrantRegistrationResult> {
  if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
    return { valid: false, error: "scopes must be a non-empty array" };
  }
  if (!input.scopes.every((scope) => typeof scope === "string")) {
    return { valid: false, error: "scopes must contain only strings" };
  }

  const grantVersion = toUint256(input.grantVersion);
  if (grantVersion === null || grantVersion < 1n) {
    return { valid: false, error: "grantVersion must be a uint256 >= 1" };
  }

  const expiresAt = toUint256(input.expiresAt);
  if (expiresAt === null) {
    return { valid: false, error: "expiresAt must be a non-negative uint256" };
  }

  let valid: boolean;
  try {
    valid = await verifyTypedData({
      address: input.grantorAddress,
      domain: grantRegistrationDomain(input.gatewayConfig),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: input.grantorAddress,
        granteeId: input.granteeId,
        scopes: input.scopes,
        grantVersion,
        expiresAt,
      },
      signature: input.signature,
    });
  } catch {
    return { valid: false, error: "EIP-712 signature verification failed" };
  }

  if (!valid) {
    return { valid: false, error: "Grant signature does not match grantor" };
  }

  // 0 is the "no expiry" sentinel — only enforce when expiresAt > 0.
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (expiresAt > 0n && expiresAt < BigInt(nowSeconds)) {
    return { valid: false, error: "Grant has expired" };
  }

  return {
    valid: true,
    grantorAddress: input.grantorAddress,
    granteeId: input.granteeId,
    scopes: input.scopes,
    grantVersion: grantVersion.toString(),
    expiresAt: expiresAt.toString(),
  };
}
