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
  PERSONAL_SERVER_REGISTRATION_INTENT,
  type BuildPersonalServerRegistrationTypedDataInput,
  type PersonalServerRegistrationSignature,
  type PersonalServerRegistrationSigner,
  type PersonalServerRegistrationTypedData,
} from "../protocol/personal-server-registration";

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

export interface AccountSignedPersonalServerRegistration {
  status: "signed";
  result: PersonalServerRegistrationSignature;
}

export interface AccountConfirmationRequiredPersonalServerRegistration {
  status: "confirmation_required";
  typedData: PersonalServerRegistrationTypedData;
  signerAddress?: Address;
}

export interface AccountFallbackSignedPersonalServerRegistration {
  status: "fallback_signed";
  accountStatus: "confirmation_required";
  result: PersonalServerRegistrationSignature;
}

export type AccountPersonalServerRegistrationResult =
  | AccountSignedPersonalServerRegistration
  | AccountConfirmationRequiredPersonalServerRegistration
  | AccountFallbackSignedPersonalServerRegistration;

interface AccountSilentSignResponse {
  status: AccountPersonalServerRegistrationStatus;
  signature?: Hex;
  signerAddress?: Address;
  signer?: { address?: Address };
  typedData?: PersonalServerRegistrationTypedData;
  typed_data?: PersonalServerRegistrationTypedData;
  error?: string;
}

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
  const body = (await response.json()) as AccountSilentSignResponse;

  if (!response.ok) {
    throw new Error(
      body.error ??
        `Account PS registration signing failed: ${response.status}`,
    );
  }

  return body;
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
): PersonalServerRegistrationSignature {
  assertAddress(response.signerAddress, "signerAddress");

  return {
    signature: response.signature,
    signerAddress: response.signerAddress,
    typedData:
      response.typedData ??
      buildPersonalServerRegistrationTypedData({
        ownerAddress: response.signerAddress,
        ...request,
      }),
    intent: PERSONAL_SERVER_REGISTRATION_INTENT,
  };
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
      intent: PERSONAL_SERVER_REGISTRATION_INTENT,
      serverAddress: request.serverAddress,
      serverPublicKey: request.serverPublicKey,
      serverUrl: request.serverUrl,
      config: request.config,
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

    if (!config.fallbackSigner) {
      return {
        status: "confirmation_required",
        typedData: body.typedData,
        signerAddress: body.signerAddress,
      };
    }

    const signature = await config.fallbackSigner.signTypedData(body.typedData);

    return {
      status: "fallback_signed",
      accountStatus: "confirmation_required",
      result: {
        signature,
        signerAddress: config.fallbackSigner.address,
        typedData: body.typedData,
        intent: PERSONAL_SERVER_REGISTRATION_INTENT,
      },
    };
  }

  throw new Error(
    `Unsupported Account PS registration signing status: ${String(body.status)}`,
  );
}
