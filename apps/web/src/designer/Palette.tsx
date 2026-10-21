import type { BlockKind } from "../insert.ts";
import { useDragSource } from "./dnd.tsx";

export const PALETTE: { type: BlockKind; label: string; glyph: string; hint: string }[] = [
  { type: "text", label: "Text", glyph: "T", hint: "A heading or paragraph, with values that fill in automatically" },
  { type: "kpi", label: "KPI", glyph: "#", hint: "A big number, e.g. total revenue" },
  { type: "chart", label: "Chart", glyph: "▥", hint: "A bar or line chart" },
  { type: "table", label: "Table", glyph: "▦", hint: "Rows of data" },
  { type: "divider", label: "Divider", glyph: "—", hint: "A thin line" },
  { type: "spacer", label: "Space", glyph: "↕", hint: "Empty vertical space" },
  { type: "pageBreak", label: "Page break", glyph: "⏎", hint: "Start a new page here" },
];

function Chip({ item, onAdd }: { item: (typeof PALETTE)[number]; onAdd: (t: BlockKind) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDragSource(`new:${item.type}`, { kind: "new", type: item.type });
  return (
    <button ref={setNodeRef} type="button" className="d-chip-btn" data-dragging={isDragging} title={`${item.hint}. Drag onto the page, or click to add at the end.`} onClick={() => onAdd(item.type)} {...listeners} {...attributes}>
      <span className="d-glyph" aria-hidden="true">{item.glyph}</span>
      {item.label}
    </button>
  );
}

/** Things you can drag onto the page. Clicking adds one at the end, for keyboard and touch users. */
export function Palette({ onAdd, onAddSection }: { onAdd: (t: BlockKind) => void; onAddSection: () => void }) {
  return (
    <div className="d-palette" role="toolbar" aria-label="Add to the report">
      <span className="d-palette-title">Add</span>
      {PALETTE.map((item) => <Chip key={item.type} item={item} onAdd={onAdd} />)}
      <span className="d-palette-sep" />
      <button type="button" className="d-chip-btn d-chip-plain" onClick={onAddSection} title="Add an empty section below the others">+ Section</button>
    </div>
  );
}
