import { describe, expect, it } from "vite-plus/test";
import { suggestAt, type DatasetColumns } from "./suggest.ts";

const sales: DatasetColumns = {
  id: "sales",
  columns: [
    { path: "region", type: "text", example: "East" },
    { path: "amount", type: "number", example: 12.5 },
    { path: "customer.name", type: "text", example: "Acme" },
  ],
};

const doc = {
  schemaVersion: 1,
  name: "t",
  params: [{ name: "month", type: "date" }],
  datasets: [{ id: "sales", source: { kind: "rpc", name: "report_x" }, columns: { region: "text" } }, { id: "other", source: { kind: "rpc", name: "report_y" } }],
  body: [
    {
      id: "b",
      type: "body",
      rows: [
        {
          id: "r",
          cells: [
            {
              span: 12,
              blocks: [
                { type: "table", id: "t1", dataset: "sales", groupBy: "", columns: [{ field: "", label: "A" }] },
                { type: "chart", id: "c1", kind: "bar", dataset: "sales", x: "", series: [{ field: "" }] },
                { type: "kpi", id: "k1", label: "K", value: { $agg: { fn: "sum", dataset: "", field: "" } } },
                { type: "text", id: "x1", value: [{ $param: "" }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const text = JSON.stringify(doc, null, 2);

/** Cursor inside the n-th empty string `""` of the document. */
function insideEmptyString(n: number): number {
  let idx = -1;
  for (let i = 0; i <= n; i++) idx = text.indexOf('""', idx + 1);
  return idx + 1;
}
const labels = (s: ReturnType<typeof suggestAt>) => s?.items.map((i) => i.label);

describe("suggestAt", () => {
  // empty strings in order: groupBy, columns[0].field, chart x, series[0].field, $agg.dataset, $agg.field, $param
  it("suggests dataset columns for table groupBy, column field, chart x and series field", () => {
    for (const n of [0, 1, 2, 3]) expect(labels(suggestAt(text, insideEmptyString(n), [sales]))).toEqual(["region", "amount", "customer.name"]);
  });

  it("includes type and example", () => {
    const s = suggestAt(text, insideEmptyString(1), [sales])!;
    expect(s.items[1]).toMatchObject({ label: "amount", detail: "number", documentation: "e.g. 12.5" });
  });

  it("replaces only the contents of the string literal", () => {
    const at = insideEmptyString(1);
    const s = suggestAt(text, at, [sales])!;
    expect([s.from, s.to]).toEqual([at, at]);
    const partial = text.replace('"field": ""', '"field": "reg"');
    const at2 = partial.indexOf('"reg"') + 4;
    const s2 = suggestAt(partial, at2, [sales])!;
    expect(partial.slice(s2.from, s2.to)).toBe("reg");
  });

  it("suggests dataset ids for any dataset key, and param names for $param", () => {
    expect(labels(suggestAt(text, insideEmptyString(4), [sales]))).toEqual(["sales", "other"]);
    expect(labels(suggestAt(text, insideEmptyString(6), [sales]))).toEqual(["month"]);
  });

  it("falls back to declared dataset columns when no data is loaded", () => {
    expect(labels(suggestAt(text, insideEmptyString(1), []))).toEqual(["region"]);
  });

  it("offers nothing outside completable string values", () => {
    expect(suggestAt(text, text.indexOf('"label": "A"') + 3, [sales])).toBeNull(); // property key
    expect(suggestAt(text, text.indexOf('"label": "A"') + 12, [sales])).toBeNull(); // label value
    expect(suggestAt(text, 0, [sales])).toBeNull();
  });
});
