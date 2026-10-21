import { describe, expect, it } from "vitest";
import { describeRows } from "../src/describe.ts";

describe("describeRows", () => {
  it("flattens jsonb objects to dotted paths and infers types", () => {
    const cols = describeRows([
      { id: 1, ordered_on: "2026-01-05", paid: true, customer: { name: "Acme", address: { city: "Oslo" } }, tags: ["a"] },
      { id: 2, ordered_on: "2026-01-06", paid: null, customer: { name: "Bolt", address: { city: null } }, tags: [] },
    ]);
    const byPath = Object.fromEntries(cols.map((c) => [c.path, c.type]));
    expect(byPath).toEqual({
      id: "number",
      ordered_on: "date",
      paid: "bool",
      "customer.name": "text",
      "customer.address.city": "text",
      tags: "json",
    });
    expect(cols.find((c) => c.path === "customer.address.city")!.example).toBe("Oslo");
  });

  it("marks conflicting types as mixed and all-null columns as null", () => {
    const cols = describeRows([{ a: 1, b: null }, { a: "x", b: null }]);
    expect(Object.fromEntries(cols.map((c) => [c.path, c.type]))).toEqual({ a: "mixed", b: "null" });
  });
});
