import type { Format } from "@raseport/schema";

export type Row = Record<string, unknown>;

/** Dotted-path lookup, so jsonb columns can be addressed as "meta.address.city". */
export function getPath(row: Row, path: string): unknown {
  let cur: unknown = row;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export type AggFn = "sum" | "avg" | "count" | "min" | "max" | "first" | "last";

export function aggregate(fn: AggFn, rows: Row[], field?: string): unknown {
  const values = field ? rows.map((r) => getPath(r, field)) : rows;
  const present = values.filter((v) => v !== null && v !== undefined);
  if (fn === "count") return present.length;
  if (fn === "first") return present[0] ?? null;
  if (fn === "last") return present.at(-1) ?? null;
  const nums = present.map(Number).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return null;
  if (fn === "sum") return nums.reduce((a, b) => a + b, 0);
  if (fn === "avg") return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (fn === "min") return Math.min(...nums);
  return Math.max(...nums);
}

export interface FormatEnv {
  locale: string;
  currency: string;
}

function isNumeric(v: unknown): v is number | string {
  return (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)));
}

export function formatValue(v: unknown, format: Format | undefined, env: FormatEnv): string {
  if (v === null || v === undefined) return "";
  const kind = typeof format === "object" ? format.kind : (format ?? "text");
  const digits = typeof format === "object" ? format.digits : undefined;
  const num = (opts: Intl.NumberFormatOptions) =>
    isNumeric(v) ? new Intl.NumberFormat(env.locale, opts).format(Number(v)) : String(v);

  switch (kind) {
    case "integer":
      return num({ maximumFractionDigits: 0 });
    case "decimal":
      return num({ minimumFractionDigits: digits ?? 2, maximumFractionDigits: digits ?? 2 });
    case "currency":
      return num({ style: "currency", currency: env.currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    case "percent":
      return num({ style: "percent", minimumFractionDigits: digits ?? 0, maximumFractionDigits: digits ?? 0 });
    case "boolean":
      return v === true || v === "true" ? "Yes" : v === false || v === "false" ? "No" : String(v);
    case "date":
    case "datetime": {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return String(v);
      return new Intl.DateTimeFormat(env.locale, {
        dateStyle: "medium",
        ...(kind === "datetime" ? { timeStyle: "short" } : {}),
        timeZone: "UTC",
      } as Intl.DateTimeFormatOptions).format(d);
    }
    default:
      return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}

/** Default display for values that have no explicit format. */
export function formatAuto(v: unknown, env: FormatEnv): string {
  return typeof v === "number" ? formatValue(v, Number.isInteger(v) ? "integer" : "decimal", env) : formatValue(v, "text", env);
}
