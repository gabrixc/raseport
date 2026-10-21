// Pure edit operations behind the drag-and-drop designer. Each takes the parsed definition (as plain JSON,
// so half-finished documents still work) and returns a new one, or null when the target no longer exists.
// Nodes are addressed by `id`; cells have no id, so they are addressed by (rowId, cellIndex).

import { idPrefix, uniqueId } from "../insert.ts";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Section = { section: "header" } | { section: "footer" } | { section: "band"; bandId: string };

/** Where something can be dropped. */
export type Dest =
  /** a new full-width row in a section, before the row currently at `index` */
  | { kind: "row"; at: Section; index: number }
  /** into an existing cell, before the block currently at `index` */
  | { kind: "cell"; rowId: string; cellIndex: number; index: number }
  /** a new cell beside an existing one, splitting its width */
  | { kind: "split"; rowId: string; cellIndex: number; side: "before" | "after" };

const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

/** The row array of a section, created when missing. */
function rowsOf(doc: Json, at: Section): Json[] | null {
  if (at.section === "header") return (doc.pageHeader ??= []);
  if (at.section === "footer") return (doc.pageFooter ??= []);
  const band = arr(doc.body).find((b) => b.id === at.bandId);
  return band ? (band.rows ??= []) : null;
}

const sections = (doc: Json): Json[][] => [
  ...(doc.pageHeader ? [doc.pageHeader as Json[]] : []),
  ...(doc.pageFooter ? [doc.pageFooter as Json[]] : []),
  ...arr(doc.body).map((b) => (b.rows ??= []) as Json[]),
];

function findRow(doc: Json, rowId: string): Json | null {
  for (const rows of sections(doc)) for (const row of arr(rows)) if (row.id === rowId) return row;
  return null;
}

/** Drop cells without blocks, then rows without cells (a row needs at least one cell). */
function prune(doc: Json): void {
  for (const rows of sections(doc)) {
    for (const row of arr(rows)) row.cells = arr(row.cells).filter((c) => arr(c.blocks).length > 0);
    const kept = arr(rows).filter((row) => row.cells.length > 0);
    rows.splice(0, rows.length, ...kept);
  }
}

const MOVING = "__moving"; // temporary marker so a moved node can be found again after insertion

/** Insert `block` at `dest`. Returns false when the destination does not exist. */
function place(doc: Json, block: Json, dest: Dest): boolean {
  if (dest.kind === "row") {
    const rows = rowsOf(doc, dest.at);
    if (!rows) return false;
    const row = { id: uniqueId(doc, "row"), cells: [{ span: 12, blocks: [block] }] };
    rows.splice(Math.max(0, Math.min(dest.index, rows.length)), 0, row);
    return true;
  }
  const row = findRow(doc, dest.rowId);
  const cells = row ? arr(row.cells) : [];
  const cell = cells[dest.cellIndex];
  if (!row || !cell) return false;
  if (dest.kind === "cell") {
    const blocks = (cell.blocks ??= []) as Json[];
    blocks.splice(Math.max(0, Math.min(dest.index, blocks.length)), 0, block);
    return true;
  }
  // split: the new cell takes half of the neighbour's width (at least 1)
  const span = Number(cell.span) || 12;
  const taken = span > 1 ? Math.floor(span / 2) : 1;
  if (span > 1) cell.span = span - taken;
  const fresh = { span: taken, blocks: [block] };
  row.cells.splice(dest.side === "before" ? dest.cellIndex : dest.cellIndex + 1, 0, fresh);
  return true;
}

/** Insert a new block (not yet in the document). */
export function insertBlock(input: Json, block: Json, dest: Dest): Json | null {
  const doc: Json = structuredClone(input);
  return place(doc, structuredClone(block), dest) ? doc : null;
}

/** Find a block by id anywhere in the document. */
export function findBlock(doc: Json, id: string): { block: Json; rowId: string; cellIndex: number } | null {
  for (const rows of sections(doc))
    for (const row of arr(rows)) {
      const cells = arr(row.cells);
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        const block = arr(cells[cellIndex]!.blocks).find((b) => b.id === id);
        if (block) return { block, rowId: row.id, cellIndex };
      }
    }
  return null;
}

/** Move an existing block to a new place; empty cells and rows it leaves behind are removed. */
export function moveBlock(input: Json, blockId: string, dest: Dest): Json | null {
  const doc: Json = structuredClone(input);
  const found = findBlock(doc, blockId);
  if (!found) return null;
  // Splitting a cell that holds only this block would leave it nothing to split off from.
  if (dest.kind === "split" && dest.rowId === found.rowId && dest.cellIndex === found.cellIndex && arr(findRow(doc, found.rowId)?.cells[found.cellIndex]?.blocks).length === 1) return null;
  found.block[MOVING] = true;
  const copy = structuredClone(found.block);
  delete copy[MOVING];
  if (!place(doc, copy, dest)) return null;
  // remove the original (identified by the marker), wherever it ended up relative to the copy
  for (const rows of sections(doc))
    for (const row of arr(rows)) for (const cell of arr(row.cells)) cell.blocks = arr(cell.blocks).filter((b) => !b[MOVING]);
  prune(doc);
  return doc;
}

