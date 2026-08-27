import { describe, expect, it } from "vitest";

import { isPlainObject, readJsonObject, readJsonValue } from "./response-body";

function res(body: string | null, status = 200): Response {
  return new Response(body, { status });
}

describe("isPlainObject", () => {
  it("accepts only non-null, non-array objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(1)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });
});

describe("readJsonValue", () => {
  it("returns the parsed value for any valid JSON", async () => {
    expect(await readJsonValue(res("null"))).toBeNull();
    expect(await readJsonValue(res("[1]"))).toEqual([1]);
    expect(await readJsonValue(res('"s"'))).toBe("s");
    expect(await readJsonValue(res("{}"))).toEqual({});
  });

  it("returns null for empty, 204, and non-JSON bodies", async () => {
    expect(await readJsonValue(res(""))).toBeNull();
    expect(await readJsonValue(res(null, 204))).toBeNull();
    expect(await readJsonValue(res("<html>oops</html>"))).toBeNull();
  });
});

describe("readJsonObject", () => {
  it("returns the object body untouched", async () => {
    expect(await readJsonObject(res('{"a":1}'))).toEqual({ a: 1 });
  });

  it.each([
    ["null", "null"],
    ["array", "[]"],
    ["string", '"x"'],
    ["number", "1"],
    ["empty", ""],
    ["non-JSON", "not json"],
  ])("degrades a %s body to {}", async (_label, body) => {
    expect(await readJsonObject(res(body))).toEqual({});
  });

  it("degrades a 204 with no body to {}", async () => {
    expect(await readJsonObject(res(null, 204))).toEqual({});
  });
});
