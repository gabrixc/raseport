import { describe, expect, it } from "vite-plus/test";
import { parseDefinition } from "@raseport/schema";
import { duplicateBlock, duplicateRow, findBlock, insertBlock, moveBlock, moveRow, removeRow, resizeBoundary, setCellSpan, setPath, updateNode } from "./ops.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const txt = (id: string) => ({ type: "text", id, value: [id] });

/** body band "main": r1 = [A | B, C], r2 = [D]; footer f1 = [F] */
const doc = (): Record<string, any> => ({
  schemaVersion: 1,
  name: "t",
  pageFooter: [{ id: "f1", cells: [{ span: 12, blocks: [txt("F")] }] }],
  body: [
    {
      id: "main",
      type: "body",
      rows: [
        { id: "r1", cells: [{ span: 6, blocks: [txt("A")] }, { span: 6, blocks: [txt("B"), txt("C")] }] },
        { id: "r2", cells: [{ span: 12, blocks: [txt("D")] }] },
      ],
    },
    { id: "empty", type: "summary", rows: [] },
  ],
});

const ids = (cell: any) => cell.blocks.map((b: any) => b.id);
const main = (d: any) => d.body[0].rows;
const valid = (d: any) => expect(() => parseDefinition(d)).not.toThrow();

describe("insertBlock", () => {
  it("adds a full-width row at a position, in a band, an empty band, and the footer", () => {
    const d = insertBlock(doc(), txt("N"), { kind: "row", at: { section: "band", bandId: "main" }, index: 1 })!;
    expect(main(d).map((r: any) => ids(r.cells[0]))).toEqual([["A"], ["N"], ["D"]]);
    const e = insertBlock(doc(), txt("N"), { kind: "row", at: { section: "band", bandId: "empty" }, index: 0 })!;
    expect(e.body[1].rows).toHaveLength(1);
    const f = insertBlock(doc(), txt("N"), { kind: "row", at: { section: "footer" }, index: 1 })!;
    expect(f.pageFooter).toHaveLength(2);
    const h = insertBlock(doc(), txt("N"), { kind: "row", at: { section: "header" }, index: 0 })!;
    expect(h.pageHeader).toHaveLength(1);
    [d, e, f, h].forEach(valid);
  });

  it("gives new rows unique ids", () => {
    let d: any = doc();
    for (let i = 0; i < 3; i++) d = insertBlock(d, txt(`N${i}`), { kind: "row", at: { section: "band", bandId: "main" }, index: 0 });
    const rowIds = main(d).map((r: any) => r.id);
    expect(new Set(rowIds).size).toBe(rowIds.length);
  });

  it("inserts into a cell before the block at an index", () => {
    const d = insertBlock(doc(), txt("N"), { kind: "cell", rowId: "r1", cellIndex: 1, index: 1 })!;
    expect(ids(main(d)[0].cells[1])).toEqual(["B", "N", "C"]);
    valid(d);
  });

  it("splits a cell: the new cell takes half the width, before or after", () => {
    const after = insertBlock(doc(), txt("N"), { kind: "split", rowId: "r2", cellIndex: 0, side: "after" })!;
    expect(main(after)[1].cells.map((c: any) => [c.span, ids(c)])).toEqual([[6, ["D"]], [6, ["N"]]]);
    const before = insertBlock(doc(), txt("N"), { kind: "split", rowId: "r1", cellIndex: 0, side: "before" })!;
    expect(main(before)[0].cells.map((c: any) => [c.span, ids(c)])).toEqual([[3, ["N"]], [3, ["A"]], [6, ["B", "C"]]]);
    valid(after);
    valid(before);
  });

  it("returns null for a missing destination and never mutates the input", () => {
    const d = doc();
    const snap = JSON.stringify(d);
    expect(insertBlock(d, txt("N"), { kind: "cell", rowId: "nope", cellIndex: 0, index: 0 })).toBeNull();
    expect(insertBlock(d, txt("N"), { kind: "row", at: { section: "band", bandId: "nope" }, index: 0 })).toBeNull();
    insertBlock(d, txt("N"), { kind: "row", at: { section: "footer" }, index: 0 });
    expect(JSON.stringify(d)).toBe(snap);
  });
});

