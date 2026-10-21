// Structured "remove" helpers, the counterpart of insert.ts: they edit the parsed JSON and the editor
// re-serializes it, so the result is always well-formed JSON. Ctrl+Z in the editor undoes a removal.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RemoveTarget =
  | { kind: "dataset"; id: string }
  | { kind: "param"; name: string }
  | { kind: "band"; id: string }
  | { kind: "block"; id: string };

export type RemoveGroup = "Datasets" | "Params" | "Bands" | "Blocks";

export interface RemovableItem {
  target: RemoveTarget;
  group: RemoveGroup;
  label: string;
}

export interface RemoveResult {
  doc: Json;
  /** What was removed, for the status line */
  removed: string;
  /** Things that still point at the removed item and now need fixing */
  dangling: string[];
}

const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

/** Every row in the document with the section it lives in. */
function allRows(doc: Json): { row: Json; where: string }[] {
  return [
    ...arr(doc.pageHeader).map((row) => ({ row, where: "header" })),
    ...arr(doc.pageFooter).map((row) => ({ row, where: "footer" })),
    ...arr(doc.body).flatMap((band) => arr(band.rows).map((row) => ({ row, where: `band ${band.id}` }))),
  ];
}

function allBlocks(doc: Json): { block: Json; where: string }[] {
  return allRows(doc).flatMap(({ row, where }) => arr(row.cells).flatMap((cell) => arr(cell.blocks).map((block) => ({ block, where }))));
}

const short = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function describeBlock(b: Json): string {
  const id = String(b.id ?? "?");
  switch (b.type) {
    case "text": {
      const first = Array.isArray(b.value) ? b.value.find((p: unknown) => typeof p === "string") : typeof b.value === "string" ? b.value : undefined;
      return `${id} · text${first ? ` "${short(first)}"` : ""}`;
    }
    case "kpi":
      return `${id} · kpi${b.label ? ` "${short(String(b.label))}"` : ""}`;
    case "chart":
      return `${id} · ${b.kind ?? "chart"} chart${b.title ? ` "${short(String(b.title))}"` : ""}`;
    case "table":
      return `${id} · table${b.dataset ? ` of ${b.dataset}` : ""}`;
    default:
      return `${id} · ${b.type ?? "block"}`;
  }
}

/** Everything that can be removed, in document order, for the Remove menu. */
export function listRemovable(doc: Json): RemovableItem[] {
  const out: RemovableItem[] = [];
  for (const d of arr(doc.datasets)) if (typeof d.id === "string") out.push({ target: { kind: "dataset", id: d.id }, group: "Datasets", label: `${d.id}${d.source?.name ? ` · ${d.source.name}` : ""}` });
  for (const p of arr(doc.params)) if (typeof p.name === "string") out.push({ target: { kind: "param", name: p.name }, group: "Params", label: `${p.name}${p.type ? ` (${p.type})` : ""}` });
  for (const b of arr(doc.body)) if (typeof b.id === "string") out.push({ target: { kind: "band", id: b.id }, group: "Bands", label: `${b.id} · ${b.type ?? "band"} · ${arr(b.rows).length} row${arr(b.rows).length === 1 ? "" : "s"}` });
  for (const { block, where } of allBlocks(doc)) if (typeof block.id === "string") out.push({ target: { kind: "block", id: block.id }, group: "Blocks", label: `${describeBlock(block)} — ${where}` });
  return out;
}

/** Ids of blocks/bands (and dataset args) that reference `dataset`. */
function datasetRefs(doc: Json, dataset: string): string[] {
  const refs: string[] = [];
  const usesAgg = (v: unknown): boolean => Array.isArray(v) ? v.some(usesAgg) : !!v && typeof v === "object" && ((v as Json).$agg?.dataset === dataset || Object.values(v as Json).some(usesAgg));
  for (const band of arr(doc.body)) if (band.dataset === dataset) refs.push(`band ${band.id}`);
  for (const { block } of allBlocks(doc)) if (block.dataset === dataset || usesAgg(block.value)) refs.push(`${block.type} ${block.id}`);
  return refs;
}

function paramRefs(doc: Json, name: string): string[] {
  const refs: string[] = [];
  const uses = (v: unknown): boolean => Array.isArray(v) ? v.some(uses) : !!v && typeof v === "object" && ((v as Json).$param === name || Object.values(v as Json).some(uses));
  for (const d of arr(doc.datasets)) if (uses(d.args)) refs.push(`dataset ${d.id}`);
  for (const { block } of allBlocks(doc)) if (uses(block.value)) refs.push(`${block.type} ${block.id}`);
  return refs;
}

/** Remove cells left without blocks, then rows left without cells (a row needs at least one cell). */
function prune(rows: Json[]): Json[] {
  return rows
    .map((row) => ({ ...row, cells: arr(row.cells).filter((cell) => arr(cell.blocks).length > 0) }))
    .filter((row) => row.cells.length > 0);
}

/** Returns a new document without the target, or null if it was not found. The input is not mutated. */
export function removeItem(input: Json, target: RemoveTarget): RemoveResult | null {
  const doc: Json = structuredClone(input);

  switch (target.kind) {
    case "dataset": {
      const before = arr(doc.datasets).length;
      doc.datasets = arr(doc.datasets).filter((d) => d.id !== target.id);
      if (doc.datasets.length === before) return null;
      return { doc, removed: `dataset "${target.id}"`, dangling: datasetRefs(doc, target.id) };
    }
    case "param": {
      const before = arr(doc.params).length;
      doc.params = arr(doc.params).filter((p) => p.name !== target.name);
      if (doc.params.length === before) return null;
      return { doc, removed: `param "${target.name}"`, dangling: paramRefs(doc, target.name) };
    }
    case "band": {
      const before = arr(doc.body).length;
      doc.body = arr(doc.body).filter((b) => b.id !== target.id);
      if (doc.body.length === before) return null;
      return { doc, removed: `band "${target.id}"`, dangling: [] };
    }
    case "block": {
      let found = false;
      const strip = (rows: unknown): Json[] =>
        prune(
          arr(rows).map((row) => ({
            ...row,
            cells: arr(row.cells).map((cell) => ({
              ...cell,
              blocks: arr(cell.blocks).filter((b) => {
                const hit = b.id === target.id;
                found ||= hit;
                return !hit;
              }),
            })),
          })),
        );
      if (doc.pageHeader) doc.pageHeader = strip(doc.pageHeader);
      if (doc.pageFooter) doc.pageFooter = strip(doc.pageFooter);
      doc.body = arr(doc.body).map((band) => ({ ...band, rows: strip(band.rows) }));
      return found ? { doc, removed: `block "${target.id}"`, dangling: [] } : null;
    }
  }
}
