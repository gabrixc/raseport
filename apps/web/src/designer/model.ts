import type { FormatEnv } from "@raseport/render-core";
import type { DatasetInfo } from "../render.ts";

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** What is currently selected on the canvas. */
export type Selection =
  | { kind: "report" }
  | { kind: "band"; id: string }
  | { kind: "row"; id: string }
  | { kind: "cell"; rowId: string; index: number }
  | { kind: "block"; id: string };

export const sameSelection = (a: Selection, b: Selection): boolean => JSON.stringify(a) === JSON.stringify(b);

export const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

/** Everything a block needs to draw itself from real data. */
export interface DrawContext {
  rows: (dataset: string | undefined) => Record<string, unknown>[];
  columns: (dataset: string | undefined) => DatasetInfo["columns"];
  params: Record<string, unknown>;
  env: FormatEnv;
  accent: string;
  font: string;
  total: (dataset: string | undefined) => number;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function drawContext(doc: Json, data: DatasetInfo[] | null, params: Record<string, unknown>): DrawContext {
  const byId = new Map((data ?? []).map((d) => [d.id, d]));
  const accent = typeof doc.theme?.accent === "string" && HEX.test(doc.theme.accent) ? doc.theme.accent : "#0b5fff";
  return {
    rows: (id) => (id ? (byId.get(id)?.rows ?? []) : []),
    columns: (id) => (id ? (byId.get(id)?.columns ?? []) : []),
    total: (id) => (id ? (byId.get(id)?.total ?? 0) : 0),
    params,
    env: { locale: typeof doc.locale === "string" ? doc.locale : "en-US", currency: typeof doc.currency === "string" && doc.currency.length === 3 ? doc.currency : "USD" },
    accent,
    font: typeof doc.theme?.font === "string" ? doc.theme.font : "Liberation Sans",
  };
}