/** Move a whole row to another position (same or different section). */
export function moveRow(input: Json, rowId: string, at: Section, index: number): Json | null {
  const doc: Json = structuredClone(input);
  const row = findRow(doc, rowId);
  if (!row) return null;
  row[MOVING] = true;
  const copy = structuredClone(row);
  delete copy[MOVING];
  const target = rowsOf(doc, at);
  if (!target) return null;
  target.splice(Math.max(0, Math.min(index, target.length)), 0, copy);
  for (const rows of sections(doc)) rows.splice(0, rows.length, ...arr(rows).filter((r) => !r[MOVING]));
  return doc;
}

/** Copy a block right after the original, in the same cell. */
export function duplicateBlock(input: Json, blockId: string): { doc: Json; newId: string } | null {
  const doc: Json = structuredClone(input);
  for (const rows of sections(doc))
    for (const row of arr(rows))
      for (const cell of arr(row.cells)) {
        const blocks = cell.blocks as Json[];
        const i = blocks.findIndex((b) => b.id === blockId);
        if (i < 0) continue;
        const copy = structuredClone(blocks[i]!);
        copy.id = uniqueId(doc, idPrefix(String(copy.type)));
        blocks.splice(i + 1, 0, copy);
        return { doc, newId: copy.id };
      }
  return null;
}

/** Copy a row (with all its blocks) right after the original. */
export function duplicateRow(input: Json, rowId: string): { doc: Json; newId: string } | null {
  const doc: Json = structuredClone(input);
  for (const rows of sections(doc)) {
    const i = arr(rows).findIndex((r) => r.id === rowId);
    if (i < 0) continue;
    const copy = structuredClone(rows[i]!);
    // assign ids one by one so each new id is visible to the next uniqueId call
    copy.id = uniqueId(doc, "row");
    rows.splice(i + 1, 0, copy);
    for (const cell of arr(copy.cells)) for (const b of arr(cell.blocks)) b.id = uniqueId(doc, idPrefix(String(b.type)));
    return { doc, newId: copy.id };
  }
  return null;
}

/** Remove a row and everything in it. */
export function removeRow(input: Json, rowId: string): Json | null {
  const doc: Json = structuredClone(input);
  let hit = false;
  for (const rows of sections(doc)) {
    const kept = arr(rows).filter((r) => r.id !== rowId);
    if (kept.length !== arr(rows).length) hit = true;
    rows.splice(0, rows.length, ...kept);
  }
  return hit ? doc : null;
}

/** Set a cell's width (1-12). */
export function setCellSpan(input: Json, rowId: string, cellIndex: number, span: number): Json | null {
  const doc: Json = structuredClone(input);
  const cell = arr(findRow(doc, rowId)?.cells)[cellIndex];
  if (!cell) return null;
  cell.span = Math.max(1, Math.min(12, Math.round(span)));
  return doc;
}

/**
 * Move the boundary between a cell and its right neighbour by `delta` columns (positive grows the left cell).
 * Neither cell can go below 1.
 */
export function resizeBoundary(input: Json, rowId: string, cellIndex: number, delta: number): Json | null {
  const doc: Json = structuredClone(input);
  const cells = arr(findRow(doc, rowId)?.cells);
  const left = cells[cellIndex];
  const right = cells[cellIndex + 1];
  if (!left || !right) return null;
  const a = Number(left.span) || 1;
  const b = Number(right.span) || 1;
  const d = Math.max(1 - a, Math.min(b - 1, Math.round(delta)));
  if (d === 0) return doc;
  left.span = a + d;
  right.span = b - d;
  return doc;
}

/** Shallow-merge `patch` into the node (band, row, block or dataset) with this id; `undefined` deletes a key. */
export function updateNode(input: Json, id: string, patch: Json): Json | null {
  const doc: Json = structuredClone(input);
  let found: Json | null = null;
  const visit = (node: unknown): void => {
    if (found) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const o = node as Json;
    if (o.id === id) {
      found = o;
      return;
    }
    Object.values(o).forEach(visit);
  };
  visit(doc);
  if (!found) return null;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (found as Json)[k];
    else (found as Json)[k] = v;
  }
  return doc;
}

/** Set a value at a path inside the document (used for page, theme and other non-node settings). */
export function setPath(input: Json, path: (string | number)[], value: unknown): Json {
  const doc: Json = structuredClone(input);
  let cur: Json = doc;
  path.forEach((key, i) => {
    if (i === path.length - 1) {
      if (value === undefined) delete cur[key];
      else cur[key] = value;
    } else {
      if (cur[key] === undefined || cur[key] === null || typeof cur[key] !== "object") cur[key] = typeof path[i + 1] === "number" ? [] : {};
      cur = cur[key];
    }
  });
  return doc;
}

/** Where a row sits: its section, its index there, and how many rows the section has. */
export function findRowPosition(doc: Json, rowId: string): { section: Section; index: number; count: number } | null {
  const candidates: { section: Section; rows: Json[] }[] = [
    { section: { section: "header" }, rows: arr(doc.pageHeader) },
    { section: { section: "footer" }, rows: arr(doc.pageFooter) },
    ...arr(doc.body).map((b) => ({ section: { section: "band", bandId: String(b.id) } as Section, rows: arr(b.rows) })),
  ];
  for (const { section, rows } of candidates) {
    const index = rows.findIndex((r) => r.id === rowId);
    if (index >= 0) return { section, index, count: rows.length };
  }
  return null;
}
