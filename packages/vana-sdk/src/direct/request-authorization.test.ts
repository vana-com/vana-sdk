import { describe, expect, it } from "vitest";
import { keccak256, recoverMessageAddress, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildRequestReadAuthorizationMessage,
  signRequestReadAuthorization,
} from "./request-authorization";
import { createDirectDataController } from "./controller";
import { DirectConfigError } from "./errors";
import type { AccessRequestClient } from "./types";

// The published test vector (src/connect/WIRE_CONTRACT.md). A backend in any language
// must produce exactly this signature for this key, id and timestamp.
const VECTOR = {
  // Derived, so no raw key sits in the repository.
  privateKey: keccak256(toBytes("vana-sdk connect test vector")),
  appAddress: "0x40ED6841FCa2e4f44EDbECe0541D1f73bBa11442",
  requestId: "dcr_test_vector_1",
  timestamp: "1767225600000",
  message:
    "Vana Direct Access Request v1\nmethod:GET\npath:/api/data-connection-requests/dcr_test_vector_1\ntimestamp:1767225600000\nbody:",
  signature:
    "0xb7ceb795efdb9697275b9b003e1df608c92b33d17644845d52af1b41436a579a186e6ae426cd268c9f48e2c108133a07c76e801c664a1615fab18bfa1ee0e0b51c",
};

const account = privateKeyToAccount(VECTOR.privateKey);
const signMessage = (message: string) => account.signMessage({ message });

describe("signRequestReadAuthorization", () => {
  it("signs the documented test vector", async () => {
    expect(
      buildRequestReadAuthorizationMessage(VECTOR.requestId, VECTOR.timestamp),
    ).toBe(VECTOR.message);

    await expect(
      signRequestReadAuthorization({
        requestId: VECTOR.requestId,
        appAddress: account.address,
        signMessage,
        now: () => Number(VECTOR.timestamp),
      }),
    ).resolves.toEqual({
      appAddress: VECTOR.appAddress,
      signature: VECTOR.signature,
      timestamp: VECTOR.timestamp,
    });
  });

  it("names exactly one request", async () => {
    const authorization = await signRequestReadAuthorization({
      requestId: "dcr_one",
      appAddress: account.address,
      signMessage,
    });
    const recover = (requestId: string) =>
      recoverMessageAddress({
        message: buildRequestReadAuthorizationMessage(
          requestId,
          authorization.timestamp,
        ),
        signature: authorization.signature,
      });

    expect(await recover("dcr_one")).toBe(account.address);
    expect(await recover("dcr_two")).not.toBe(account.address);
  });

  it.each(["", "../admin", "dcr/1", "dcr 1", "a".repeat(129)])(
    "refuses to sign %j, which would name another path",
    async (requestId) => {
      await expect(
        signRequestReadAuthorization({
          requestId,
          appAddress: account.address,
          signMessage,
        }),
      ).rejects.toBeInstanceOf(DirectConfigError);
    },
  );
});

describe("controller.authorizeRequestRead", () => {
  it("is the signature the controller sends when it polls the same request", async () => {
    const seen: Record<string, string>[] = [];
    const controller = createDirectDataController({
      appPrivateKey: VECTOR.privateKey,
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "spotify",
      scopes: ["spotify.savedTracks"],
      fetchFn: async (_url, init) => {
        seen.push(init?.headers ?? {});
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ status: "pending" }),
          text: async () => "",
        };
      },
    });

    await controller.getAccessRequestStatus(VECTOR.requestId);
    const headers = seen[0];
    const authorization = await controller.authorizeRequestRead(
      VECTOR.requestId,
    );
    const recovered = await recoverMessageAddress({
      message: buildRequestReadAuthorizationMessage(
        VECTOR.requestId,
        headers["X-Vana-App-Timestamp"],
      ),
      signature: headers["X-Vana-App-Signature"] as `0x${string}`,
    });

    expect(recovered).toBe(authorization.appAddress);
    expect(authorization.appAddress).toBe(controller.appAddress);
  });

  it("derives independent secrets per purpose without exposing the key", async () => {
    const controller = createDirectDataController({
      appPrivateKey: VECTOR.privateKey,
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "spotify",
      scopes: ["spotify.savedTracks"],
      accessRequestClient: {} as AccessRequestClient,
    });
    const hex = (buffer: ArrayBuffer) =>
      Buffer.from(new Uint8Array(buffer)).toString("hex");

    const a = hex(await controller.deriveSecret("purpose-a"));
    const again = hex(await controller.deriveSecret("purpose-a"));
    const b = hex(await controller.deriveSecret("purpose-b"));

    expect(a).toHaveLength(64);
    expect(a).toBe(again);
    expect(a).not.toBe(b);
    expect(a).not.toBe(VECTOR.privateKey.slice(2).toLowerCase());
  });
});
