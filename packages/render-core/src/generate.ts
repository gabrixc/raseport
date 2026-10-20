import type { Block, Column, DatasetRows, ParamValues, ParsedReport, Part, Row as LayoutRow, TableBlock } from "@raseport/schema";
import { color, font, length, str } from "./typst.ts";
import { aggregate, formatAuto, formatValue, getPath, type FormatEnv, type Row } from "./values.ts";

const PAPER = { a4: "a4", a3: "a3", "us-letter": "us-letter" } as const;

interface Ctx {
  def: ParsedReport;
  data: DatasetRows;
  params: ParamValues;
  env: FormatEnv;
}

/**
 * Turn a report definition plus fetched data into one Typst source file.
 * Everything user- or data-derived enters as an escaped Typst string literal
 * or a validated length/color, never as raw markup or code.
 */
export function generateTypst(def: ParsedReport, data: DatasetRows, params: ParamValues): string {
  const ctx: Ctx = { def, data, params, env: { locale: def.locale, currency: def.currency } };
  const page = def.page;
  const header = def.pageHeader.length ? `header: ${rowsExpr(ctx, def.pageHeader)},` : "";
  const footer = def.pageFooter.length ? `footer: ${rowsExpr(ctx, def.pageFooter)},` : "";

  const out: string[] = [
    `#set page(paper: ${str(PAPER[page.size])}, flipped: ${page.orientation === "landscape"}, margin: ${length(page.margin)}, ${header} ${footer})`,
    `#set text(font: ${font(def.theme.font)}, size: ${length(def.theme.baseSize)}, lang: ${str(def.locale.split("-")[0] ?? "en")})`,
    `#set par(leading: 0.6em)`,
    `#set table(stroke: none, inset: (x: 5pt, y: 4pt))`,
  ];

  for (const band of def.body) {
    if (band.dataset) {
      const empty = (data[band.dataset]?.length ?? 0) === 0;
      if (band.type === "noData" ? !empty : empty) continue;
    } else if (band.type === "noData") continue;
    for (const row of band.rows) out.push(topLevelRow(ctx, row));
  }
  return out.join("\n") + "\n";
}

// ---- layout -----------------------------------------------------------------

function isPageBreakRow(row: LayoutRow): boolean {
  return row.cells.every((c) => c.blocks.length > 0 && c.blocks.every((b) => b.type === "pageBreak"));
}

function topLevelRow(ctx: Ctx, row: LayoutRow): string {
  if (isPageBreakRow(row)) return "#pagebreak()";
  return `#${rowExpr(ctx, row)}\n#v(8pt)`;
}

function rowsExpr(ctx: Ctx, rows: LayoutRow[]): string {
  return `stack(dir: ttb, spacing: 4pt, ${rows.map((r) => rowExpr(ctx, r)).join(", ")})`;
}

function rowExpr(ctx: Ctx, row: LayoutRow): string {
  const cols = row.cells.map((c) => `${c.span}fr`).join(", ");
  const cells = row.cells.map((c) => `stack(dir: ttb, spacing: 6pt, ${c.blocks.filter((b) => b.type !== "pageBreak").map((b) => blockExpr(ctx, b)).join(", ")})`);
  const trailing = row.cells.length === 1 ? "," : "";
  return `grid(columns: (${cols}${trailing}), column-gutter: 12pt, ${cells.join(", ")})`;
}

// ---- blocks -----------------------------------------------------------------

function blockExpr(ctx: Ctx, b: Block): string {
  switch (b.type) {
    case "text": {
      const style = {
        body: "",
        h1: `size: 1.8em, weight: "bold", fill: ${color(ctx.def.theme.accent)}`,
        h2: `size: 1.4em, weight: "bold"`,
        h3: `size: 1.15em, weight: "bold"`,
        muted: `fill: luma(110)`,
        small: `size: 0.85em`,
      }[b.style];
      const content = b.value.map((p) => `#(${partExpr(ctx, p, b.format)})`).join("");
      return `block(width: 100%, align(${b.align}, text(${style})[${content}]))`;
    }
    case "kpi": {
      const v = resolveAgg(ctx, b.value);
      const shown = b.format === "text" ? formatAuto(v, ctx.env) : formatValue(v, b.format, ctx.env);
      return (
        `block(width: 100%, inset: 10pt, radius: 4pt, fill: luma(245), stack(dir: ttb, spacing: 4pt, ` +
        `text(size: 0.8em, fill: luma(110), ${str(b.label)}), text(size: 1.8em, weight: "bold", fill: ${color(ctx.def.theme.accent)}, ${str(shown)})))`
      );
    }
    case "divider":
      return `line(length: 100%, stroke: 0.5pt + luma(180))`;
    case "spacer":
      return `block(height: ${length(b.height)})`;
    case "table":
      return tableExpr(ctx, b);
    case "pageBreak":
      return `[]`;
  }
}

