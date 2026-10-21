import type { Format } from "@raseport/schema";
import { aggregate, formatAuto, formatValue, getPath, type AggFn, type FormatEnv, type Row } from "./values.ts";

export interface ChartSpec {
  kind: "bar" | "line";
  title?: string | undefined;
  x: string;
  series: { field: string; label?: string | undefined; color?: string | undefined }[];
  aggregate?: AggFn | undefined;
  format: Format;
  height: number;
}

/** Drawing width for a full-width (12-column) cell; narrower cells get proportionally smaller drawings so text keeps its size. */
export const FULL_WIDTH = 640;
const PALETTE = ["#0b5fff", "#e8590c", "#2f9e44", "#9c36b5", "#f08c00", "#0c8599"];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Round the axis maximum up to a "nice" number and return evenly spaced ticks from 0. */
export function niceTicks(max: number, count = 5): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) ?? 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

interface Point {
  label: string;
  values: (number | null)[];
}

function points(rows: Row[], spec: ChartSpec, env: FormatEnv): Point[] {
  const keyOf = (r: Row) => formatAuto(getPath(r, spec.x), env);
  const groups = new Map<string, Row[]>();
  if (spec.aggregate) {
    for (const r of rows) {
      const k = keyOf(r);
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    return [...groups].map(([label, rs]) => ({
      label,
      values: spec.series.map((s) => toNum(aggregate(spec.aggregate!, rs, s.field))),
    }));
  }
  return rows.map((r) => ({ label: keyOf(r), values: spec.series.map((s) => toNum(getPath(r, s.field))) }));
}

const toNum = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Render a bar or line chart as a self-contained SVG string. */
export function chartSvg(rows: Row[], spec: ChartSpec, env: FormatEnv, fontFamily = "Liberation Sans", span = 12): string {
  const W = Math.max(260, Math.round((FULL_WIDTH * span) / 12));
  const pts = points(rows, spec, env);
  const H = spec.height;
  // Only plain hex colors reach the SVG, whatever the caller passes: it is embedded in pages and PDFs.
  const color = (i: number) => {
    const c = spec.series[i]?.color;
    return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : PALETTE[i % PALETTE.length]!;
  };
  const legendH = spec.series.length > 1 ? 20 : 0;
  const titleH = spec.title ? 26 : 0;
  const m = { l: 64, r: 12, t: 10 + titleH + legendH, b: 34 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;

  const all = pts.flatMap((p) => p.values).filter((v): v is number => v !== null);
  const ticks = niceTicks(Math.max(0, ...all));
  const top = ticks.at(-1)!;
  const y = (v: number) => m.t + ph - (v / top) * ph;

  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${esc(fontFamily)}" font-size="11">`];
  if (spec.title) out.push(`<text x="${m.l}" y="20" font-size="14" font-weight="bold" fill="#222">${esc(spec.title)}</text>`);
  if (legendH) {
    let lx = m.l;
    spec.series.forEach((s, i) => {
      const label = s.label ?? s.field;
      out.push(`<rect x="${lx}" y="${titleH + 6}" width="10" height="10" fill="${color(i)}"/><text x="${lx + 14}" y="${titleH + 15}" fill="#444">${esc(label)}</text>`);
      lx += 28 + label.length * 6;
    });
  }
  for (const t of ticks) {
    out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="#ddd"/>`);
    out.push(`<text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end" fill="#555">${esc(formatValue(t, spec.format, env))}</text>`);
  }
  out.push(`<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t + ph}" stroke="#999"/>`);

  const n = pts.length;
  if (n === 0) {
    out.push(`<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#888">No data</text></svg>`);
    return out.join("");
  }
  const slot = pw / n;
  const maxLabels = Math.max(1, Math.floor(pw / 56));
  const every = Math.ceil(n / maxLabels);
  const cx = (i: number) => m.l + slot * (i + 0.5);

  pts.forEach((p, i) => {
    if (i % every === 0) {
      const label = p.label.length > 14 ? p.label.slice(0, 13) + "…" : p.label;
      out.push(`<text x="${cx(i)}" y="${m.t + ph + 16}" text-anchor="middle" fill="#555">${esc(label)}</text>`);
    }
  });

  if (spec.kind === "bar") {
    const k = spec.series.length;
    const group = slot * 0.7;
    const bw = group / k;
    pts.forEach((p, i) =>
      p.values.forEach((v, si) => {
        if (v === null) return;
        const bx = cx(i) - group / 2 + si * bw;
        const by = y(Math.max(v, 0));
        out.push(`<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${(bw - 1).toFixed(2)}" height="${Math.max(0, y(0) - by).toFixed(2)}" fill="${color(si)}"/>`);
      }),
    );
  } else {
    spec.series.forEach((_, si) => {
      const segs: string[] = [];
      let run: string[] = [];
      pts.forEach((p, i) => {
        const v = p.values[si];
        if (v === null || v === undefined) {
          if (run.length) segs.push(run.join(" "));
          run = [];
        } else run.push(`${cx(i).toFixed(2)},${y(v).toFixed(2)}`);
      });
      if (run.length) segs.push(run.join(" "));
      for (const s of segs) out.push(`<polyline points="${s}" fill="none" stroke="${color(si)}" stroke-width="2"/>`);
      if (n <= 60) pts.forEach((p, i) => {
        const v = p.values[si];
        if (v !== null && v !== undefined) out.push(`<circle cx="${cx(i).toFixed(2)}" cy="${y(v).toFixed(2)}" r="2.5" fill="${color(si)}"/>`);
      });
    });
  }
  out.push("</svg>");
  return out.join("");
}
