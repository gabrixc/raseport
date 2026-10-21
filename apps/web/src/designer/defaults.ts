import type { ColumnOption } from "./Fields.tsx";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** "customer.name" -> "Customer name", "ordered_on" -> "Ordered on" */
export const prettify = (path: string) => {
  const spaced = path.split(".").join(" ").replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** The category column for a chart: the one with the fewest different values, so bars stay readable. */
function pickCategory(candidates: ColumnOption[]): ColumnOption | undefined {
  const known = candidates.filter((c) => c.distinct !== undefined && c.distinct > 1);
  if (known.length) return known.reduce((best, c) => (c.distinct! < best.distinct! ? c : best));
  return candidates[0];
}

/** Show real, readable data: skip columns that look like internal ids unless nothing else is left. */
const shown = (cols: ColumnOption[]) => {
  const nice = cols.filter((c) => !/(^|\.)(id|uuid)$/i.test(c.path) && c.type !== "json" && c.type !== "null");
  return nice.length ? nice : cols;
};

/**
 * A freshly dropped table, chart or KPI starts out pointing at the first data source with placeholder column
 * names. When the real columns are known, use them so the block shows data straight away.
 */
export function withColumnDefaults(block: Json, columns: ColumnOption[]): Json {
  if (columns.length === 0) return block;
  const out = structuredClone(block);
  const usable = shown(columns);
  const numbers = usable.filter((c) => c.type === "number");
  const labels = usable.filter((c) => c.type === "text" || c.type === "date");

  if (out.type === "table") {
    out.columns = usable.slice(0, 5).map((c) => ({
      field: c.path,
      label: prettify(c.path),
      ...(c.type === "number" ? { format: "decimal" } : c.type === "date" ? { format: "date" } : {}),
    }));
  } else if (out.type === "chart") {
    out.x = (pickCategory(labels) ?? usable[0])?.path ?? out.x;
    const value = numbers[0] ?? usable.find((c) => c.path !== out.x);
    out.series = value ? [{ field: value.path, label: prettify(value.path) }] : [];
    out.aggregate = "sum";
    out.format = "integer";
  } else if (out.type === "kpi") {
    const value = numbers[0];
    if (value) {
      out.label = `Total ${prettify(value.path).toLowerCase()}`;
      out.value = { $agg: { ...out.value?.$agg, fn: "sum", field: value.path } };
      out.format = "decimal";
    }
  }
  return out;
}