function partExpr(ctx: Ctx, p: Part, format?: Parameters<typeof formatValue>[1]): string {
  if (typeof p === "string") return str(p);
  if ("$builtin" in p) {
    if (p.$builtin === "page") return `context counter(page).display()`;
    if (p.$builtin === "pages") return `context counter(page).final().first()`;
    return str(new Intl.DateTimeFormat(ctx.env.locale, { dateStyle: "medium" }).format(new Date()));
  }
  const value = "$param" in p ? ctx.params[p.$param] : resolveAgg(ctx, p);
  return str(format ? formatValue(value, format, ctx.env) : formatAuto(value, ctx.env));
}

function resolveAgg(ctx: Ctx, ref: { $agg: { fn: Parameters<typeof aggregate>[0]; dataset: string; field?: string | undefined } }): unknown {
  const { fn, dataset, field } = ref.$agg;
  return aggregate(fn, ctx.data[dataset] ?? [], field);
}

// ---- tables -----------------------------------------------------------------

const NUMERIC_FORMATS = new Set(["integer", "decimal", "currency", "percent"]);

function colAlign(c: Column): "left" | "right" | "center" {
  if (c.align) return c.align;
  const kind = typeof c.format === "object" ? c.format.kind : c.format;
  return NUMERIC_FORMATS.has(kind) ? "right" : "left";
}

function tableExpr(ctx: Ctx, t: TableBlock): string {
  const rows: Row[] = ctx.data[t.dataset] ?? [];
  const n = t.columns.length;
  const widths = t.columns.map((c) => (c.width ? `${c.width}fr` : "auto")).join(", ");
  const aligns = t.columns.map(colAlign).join(", ");
  const accent = color(ctx.def.theme.accent);

  const cell = (c: Column, row: Row) => str(formatValue(getPath(row, c.field), c.format, ctx.env));
  const aggRow = (subset: Row[], label: string | null, fill: string) =>
    t.columns.map((c, i) => {
      const body = c.aggregate
        ? str(formatValue(aggregate(c.aggregate, subset, c.field), c.format, ctx.env))
        : i === 0 && label !== null
          ? str(label)
          : "[]";
      return `table.cell(fill: ${fill})[#text(weight: "bold", ${body})]`;
    });

  const cells: string[] = [];
  const header = t.columns.map((c) => `table.cell(fill: ${accent})[#text(fill: white, weight: "bold", ${str(c.label)})]`);

  if (t.groupBy) {
    let start = 0;
    while (start < rows.length) {
      const key = getPath(rows[start]!, t.groupBy);
      let end = start;
      while (end < rows.length && getPath(rows[end]!, t.groupBy) === key) end++;
      cells.push(`table.cell(colspan: ${n}, fill: luma(225))[#text(weight: "bold", ${str(formatAuto(key, ctx.env))})]`);
      for (const row of rows.slice(start, end)) cells.push(...t.columns.map((c) => cell(c, row)));
      if (t.groupSubtotals) cells.push(...aggRow(rows.slice(start, end), "Subtotal", "luma(240)"));
      start = end;
    }
  } else {
    for (const row of rows) cells.push(...t.columns.map((c) => cell(c, row)));
  }
  if (t.grandTotal) cells.push(...aggRow(rows, "Total", "luma(225)"));

  const fill = t.zebra ? `fill: (x, y) => if y > 0 and calc.odd(y) { luma(248) }, ` : "";
  return (
    `table(columns: (${widths}${n === 1 ? "," : ""}), align: (${aligns}${n === 1 ? "," : ""}), ${fill}` +
    `table.header(${header.join(", ")}), ${cells.join(", ")})`
  );
}
