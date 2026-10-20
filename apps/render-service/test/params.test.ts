import { describe, expect, it } from "vitest";
import { parseDefinition } from "@raseport/schema";
import { BadRequest, resolveParams } from "../src/params.ts";

const def = parseDefinition({
  schemaVersion: 1,
  name: "t",
  params: [
    { name: "month", type: "date", required: true },
    { name: "limit", type: "number", default: 10 },
    { name: "flag", type: "bool" },
  ],
  body: [],
});

describe("resolveParams", () => {
  it("coerces types and applies defaults", () => {
    expect(resolveParams(def, { month: "2026-01-01", flag: "true" })).toEqual({ month: "2026-01-01", limit: 10, flag: true });
  });
  it("rejects missing required and malformed values", () => {
    expect(() => resolveParams(def, {})).toThrow(BadRequest);
    expect(() => resolveParams(def, { month: "not a date" })).toThrow(/date/);
    expect(() => resolveParams(def, { month: "2026-01-01", limit: "x" })).toThrow(/number/);
  });
});
