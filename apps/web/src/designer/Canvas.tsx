import type { CSSProperties, MouseEvent } from "react";
import { BlockView } from "./BlockView.tsx";
import { arr, sameSelection, type DrawContext, type Json, type Selection } from "./model.ts";

interface CanvasProps {
  doc: Json;
  ctx: DrawContext;
  selection: Selection;
  onSelect: (s: Selection) => void;
}

const BAND_LABEL: Record<string, string> = { title: "Title", body: "Body", summary: "Summary", noData: "Shown when there is no data" };
const clampSpan = (n: unknown) => Math.max(1, Math.min(12, Math.round(Number(n) || 12)));

/** Stop a click from also selecting whatever is behind it. */
const pick = (onSelect: (s: Selection) => void, s: Selection) => (e: MouseEvent) => {
  e.stopPropagation();
  onSelect(s);
};

function RowView({ row, ctx, selection, onSelect }: { row: Json; ctx: DrawContext } & Pick<CanvasProps, "selection" | "onSelect">) {
  const cells = arr(row.cells);
  const rowSel: Selection = { kind: "row", id: String(row.id) };
  return (
    <div className="d-row" data-selected={sameSelection(selection, rowSel)} data-row-id={row.id}>
      <button type="button" className="d-row-tab" onClick={pick(onSelect, rowSel)} title="Select this row" aria-label={`Select row ${row.id}`}>
        ⋮⋮
      </button>
      <div className="d-cells">
        {cells.map((cell, index) => {
          const cellSel: Selection = { kind: "cell", rowId: String(row.id), index };
          const span = clampSpan(cell.span);
          return (
            <div key={index} className="d-cell" style={{ gridColumn: `span ${span}` }} data-selected={sameSelection(selection, cellSel)} data-cell={`${row.id}:${index}`} onClick={pick(onSelect, cellSel)}>
              {arr(cell.blocks).map((block) => {
                const blockSel: Selection = { kind: "block", id: String(block.id) };
                return (
                  <div key={String(block.id)} className="d-block" data-selected={sameSelection(selection, blockSel)} data-block-id={block.id} data-type={block.type} onClick={pick(onSelect, blockSel)}>
                    <span className="d-tag">{String(block.type)}</span>
                    <BlockView block={block} ctx={ctx} span={span} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ label, id, rows, ctx, selection, onSelect, bandSel, hint }: { label: string; id: string; rows: Json[]; ctx: DrawContext; bandSel?: Selection; hint?: string } & Pick<CanvasProps, "selection" | "onSelect">) {
  return (
    <section className="d-section" data-section={id} data-selected={bandSel ? sameSelection(selection, bandSel) : false}>
      <header className="d-section-head">
        {bandSel ? (
          <button type="button" className="d-section-label" onClick={pick(onSelect, bandSel)}>{label}</button>
        ) : (
          <span className="d-section-label">{label}</span>
        )}
        {hint && <span className="d-section-hint">{hint}</span>}
      </header>
      {rows.length === 0 && <div className="d-empty-band">Nothing here yet</div>}
      {rows.map((row) => <RowView key={String(row.id)} row={row} ctx={ctx} selection={selection} onSelect={onSelect} />)}
    </section>
  );
}

/** The report drawn as a page: header, bands, footer; rows are 12-column grids of cells holding blocks. */
export function Canvas({ doc, ctx, selection, onSelect }: CanvasProps) {
  const style = { "--doc-accent": ctx.accent, fontFamily: `"${ctx.font}", sans-serif` } as CSSProperties;
  return (
    <div className="d-page" style={style} onClick={() => onSelect({ kind: "report" })} data-selected={selection.kind === "report"}>
      <Section label="Page header" id="header" rows={arr(doc.pageHeader)} ctx={ctx} selection={selection} onSelect={onSelect} hint="repeats on every page" />
      {arr(doc.body).map((band) => (
        <Section
          key={String(band.id)}
          label={BAND_LABEL[String(band.type)] ?? String(band.type)}
          id={String(band.id)}
          rows={arr(band.rows)}
          ctx={ctx}
          selection={selection}
          onSelect={onSelect}
          bandSel={{ kind: "band", id: String(band.id) }}
          hint={band.dataset ? `data: ${band.dataset}` : undefined}
        />
      ))}
      <Section label="Page footer" id="footer" rows={arr(doc.pageFooter)} ctx={ctx} selection={selection} onSelect={onSelect} hint="repeats on every page" />
    </div>
  );
}
