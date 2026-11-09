import { describe, it, expect } from "vitest";
import vectors from "./stream-sync-vectors.json";
import { VanaError } from "../../errors";
import {
  controlHashes,
  deriveKeyCheck,
  deriveNamespaceKey,
  deriveNs,
  NAMESPACE_KEY_LABEL,
  streamMasterKeyFromSignature,
} from "./stream-sync";

const hexToBytes = (h: string) =>
  Uint8Array.from(
    h
      .slice(2)
      .match(/../g)!
      .map((x) => parseInt(x, 16)),
  );
const bytesToHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("stream-sync key vectors (generated from personal-server-ts)", () => {
  it("uses the same namespace label as personal-server-ts", () => {
    expect(NAMESPACE_KEY_LABEL).toBe(vectors.namespaceKeyLabel);
  });

  for (const key of vectors.keys) {
    describe(key.id, () => {
      for (const enc of key.encodings) {
        it(`derives the same stream key from the ${enc.name} encoding`, () => {
          const streamMaster = streamMasterKeyFromSignature(
            hexToBytes(enc.signature),
          );
          expect(bytesToHex(streamMaster)).toBe(enc.streamMasterKey.slice(2));
        });
      }

      it("derives K_ns, keyCheck, ns and control hashes", () => {
        const streamMaster = hexToBytes(key.streamMasterKey);
        const kNs = deriveNamespaceKey(streamMaster);
        expect(bytesToHex(kNs)).toBe(key.kNs);
        expect(deriveKeyCheck(kNs)).toBe(key.keyCheck);
        for (const ns of key.namespaces) {
          expect(deriveNs(kNs, ns.connector, ns.accountId)).toBe(ns.ns);
        }
        const hashes = controlHashes(key.keyCheck);
        expect(hashes).toEqual(key.controlHashes);
      });
    });
  }
});

describe("streamMasterKeyFromSignature rejects bad input", () => {
  const good = vectors.keys[0]!.encodings[0]!.signature as `0x${string}`;

  it("rejects a non-65-byte signature", () => {
    expect(() =>
      streamMasterKeyFromSignature(good.slice(0, 130) as `0x${string}`),
    ).toThrow(VanaError);
  });

  it("rejects malformed hex", () => {
    expect(() =>
      streamMasterKeyFromSignature(`0x${"zz".repeat(65)}` as `0x${string}`),
    ).toThrow(VanaError);
  });

  it("rejects v outside 0, 1, 27, 28", () => {
    const bytes = hexToBytes(good);
    bytes[64] = 2;
    expect(() => streamMasterKeyFromSignature(bytes)).toThrow(/v must be/);
  });

  it("rejects r = 0", () => {
    const bytes = hexToBytes(good);
    bytes.fill(0, 0, 32);
    expect(() => streamMasterKeyFromSignature(bytes)).toThrow(/out of range/);
  });
});

describe("deriveNs and controlHashes input checks", () => {
  const kNs = deriveNamespaceKey(hexToBytes(vectors.keys[0]!.streamMasterKey));

  it("rejects an empty accountId", () => {
    expect(() => deriveNs(kNs, "connector", "")).toThrow(VanaError);
  });

  it("rejects a keyCheck that is not 16 lowercase hex", () => {
    expect(() => controlHashes("ABCDEF0123456789")).toThrow(VanaError);
    expect(() => controlHashes("abc")).toThrow(VanaError);
  });
});
