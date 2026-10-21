// Data sources and params for the designer: parsing the catalogue of report_* functions and the pure
// edits that wire a source to params, so nobody has to type an RPC name or an argument mapping.

import { uniqueId } from "../insert.ts";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ParamType = "text" | "number" | "date" | "bool";

export interface SourceArg {
  name: string;
  pgType: string;
  paramType: ParamType;
}

export interface SourceInfo {
  /** the Postgres function name, e.g. report_sales_by_region */
  name: string;
  /** what the author sees */
  label: string;
  args: SourceArg[];
  /** false when an argument has no name (PostgREST needs names) */
  usable: boolean;
}

export interface CatalogRow {
  name: string;
  arguments: string | null;
  description: string | null;
}

const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

/** Split on commas that are not inside parentheses, so numeric(10,2) stays whole. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function paramTypeOf(pgType: string): ParamType {
  const t = pgType.toLowerCase();
  if (/^(date|timestamp)/.test(t)) return "date";
  if (/^(smallint|integer|int\d?|bigint|numeric|decimal|real|double precision|float\d?)/.test(t)) return "number";
  if (t === "boolean" || t === "bool") return "bool";
  return "text";
}

/** Parse the output of pg_get_function_identity_arguments, e.g. "p_month date, p_region text". */
export function parseArguments(text: string | null | undefined): { args: SourceArg[]; usable: boolean } {
  if (!text || !text.trim()) return { args: [], usable: true };
  let usable = true;
  const args: SourceArg[] = [];
  for (const piece of splitTopLevel(text)) {
    const m = /^(?:(?:IN|INOUT|VARIADIC)\s+)?([a-z_][a-z0-9_]*)\s+(.+)$/i.exec(piece);
    // A lone word is a type with no argument name; so is "double precision" (a name would be followed by a type).
    if (!m || /^(double precision|character varying|timestamp with.*)$/i.test(piece)) {
      usable = false;
      continue;
    }
    args.push({ name: m[1]!, pgType: m[2]!, paramType: paramTypeOf(m[2]!) });
  }
  return { args, usable };
}

const prettify = (name: string) => {
  const spaced = name.replace(/^report_/, "").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export function toSourceInfo(row: CatalogRow): SourceInfo {
  const { args, usable } = parseArguments(row.arguments);
  return { name: row.name, label: row.description?.trim() || prettify(row.name), args, usable };
}

// ---- edits ------------------------------------------------------------------------------------------

const IDENT = /[^a-z0-9_]/g;
/** Lowercase letters, digits and underscores, starting with a letter. */
export function toIdent(raw: string): string {
  const s = raw.toLowerCase().replace(IDENT, "_").replace(/^[^a-z]+/, "");
  return s;
}

const paramNameFor = (argName: string) => toIdent(argName.replace(/^p_/, "")) || "value";

/** Find or create the param an argument should be filled from; returns its name. */
function ensureParam(doc: Json, arg: SourceArg): string {
  const wanted = paramNameFor(arg.name);
  const params = (doc.params ??= []) as Json[];
  const same = params.find((p) => p.name === wanted);
  if (same && (same.type ?? "text") === arg.paramType) return wanted;
  let name = wanted;
  for (let n = 2; params.some((p) => p.name === name); n++) name = `${wanted}_${n}`;
  params.push({ name, type: arg.paramType, required: true });
  return name;
}

function wireArgs(doc: Json, dataset: Json, source: SourceInfo): void {
  const previous = (dataset.args ?? {}) as Json;
  const args: Json = {};
  for (const arg of source.args) args[arg.name] = arg.name in previous ? previous[arg.name] : { $param: ensureParam(doc, arg) };
  dataset.args = args;
}

/** Add a data source from the catalogue, creating and mapping the params it needs. */
export function addDataSource(input: Json, source: SourceInfo): { doc: Json; id: string } {
  const doc: Json = structuredClone(input);
  const base = toIdent(source.name.replace(/^report_/, "")) || "data";
  let id = base;
  const taken = (i: string) => arr(doc.datasets).some((d) => d.id === i);
  for (let n = 2; taken(id); n++) id = `${base}_${n}`;
  const dataset: Json = { id, source: { kind: "rpc", name: source.name }, args: {} };
  wireArgs(doc, dataset, source);
  (doc.datasets ??= []).push(dataset);
  return { doc, id };
}

/** Point a dataset at another source; arguments with the same name keep their mapping. */
export function changeSource(input: Json, datasetId: string, source: SourceInfo): Json | null {
  const doc: Json = structuredClone(input);
  const dataset = arr(doc.datasets).find((d) => d.id === datasetId);
  if (!dataset) return null;
  dataset.source = { kind: "rpc", name: source.name };
  wireArgs(doc, dataset, source);
  return doc;
}

/** Fill one argument from a param, or with a fixed value. */
export function mapArgument(input: Json, datasetId: string, argName: string, value: { param: string } | { fixed: string | number | boolean | null }): Json | null {
  const doc: Json = structuredClone(input);
  const dataset = arr(doc.datasets).find((d) => d.id === datasetId);
  if (!dataset) return null;
  (dataset.args ??= {})[argName] = "param" in value ? { $param: value.param } : value.fixed;
  return doc;
}

/** Visit every object in the document. */
function walk(node: unknown, visit: (o: Json) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!node || typeof node !== "object") return;
  visit(node as Json);
  Object.values(node as Json).forEach((v) => walk(v, visit));
}

/** Rename a dataset everywhere it is referenced. Returns null if the new name is taken or invalid. */
export function renameDataset(input: Json, from: string, to: string): Json | null {
  if (from === to) return structuredClone(input);
  if (!/^[a-z][a-z0-9_]*$/.test(to) || arr(input.datasets).some((d) => d.id === to)) return null;
  const doc: Json = structuredClone(input);
  if (!arr(doc.datasets).some((d) => d.id === from)) return null;
  for (const d of arr(doc.datasets)) if (d.id === from) d.id = to;
  walk(doc, (o) => {
    if (o.dataset === from) o.dataset = to;
    if (o.$agg?.dataset === from) o.$agg.dataset = to;
  });
  return doc;
}

/** Rename a param everywhere it is used. Returns null if the new name is taken or invalid. */
export function renameParam(input: Json, from: string, to: string): Json | null {
  if (from === to) return structuredClone(input);
  if (!/^[a-z][a-z0-9_]*$/.test(to) || arr(input.params).some((p) => p.name === to)) return null;
  const doc: Json = structuredClone(input);
  const param = arr(doc.params).find((p) => p.name === from);
  if (!param) return null;
  param.name = to;
  walk(doc, (o) => {
    if (o.$param === from) o.$param = to;
  });
  return doc;
}

export function addParam(input: Json): { doc: Json; name: string } {
  const doc: Json = structuredClone(input);
  const params = (doc.params ??= []) as Json[];
  let n = params.length + 1;
  while (params.some((p) => p.name === `param_${n}`)) n++;
  const name = `param_${n}`;
  params.push({ name, type: "text" });
  return { doc, name };
}

export function updateParam(input: Json, name: string, patch: Json): Json | null {
  const doc: Json = structuredClone(input);
  const param = arr(doc.params).find((p) => p.name === name);
  if (!param) return null;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete param[k];
    else param[k] = v;
  }
  return doc;
}

export { uniqueId };
