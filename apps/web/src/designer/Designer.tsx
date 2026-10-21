import { useCallback, useEffect, useMemo, useState } from "react";
import { ProblemList } from "../ProblemList.tsx";
import type { Problem } from "../problems.ts";
import type { DatasetInfo } from "../render.ts";
import { removeItem } from "../remove.ts";
import { Canvas } from "./Canvas.tsx";
import type { ColumnOption } from "./Fields.tsx";
import { Inspector } from "./Inspector.tsx";
import { arr, drawContext, type Json, type Selection } from "./model.ts";
import { duplicateBlock, duplicateRow, removeRow } from "./ops.ts";
import "./designer.css";

interface DesignerProps {
  text: string;
  onChange: (text: string) => void;
  data: DatasetInfo[] | null;
  dataLoading: boolean;
  params: Record<string, unknown>;
  problems: Problem[];
  onSwitchToJson: () => void;
  /** open a problem in the JSON editor */
  onShowProblem: (p: Problem) => void;
}

/** Does the thing the selection points at still exist? */
function exists(doc: Json, s: Selection): boolean {
  const rows = [...arr(doc.pageHeader), ...arr(doc.pageFooter), ...arr(doc.body).flatMap((b) => arr(b.rows))];
  switch (s.kind) {
    case "report":
      return true;
    case "band":
      return arr(doc.body).some((b) => b.id === s.id);
    case "row":
      return rows.some((r) => r.id === s.id);
    case "cell":
      return arr(rows.find((r) => r.id === s.rowId)?.cells)[s.index] !== undefined;
    case "block":
      return rows.some((r) => arr(r.cells).some((c) => arr(c.blocks).some((b) => b.id === s.id)));
  }
}

export function Designer({ text, onChange, data, dataLoading, params, problems, onSwitchToJson, onShowProblem }: DesignerProps) {
  const [selection, setSelection] = useState<Selection>({ kind: "report" });

  const parsed = useMemo((): { doc: Json } | { error: string } => {
    try {
      const json = JSON.parse(text);
      return json && typeof json === "object" && !Array.isArray(json) ? { doc: json as Json } : { error: "The document is not a JSON object." };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [text]);

  const doc = "doc" in parsed ? parsed.doc : null;
  const ctx = useMemo(() => (doc ? drawContext(doc, data, params) : null), [doc, data, params]);

  // Never keep a selection that points at something that was deleted or moved away.
  useEffect(() => {
    if (doc && !exists(doc, selection)) setSelection({ kind: "report" });
  }, [doc, selection]);

  // Edits go through the same text the JSON editor shows, so both views always agree.
  const commit = useCallback(
    (next: Json | null, select?: Selection) => {
      if (!next) return;
      onChange(JSON.stringify(next, null, 2));
      if (select) setSelection(select);
    },
    [onChange],
  );

  const datasetIds = useMemo(() => arr(doc?.datasets).map((d) => String(d.id)), [doc]);
  const paramNames = useMemo(() => arr(doc?.params).map((x) => String(x.name)), [doc]);

  /** Columns of a data source: the real ones once data is loaded, otherwise whatever the dataset declares. */
  const columnsFor = useCallback(
    (dataset?: string): ColumnOption[] => {
      if (!dataset) return [];
      const live = data?.find((d) => d.id === dataset)?.columns;
      if (live?.length) return live.map((c) => ({ path: c.path, type: c.type }));
      const declared = arr(doc?.datasets).find((d) => d.id === dataset)?.columns;
      return declared && typeof declared === "object" ? Object.entries(declared as Record<string, string>).map(([path, type]) => ({ path, type })) : [];
    },
    [data, doc],
  );

  // Delete, Ctrl+D and Esc, unless the user is typing in a field.
  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable=true], .monaco-editor") || t.isContentEditable)) return;
      if (e.key === "Escape") return setSelection({ kind: "report" });
      if ((e.key === "Delete" || e.key === "Backspace") && selection.kind === "block") {
        e.preventDefault();
        commit(removeItem(doc, { kind: "block", id: selection.id })?.doc ?? null, { kind: "report" });
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection.kind === "row") {
        e.preventDefault();
        commit(removeRow(doc, selection.id), { kind: "report" });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && (selection.kind === "block" || selection.kind === "row")) {
        e.preventDefault();
        const r = selection.kind === "block" ? duplicateBlock(doc, selection.id) : duplicateRow(doc, selection.id);
        if (r) commit(r.doc, { kind: selection.kind, id: r.newId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, selection, commit]);

  if (!doc || !ctx) {
    return (
      <div className="designer designer-error">
        <p><strong>The designer can't draw this yet.</strong></p>
        <p className="note">{"error" in parsed ? parsed.error : ""}</p>
        <button onClick={onSwitchToJson}>Fix it in JSON mode</button>
      </div>
    );
  }

  return (
    <div className="designer">
      <div className="designer-scroll">
        {dataLoading && !data && <p className="note">Loading data…</p>}
        <Canvas doc={doc} ctx={ctx} selection={selection} onSelect={setSelection} />
      </div>
      <Inspector doc={doc} selection={selection} datasetIds={datasetIds} paramNames={paramNames} columnsFor={columnsFor} onCommit={commit} />
      {problems.length > 0 && (
        <div className="problems">
          <p className="note warn">{problems.length} problem{problems.length > 1 ? "s" : ""} — click one to fix it in JSON mode</p>
          <ProblemList problems={problems} onJump={onShowProblem} />
        </div>
      )}
    </div>
  );
}
