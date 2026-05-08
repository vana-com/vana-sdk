import { describe, expect, it } from "vitest";

import {
  DataFileEnvelopeSchema,
  IngestResponseSchema,
  createDataFileEnvelope,
} from "./data-file";

describe("DataFileEnvelopeSchema", () => {
  const validEnvelope = {
    version: "1.0",
    scope: "instagram.profile",
    collectedAt: "2026-05-08T00:00:00.000Z",
    data: { username: "alice" },
  };

  it("accepts a valid envelope", () => {
    expect(DataFileEnvelopeSchema.parse(validEnvelope)).toEqual(validEnvelope);
  });

  it("requires version 1.0", () => {
    expect(() =>
      DataFileEnvelopeSchema.parse({ ...validEnvelope, version: "2.0" }),
    ).toThrow();
  });

  it("requires collectedAt to be datetime", () => {
    expect(() =>
      DataFileEnvelopeSchema.parse({
        ...validEnvelope,
        collectedAt: "2026-05-08",
      }),
    ).toThrow();
  });

  it("accepts optional schema metadata", () => {
    expect(
      DataFileEnvelopeSchema.parse({
        ...validEnvelope,
        $schema: "https://example.com/schema.json",
        schemaId: "schema-1",
      }),
    ).toMatchObject({
      $schema: "https://example.com/schema.json",
      schemaId: "schema-1",
    });
  });
});

describe("createDataFileEnvelope", () => {
  it("creates a minimal envelope", () => {
    expect(
      createDataFileEnvelope("instagram.profile", "2026-05-08T00:00:00.000Z", {
        username: "alice",
      }),
    ).toEqual({
      version: "1.0",
      scope: "instagram.profile",
      collectedAt: "2026-05-08T00:00:00.000Z",
      data: { username: "alice" },
    });
  });

  it("includes optional schema URL and schema ID", () => {
    expect(
      createDataFileEnvelope(
        "instagram.profile",
        "2026-05-08T00:00:00.000Z",
        { username: "alice" },
        "https://example.com/schema.json",
        "schema-1",
      ),
    ).toMatchObject({
      $schema: "https://example.com/schema.json",
      schemaId: "schema-1",
    });
  });
});

describe("IngestResponseSchema", () => {
  it("accepts stored and syncing statuses", () => {
    expect(
      IngestResponseSchema.parse({
        scope: "instagram.profile",
        collectedAt: "2026-05-08T00:00:00.000Z",
        status: "stored",
      }),
    ).toMatchObject({ status: "stored" });
    expect(
      IngestResponseSchema.parse({
        scope: "instagram.profile",
        collectedAt: "2026-05-08T00:00:00.000Z",
        status: "syncing",
      }),
    ).toMatchObject({ status: "syncing" });
  });
});
