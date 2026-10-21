import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { BlockView } from "./BlockView.tsx";
import { gapId, useDragSource, Zone } from "./dnd.tsx";
import { arr, sameSelection, type DrawContext, type Json, type Selection } from "./model.ts";
import type { Section as SectionRef } from "./ops.ts";

interface CanvasProps {
  doc: Json;
  ctx: DrawContext;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** a column boundary drag starts / moves (delta is in 12-grid columns since the drag began) */
  onResizeStart: () => void;
  onResize: (rowId: string, cellIndex: number, delta: number) => void;
}

type Shared = Pick<CanvasProps, "selection" | "onSelect" | "onResizeStart" | "onResize"> & { ctx: DrawContext };

const BAND_LABEL: Record<string, string> = { title: "Title", body: "Body", summary: "Summary", noData: "Shown when there is no data" };
const clampSpan = (n: unknown) => Math.max(1, Math.min(12, Math.round(Number(n) || 12)));

/** Stop a click from also selecting whatever is behind it. */
const pick = (onSelect: (s: Selection) => void, s: Selection) => (e: MouseEvent) => {
  e.stopPropagation();
  onSelect(s);
};

/** Drag the boundary between two columns; the width change snaps to the 12-column grid. */
function ResizeHandle({ rowId, index, onResizeStart, onResize }: { rowId: string; index: number } & Pick<CanvasProps, "onResizeStart" | "onResize">) {
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const colWidth = (el.closest(".d-cells") as HTMLElement).clientWidth / 12;
    const startX = e.clientX;
    el.setPointerCapture(e.pointerId);
    onResizeStart();
    const move = (ev: PointerEvent) => onResize(rowId, index, Math.round((ev.clientX - startX) / colWidth));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  return <div className="d-resize" role="separator" aria-label="Resize columns" aria-orientation="vertical" onPointerDown={down} onClick={(e) => e.stopPropagation()} />;
}

function BlockShell({ block, rowId, cellIndex, blockIndex, span, shared }: { block: Json; rowId: string; cellIndex: number; blockIndex: number; span: number; shared: Shared }) {
  const id = String(block.id);
  const sel: Selection = { kind: "block", id };
  const { attributes, listeners, setNodeRef, isDragging } = useDragSource(`block:${id}`, { kind: "block", id });
  return (
    <div ref={setNodeRef} className="d-block" data-selected={sameSelection(shared.selection, sel)} data-dragging={isDragging} data-block-id={id} data-type={block.type} onClick={pick(shared.onSelect, sel)}>
      <span className="d-tag" {...listeners} {...attributes} title="Drag to move">
        ⠿ {String(block.type)}
      </span>
      <BlockView block={block} ctx={shared.ctx} span={span} />
      <Zone id={`half:${id}:top`} dest={{ kind: "cell", rowId, cellIndex, index: blockIndex }} className="d-zone-top" priority="half" />
      <Zone id={`half:${id}:bottom`} dest={{ kind: "cell", rowId, cellIndex, index: blockIndex + 1 }} className="d-zone-bottom" priority="half" />
    </div>
  );
}

