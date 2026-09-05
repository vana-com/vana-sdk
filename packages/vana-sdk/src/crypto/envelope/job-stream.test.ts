import { beforeAll, describe, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NodeECIESUint8Provider } from "../ecies/node";
import {
  JobEnvelopeError,
  sealJobResult,
  openJobResultStream,
  sealJobResultStream,
  type JobResultMetadata,
} from "./job";

const MIB = 1024 * 1024;
const BUILDER_PRIVATE_KEY = keccak256(toBytes("streaming result builder"));
const OTHER_PRIVATE_KEY = keccak256(toBytes("other streaming builder"));
const BUILDER = privateKeyToAccount(BUILDER_PRIVATE_KEY);
const ecies = new NodeECIESUint8Provider();
const metadata: JobResultMetadata = {
  v: 1,
  jobId: "018f47d2-a321-7e10-b528-24e5ef8a624b",
  scope: "profile.email",
  version: "7",
  contentType: "application/octet-stream",
};

function bodyBytes(size: number): Uint8Array {
  const body = new Uint8Array(size);
  for (let index = 0; index < body.length; index += 1) {
    body[index] = index % 251;
  }
  return body;
}

function readableChunks(
  bytes: Uint8Array,
  chunkSize: number,
): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function collect(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  await stream.pipeTo(
    new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
    }),
  );
  return concatenate(chunks);
}

async function sealChunks(body: Uint8Array): Promise<{
  header: Uint8Array;
  frames: Uint8Array[];
  bytes: Uint8Array;
}> {
  const sealed = await sealJobResultStream(metadata, BUILDER.publicKey, ecies);
  const frames: Uint8Array[] = [];
  await readableChunks(body, 333_333)
    .pipeThrough(sealed.transform)
    .pipeTo(
      new WritableStream({
        write(chunk) {
          frames.push(chunk);
        },
      }),
    );
  return {
    header: sealed.header,
    frames,
    bytes: concatenate([sealed.header, ...frames]),
  };
}

async function openBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const opened = await openJobResultStream(
    readableChunks(bytes, 271_337),
    BUILDER_PRIVATE_KEY,
    ecies,
    { jobId: metadata.jobId, scope: metadata.scope, version: metadata.version },
  );
  expect(opened.metadata).toEqual(metadata);
  return collect(opened.body);
}