describe("moveBlock", () => {
  it("moves a block into another cell and prunes the cell/row it leaves empty", () => {
    const d = moveBlock(doc(), "D", { kind: "cell", rowId: "r1", cellIndex: 0, index: 1 })!;
    expect(main(d)).toHaveLength(1); // r2 was emptied and removed
    expect(ids(main(d)[0].cells[0])).toEqual(["A", "D"]);
    valid(d);
  });

  it("reorders within the same cell without off-by-one errors", () => {
    // B C -> move B to the end (index 2 = after C)
    expect(ids(main(moveBlock(doc(), "B", { kind: "cell", rowId: "r1", cellIndex: 1, index: 2 })!)[0].cells[1])).toEqual(["C", "B"]);
    // move C to the front
    expect(ids(main(moveBlock(doc(), "C", { kind: "cell", rowId: "r1", cellIndex: 1, index: 0 })!)[0].cells[1])).toEqual(["C", "B"]);
    // dropping right where it already is changes nothing
    expect(ids(main(moveBlock(doc(), "B", { kind: "cell", rowId: "r1", cellIndex: 1, index: 0 })!)[0].cells[1])).toEqual(["B", "C"]);
    expect(ids(main(moveBlock(doc(), "B", { kind: "cell", rowId: "r1", cellIndex: 1, index: 1 })!)[0].cells[1])).toEqual(["B", "C"]);
  });

  it("moves a block to a new row, another section, or beside another cell", () => {
    const toRow = moveBlock(doc(), "A", { kind: "row", at: { section: "band", bandId: "main" }, index: 2 })!;
    expect(main(toRow).map((r: any) => r.cells.map(ids))).toEqual([[["B", "C"]], [["D"]], [["A"]]]);
    const toFooter = moveBlock(doc(), "D", { kind: "row", at: { section: "footer" }, index: 0 })!;
    expect(toFooter.pageFooter).toHaveLength(2);
    expect(main(toFooter)).toHaveLength(1);
    const beside = moveBlock(doc(), "D", { kind: "split", rowId: "r1", cellIndex: 1, side: "after" })!;
    expect(main(beside)[0].cells.map((c: any) => [c.span, ids(c)])).toEqual([[6, ["A"]], [3, ["B", "C"]], [3, ["D"]]]);
    [toRow, toFooter, beside].forEach(valid);
  });

  it("refuses to split a cell off from itself, and returns null for unknown ids", () => {
    expect(moveBlock(doc(), "D", { kind: "split", rowId: "r2", cellIndex: 0, side: "after" })).toBeNull();
    expect(moveBlock(doc(), "nope", { kind: "row", at: { section: "footer" }, index: 0 })).toBeNull();
    expect(moveBlock(doc(), "A", { kind: "cell", rowId: "nope", cellIndex: 0, index: 0 })).toBeNull();
  });

  it("does not leave the temporary move marker behind", () => {
    expect(JSON.stringify(moveBlock(doc(), "A", { kind: "row", at: { section: "footer" }, index: 0 }))).not.toContain("__moving");
  });
});

describe("moveRow", () => {
  it("reorders rows and moves them between sections", () => {
    const d = moveRow(doc(), "r2", { section: "band", bandId: "main" }, 0)!;
    expect(main(d).map((r: any) => r.id)).toEqual(["r2", "r1"]);
    const e = moveRow(doc(), "r1", { section: "band", bandId: "empty" }, 0)!;
    expect(main(e).map((r: any) => r.id)).toEqual(["r2"]);
    expect(e.body[1].rows.map((r: any) => r.id)).toEqual(["r1"]);
    expect(JSON.stringify(d)).not.toContain("__moving");
    [d, e].forEach(valid);
  });
});

describe("duplicate and remove", () => {
  it("duplicates a block right after the original with a fresh id", () => {
    const { doc: d, newId } = duplicateBlock(doc(), "B")!;
    expect(ids(main(d)[0].cells[1])).toEqual(["B", newId, "C"]);
    expect(newId).not.toBe("B");
    valid(d);
  });

  it("duplicates a row with fresh ids throughout", () => {
    const { doc: d, newId } = duplicateRow(doc(), "r1")!;
    expect(main(d).map((r: any) => r.id)).toEqual(["r1", newId, "r2"]);
    const all = JSON.stringify(d).match(/"id":"[^"]+"/g)!;
    expect(new Set(all).size).toBe(all.length);
    valid(d);
  });

  it("removes a whole row", () => {
    expect(main(removeRow(doc(), "r1")!).map((r: any) => r.id)).toEqual(["r2"]);
    expect(removeRow(doc(), "nope")).toBeNull();
  });

  it("finds blocks by id", () => {
    expect(findBlock(doc(), "C")).toMatchObject({ rowId: "r1", cellIndex: 1 });
    expect(findBlock(doc(), "zzz")).toBeNull();
  });
});

describe("sizing", () => {
  it("clamps a span to 1-12", () => {
    expect(main(setCellSpan(doc(), "r1", 0, 99)!)[0].cells[0].span).toBe(12);
    expect(main(setCellSpan(doc(), "r1", 0, 0)!)[0].cells[0].span).toBe(1);
    expect(setCellSpan(doc(), "r1", 5, 4)).toBeNull();
  });

  it("moves the boundary between neighbours, keeping both at least 1 wide", () => {
    const spans = (d: any) => main(d)[0].cells.map((c: any) => c.span);
    expect(spans(resizeBoundary(doc(), "r1", 0, 2)!)).toEqual([8, 4]);
    expect(spans(resizeBoundary(doc(), "r1", 0, -2)!)).toEqual([4, 8]);
    expect(spans(resizeBoundary(doc(), "r1", 0, 100)!)).toEqual([11, 1]);
    expect(spans(resizeBoundary(doc(), "r1", 0, -100)!)).toEqual([1, 11]);
    expect(resizeBoundary(doc(), "r1", 1, 1)).toBeNull(); // no right neighbour
  });
});

describe("updateNode / setPath", () => {
  it("patches a node by id and deletes keys set to undefined", () => {
    const d = updateNode(doc(), "A", { style: "h1", value: ["Hello"] })!;
    expect(findBlock(d, "A")!.block).toMatchObject({ style: "h1", value: ["Hello"] });
    const e = updateNode(d, "A", { style: undefined })!;
    expect(findBlock(e, "A")!.block).not.toHaveProperty("style");
    expect(updateNode(doc(), "nope", { x: 1 })).toBeNull();
  });

  it("sets nested values, creating parents as needed", () => {
    const d = setPath(doc(), ["page", "size"], "a3");
    expect(d.page).toEqual({ size: "a3" });
    expect(setPath(d, ["params", 0, "name"], "m").params).toEqual([{ name: "m" }]);
    expect(setPath(d, ["page", "size"], undefined).page).toEqual({});
  });
});
