// Structured "insert" helpers: they edit the parsed definition and the editor re-serializes it,
// so commas and nesting are always right (unlike pasting snippets at the cursor).

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type InsertKind = "text" | "kpi" | "chart" | "table" | "divider" | "spacer" | "pageBreak" | "band" | "dataset" | "param";

export const INSERT_LABELS: Record<InsertKind, string> = {
  text: "Text",
  kpi: "KPI tile",
  chart: "Chart",
  table: "Table",
  divider: "Divider",
  spacer: "Spacer",
  pageBreak: "Page break",
  band: "Band",
  dataset: "Dataset",
  param: "Param",
};

/** Every id already used anywhere in the document. */
function usedIds(node: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => usedIds(n, acc));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "id" && typeof v === "string") acc.add(v);
      else usedIds(v, acc);
    }
  }
  return acc;
}

export const idPrefix = (type: string): string => (type === "pageBreak" ? "pb" : type.slice(0, 2));

export function uniqueId(doc: unknown, prefix: string): string {
  const used = usedIds(doc);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export type BlockKind = Exclude<InsertKind, "band" | "dataset" | "param">;

/** A new block with sensible defaults and an id that is unique in `doc` (it is not inserted anywhere). */
export function makeBlock(doc: Json, kind: BlockKind): Json {
  const ds = (doc.datasets as Json[] | undefined)?.[0]?.id ?? "data";
  const id = uniqueId(doc, idPrefix(kind));
  switch (kind) {
    case "text":
      return { type: "text", id, style: "body", value: ["New text"] };
    case "kpi":
      return { type: "kpi", id, label: "Count", format: "integer", value: { $agg: { fn: "count", dataset: ds } } };
    case "chart":
      return { type: "chart", id, kind: "bar", dataset: ds, title: "Chart title", x: "category", aggregate: "sum", series: [{ field: "value", label: "Value" }] };
    case "table":
      return { type: "table", id, dataset: ds, columns: [{ field: "id", label: "ID" }] };
    case "divider":
      return { type: "divider", id };
    case "spacer":
      return { type: "spacer", id, height: "12pt" };
    case "pageBreak":
      return { type: "pageBreak", id };
  }
}

/** Returns a new document with the item added. Blocks become a new full-width row in the last `body` band. */
export function insertItem(input: Json, kind: InsertKind): Json {
  const doc: Json = structuredClone(input);
  if (kind === "param") {
    (doc.params ??= []).push({ name: `param_${(doc.params.length ?? 0) + 1}`, type: "text" });
    return doc;
  }
  if (kind === "dataset") {
    const id = uniqueId(doc, "data");
    (doc.datasets ??= []).push({ id, source: { kind: "rpc", name: "report_" }, args: {} });
    return doc;
  }
  doc.body ??= [];
  if (kind === "band") {
    doc.body.push({ id: uniqueId(doc, "band"), type: "body", rows: [] });
    return doc;
  }
  let band = [...doc.body].reverse().find((b: Json) => b.type === "body");
  if (!band) {
    band = { id: uniqueId(doc, "band"), type: "body", rows: [] };
    doc.body.push(band);
  }
  const b = makeBlock(doc, kind);
  band.rows.push({ id: uniqueId(doc, "row"), cells: [{ span: 12, blocks: [b] }] });
  return doc;
}
