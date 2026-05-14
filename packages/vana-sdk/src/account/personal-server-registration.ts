/**
 * Optional first-party Account integration for Personal Server registration.
 *
 * The protocol helper lives in `protocol/personal-server-registration`.
 * This module is only for callers that want to use an Account deployment's
 * constrained silent-sign endpoint.
 *
 * @category Account
 */

import { isAddress, type Address, type Hex } from "viem";
import {
  buildPersonalServerRegistrationTypedData,
  type BuildPersonalServerRegistrationTypedDataInput,
  type PersonalServerRegistrationSignature,
  type PersonalServerRegistrationSigner,
  type PersonalServerRegistrationTypedData,
  personalServerRegistrationDomain,
} from "../protocol/personal-server-registration";
import { SERVER_REGISTRATION_TYPES } from "../protocol/eip712";

export const ACCOUNT_PERSONAL_SERVER_REGISTRATION_INTENT =
  "personal_server.server_registration.v1" as const;

export type AccountPersonalServerRegistrationIntent =
  typeof ACCOUNT_PERSONAL_SERVER_REGISTRATION_INTENT;

export type AccountPersonalServerRegistrationStatus =
  | "signed"
  | "confirmation_required"
  | "fallback_required";

export interface AccountPersonalServerRegistrationRequest extends Omit<
  BuildPersonalServerRegistrationTypedDataInput,
  "ownerAddress"
> {}

export interface AccountPersonalServerRegistrationConfig {
  /**
   * Origin for the Account deployment to call, e.g. an app-dev Account origin.
   * No production origin is assumed by the SDK.
   */
  accountOrigin: string;
  /**
   * Path for Account's constrained PS registration silent-sign endpoint.
   */
  endpointPath?: string;
  /**
   * Optional fetch implementation for tests and non-default runtimes.
   */
  fetchImpl?: typeof fetch;
  /**
   * Optional signer used when Account says user confirmation is required and
   * returns typed data for the caller to sign interactively.
   */
  fallbackSigner?: PersonalServerRegistrationSigner;
}

export type AccountPersonalServerRegistrationSignature =
  PersonalServerRegistrationSignature & {
    intent: AccountPersonalServerRegistrationIntent;
  };

export interface AccountSignedPersonalServerRegistration {
  status: "signed";
  result: AccountPersonalServerRegistrationSignature;
}

export interface AccountConfirmationRequiredPersonalServerRegistration {
  status: "confirmation_required";
  typedData: PersonalServerRegistrationTypedData;
  signerAddress?: Address;
}

export interface AccountFallbackSignedPersonalServerRegistration {
  status: "fallback_signed";
  accountStatus: "confirmation_required";
  result: AccountPersonalServerRegistrationSignature;
}

export type AccountPersonalServerRegistrationResult =
  | AccountSignedPersonalServerRegistration
  | AccountConfirmationRequiredPersonalServerRegistration
  | AccountFallbackSignedPersonalServerRegistration;

export class AccountPersonalServerRegistrationError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(input: {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "AccountPersonalServerRegistrationError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
  }
}

interface AccountSilentSignResponse {
  status: AccountPersonalServerRegistrationStatus;
  signature?: Hex;
  signerAddress?: Address;
  signer?: { address?: Address };
  typedData?: PersonalServerRegistrationTypedData;
  typed_data?: PersonalServerRegistrationTypedData;
  error?: unknown;
}

