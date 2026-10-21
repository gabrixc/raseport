import { aggregate, chartSvg, formatAuto, formatValue, getPath, type FormatEnv } from "@raseport/render-core";
import { arr, type DrawContext, type Json } from "./model.ts";

const NUMERIC = new Set(["integer", "decimal", "currency", "percent"]);
const kindOf = (format: unknown): string => (typeof format === "object" && format ? String((format as Json).kind) : String(format ?? "text"));
const TABLE_PREVIEW_ROWS = 8;

function aggValue(ref: Json, ctx: DrawContext): unknown {
  const a = ref?.$agg;
  if (!a) return null;
  return aggregate(a.fn, ctx.rows(a.dataset), a.field);
}

function partText(part: unknown, block: Json, ctx: DrawContext): { text: string; placeholder?: boolean } {
  if (typeof part === "string") return { text: part };
  const p = (part ?? {}) as Json;
  if (p.$builtin) return { text: p.$builtin === "page" ? "1" : p.$builtin === "pages" ? "1" : new Intl.DateTimeFormat(ctx.env.locale, { dateStyle: "medium" }).format(new Date()) };
  let value: unknown;
  if (p.$param) {
    value = ctx.params[p.$param];
    if (value === undefined || value === null || value === "") return { text: `‹${p.$param}›`, placeholder: true };
  } else if (p.$agg) value = aggValue(p, ctx);
  else return { text: "", placeholder: true };
  return { text: block.format ? formatValue(value, block.format, ctx.env) : formatAuto(value, ctx.env) };
}

function TextBlock({ block, ctx }: { block: Json; ctx: DrawContext }) {
  const parts = Array.isArray(block.value) ? block.value : typeof block.value === "string" ? [block.value] : [];
  return (
    <div className={`d-text d-${block.style ?? "body"}`} style={{ textAlign: block.align ?? "left" }}>
      {parts.length === 0 && <span className="d-placeholder">Empty text</span>}
      {parts.map((p: unknown, i: number) => {
        const { text, placeholder } = partText(p, block, ctx);
        return placeholder ? <span key={i} className="d-chip">{text}</span> : <span key={i}>{text}</span>;
      })}
    </div>
  );
}

function KpiBlock({ block, ctx }: { block: Json; ctx: DrawContext }) {
  const v = aggValue(block.value ?? {}, ctx);
  const shown = block.format && block.format !== "text" ? formatValue(v, block.format, ctx.env) : formatAuto(v, ctx.env);
  return (
    <div className="d-kpi">
      <div className="d-kpi-label">{block.label || <span className="d-placeholder">Label</span>}</div>
      <div className="d-kpi-value">{shown || "—"}</div>
    </div>
  );
}

function ChartBlock({ block, ctx, span }: { block: Json; ctx: DrawContext; span: number }) {
  const rows = ctx.rows(block.dataset);
  if (!block.dataset || !Array.isArray(block.series) || block.series.length === 0 || !block.x) return <div className="d-empty">Choose a data source, a category and a value for this chart</div>;
  const svg = chartSvg(
    rows,
    { kind: block.kind === "line" ? "line" : "bar", title: block.title, x: String(block.x), series: arr(block.series).map((s) => ({ field: String(s.field ?? ""), label: s.label, color: s.color })), aggregate: block.aggregate, format: block.format ?? "decimal", height: Number(block.height) || 260 },
    ctx.env,
    ctx.font,
    span,
  );
  // An <img> keeps the SVG inert (no scripts), which matters because the document may not be validated yet.
  return <img className="d-chart" alt={block.title ?? "Chart"} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />;
}

function TableBlock({ block, ctx }: { block: Json; ctx: DrawContext }) {
  const cols = arr(block.columns);
  const rows = ctx.rows(block.dataset);
  if (!block.dataset) return <div className="d-empty">Choose a data source for this table</div>;
  if (cols.length === 0) return <div className="d-empty">Add columns to this table</div>;

  const cell = (c: Json, row: Record<string, unknown>) => formatValue(getPath(row, String(c.field ?? "")), c.format ?? "text", ctx.env);
  const align = (c: Json) => c.align ?? (NUMERIC.has(kindOf(c.format)) ? "right" : "left");
  const body: { key: string; kind: "group" | "row" | "sub" | "total"; cells: string[] }[] = [];

  const aggCells = (subset: Record<string, unknown>[], label: string) =>
    cols.map((c, i) => (c.aggregate ? formatValue(aggregate(c.aggregate, subset, c.field), c.format ?? "text", ctx.env) : i === 0 ? label : ""));

  let shown = 0;
  if (block.groupBy) {
    let start = 0;
    while (start < rows.length && shown < TABLE_PREVIEW_ROWS) {
      const key = getPath(rows[start]!, block.groupBy);
      let end = start;
      while (end < rows.length && getPath(rows[end]!, block.groupBy) === key) end++;
      body.push({ key: `g${start}`, kind: "group", cells: [formatAuto(key, ctx.env)] });
      for (const row of rows.slice(start, Math.min(end, start + 3))) {
        body.push({ key: `r${shown}-${start}`, kind: "row", cells: cols.map((c) => cell(c, row)) });
        shown++;
      }
      if (block.groupSubtotals) body.push({ key: `s${start}`, kind: "sub", cells: aggCells(rows.slice(start, end), "Subtotal") });
      start = end;
    }
  } else {
    for (const row of rows.slice(0, TABLE_PREVIEW_ROWS)) body.push({ key: `r${shown++}`, kind: "row", cells: cols.map((c) => cell(c, row)) });
  }
  if (block.grandTotal) body.push({ key: "total", kind: "total", cells: aggCells(rows, "Total") });

  return (
    <div className="d-table-wrap">
      <table className="d-table">
        <thead>
          <tr>{cols.map((c, i) => <th key={i} style={{ textAlign: align(c), background: ctx.accent }}>{c.label || <span className="d-placeholder">Column</span>}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, ri) =>
            r.kind === "group" ? (
              <tr key={r.key} className="d-group"><td colSpan={cols.length}>{r.cells[0]}</td></tr>
            ) : (
              <tr key={r.key} className={r.kind === "row" ? (ri % 2 ? "d-zebra" : "") : "d-sum"}>{cols.map((c, i) => <td key={i} style={{ textAlign: align(c) }}>{r.cells[i]}</td>)}</tr>
            ),
          )}
        </tbody>
      </table>
      <div className="d-table-note">{rows.length === 0 ? "No rows yet for these params" : rows.length > TABLE_PREVIEW_ROWS ? `Preview of ${TABLE_PREVIEW_ROWS} of ${ctx.total(block.dataset).toLocaleString()} rows` : `${rows.length} rows`}</div>
    </div>
  );
}

/** What a block looks like on the canvas, drawn from real data with the same helpers the PDF uses. */
export function BlockView({ block, ctx, span }: { block: Json; ctx: DrawContext; span: number }) {
  switch (block.type) {
    case "text":
      return <TextBlock block={block} ctx={ctx} />;
    case "kpi":
      return <KpiBlock block={block} ctx={ctx} />;
    case "chart":
      return <ChartBlock block={block} ctx={ctx} span={span} />;
    case "table":
      return <TableBlock block={block} ctx={ctx} />;
    case "divider":
      return <hr className="d-divider" />;
    case "spacer":
      return <div className="d-spacer" style={{ height: Math.max(8, parseFloat(String(block.height)) || 12) }}>Spacer</div>;
    case "pageBreak":
      return <div className="d-pagebreak">Page break</div>;
    default:
      return <div className="d-empty">Unknown block “{String(block.type)}”</div>;
  }
}

export type { FormatEnv };
