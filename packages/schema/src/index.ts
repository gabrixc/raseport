import { z } from "zod";

// ---- Bindings -------------------------------------------------------------
// Bindings are structured, never strings parsed at render time.

export const ParamRef = z.object({ $param: z.string() }).strict();
export const AggFn = z.enum(["sum", "avg", "count", "min", "max", "first", "last"]);
export const AggRef = z
  .object({
    $agg: z.object({
      fn: AggFn,
      dataset: z.string(),
      // dotted path into a row (jsonb friendly); optional for count
      field: z.string().optional(),
    }),
  })
  .strict();

/** Render-time builtins, mainly for page headers and footers. */
export const BuiltinRef = z.object({ $builtin: z.enum(["page", "pages", "today"]) }).strict();

export const Part = z.union([z.string(), ParamRef, AggRef, BuiltinRef]);
export type Part = z.infer<typeof Part>;
/** A text value: a literal string, or a list of literals and bindings. */
export const Parts = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(Part));

export const Format = z.union([
  z.enum(["text", "integer", "decimal", "currency", "percent", "date", "datetime", "boolean"]),
  z.object({ kind: z.enum(["decimal", "currency", "percent"]), digits: z.number().int().min(0).max(8) }),
]);
export type Format = z.infer<typeof Format>;

// ---- Blocks ---------------------------------------------------------------

const TextBlock = z.object({
  type: z.literal("text"),
  id: z.string(),
  value: Parts,
  style: z.enum(["body", "h1", "h2", "h3", "muted", "small"]).default("body"),
  align: z.enum(["left", "center", "right"]).default("left"),
  format: Format.optional(),
});

const Column = z.object({
  /** dotted path into a row, e.g. "meta.address.city" */
  field: z.string(),
  label: z.string(),
  format: Format.default("text"),
  align: z.enum(["left", "center", "right"]).optional(),
  /** relative width; omitted = auto */
  width: z.number().positive().optional(),
  /** shown in group subtotal rows and the grand total row */
  aggregate: AggFn.optional(),
});

const TableBlock = z.object({
  type: z.literal("table"),
  id: z.string(),
  dataset: z.string(),
  columns: z.array(Column).min(1),
  /** Rows must already be sorted by this field (do it in the RPC). */
  groupBy: z.string().optional(),
  groupSubtotals: z.boolean().default(false),
  grandTotal: z.boolean().default(false),
  zebra: z.boolean().default(true),
});

const KpiBlock = z.object({
  type: z.literal("kpi"),
  id: z.string(),
  label: z.string(),
  value: AggRef,
  format: Format.default("text"),
});

const ChartSeries = z.object({
  field: z.string(),
  label: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const ChartBlock = z.object({
  type: z.literal("chart"),
  id: z.string(),
  kind: z.enum(["bar", "line"]),
  dataset: z.string(),
  title: z.string().optional(),
  /** category axis field (dotted path allowed) */
  x: z.string(),
  series: z.array(ChartSeries).min(1).max(6),
  /** when set, rows are grouped by x and each series is aggregated with this function */
  aggregate: AggFn.optional(),
  /** value-axis number format */
  format: Format.default("decimal"),
  /** chart height in SVG units; width is fixed at 640 and scales to the cell */
  height: z.number().int().min(120).max(600).default(260),
});

const DividerBlock = z.object({ type: z.literal("divider"), id: z.string() });
const SpacerBlock = z.object({ type: z.literal("spacer"), id: z.string(), height: z.string().default("12pt") });
const PageBreakBlock = z.object({ type: z.literal("pageBreak"), id: z.string() });

export const Block = z.discriminatedUnion("type", [
  TextBlock,
  TableBlock,
  KpiBlock,
  ChartBlock,
  DividerBlock,
  SpacerBlock,
  PageBreakBlock,
]);
export type Block = z.infer<typeof Block>;
export type TableBlock = z.infer<typeof TableBlock>;
export type Column = z.infer<typeof Column>;

// ---- Layout: bands -> 12-column rows -> cells -> blocks -----------------------

export const Cell = z.object({
  span: z.number().int().min(1).max(12).default(12),
  blocks: z.array(Block),
});
export const Row = z.object({ id: z.string(), cells: z.array(Cell).min(1) });
export const Band = z.object({
  id: z.string(),
  type: z.enum(["title", "body", "summary", "noData"]),
  /** noData band is shown instead of the body when this dataset is empty */
  dataset: z.string().optional(),
  rows: z.array(Row),
});
export type Band = z.infer<typeof Band>;
export type Row = z.infer<typeof Row>;
export type Cell = z.infer<typeof Cell>;

// ---- Data -----------------------------------------------------------------

export const ColumnType = z.enum(["text", "number", "date", "bool", "json"]);

/** The render service only calls functions named report_*, so the editor can flag anything else immediately. */
export const RPC_NAME = /^report_[a-z0-9_]+$/;
const RpcName = z.string().regex(RPC_NAME, "RPC name must be report_ followed by lowercase letters, digits or underscores");

export const Dataset = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  source: z.object({ kind: z.literal("rpc"), name: RpcName }),
  /** values are literals or {$param} */
  args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), ParamRef])).default({}),
  /** optional declared types, used by editors and for validation */
  columns: z.record(z.string(), ColumnType).optional(),
});
export type Dataset = z.infer<typeof Dataset>;

