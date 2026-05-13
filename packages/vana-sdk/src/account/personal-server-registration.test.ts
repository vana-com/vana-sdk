import { describe, expect, it, vi } from "vitest";
import {
  PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
  PERSONAL_SERVER_REGISTRATION_INTENT,
  buildPersonalServerRegistrationTypedData,
  type PersonalServerRegistrationSigner,
} from "../protocol/personal-server-registration";
import type { AccountPersonalServerRegistrationError } from "./personal-server-registration";
import { signPersonalServerRegistrationWithAccount } from "./personal-server-registration";

const ACCOUNT_ORIGIN = "https://account.app-dev.example";
const OWNER_ADDRESS = "0x1111111111111111111111111111111111111111";
const SERVER_ADDRESS = "0x2222222222222222222222222222222222222222";
const SERVER_PUBLIC_KEY = "did:key:z6MkiPersonalServerPublicKey";
const SERVER_URL = "https://ps.example.com";
const SIGNATURE = `0x${"aa".repeat(65)}` as const;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Account Personal Server registration integration", () => {
  it("returns the SDK signed result when Account silently signs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "signed",
        signature: SIGNATURE,
        signerAddress: OWNER_ADDRESS,
      }),
    );

    const result = await signPersonalServerRegistrationWithAccount(
      { accountOrigin: ACCOUNT_ORIGIN, fetchImpl },
      {
        serverAddress: SERVER_ADDRESS,
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
      },
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(
        "/api/v1/intents/personal-server-registration/sign",
        `${ACCOUNT_ORIGIN}/`,
      ),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: PERSONAL_SERVER_REGISTRATION_INTENT,
          serverAddress: SERVER_ADDRESS,
          serverPublicKey: SERVER_PUBLIC_KEY,
          serverUrl: SERVER_URL,
        }),
      }),
    );
    expect(result).toEqual({
      status: "signed",
      result: {
        signature: SIGNATURE,
        signerAddress: OWNER_ADDRESS,
        typedData: buildPersonalServerRegistrationTypedData({
          ownerAddress: OWNER_ADDRESS,
          serverAddress: SERVER_ADDRESS,
          serverPublicKey: SERVER_PUBLIC_KEY,
          serverUrl: SERVER_URL,
        }),
        intent: PERSONAL_SERVER_REGISTRATION_INTENT,
      },
    });
  });

  it("returns confirmation-required typed data without hiding fallback semantics", async () => {
    const typedData = buildPersonalServerRegistrationTypedData({
      ownerAddress: OWNER_ADDRESS,
      serverAddress: SERVER_ADDRESS,
      serverPublicKey: SERVER_PUBLIC_KEY,
      serverUrl: SERVER_URL,
      config: {
        chainId: 1480,
        contracts: {
          dataRegistry: PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
          dataPortabilityPermissions:
            PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
          dataPortabilityServer:
            PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
          dataPortabilityGrantees:
            PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
        },
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "confirmation_required",
        signerAddress: OWNER_ADDRESS,
        typedData,
      }),
    );

    await expect(
      signPersonalServerRegistrationWithAccount(
        { accountOrigin: ACCOUNT_ORIGIN, fetchImpl },
        {
          serverAddress: SERVER_ADDRESS,
          serverPublicKey: SERVER_PUBLIC_KEY,
          serverUrl: SERVER_URL,
        },
      ),
    ).resolves.toEqual({
      status: "confirmation_required",
      signerAddress: OWNER_ADDRESS,
      typedData,
    });
  });

  it("passes optional domain overrides through to Account", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "signed",
        signature: SIGNATURE,
        signerAddress: OWNER_ADDRESS,
      }),
    );

    await signPersonalServerRegistrationWithAccount(
      { accountOrigin: ACCOUNT_ORIGIN, fetchImpl },
      {
        serverAddress: SERVER_ADDRESS,
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
        chainId: 31337,
        verifyingContract:
          PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
      },
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        body: JSON.stringify({
          intent: PERSONAL_SERVER_REGISTRATION_INTENT,
          serverAddress: SERVER_ADDRESS,
          serverPublicKey: SERVER_PUBLIC_KEY,
          serverUrl: SERVER_URL,
          chainId: 31337,
          verifyingContract:
            PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
        }),
      }),
    );
  });

  it("normalizes the current experimental silent-sign response shape", async () => {
    const typedData = buildPersonalServerRegistrationTypedData({
      ownerAddress: OWNER_ADDRESS,
      serverAddress: SERVER_ADDRESS,
      serverPublicKey: SERVER_PUBLIC_KEY,
      serverUrl: SERVER_URL,
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "fallback_required",
        signer: { address: OWNER_ADDRESS },
        typed_data: typedData,
      }),
    );

    await expect(
      signPersonalServerRegistrationWithAccount(
        {
          accountOrigin: ACCOUNT_ORIGIN,
          endpointPath: "/api/experimental/silent-sign",
          fetchImpl,
        },
        {
          serverAddress: SERVER_ADDRESS,
          serverPublicKey: SERVER_PUBLIC_KEY,
          serverUrl: SERVER_URL,
        },
      ),
    ).resolves.toEqual({
      status: "confirmation_required",
      signerAddress: OWNER_ADDRESS,
      typedData,
    });
  });

  it("normalizes experimental signed responses", async () => {
    const typedData = buildPersonalServerRegistrationTypedData({
      ownerAddress: OWNER_ADDRESS,
      serverAddress: SERVER_ADDRESS,
      serverPublicKey: SERVER_PUBLIC_KEY,
      serverUrl: SERVER_URL,
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "signed",
        signature: SIGNATURE,
        signer: { address: OWNER_ADDRESS },
        typed_data: typedData,
      }),
    );

    await expect(
      signPersonalServerRegistrationWithAccount(
        {
          accountOrigin: ACCOUNT_ORIGIN,
          endpointPath: "/api/experimental/silent-sign",
          fetchImpl,
        },
        {
          serverAddress: SERVER_ADDRESS,
          serverPublicKey: SERVER_PUBLIC_KEY,
          serverUrl: SERVER_URL,
        },
      ),
    ).resolves.toEqual({
      status: "signed",
      result: {
        signature: SIGNATURE,
        signerAddress: OWNER_ADDRESS,
        typedData,
        intent: PERSONAL_SERVER_REGISTRATION_INTENT,
      },
    });
  });

  it("uses a fallback signer for returned confirmation typed data when provided", async () => {
    const typedData = buildPersonalServerRegistrationTypedData({
      ownerAddress: OWNER_ADDRESS,
      serverAddress: SERVER_ADDRESS,
      serverPublicKey: SERVER_PUBLIC_KEY,
      serverUrl: SERVER_URL,
    });
    const fallbackSigner: PersonalServerRegistrationSigner = {
      address: OWNER_ADDRESS,
      signTypedData: vi.fn().mockResolvedValue(SIGNATURE),
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "confirmation_required",
        typedData,
      }),
    );

    const result = await signPersonalServerRegistrationWithAccount(
      { accountOrigin: ACCOUNT_ORIGIN, fetchImpl, fallbackSigner },
      {
        serverAddress: SERVER_ADDRESS,
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
      },
    );

    expect(fallbackSigner.signTypedData).toHaveBeenCalledWith(typedData);
    expect(result).toEqual({
      status: "fallback_signed",
      accountStatus: "confirmation_required",
      result: {
        signature: SIGNATURE,
        signerAddress: OWNER_ADDRESS,
        typedData,
        intent: PERSONAL_SERVER_REGISTRATION_INTENT,
      },
    });
  });

  it("preserves structured Account error details", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: "account_session_required" } },
          { status: 401 },
        ),
      );

    await expect(
      signPersonalServerRegistrationWithAccount(
        { accountOrigin: ACCOUNT_ORIGIN, fetchImpl },
        {
          serverAddress: SERVER_ADDRESS,
          serverPublicKey: SERVER_PUBLIC_KEY,
          serverUrl: SERVER_URL,
        },
      ),
    ).rejects.toMatchObject({
      name: "AccountPersonalServerRegistrationError",
      status: 401,
      code: "account_session_required",
      message:
        "Account PS registration signing failed: account_session_required",
      details: { error: { code: "account_session_required" } },
    } satisfies Partial<AccountPersonalServerRegistrationError>);
  });
});
