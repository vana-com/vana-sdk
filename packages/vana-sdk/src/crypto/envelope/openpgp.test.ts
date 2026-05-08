import { describe, it, expect } from "vitest";
import * as openpgp from "openpgp";
import { encryptWithPassword, decryptWithPassword } from "./openpgp";

const PASSWORD =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

describe("encryptWithPassword + decryptWithPassword", () => {
  it("roundtrip returns original plaintext", async () => {
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ scope: "test.scope", data: "hello" }),
    );
    const encrypted = await encryptWithPassword(plaintext, PASSWORD);
    const decrypted = await decryptWithPassword(encrypted, PASSWORD);
    expect(decrypted).toEqual(plaintext);
  });

  it("different calls produce different ciphertext", async () => {
    const plaintext = new TextEncoder().encode("same data");
    const encrypted1 = await encryptWithPassword(plaintext, PASSWORD);
    const encrypted2 = await encryptWithPassword(plaintext, PASSWORD);
    expect(Buffer.from(encrypted1).equals(Buffer.from(encrypted2))).toBe(false);
  });

  it("decrypt with wrong password throws", async () => {
    const plaintext = new TextEncoder().encode("secret data");
    const encrypted = await encryptWithPassword(plaintext, PASSWORD);
    const wrongPassword = "ff".repeat(32);
    await expect(
      decryptWithPassword(encrypted, wrongPassword),
    ).rejects.toThrow();
  });

  it("decrypt with corrupted ciphertext throws", async () => {
    const plaintext = new TextEncoder().encode("secret data");
    const encrypted = await encryptWithPassword(plaintext, PASSWORD);
    const corrupted = new Uint8Array(encrypted);
    const mid = Math.floor(corrupted.length / 2);
    corrupted[mid] ^= 0xff;
    corrupted[mid + 1] ^= 0xff;
    corrupted[mid + 2] ^= 0xff;
    await expect(decryptWithPassword(corrupted, PASSWORD)).rejects.toThrow();
  });

  it("output can be decrypted by raw openpgp.decrypt", async () => {
    const plaintext = new TextEncoder().encode("cross-compat test");
    const encrypted = await encryptWithPassword(plaintext, PASSWORD);

    const message = await openpgp.readMessage({ binaryMessage: encrypted });
    const { data } = await openpgp.decrypt({
      message,
      passwords: [PASSWORD],
      format: "binary",
    });
    expect(data as Uint8Array).toEqual(plaintext);
  });

  it("roundtrips 1 KB plaintext", async () => {
    const plaintext = new Uint8Array(1024);
    for (let i = 0; i < plaintext.length; i++) plaintext[i] = i % 256;
    const encrypted = await encryptWithPassword(plaintext, PASSWORD);
    const decrypted = await decryptWithPassword(encrypted, PASSWORD);
    expect(decrypted).toEqual(plaintext);
  });

  it("roundtrips 100 KB plaintext", async () => {
    const plaintext = new Uint8Array(100 * 1024);
    for (let i = 0; i < plaintext.length; i++) plaintext[i] = (i * 17) % 256;
    const encrypted = await encryptWithPassword(plaintext, PASSWORD);
    const decrypted = await decryptWithPassword(encrypted, PASSWORD);
    expect(decrypted).toEqual(plaintext);
  });

  it("roundtrips 1 MB plaintext", async () => {
    const plaintext = new Uint8Array(1024 * 1024);
    for (let i = 0; i < plaintext.length; i++) plaintext[i] = i % 256;
    const encrypted = await encryptWithPassword(plaintext, PASSWORD);
    const decrypted = await decryptWithPassword(encrypted, PASSWORD);
    expect(decrypted).toEqual(plaintext);
  }, 15_000);

  // Cross-package interop: ciphertext below was produced by personal-server-ts
  // `encryptWithPassword` (commit fingerprint 78f644b era). vana-sdk decrypt
  // must round-trip cleanly to prove wire compatibility.
  it("decrypts a ciphertext produced by personal-server-ts encrypt", async () => {
    const PS_PASSWORD = "deadbeef".repeat(8);
    const PS_PLAINTEXT = "hello, vana cross-package interop";
    const PS_CIPHERTEXT_B64 =
      "wy4ECQMIWx4zUAI4jZXgCX7xO8pZ3gl84/1qHr+dcWI8EgP4d+uWmJEpb/LwJcFg0lIBOqzmbNmuj6KRJOWTY9PGWJut6uzCQuRsmBjD7/61Arw0q7rUhyG5Xf+Nkg1W6FAs89tRJbFkYh5oH6XIlGaJTojEJaZCkuZZRJvkaAs1K9rX";
    const ciphertext = new Uint8Array(Buffer.from(PS_CIPHERTEXT_B64, "base64"));
    const decrypted = await decryptWithPassword(ciphertext, PS_PASSWORD);
    expect(new TextDecoder().decode(decrypted)).toBe(PS_PLAINTEXT);
  });
});
