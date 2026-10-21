import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProblemList } from "../ProblemList.tsx";
import type { Problem } from "../problems.ts";
import type { DatasetInfo } from "../render.ts";
import { insertItem, makeBlock, type BlockKind } from "../insert.ts";
import { removeItem } from "../remove.ts";
import { Canvas } from "./Canvas.tsx";
import type { ColumnOption } from "./Fields.tsx";
import { collisionDetection, type DragData, type ZoneData } from "./dnd.tsx";
import { Inspector } from "./Inspector.tsx";
import { arr, drawContext, type Json, type Selection } from "./model.ts";
import { duplicateBlock, duplicateRow, insertBlock, moveBlock, moveRow, removeRow, resizeBoundary } from "./ops.ts";
import { Palette, PALETTE } from "./Palette.tsx";
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
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const resizeBase = useRef<Json | null>(null);
  // A small distance threshold keeps plain clicks (select) separate from drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  /** Add a block at the end of the last body section (click on a palette chip). */
  const appendBlock = (kind: BlockKind) => {
    if (!doc) return;
    const next = insertItem(doc, kind);
    const last = arr(next.body).filter((b) => b.type === "body").at(-1);
    const row = arr(last?.rows).at(-1);
    commit(next, { kind: "block", id: String(arr(arr(row?.cells)[0]?.blocks)[0]?.id) });
  };
  const addSection = () => {
    if (!doc) return;
    const next = insertItem(doc, "band");
    commit(next, { kind: "band", id: String(arr(next.body).at(-1)?.id) });
  };

  const labelOf = (d: DragData) => (d.kind === "new" ? (PALETTE.find((x) => x.type === d.type)?.label ?? d.type) : d.kind === "block" ? `Moving ${d.id}` : `Moving row ${d.id}`);
  const onDragStart = (e: DragStartEvent) => setDragLabel(labelOf(e.active.data.current as DragData));
  const onDragEnd = (e: DragEndEvent) => {
    setDragLabel(null);
    const drag = e.active.data.current as DragData | undefined;
    const zone = e.over?.data.current as ZoneData | undefined;
    if (!doc || !drag || !zone) return;
    if (drag.kind === "new") {
      const block = makeBlock(doc, drag.type);
      commit(insertBlock(doc, block, zone.dest), { kind: "block", id: String(block.id) });
    } else if (drag.kind === "block") {
      commit(moveBlock(doc, drag.id, zone.dest), { kind: "block", id: drag.id });
    } else if (drag.kind === "row" && zone.dest.kind === "row") {
      commit(moveRow(doc, drag.id, zone.dest.at, zone.dest.index), { kind: "row", id: drag.id });
    }
  };

  // Column resizing recomputes from the document as it was when the drag began, so it is always consistent.
  const onResizeStart = () => {
    resizeBase.current = doc;
  };
  const onResize = (rowId: string, cellIndex: number, delta: number) => {
    if (resizeBase.current) commit(resizeBoundary(resizeBase.current, rowId, cellIndex, delta));
  };

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
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragLabel(null)}>
    <div className="designer" data-dragging={dragLabel !== null}>
      <Palette onAdd={appendBlock} onAddSection={addSection} />
      <div className="designer-scroll">
        {dataLoading && !data && <p className="note">Loading data…</p>}
        <Canvas doc={doc} ctx={ctx} selection={selection} onSelect={setSelection} onResizeStart={onResizeStart} onResize={onResize} />
      </div>
      <Inspector doc={doc} selection={selection} datasetIds={datasetIds} paramNames={paramNames} columnsFor={columnsFor} onCommit={commit} />
      {problems.length > 0 && (
        <div className="problems">
          <p className="note warn">{problems.length} problem{problems.length > 1 ? "s" : ""} — click one to fix it in JSON mode</p>
          <ProblemList problems={problems} onJump={onShowProblem} />
        </div>
      )}
    </div>
    <DragOverlay dropAnimation={null}>{dragLabel && <div className="d-ghost">{dragLabel}</div>}</DragOverlay>
    </DndContext>
  );
}
