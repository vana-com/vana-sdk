import { describe, expect, it } from "vitest";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import {
  buildSessionRelayWeb3SignedHeader,
  computeSessionRelayBodyHash,
} from "./signing";

describe("computeSessionRelayBodyHash", () => {
  it("uses the Relay legacy empty-body hash shape", () => {
    expect(computeSessionRelayBodyHash(undefined)).toBe("");
    expect(computeSessionRelayBodyHash("")).toBe("");
  });

  it("hashes canonical JSON as bare hex", () => {
    const left = computeSessionRelayBodyHash(
      JSON.stringify({ scopes: ["b"], granteeAddress: "0xabc" }),
    );
    const right = computeSessionRelayBodyHash(
      JSON.stringify({ granteeAddress: "0xabc", scopes: ["b"] }),
    );

    expect(left).toBe(right);
    expect(left).toMatch(/^[0-9a-f]{64}$/);
    expect(left.startsWith("sha256:")).toBe(false);
  });

  it("does not change the generic Web3Signed body hash semantics", async () => {
    const signMessage = async () => "0x01" as `0x${string}`;
    const body = new TextEncoder().encode(JSON.stringify({ a: 1 }));
    const header = await buildWeb3SignedHeader({
      signMessage,
      aud: "https://ps.example",
      method: "POST",
      uri: "/v1/data/x",
      body,
      iat: 1,
      exp: 2,
    });

    expect(parseWeb3SignedHeader(header).payload.bodyHash).toMatch(/^sha256:/);
  });
});

describe("buildSessionRelayWeb3SignedHeader", () => {
  it("places the Relay legacy body hash in the Web3Signed payload", async () => {
    let signedMessage = "";
    const signMessage = async (message: string) => {
      signedMessage = message;
      return "0x01" as `0x${string}`;
    };
    const body = JSON.stringify({ scopes: ["chatgpt.conversations"] });

    const header = await buildSessionRelayWeb3SignedHeader({
      signMessage,
      aud: "https://session-relay.vana.org",
      method: "POST",
      uri: "/v1/session/init",
      body,
      iat: 10,
      exp: 20,
    });

    const parsed = parseWeb3SignedHeader(header);
    expect(signedMessage).toBe(parsed.payloadBase64);
    expect(parsed.payload).toMatchObject({
      aud: "https://session-relay.vana.org",
      bodyHash: computeSessionRelayBodyHash(body),
      exp: 20,
      iat: 10,
      method: "POST",
      uri: "/v1/session/init",
    });
  });
});
