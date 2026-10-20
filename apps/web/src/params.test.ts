import { describe, expect, it } from "vite-plus/test";
import { check, lenientParams } from "./check.ts";

const doc = (extra: object = {}) => ({
  schemaVersion: 1,
  name: "t",
  params: [{ name: "month", type: "date", required: true }, { name: "limit", type: "number", default: 10 }, { name: "weird", type: "nope" }],
  datasets: [],
  body: [],
  ...extra,
});

describe("lenientParams", () => {
  it("reads params even when the rest of the definition is invalid", () => {
    const text = JSON.stringify(doc({ datasets: [{ id: "a", source: { kind: "rpc", name: "report_" } }] }));
    expect(check(text).def).toBeNull(); // invalid: the placeholder RPC name
    expect(lenientParams(text)).toEqual([
      { name: "month", type: "date", required: true },
      { name: "limit", type: "number", required: false, default: 10 },
      { name: "weird", type: "text", required: false }, // unknown type falls back to text
    ]);
  });

  it("returns nothing for broken JSON or a missing params list", () => {
    expect(lenientParams("{ not json")).toEqual([]);
    expect(lenientParams("null")).toEqual([]);
    expect(lenientParams(JSON.stringify({ name: "x" }))).toEqual([]);
    expect(lenientParams(JSON.stringify({ params: [null, 3, { type: "date" }, { name: "" }] }))).toEqual([]);
  });
});
