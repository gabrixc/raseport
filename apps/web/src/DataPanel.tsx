import { useState } from "react";
import type { DatasetInfo } from "./render.ts";

function pick(row: Record<string, unknown>, path: string): unknown {
  let cur: unknown = row;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

const show = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function DataPanel({ datasets, loading, error, onRefresh }: { datasets: DatasetInfo[] | null; loading: boolean; error: string | null; onRefresh: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(path);
      setTimeout(() => setCopied((c) => (c === path ? null : c)), 1200);
    } catch {
      /* clipboard can be blocked; the path is still visible */
    }
  }

  return (
    <div className="data-panel">
      <div className="data-bar">
        <span className="note">Click a field path to copy it for a column, chart axis or series.</span>
        <button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>
      {error && <div className="error-box"><strong>{error}</strong></div>}
      {!datasets && !error && <p className="empty">{loading ? "Loading data…" : "Set the required params to load data."}</p>}
      {datasets?.length === 0 && <p className="empty">This report has no datasets yet. Use Insert → Dataset.</p>}
      {datasets?.map((ds) => (
        <section key={ds.id} className="dataset">
          <h3>{ds.id} <span className="note">{ds.total.toLocaleString()} rows</span></h3>
          <div className="chips">
            {ds.columns.map((c) => (
              <button key={c.path} className={`chip type-${c.type}`} title={`${c.type} · e.g. ${show(c.example).slice(0, 60)}`} onClick={() => copy(c.path)}>
                {copied === c.path ? "copied" : c.path}
                <small>{c.type}</small>
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{ds.columns.map((c) => <th key={c.path}>{c.path}</th>)}</tr>
              </thead>
              <tbody>
                {ds.sample.map((row, i) => (
                  <tr key={i}>{ds.columns.map((c) => <td key={c.path} className={c.type === "number" ? "num" : ""}>{show(pick(row, c.path))}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {ds.total > ds.sample.length && <p className="note">Showing the first {ds.sample.length} of {ds.total.toLocaleString()} rows.</p>}
        </section>
      ))}
    </div>
  );
}