// Account-owned route policy. Protocol signing primitives deliberately do not
// define Account intent names or API paths.
const DEFAULT_ACCOUNT_PS_REGISTRATION_PATH =
  "/api/v1/intents/personal-server-registration/sign";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function assertAddress(value: Address, name: string): void {
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address`);
  }
}

async function parseAccountResponse(
  response: Response,
): Promise<AccountSilentSignResponse> {
  const body = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    throw new AccountPersonalServerRegistrationError({
      status: response.status,
      code: accountErrorCode(body),
      message: accountErrorMessage(response.status, body),
      details: body,
    });
  }

  return body as AccountSilentSignResponse;
}

function accountErrorMessage(status: number, body: unknown): string {
  const nestedMessage = nestedAccountErrorField(body, "message");
  if (nestedMessage) {
    return nestedMessage;
  }

  if (isRecord(body) && typeof body.message === "string") {
    return body.message;
  }

  const code = accountErrorCode(body);
  if (code) {
    return `Account PS registration signing failed: ${code}`;
  }

  return `Account PS registration signing failed: ${status}`;
}

function accountErrorCode(body: unknown): string | undefined {
  const nestedCode = nestedAccountErrorField(body, "code");
  if (nestedCode) {
    return nestedCode;
  }

  if (isRecord(body)) {
    if (typeof body.code === "string") {
      return body.code;
    }
    if (typeof body.error === "string") {
      return body.error;
    }
  }

  return undefined;
}

function nestedAccountErrorField(
  body: unknown,
  field: "code" | "message",
): string | undefined {
  if (!isRecord(body) || !isRecord(body.error)) {
    return undefined;
  }

  const value = body.error[field];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAccountResponse(
  response: AccountSilentSignResponse,
): AccountSilentSignResponse {
  return {
    ...response,
    status:
      response.status === "fallback_required"
        ? "confirmation_required"
        : response.status,
    signerAddress: response.signerAddress ?? response.signer?.address,
    typedData: response.typedData ?? response.typed_data,
  };
}

function buildSignedResult(
  response: Required<
    Pick<AccountSilentSignResponse, "signature" | "signerAddress">
  > &
    Pick<AccountSilentSignResponse, "typedData">,
  request: AccountPersonalServerRegistrationRequest,
): AccountPersonalServerRegistrationSignature {
  assertAddress(response.signerAddress, "signerAddress");
  if (response.typedData) {
    assertTypedDataMatchesRequest(
      response.typedData,
      request,
      response.signerAddress,
    );
  }

  return {
    signature: response.signature,
    signerAddress: response.signerAddress,
    typedData:
      response.typedData ??
      buildPersonalServerRegistrationTypedData({
        ownerAddress: response.signerAddress,
        ...request,
      }),
    intent: ACCOUNT_PERSONAL_SERVER_REGISTRATION_INTENT,
  };
}

function assertTypedDataMatchesRequest(
  typedData: PersonalServerRegistrationTypedData,
  request: AccountPersonalServerRegistrationRequest,
  expectedSignerAddress?: Address,
): void {
  assertAddress(
    typedData.message.ownerAddress,
    "typedData.message.ownerAddress",
  );
  assertAddress(
    typedData.message.serverAddress,
    "typedData.message.serverAddress",
  );

  if (
    expectedSignerAddress &&
    !sameAddress(typedData.message.ownerAddress, expectedSignerAddress)
  ) {
    throw new Error(
      "Account typedData ownerAddress must match the expected signer address",
    );
  }

  if (!sameAddress(typedData.message.serverAddress, request.serverAddress)) {
    throw new Error(
      "Account typedData serverAddress must match the requested serverAddress",
    );
  }

  if (typedData.message.publicKey !== request.serverPublicKey) {
    throw new Error(
      "Account typedData publicKey must match the requested serverPublicKey",
    );
  }

  if (typedData.message.serverUrl !== request.serverUrl) {
    throw new Error(
      "Account typedData serverUrl must match the requested serverUrl",
    );
  }

  if (typedData.primaryType !== "ServerRegistration") {
    throw new Error("Account typedData primaryType must be ServerRegistration");
  }

  if (
    JSON.stringify(typedData.types) !==
    JSON.stringify(SERVER_REGISTRATION_TYPES)
  ) {
    throw new Error("Account typedData types must be ServerRegistration types");
  }

  const expectedDomain = personalServerRegistrationDomain({
    config: request.config,
    chainId: request.chainId,
    verifyingContract: request.verifyingContract,
  });
  if (!domainsEqual(typedData.domain, expectedDomain)) {
    throw new Error("Account typedData domain must match the requested domain");
  }
}

function sameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function domainsEqual(
  a: PersonalServerRegistrationTypedData["domain"],
  b: PersonalServerRegistrationTypedData["domain"],
): boolean {
  if (!a || !b) {
    return false;
  }

  return (
    a.name === b.name &&
    a.version === b.version &&
    Number(a.chainId) === Number(b.chainId) &&
    String(a.verifyingContract ?? "").toLowerCase() ===
      String(b.verifyingContract ?? "").toLowerCase() &&
    a.salt === b.salt
  );
}

export async function signPersonalServerRegistrationWithAccount(
  config: AccountPersonalServerRegistrationConfig,
  request: AccountPersonalServerRegistrationRequest,
): Promise<AccountPersonalServerRegistrationResult> {
  assertAddress(request.serverAddress, "serverAddress");

  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const endpoint = new URL(
    config.endpointPath ?? DEFAULT_ACCOUNT_PS_REGISTRATION_PATH,
    `${trimTrailingSlash(config.accountOrigin)}/`,
  );

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      intent: ACCOUNT_PERSONAL_SERVER_REGISTRATION_INTENT,
      serverAddress: request.serverAddress,
      serverPublicKey: request.serverPublicKey,
      serverUrl: request.serverUrl,
      config: request.config,
      chainId: request.chainId,
      verifyingContract: request.verifyingContract,
    }),
  });
  const body = normalizeAccountResponse(await parseAccountResponse(response));

  if (body.status === "signed") {
    if (!body.signature || !body.signerAddress) {
      throw new Error(
        "Account signed response must include signature and signerAddress",
      );
    }

    return {
      status: "signed",
      result: buildSignedResult(
        {
          signature: body.signature,
          signerAddress: body.signerAddress,
          typedData: body.typedData,
        },
        request,
      ),
    };
  }

  if (body.status === "confirmation_required") {
    if (!body.typedData) {
      throw new Error(
        "Account confirmation_required response must include typedData",
      );
    }
    assertTypedDataMatchesRequest(body.typedData, request, body.signerAddress);

    if (!config.fallbackSigner) {
      return {
        status: "confirmation_required",
        typedData: body.typedData,
        signerAddress: body.signerAddress,
      };
    }

    assertTypedDataMatchesRequest(
      body.typedData,
      request,
      config.fallbackSigner.address,
    );
    const signature = await config.fallbackSigner.signTypedData(body.typedData);

    return {
      status: "fallback_signed",
      accountStatus: "confirmation_required",
      result: {
        signature,
        signerAddress: config.fallbackSigner.address,
        typedData: body.typedData,
        intent: ACCOUNT_PERSONAL_SERVER_REGISTRATION_INTENT,
      },
    };
  }

  throw new Error(
    `Unsupported Account PS registration signing status: ${String(body.status)}`,
  );
}
