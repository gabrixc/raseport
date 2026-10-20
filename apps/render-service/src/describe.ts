export type ColumnType = "text" | "number" | "date" | "bool" | "json" | "mixed" | "null";

export interface ColumnInfo {
  /** dotted path usable as a table column `field` or chart `x` / series `field` */
  path: string;
  type: ColumnType;
  example: unknown;
}

const ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}.*)?$/;
const MAX_DEPTH = 4;
const SCAN_ROWS = 200;

function typeOf(v: unknown): ColumnType {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "string") return ISO.test(v) ? "date" : "text";
  return "json";
}

/** Infer addressable columns (nested jsonb objects flattened to dotted paths) from sample rows. */
export function describeRows(rows: Record<string, unknown>[]): ColumnInfo[] {
  const cols = new Map<string, ColumnInfo>();

  const visit = (value: unknown, path: string, depth: number) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value) && depth < MAX_DEPTH) {
      for (const [k, v] of Object.entries(value)) visit(v, path ? `${path}.${k}` : k, depth + 1);
      return;
    }
    const t = typeOf(value);
    const prev = cols.get(path);
    if (!prev) cols.set(path, { path, type: t, example: value ?? null });
    else if (prev.type === "null") {
      prev.type = t;
      prev.example = value ?? null;
    } else if (t !== "null" && t !== prev.type) prev.type = "mixed";
  };

  for (const row of rows.slice(0, SCAN_ROWS)) visit(row, "", 0);
  return [...cols.values()];
}