describe("streaming job result envelope", () => {
  let adversarialSealA: Awaited<ReturnType<typeof sealChunks>>;
  let adversarialSealB: Awaited<ReturnType<typeof sealChunks>>;

  beforeAll(async () => {
    const body = bodyBytes(2 * MIB + 17);
    [adversarialSealA, adversarialSealB] = await Promise.all([
      sealChunks(body),
      sealChunks(body),
    ]);
    expect(adversarialSealA.frames.length).toBeGreaterThan(2);
    expect(adversarialSealB.frames.length).toBe(adversarialSealA.frames.length);
  }, 60_000);

  it.each([0, 31, MIB, 20 * MIB])(
    "round-trips a %i-byte body",
    async (size) => {
      const body = bodyBytes(size);
      const sealed = await sealChunks(body);
      const opened = await openBytes(sealed.bytes);

      expect(opened.length).toBe(body.length);
      expect(bytesToHex(sha256(opened))).toBe(bytesToHex(sha256(body)));
    },
    60_000,
  );

  it("rejects reordered chunks", async () => {
    const sealed = await sealChunks(bodyBytes(2 * MIB + 17));
    expect(sealed.frames.length).toBeGreaterThan(2);
    const reordered = concatenate([
      sealed.header,
      sealed.frames[1]!,
      sealed.frames[0]!,
      ...sealed.frames.slice(2),
    ]);

    await expect(openBytes(reordered)).rejects.toBeInstanceOf(JobEnvelopeError);
  });

  it("rejects a header swapped between two seals", async () => {
    const swapped = concatenate([
      adversarialSealB.header,
      ...adversarialSealA.frames,
    ]);

    await expect(openBytes(swapped)).rejects.toBeInstanceOf(JobEnvelopeError);
  });

  it("rejects a same-index frame spliced from another seal", async () => {
    const spliced = concatenate([
      adversarialSealA.header,
      adversarialSealA.frames[0]!,
      adversarialSealB.frames[1]!,
      ...adversarialSealA.frames.slice(2),
    ]);

    await expect(openBytes(spliced)).rejects.toBeInstanceOf(JobEnvelopeError);
  });

  it("rejects a dropped final frame", async () => {
    const truncated = concatenate([
      adversarialSealA.header,
      ...adversarialSealA.frames.slice(0, -1),
    ]);

    await expect(openBytes(truncated)).rejects.toBeInstanceOf(JobEnvelopeError);
  });

  it("rejects a duplicate final frame appended after finality", async () => {
    const duplicated = concatenate([
      adversarialSealA.header,
      ...adversarialSealA.frames,
      adversarialSealA.frames.at(-1)!,
    ]);

    await expect(openBytes(duplicated)).rejects.toBeInstanceOf(
      JobEnvelopeError,
    );
  });

  it("rejects a truncated stream", async () => {
    const sealed = await sealChunks(bodyBytes(MIB + 17));

    await expect(
      openBytes(sealed.bytes.subarray(0, sealed.bytes.length - 1)),
    ).rejects.toBeInstanceOf(JobEnvelopeError);
  });

  it("rejects AAD flag tampering on a full non-final chunk", async () => {
    const tamperedFrame = adversarialSealA.frames[0]!.slice();
    expect(tamperedFrame.length).toBe(4 + 1 + MIB + 16);
    expect(tamperedFrame[4]).toBe(0);
    tamperedFrame[4] = 1;
    const tampered = concatenate([adversarialSealA.header, tamperedFrame]);

    await expect(openBytes(tampered)).rejects.toBeInstanceOf(JobEnvelopeError);
  });

  it("rejects a scope mismatch before requesting a body chunk", async () => {
    let bodyPulls = 0;
    const headerOnly = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          controller.enqueue(adversarialSealA.header);
        },
        pull() {
          bodyPulls += 1;
          throw new Error("body bytes were requested");
        },
      },
      { highWaterMark: 0 },
    );

    await expect(
      openJobResultStream(headerOnly, BUILDER_PRIVATE_KEY, ecies, {
        jobId: metadata.jobId,
        scope: "profile.name",
      }),
    ).rejects.toThrow(
      `Job result scope ${metadata.scope} does not match expected scope profile.name`,
    );
    expect(bodyPulls).toBe(0);
  });

  it("rejects the wrong builder key", async () => {
    const sealed = await sealChunks(bodyBytes(31));

    await expect(
      openJobResultStream(
        readableChunks(sealed.bytes, 128),
        OTHER_PRIVATE_KEY,
        ecies,
        { jobId: metadata.jobId },
      ),
    ).rejects.toThrow();
  });

  it("surfaces a final-chunk cipher failure from the buffered sealer", async () => {
    const failure = new Error("mock cipher failed during flush");
    const encrypt = vi
      .spyOn(globalThis.crypto.subtle, "encrypt")
      .mockRejectedValueOnce(failure);

    await expect(
      sealJobResult(
        { ...metadata, body: new Uint8Array() },
        BUILDER.publicKey,
        ecies,
      ),
    ).rejects.toBe(failure);
    encrypt.mockRestore();
  });

  it.skipIf(Boolean(process.env.CI) || typeof globalThis.gc !== "function")(
    "seals 50 MiB with less than 16 MiB of array-buffer growth",
    async () => {
      globalThis.gc!();
      const baseline = process.memoryUsage().arrayBuffers;
      let peak = baseline;
      let remaining = 50 * MIB;
      const inputChunk = new Uint8Array(MIB).fill(0x61);
      const source = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (remaining === 0) {
            controller.close();
            return;
          }
          const length = Math.min(inputChunk.length, remaining);
          controller.enqueue(inputChunk.subarray(0, length));
          remaining -= length;
        },
      });
      const sealed = await sealJobResultStream(
        metadata,
        BUILDER.publicKey,
        ecies,
      );

      await source.pipeThrough(sealed.transform).pipeTo(
        new WritableStream({
          write() {
            globalThis.gc!();
            peak = Math.max(peak, process.memoryUsage().arrayBuffers);
          },
        }),
      );
      const growth = peak - baseline;
      console.info(`50 MiB seal peak arrayBuffers growth: ${growth} bytes`);
      expect(growth).toBeLessThan(16 * MIB);
    },
    60_000,
  );
});
