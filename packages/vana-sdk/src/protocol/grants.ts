import { verifyTypedData } from "viem";
import {
  GRANT_REGISTRATION_TYPES,
  grantRegistrationDomain,
  type DataPortabilityGatewayConfig,
} from "./eip712";

export interface DataPortabilityGrantPayload {
  user?: `0x${string}`;
  builder?: `0x${string}`;
  scopes: string[];
  expiresAt: number;
  nonce?: number;
}

export interface VerifyGrantRegistrationInput {
  gatewayConfig: DataPortabilityGatewayConfig;
  grantorAddress: `0x${string}`;
  granteeId: `0x${string}`;
  grant: string;
  fileIds?: Array<string | number | bigint>;
  signature: `0x${string}`;
  nowSeconds?: number;
}

export type VerifyGrantRegistrationResult =
  | {
      valid: true;
      grantorAddress: `0x${string}`;
      granteeId: `0x${string}`;
      grant: string;
      payload: DataPortabilityGrantPayload;
      fileIds: string[];
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
    isHexString(c["dataPortabilityGrantees"])
  );
}

export function parseGrantRegistrationPayload(
  grant: string,
): DataPortabilityGrantPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(grant);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const value = parsed as Record<string, unknown>;
  if (!Array.isArray(value["scopes"]) || value["scopes"].length === 0) {
    return null;
  }
  if (!value["scopes"].every((scope) => typeof scope === "string")) {
    return null;
  }
  if (
    typeof value["expiresAt"] !== "number" ||
    !Number.isFinite(value["expiresAt"])
  ) {
    return null;
  }
  if (value["user"] !== undefined && !isHexString(value["user"])) {
    return null;
  }
  if (value["builder"] !== undefined && !isHexString(value["builder"])) {
    return null;
  }
  if (
    value["nonce"] !== undefined &&
    (typeof value["nonce"] !== "number" || !Number.isFinite(value["nonce"]))
  ) {
    return null;
  }
  return {
    user: value["user"] as `0x${string}` | undefined,
    builder: value["builder"] as `0x${string}` | undefined,
    scopes: value["scopes"] as string[],
    expiresAt: value["expiresAt"],
    nonce: value["nonce"] as number | undefined,
  };
}

function parseFileIds(fileIds: Array<string | number | bigint> | undefined): {
  values: bigint[];
  display: string[];
} | null {
  try {
    const values = (fileIds ?? []).map((fileId) => BigInt(fileId));
    return {
      values,
      display: values.map((fileId) => fileId.toString()),
    };
  } catch {
    return null;
  }
}

export async function verifyGrantRegistration(
  input: VerifyGrantRegistrationInput,
): Promise<VerifyGrantRegistrationResult> {
  const payload = parseGrantRegistrationPayload(input.grant);
  if (!payload) {
    return {
      valid: false,
      error: "Grant must be JSON with scopes and expiresAt",
    };
  }

  const fileIds = parseFileIds(input.fileIds);
  if (!fileIds) {
    return { valid: false, error: "fileIds must contain integer values" };
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
        grant: input.grant,
        fileIds: fileIds.values,
      },
      signature: input.signature,
    });
  } catch {
    return { valid: false, error: "EIP-712 signature verification failed" };
  }

  if (!valid) {
    return { valid: false, error: "Grant signature does not match grantor" };
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.expiresAt > 0 && payload.expiresAt < nowSeconds) {
    return { valid: false, error: "Grant has expired" };
  }

  if (
    payload.user !== undefined &&
    payload.user.toLowerCase() !== input.grantorAddress.toLowerCase()
  ) {
    return { valid: false, error: "Grant user does not match grantorAddress" };
  }

  return {
    valid: true,
    grantorAddress: input.grantorAddress,
    granteeId: input.granteeId,
    grant: input.grant,
    payload,
    fileIds: fileIds.display,
  };
}