function RowShell({ row, rowIndex, rowCount, section, sectionKey, shared }: { row: Json; rowIndex: number; rowCount: number; section: SectionRef; sectionKey: string; shared: Shared }) {
  const rowId = String(row.id);
  const cells = arr(row.cells);
  const rowSel: Selection = { kind: "row", id: rowId };
  const { attributes, listeners, setNodeRef, isDragging } = useDragSource(`row:${rowId}`, { kind: "row", id: rowId });
  return (
    <div ref={setNodeRef} className="d-row" data-selected={sameSelection(shared.selection, rowSel)} data-dragging={isDragging} data-row-id={rowId}>
      <button type="button" className="d-row-tab" {...listeners} {...attributes} onClick={pick(shared.onSelect, rowSel)} title="Click to select this row, drag to move it" aria-label={`Row ${rowId}`}>
        ⋮⋮
      </button>
      <div className="d-cells">
        {cells.map((cell, cellIndex) => {
          const cellSel: Selection = { kind: "cell", rowId, index: cellIndex };
          const span = clampSpan(cell.span);
          return (
            <div key={cellIndex} className="d-cell" style={{ gridColumn: `span ${span}` }} data-selected={sameSelection(shared.selection, cellSel)} data-cell={`${rowId}:${cellIndex}`} onClick={pick(shared.onSelect, cellSel)}>
              {arr(cell.blocks).map((block, blockIndex) => (
                <BlockShell key={String(block.id)} block={block} rowId={rowId} cellIndex={cellIndex} blockIndex={blockIndex} span={span} shared={shared} />
              ))}
              <Zone id={`edge:${rowId}:${cellIndex}:before`} dest={{ kind: "split", rowId, cellIndex, side: "before" }} accepts={["new", "block"]} className="d-zone-left" priority="edge" />
              <Zone id={`edge:${rowId}:${cellIndex}:after`} dest={{ kind: "split", rowId, cellIndex, side: "after" }} accepts={["new", "block"]} className="d-zone-right" priority="edge" />
              {cellIndex < cells.length - 1 && <ResizeHandle rowId={rowId} index={cellIndex} onResizeStart={shared.onResizeStart} onResize={shared.onResize} />}
            </div>
          );
        })}
      </div>
      <Zone id={gapId(sectionKey, rowIndex)} dest={{ kind: "row", at: section, index: rowIndex }} className="d-zone-gap-top" priority="gap" gap />
      {rowIndex === rowCount - 1 && <Zone id={gapId(sectionKey, rowCount)} dest={{ kind: "row", at: section, index: rowCount }} className="d-zone-gap-bottom" priority="gap" gap />}
    </div>
  );
}

function SectionView({ label, sectionKey, section, rows, shared, bandSel, hint }: { label: string; sectionKey: string; section: SectionRef; rows: Json[]; shared: Shared; bandSel?: Selection; hint?: string }) {
  const { selection, onSelect } = shared;
  return (
    <section className="d-section" data-section={sectionKey} data-selected={bandSel ? sameSelection(selection, bandSel) : false}>
      <header className="d-section-head">
        {bandSel ? (
          <button type="button" className="d-section-label" onClick={pick(onSelect, bandSel)}>{label}</button>
        ) : (
          <span className="d-section-label">{label}</span>
        )}
        {hint && <span className="d-section-hint">{hint}</span>}
      </header>
      {rows.length === 0 && (
        <div className="d-empty-band">
          Drop a block here
          <Zone id={gapId(sectionKey, 0)} dest={{ kind: "row", at: section, index: 0 }} className="d-zone-fill" priority="gap" gap />
        </div>
      )}
      {rows.map((row, i) => (
        <RowShell key={String(row.id)} row={row} rowIndex={i} rowCount={rows.length} section={section} sectionKey={sectionKey} shared={shared} />
      ))}
    </section>
  );
}

/** The report drawn as a page: header, bands, footer; rows are 12-column grids of cells holding blocks. */
export function Canvas({ doc, ctx, selection, onSelect, onResizeStart, onResize }: CanvasProps) {
  const style = { "--doc-accent": ctx.accent, fontFamily: `"${ctx.font}", sans-serif` } as CSSProperties;
  const shared: Shared = { ctx, selection, onSelect, onResizeStart, onResize };
  return (
    <div className="d-page" style={style} onClick={() => onSelect({ kind: "report" })} data-selected={selection.kind === "report"}>
      <SectionView label="Page header" sectionKey="header" section={{ section: "header" }} rows={arr(doc.pageHeader)} shared={shared} hint="repeats on every page" />
      {arr(doc.body).map((band) => (
        <SectionView
          key={String(band.id)}
          label={BAND_LABEL[String(band.type)] ?? String(band.type)}
          sectionKey={`band:${band.id}`}
          section={{ section: "band", bandId: String(band.id) }}
          rows={arr(band.rows)}
          shared={shared}
          bandSel={{ kind: "band", id: String(band.id) }}
          hint={band.dataset ? `data: ${band.dataset}` : undefined}
        />
      ))}
      <SectionView label="Page footer" sectionKey="footer" section={{ section: "footer" }} rows={arr(doc.pageFooter)} shared={shared} hint="repeats on every page" />
    </div>
  );
}
