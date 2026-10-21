import { describe, expect, it } from "vite-plus/test";
import { withColumnDefaults } from "./defaults.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const cols = [
  { path: "id", type: "number" },
  { path: "region", type: "text" },
  { path: "ordered_on", type: "date" },
  { path: "amount", type: "number" },
  { path: "customer.name", type: "text" },
  { path: "tags", type: "json" },
];

describe("withColumnDefaults", () => {
  it("fills a table with the first real columns, skipping ids and json, with sensible formats", () => {
    const t = withColumnDefaults({ type: "table", id: "ta1", dataset: "d", columns: [{ field: "id", label: "ID" }] }, cols);
    expect(t.columns.map((c: any) => c.field)).toEqual(["region", "ordered_on", "amount", "customer.name"]);
    expect(t.columns[1].format).toBe("date");
    expect(t.columns[2].format).toBe("decimal");
    expect(t.columns[0].label).toBe("Region");
  });

  it("points a chart at a category and a number, summing rows", () => {
    const c = withColumnDefaults({ type: "chart", id: "ch1", kind: "bar", dataset: "d", x: "category", series: [{ field: "value" }] }, cols);
    expect(c).toMatchObject({ x: "region", aggregate: "sum", series: [{ field: "amount", label: "Amount" }] });
  });

  it("picks the category with the fewest different values, and names nested columns in full", () => {
    const withCounts = cols.map((c) => ({ ...c, distinct: ({ region: 4, ordered_on: 31, "customer.name": 120, id: 2000 } as Record<string, number>)[c.path] }));
    const c = withColumnDefaults({ type: "chart", id: "ch1", dataset: "d", x: "", series: [] }, withCounts);
    expect(c.x).toBe("region");
    const t = withColumnDefaults({ type: "table", id: "ta1", dataset: "d", columns: [] }, cols);
    expect(t.columns.at(-1).label).toBe("Customer name");
  });

  it("points a KPI at the first number", () => {
    const k = withColumnDefaults({ type: "kpi", id: "kp1", label: "Count", value: { $agg: { fn: "count", dataset: "d" } } }, cols);
    expect(k.value.$agg).toEqual({ fn: "sum", dataset: "d", field: "amount" });
    expect(k.label).toBe("Total amount");
  });

  it("leaves blocks alone when columns are unknown, and other block types untouched", () => {
    const t = { type: "table", id: "ta1", dataset: "d", columns: [{ field: "id", label: "ID" }] };
    expect(withColumnDefaults(t, [])).toBe(t);
    const x = { type: "divider", id: "di1" };
    expect(withColumnDefaults(x, cols)).toEqual(x);
  });

  it("falls back to id columns when they are all there is, and does not mutate the input", () => {
    const only = [{ path: "id", type: "number" }];
    const t: any = { type: "table", id: "ta1", dataset: "d", columns: [] };
    expect(withColumnDefaults(t, only).columns.map((c: any) => c.field)).toEqual(["id"]);
    expect(t.columns).toEqual([]);
  });
});
