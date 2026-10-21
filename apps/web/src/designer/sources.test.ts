import { describe, expect, it } from "vite-plus/test";
import { parseDefinition } from "@raseport/schema";
import { addDataSource, addParam, changeSource, mapArgument, parseArguments, renameDataset, renameParam, toIdent, toSourceInfo, updateParam } from "./sources.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const sales = toSourceInfo({ name: "report_sales_by_region", arguments: "p_month date", description: "Sales by region for a month" });
const orders = toSourceInfo({ name: "report_orders", arguments: "p_month date, p_limit integer, p_open boolean, p_note text", description: null });
const empty = (): Record<string, any> => ({ schemaVersion: 1, name: "t", body: [] });

describe("parseArguments", () => {
  it("parses names and types and maps them to param types", () => {
    expect(parseArguments("p_month date, p_limit integer, p_open boolean, p_note text, p_at timestamp with time zone")).toEqual({
      usable: true,
      args: [
        { name: "p_month", pgType: "date", paramType: "date" },
        { name: "p_limit", pgType: "integer", paramType: "number" },
        { name: "p_open", pgType: "boolean", paramType: "bool" },
        { name: "p_note", pgType: "text", paramType: "text" },
        { name: "p_at", pgType: "timestamp with time zone", paramType: "date" },
      ],
    });
  });

  it("keeps types with commas whole and handles no arguments", () => {
    expect(parseArguments("p_amount numeric(10,2), p_x text").args.map((a) => a.pgType)).toEqual(["numeric(10,2)", "text"]);
    expect(parseArguments("")).toEqual({ args: [], usable: true });
    expect(parseArguments(null)).toEqual({ args: [], usable: true });
  });

  it("marks functions with unnamed arguments as unusable", () => {
    expect(parseArguments("date").usable).toBe(false);
    expect(parseArguments("p_a text, integer").usable).toBe(false);
  });
});

describe("toSourceInfo", () => {
  it("uses the description as the label, or a readable function name", () => {
    expect(sales.label).toBe("Sales by region for a month");
    expect(orders.label).toBe("Orders");
  });
});

describe("addDataSource", () => {
  it("adds the dataset and creates and maps the params it needs", () => {
    const { doc, id } = addDataSource(empty(), sales);
    expect(id).toBe("sales_by_region");
    expect(doc.datasets[0]).toEqual({ id, source: { kind: "rpc", name: "report_sales_by_region" }, args: { p_month: { $param: "month" } } });
    expect(doc.params).toEqual([{ name: "month", type: "date", required: true }]);
    expect(() => parseDefinition(doc)).not.toThrow();
  });

  it("reuses an existing param of the same name and type, and picks fresh ids when taken", () => {
    const a = addDataSource(empty(), sales);
    const b = addDataSource(a.doc, sales);
    expect(b.id).toBe("sales_by_region_2");
    expect(b.doc.params).toHaveLength(1);
    expect(b.doc.datasets[1].args.p_month).toEqual({ $param: "month" });
  });

  it("does not reuse a same-named param of a different type", () => {
    const base = { ...empty(), params: [{ name: "month", type: "text" }] };
    const { doc } = addDataSource(base, sales);
    expect(doc.params.map((p: any) => `${p.name}:${p.type}`)).toEqual(["month:text", "month_2:date"]);
    expect(doc.datasets[0].args.p_month).toEqual({ $param: "month_2" });
  });

  it("handles several arguments", () => {
    const { doc } = addDataSource(empty(), orders);
    expect(doc.params.map((p: any) => `${p.name}:${p.type}`)).toEqual(["month:date", "limit:number", "open:bool", "note:text"]);
    expect(() => parseDefinition(doc)).not.toThrow();
  });
});

describe("changeSource and mapArgument", () => {
  it("keeps the mapping of arguments that still exist and adds the new ones", () => {
    const a = addDataSource(empty(), sales);
    const mapped = mapArgument(a.doc, a.id, "p_month", { fixed: "2026-01-01" })!;
    const changed = changeSource(mapped, a.id, orders)!;
    expect(changed.datasets[0].source.name).toBe("report_orders");
    expect(changed.datasets[0].args.p_month).toBe("2026-01-01"); // kept
    expect(changed.datasets[0].args.p_limit).toEqual({ $param: "limit" }); // new
    expect(changeSource(a.doc, "nope", orders)).toBeNull();
  });

  it("maps an argument to a param or a fixed value", () => {
    const a = addDataSource(empty(), sales);
    expect(mapArgument(a.doc, a.id, "p_month", { fixed: 5 })!.datasets[0].args.p_month).toBe(5);
    expect(mapArgument(a.doc, a.id, "p_month", { param: "other" })!.datasets[0].args.p_month).toEqual({ $param: "other" });
  });
});

describe("renames update every reference", () => {
  const doc = (): Record<string, any> => ({
    schemaVersion: 1,
    name: "t",
    params: [{ name: "month", type: "date" }, { name: "other", type: "text" }],
    datasets: [{ id: "sales", source: { kind: "rpc", name: "report_x" }, args: { p_month: { $param: "month" } } }],
    body: [
      {
        id: "b",
        type: "body",
        dataset: "sales",
        rows: [
          {
            id: "r",
            cells: [
              {
                span: 12,
                blocks: [
                  { type: "text", id: "t1", value: ["For ", { $param: "month" }] },
                  { type: "kpi", id: "k1", label: "K", value: { $agg: { fn: "sum", dataset: "sales", field: "a" } } },
                  { type: "table", id: "tb", dataset: "sales", columns: [{ field: "a", label: "A" }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  it("renames a dataset in blocks, bands and aggregates", () => {
    const d = renameDataset(doc(), "sales", "revenue")!;
    const text = JSON.stringify(d);
    expect(text).not.toContain('"sales"');
    expect(d.datasets[0].id).toBe("revenue");
    expect(d.body[0].dataset).toBe("revenue");
    expect(() => parseDefinition(d)).not.toThrow();
  });

  it("renames a param in dataset args and text", () => {
    const d = renameParam(doc(), "month", "period")!;
    expect(JSON.stringify(d)).not.toContain('"month"');
    expect(d.params[0].name).toBe("period");
    expect(d.datasets[0].args.p_month).toEqual({ $param: "period" });
    expect(() => parseDefinition(d)).not.toThrow();
  });

  it("refuses a name that is taken or invalid", () => {
    expect(renameParam(doc(), "month", "other")).toBeNull();
    expect(renameParam(doc(), "month", "Bad Name")).toBeNull();
    expect(renameDataset(doc(), "sales", "Bad")).toBeNull();
    expect(renameDataset(doc(), "nope", "fine")).toBeNull();
  });
});

describe("params", () => {
  it("adds, updates and sanitizes", () => {
    const { doc, name } = addParam(empty());
    expect(name).toBe("param_1");
    expect(updateParam(doc, name, { type: "number", required: true })!.params[0]).toEqual({ name, type: "number", required: true });
    expect(updateParam(doc, name, { type: undefined })!.params[0]).toEqual({ name });
    expect(addParam(doc).name).toBe("param_2");
    expect(toIdent("My Param-1")).toBe("my_param_1");
    expect(toIdent("1abc")).toBe("abc");
  });
});