export const Param = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(["text", "number", "date", "bool"]),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

// ---- Definition -----------------------------------------------------------

export const ReportDefinition = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
  locale: z.string().default("en-US"),
  currency: z.string().length(3).default("USD"),
  page: z
    .object({
      size: z.enum(["a4", "a3", "us-letter"]).default("a4"),
      orientation: z.enum(["portrait", "landscape"]).default("portrait"),
      margin: z.string().default("2cm"),
    })
    .default({ size: "a4", orientation: "portrait", margin: "2cm" }),
  theme: z
    .object({
      font: z.string().default("Liberation Sans"),
      baseSize: z.string().default("10pt"),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0b5fff"),
    })
    .default({ font: "Liberation Sans", baseSize: "10pt", accent: "#0b5fff" }),
  params: z.array(Param).default([]),
  datasets: z.array(Dataset).default([]),
  pageHeader: z.array(Row).default([]),
  pageFooter: z.array(Row).default([]),
  body: z.array(Band),
});
export type ReportDefinition = z.input<typeof ReportDefinition>;
export type ParsedReport = z.output<typeof ReportDefinition>;

export type ParamValues = Record<string, string | number | boolean | null>;
export type DatasetRows = Record<string, Record<string, unknown>[]>;

export function parseDefinition(input: unknown): ParsedReport {
  const def = ReportDefinition.parse(input);
  assertReferences(def);
  return def;
}

export interface DefinitionIssue {
  message: string;
  /** `id` of the node the problem is about, so editors can jump to it */
  nodeId?: string;
}

export class DefinitionError extends Error {
  readonly issues: DefinitionIssue[];
  constructor(issues: DefinitionIssue[]) {
    super(`Invalid report definition:\n- ${issues.map((i) => i.message).join("\n- ")}`);
    this.name = "DefinitionError";
    this.issues = issues;
  }
}

/** Cross-reference checks that Zod shapes cannot express. */
export function assertReferences(def: ParsedReport): void {
  const ds = new Set(def.datasets.map((d) => d.id));
  const params = new Set(def.params.map((p) => p.name));
  const issues: DefinitionIssue[] = [];
  const seen = new Set<string>();
  for (const d of def.datasets) {
    if (seen.has(d.id)) issues.push({ message: `duplicate dataset id "${d.id}"`, nodeId: d.id });
    seen.add(d.id);
  }

  const checkPart = (where: string, nodeId: string, p: Part) => {
    if (typeof p === "string") return;
    if ("$param" in p && !params.has(p.$param)) issues.push({ message: `${where}: unknown param "${p.$param}"`, nodeId });
    if ("$agg" in p && !ds.has(p.$agg.dataset)) issues.push({ message: `${where}: unknown dataset "${p.$agg.dataset}"`, nodeId });
  };
  for (const d of def.datasets)
    for (const [k, v] of Object.entries(d.args))
      if (v && typeof v === "object") checkPart(`dataset ${d.id} arg ${k}`, d.id, v);

  const rows = [...def.pageHeader, ...def.pageFooter, ...def.body.flatMap((b) => b.rows)];
  for (const band of def.body) {
    if (band.dataset && !ds.has(band.dataset)) issues.push({ message: `band ${band.id}: unknown dataset "${band.dataset}"`, nodeId: band.id });
  }
  for (const row of rows)
    for (const cell of row.cells)
      for (const b of cell.blocks) {
        if (b.type === "text") b.value.forEach((p) => checkPart(`block ${b.id}`, b.id, p));
        if (b.type === "kpi") checkPart(`block ${b.id}`, b.id, b.value);
        if (b.type === "chart" && !ds.has(b.dataset)) issues.push({ message: `block ${b.id}: unknown dataset "${b.dataset}"`, nodeId: b.id });
        if (b.type === "table") {
          if (!ds.has(b.dataset)) issues.push({ message: `block ${b.id}: unknown dataset "${b.dataset}"`, nodeId: b.id });
          if (b.groupSubtotals && !b.groupBy) issues.push({ message: `block ${b.id}: groupSubtotals needs groupBy`, nodeId: b.id });
        }
      }
  if (issues.length) throw new DefinitionError(issues);
}

/** JSON Schema (draft-07, which Monaco supports best) for editors. Describes what authors write, so defaults are optional. */
export function reportJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ReportDefinition, { io: "input", unrepresentable: "any", target: "draft-7" }) as Record<string, unknown>;
}
export { ZodError } from "zod";
