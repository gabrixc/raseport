import { describe, expect, it } from "vite-plus/test";
import { parseDefinition } from "@raseport/schema";
import { insertItem } from "./insert.ts";
import { listRemovable, removeItem } from "./remove.ts";

const block = (b: object) => b;
const doc = () => ({
  schemaVersion: 1,
  name: "t",
  params: [{ name: "month", type: "date", required: true }, { name: "unused", type: "text" }],
  datasets: [
    { id: "sales", source: { kind: "rpc", name: "report_sales" }, args: { p_month: { $param: "month" } } },
    { id: "other", source: { kind: "rpc", name: "report_other" } },
  ],
  pageFooter: [{ id: "f1", cells: [{ span: 12, blocks: [block({ type: "text", id: "ft", value: ["Page ", { $builtin: "page" }] })] }] }],
  body: [
    {
      id: "title",
      type: "title",
      rows: [
        {
          id: "r1",
          cells: [
            { span: 6, blocks: [block({ type: "text", id: "h", style: "h1", value: ["Sales ", { $param: "month" }] })] },
            { span: 6, blocks: [block({ type: "kpi", id: "k1", label: "Total", value: { $agg: { fn: "sum", dataset: "sales", field: "amount" } } }), block({ type: "divider", id: "d1" })] },
          ],
        },
      ],
    },
    {
      id: "detail",
      type: "body",
      dataset: "sales",
      rows: [{ id: "r2", cells: [{ span: 12, blocks: [block({ type: "table", id: "t1", dataset: "sales", columns: [{ field: "a", label: "A" }] })] }] }],
    },
  ],
});

describe("listRemovable", () => {
  it("lists datasets, params, bands and blocks (including footer blocks) with readable labels", () => {
    const items = listRemovable(doc());
    expect(items.map((i) => `${i.group}:${i.label}`)).toEqual([
      "Datasets:sales · report_sales",
      "Datasets:other · report_other",
      "Params:month (date)",
      "Params:unused (text)",
      "Bands:title · title · 1 row",
      "Bands:detail · body · 1 row",
      "Blocks:ft · text \"Page \" — footer",
      "Blocks:h · text \"Sales \" — band title",
      "Blocks:k1 · kpi \"Total\" — band title",
      "Blocks:d1 · divider — band title",
      "Blocks:t1 · table of sales — band detail",
    ]);
  });

  it("copes with a half-written document", () => {
    expect(listRemovable({})).toEqual([]);
    expect(listRemovable({ datasets: [null, 3, { id: 5 }], body: "x" })).toEqual([]);
  });
});

describe("removeItem", () => {
  it("removes an unreferenced dataset and a param cleanly", () => {
    const a = removeItem(doc(), { kind: "dataset", id: "other" })!;
    expect(a.doc.datasets.map((d: any) => d.id)).toEqual(["sales"]); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(a.dangling).toEqual([]);
    expect(() => parseDefinition(a.doc)).not.toThrow();

    const b = removeItem(doc(), { kind: "param", name: "unused" })!;
    expect(b.dangling).toEqual([]);
    expect(() => parseDefinition(b.doc)).not.toThrow();
  });

  it("reports what still references a removed dataset or param", () => {
    expect(removeItem(doc(), { kind: "dataset", id: "sales" })!.dangling).toEqual(["band detail", "kpi k1", "table t1"]);
    expect(removeItem(doc(), { kind: "param", name: "month" })!.dangling).toEqual(["dataset sales", "text h"]);
  });

  it("removes one block and keeps its siblings", () => {
    const r = removeItem(doc(), { kind: "block", id: "d1" })!;
    expect(r.doc.body[0].rows[0].cells[1].blocks.map((b: any) => b.id)).toEqual(["k1"]); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(() => parseDefinition(r.doc)).not.toThrow();
  });

  it("drops the cell, then the row, when the last block goes, so the document stays valid", () => {
    let r = removeItem(doc(), { kind: "block", id: "h" })!;
    expect(r.doc.body[0].rows[0].cells).toHaveLength(1); // the left cell is gone
    r = removeItem(r.doc, { kind: "block", id: "k1" })!;
    r = removeItem(r.doc, { kind: "block", id: "d1" })!;
    expect(r.doc.body[0].rows).toEqual([]); // the row is gone
    expect(() => parseDefinition(r.doc)).not.toThrow();
  });

  it("removes footer blocks and bands", () => {
    const f = removeItem(doc(), { kind: "block", id: "ft" })!;
    expect(f.doc.pageFooter).toEqual([]);
    expect(removeItem(doc(), { kind: "band", id: "detail" })!.doc.body.map((b: any) => b.id)).toEqual(["title"]); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("returns null for something that is not there, and never mutates its input", () => {
    const d = doc();
    const snapshot = JSON.stringify(d);
    expect(removeItem(d, { kind: "block", id: "nope" })).toBeNull();
    expect(removeItem(d, { kind: "dataset", id: "nope" })).toBeNull();
    removeItem(d, { kind: "band", id: "title" });
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it("undoes an insert: inserting then removing a block restores the original", () => {
    const base = doc();
    const withChart = insertItem(base, "chart");
    const id = withChart.body.at(-1).rows.at(-1).cells[0].blocks[0].id;
    const back = removeItem(withChart, { kind: "block", id })!.doc;
    // the row the insert created is pruned along with the block
    expect(back.body.at(-1).rows).toEqual(base.body.at(-1)!.rows);
  });
});
