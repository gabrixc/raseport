import { describe, expect, it } from "vite-plus/test";
import { parseDefinition } from "@raseport/schema";
import { insertItem, uniqueId, type InsertKind } from "./insert.ts";

const base = { schemaVersion: 1, name: "t", datasets: [{ id: "sales", source: { kind: "rpc", name: "report_sales" } }], body: [] };

describe("insertItem", () => {
  const kinds: InsertKind[] = ["text", "kpi", "chart", "table", "divider", "spacer", "pageBreak", "band", "param"];

  it.each(kinds)("keeps the definition valid after inserting %s", (kind) => {
    expect(() => parseDefinition(insertItem(base, kind))).not.toThrow();
  });

  it("inserts a dataset with a placeholder RPC name that the schema flags until it is filled in", () => {
    const doc = insertItem(base, "dataset");
    expect(doc.datasets).toHaveLength(2);
    expect(() => parseDefinition(doc)).toThrow(/report_ followed by/);
    doc.datasets[1].source.name = "report_real_one";
    expect(() => parseDefinition(doc)).not.toThrow();
  });

  it("adds blocks as a row in the last body band, creating one if needed", () => {
    const doc = insertItem(base, "table");
    expect(doc.body).toHaveLength(1);
    expect(doc.body[0].rows[0].cells[0].blocks[0]).toMatchObject({ type: "table", dataset: "sales" });
    expect(insertItem(doc, "chart").body).toHaveLength(1);
  });

  it("generates ids that never collide", () => {
    let doc: Record<string, any> = base; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < 5; i++) doc = insertItem(doc, "text");
    const ids = JSON.stringify(doc).match(/"id":"[^"]+"/g)!;
    expect(new Set(ids).size).toBe(ids.length);
    expect(uniqueId(doc, "te")).toBe("te6");
  });

  it("does not mutate its input", () => {
    insertItem(base, "text");
    expect(base.body).toHaveLength(0);
  });
});
