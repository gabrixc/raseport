import type { ReactNode } from "react";
import { removeItem } from "../remove.ts";
import { AGGREGATES, Check, ColumnPicker, Field, FORMATS, formatName, Group, IconButton, NumberInput, Segmented, Select, TextInput, type ColumnOption } from "./Fields.tsx";
import { prettify } from "./defaults.ts";
import { arr, type Json, type Selection } from "./model.ts";
import { duplicateBlock, duplicateRow, findBlock, findRowPosition, moveBlock, moveRow, removeRow, setCellSpan, setPath, updateNode } from "./ops.ts";

export interface InspectorProps {
  doc: Json;
  selection: Selection;
  datasetIds: string[];
  paramNames: string[];
  columnsFor: (dataset?: string) => ColumnOption[];
  /** apply an edited document, optionally moving the selection */
  onCommit: (doc: Json | null, select?: Selection) => void;
  /** extra panels for the report-level view (params, data sources) */
  reportExtras?: ReactNode;
}

const TITLES: Record<string, string> = { text: "Text", kpi: "KPI tile", chart: "Chart", table: "Table", divider: "Divider", spacer: "Spacer", pageBreak: "Page break" };
const STYLES = [
  { value: "body", label: "Normal" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "muted", label: "Muted" },
  { value: "small", label: "Small" },
];
const BAND_TYPES = [
  { value: "title", label: "Title (once, at the start)" },
  { value: "body", label: "Body" },
  { value: "summary", label: "Summary (once, at the end)" },
  { value: "noData", label: "Shown only when there is no data" },
];

function findRowOf(doc: Json, rowId: string): Json | null {
  const rows = [...arr(doc.pageHeader), ...arr(doc.pageFooter), ...arr(doc.body).flatMap((b) => arr(b.rows))];
  return rows.find((r) => r.id === rowId) ?? null;
}

// ---- text -------------------------------------------------------------------------------------------

function PartsEditor({ parts, onChange, p }: { parts: unknown[]; onChange: (v: unknown[]) => void; p: InspectorProps }) {
  const set = (i: number, v: unknown) => onChange(parts.map((x, j) => (j === i ? v : x)));
  const first = p.datasetIds[0] ?? "";
  const addRef = (kind: string) => {
    if (kind === "text") return onChange([...parts, ""]);
    if (kind.startsWith("param:")) return onChange([...parts, { $param: kind.slice(6) }]);
    if (kind.startsWith("builtin:")) return onChange([...parts, { $builtin: kind.slice(8) }]);
    if (kind === "agg") return onChange([...parts, { $agg: { fn: "count", dataset: first } }]);
  };
  return (
    <div className="i-parts">
      {parts.map((part, i) => {
        const remove = <IconButton label="Remove this piece" onClick={() => onChange(parts.filter((_, j) => j !== i))} danger>✕</IconButton>;
        if (typeof part === "string")
          return (
            <div key={i} className="i-part">
              <TextInput value={part} onChange={(v) => set(i, v)} placeholder="Text" />
              {remove}
            </div>
          );
        const ref = (part ?? {}) as Json;
        if (ref.$param !== undefined)
          return (
            <div key={i} className="i-part">
              <span className="i-pill">Param</span>
              <Select value={ref.$param} onChange={(v) => set(i, { $param: v })} options={p.paramNames.map((n) => ({ value: n, label: n }))} />
              {remove}
            </div>
          );
        if (ref.$builtin !== undefined)
          return (
            <div key={i} className="i-part">
              <span className="i-pill">Auto</span>
              <Select value={ref.$builtin} onChange={(v) => set(i, { $builtin: v })} options={[{ value: "page", label: "Page number" }, { value: "pages", label: "Total pages" }, { value: "today", label: "Today's date" }]} />
              {remove}
            </div>
          );
        const a = (ref.$agg ?? {}) as Json;
        return (
          <div key={i} className="i-part i-part-agg">
            <span className="i-pill">Value</span>
            <Select value={a.fn} onChange={(v) => set(i, { $agg: { ...a, fn: v } })} options={AGGREGATES} />
            <span className="i-of">of</span>
            <Select value={a.dataset} onChange={(v) => set(i, { $agg: { ...a, dataset: v, field: undefined } })} options={p.datasetIds.map((d) => ({ value: d, label: d }))} empty="data source…" />
            {a.fn !== "count" && <ColumnPicker value={a.field} onChange={(v) => set(i, { $agg: { ...a, field: v } })} columns={p.columnsFor(a.dataset)} />}
            {remove}
          </div>
        );
      })}
      <div className="i-add-row">
        <button type="button" className="secondary" onClick={() => addRef("text")}>+ Text</button>
        <select value="" onChange={(e) => e.target.value && addRef(e.target.value)} aria-label="Insert a value">
          <option value="">+ Insert value…</option>
          {p.paramNames.length > 0 && <optgroup label="Parameters">{p.paramNames.map((n) => <option key={n} value={`param:${n}`}>{n}</option>)}</optgroup>}
          <optgroup label="Automatic">
            <option value="builtin:page">Page number</option>
            <option value="builtin:pages">Total pages</option>
            <option value="builtin:today">Today's date</option>
          </optgroup>
          {p.datasetIds.length > 0 && <option value="agg">Calculated from data…</option>}
        </select>
      </div>
    </div>
  );
}

function TextForm({ block, p, update }: { block: Json; p: InspectorProps; update: (patch: Json) => void }) {
  const parts = Array.isArray(block.value) ? block.value : typeof block.value === "string" ? [block.value] : [];
  return (
    <>
      <Field label="Content" wide hint="Mix your own text with values that fill in automatically.">
        <PartsEditor parts={parts} onChange={(v) => update({ value: v })} p={p} />
      </Field>
      <Field label="Style">
        <Select value={block.style ?? "body"} onChange={(v) => update({ style: v })} options={STYLES} empty={undefined} />
      </Field>
      <Field label="Align">
        <Segmented value={block.align ?? "left"} onChange={(v) => update({ align: v })} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
      </Field>
      {parts.some((x) => typeof x === "object") && (
        <Field label="Format values as">
          <Select value={formatName(block.format ?? "")} onChange={(v) => update({ format: v === "" || v === "text" ? undefined : v })} options={FORMATS} empty="Automatic" />
        </Field>
      )}
    </>
  );
}

// ---- kpi / chart ------------------------------------------------------------------------------------

function KpiForm({ block, p, update }: { block: Json; p: InspectorProps; update: (patch: Json) => void }) {
  const agg = (block.value?.$agg ?? {}) as Json;
  const setAgg = (patch: Json) => update({ value: { $agg: { ...agg, ...patch } } });
  return (
    <>
      <Field label="Label"><TextInput value={block.label} onChange={(v) => update({ label: v })} /></Field>
      <Field label="Calculate"><Select value={agg.fn} onChange={(v) => setAgg({ fn: v })} options={AGGREGATES} /></Field>
      <Field label="Data source"><Select value={agg.dataset} onChange={(v) => setAgg({ dataset: v, field: undefined })} options={p.datasetIds.map((d) => ({ value: d, label: d }))} /></Field>
      {agg.fn !== "count" && <Field label="Of column"><ColumnPicker value={agg.field} onChange={(v) => setAgg({ field: v })} columns={p.columnsFor(agg.dataset)} /></Field>}
      <Field label="Show as"><Select value={formatName(block.format ?? "text")} onChange={(v) => update({ format: v })} options={FORMATS} empty={undefined} /></Field>
    </>
  );
}

function ChartForm({ block, p, update }: { block: Json; p: InspectorProps; update: (patch: Json) => void }) {
  const series = arr(block.series);
  const columns = p.columnsFor(block.dataset);
  const setSeries = (i: number, patch: Json) => update({ series: series.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <>
      <Field label="Type"><Segmented value={block.kind ?? "bar"} onChange={(v) => update({ kind: v })} options={[{ value: "bar", label: "Bars" }, { value: "line", label: "Line" }]} /></Field>
      <Field label="Title"><TextInput value={block.title} onChange={(v) => update({ title: v === "" ? undefined : v })} /></Field>
      <Field label="Data source"><Select value={block.dataset} onChange={(v) => update({ dataset: v, x: undefined, series: [] })} options={p.datasetIds.map((d) => ({ value: d, label: d }))} /></Field>
      <Field label="Categories (along the bottom)"><ColumnPicker value={block.x} onChange={(v) => update({ x: v })} columns={columns} /></Field>
      <Field label="Combine rows with the same category" hint="e.g. add up all orders of one region">
        <Select value={block.aggregate ?? ""} onChange={(v) => update({ aggregate: v === "" ? undefined : v })} options={AGGREGATES} empty="Don't combine" />
      </Field>
      <Group title="Values" action={series.length < 6 && <button type="button" className="secondary" onClick={() => update({ series: [...series, { field: columns.find((c) => c.type === "number")?.path ?? "" }] })}>+ Add series</button>}>
        {series.length === 0 && <p className="i-hint">Add at least one series to draw.</p>}
        {series.map((s, i) => (
          <div key={i} className="i-row-line">
            <ColumnPicker value={s.field} onChange={(v) => setSeries(i, { field: v })} columns={columns} />
            <TextInput value={s.label} onChange={(v) => setSeries(i, { label: v === "" ? undefined : v })} placeholder="Legend name" />
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(String(s.color)) ? s.color : "#0b5fff"} onChange={(e) => setSeries(i, { color: e.target.value })} aria-label="Series color" />
            <IconButton label="Remove this series" onClick={() => update({ series: series.filter((_, j) => j !== i) })} danger>✕</IconButton>
          </div>
        ))}
      </Group>
      <Field label="Number format"><Select value={formatName(block.format ?? "decimal")} onChange={(v) => update({ format: v })} options={FORMATS} empty={undefined} /></Field>
      <Field label="Height"><NumberInput value={block.height ?? 260} min={120} max={600} step={20} onChange={(v) => update({ height: v })} /></Field>
    </>
  );
}

// ---- table ------------------------------------------------------------------------------------------

function TableForm({ block, p, update }: { block: Json; p: InspectorProps; update: (patch: Json) => void }) {
  const cols = arr(block.columns);
  const known = p.columnsFor(block.dataset);
  const setCol = (i: number, patch: Json) => update({ columns: cols.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const move = (i: number, d: number) => {
    const next = [...cols];
    const [it] = next.splice(i, 1);
    next.splice(i + d, 0, it!);
    update({ columns: next });
  };
  const unused = known.filter((k) => !cols.some((c) => c.field === k.path));
  const fresh = (path: string): Json => {
    const type = known.find((k) => k.path === path)?.type;
    return { field: path, label: prettify(path), ...(type === "number" ? { format: "decimal" } : type === "date" ? { format: "date" } : {}) };
  };
  return (
    <>
      <Field label="Data source"><Select value={block.dataset} onChange={(v) => update({ dataset: v })} options={p.datasetIds.map((d) => ({ value: d, label: d }))} /></Field>
      <Group
        title="Columns"
        action={
          <>
            <button type="button" className="secondary" disabled={unused.length === 0 && known.length > 0} onClick={() => update({ columns: [...cols, fresh(unused[0]?.path ?? "")] })}>+ Add column</button>
            {unused.length > 1 && <button type="button" className="secondary" onClick={() => update({ columns: [...cols, ...unused.map((u) => fresh(u.path))] })}>Add all</button>}
          </>
        }
      >
        {cols.length === 0 && <p className="i-hint">Add the columns you want to show.</p>}
        {cols.map((c, i) => (
          <div key={i} className="i-col">
            <div className="i-row-line">
              <ColumnPicker value={c.field} onChange={(v) => setCol(i, { field: v, label: !c.label || c.label === prettify(String(c.field ?? "")) ? prettify(v) : c.label })} columns={known} />
              <TextInput value={c.label} onChange={(v) => setCol(i, { label: v })} placeholder="Heading" />
              <IconButton label="Move left" onClick={() => move(i, -1)} disabled={i === 0}>↑</IconButton>
              <IconButton label="Move right" onClick={() => move(i, 1)} disabled={i === cols.length - 1}>↓</IconButton>
              <IconButton label="Remove this column" onClick={() => update({ columns: cols.filter((_, j) => j !== i) })} danger>✕</IconButton>
            </div>
            <div className="i-row-line i-sub">
              <Select value={formatName(c.format ?? "text")} onChange={(v) => setCol(i, { format: v === "text" ? undefined : v })} options={FORMATS} empty={undefined} />
              <Select value={c.align ?? ""} onChange={(v) => setCol(i, { align: v === "" ? undefined : v })} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} empty="Align: auto" />
              <Select value={c.aggregate ?? ""} onChange={(v) => setCol(i, { aggregate: v === "" ? undefined : v })} options={AGGREGATES} empty="No total" />
            </div>
          </div>
        ))}
      </Group>
      <Field label="Group rows by" hint="The data must already be sorted by this column.">
        <ColumnPicker value={block.groupBy} onChange={(v) => update({ groupBy: v === "" ? undefined : v, groupSubtotals: v === "" ? undefined : block.groupSubtotals })} columns={known} empty="No grouping" />
      </Field>
      <div className="i-checks">
        <Check value={block.groupSubtotals} onChange={(v) => update({ groupSubtotals: v })} label="Subtotal per group" />
        <Check value={block.grandTotal} onChange={(v) => update({ grandTotal: v })} label="Grand total" />
        <Check value={block.zebra !== false} onChange={(v) => update({ zebra: v })} label="Striped rows" />
      </div>
    </>
  );
}

// ---- layout nodes -----------------------------------------------------------------------------------

function RowForm({ row, p }: { row: Json; p: InspectorProps }) {
  const cells = arr(row.cells);
  return (
    <Group title="Columns in this row">
      {cells.map((c, i) => (
        <Field key={i} label={`Width of column ${i + 1}`} hint={`${Number(c.span) || 12} of 12`}>
          <input type="range" min={1} max={12} value={Number(c.span) || 12} onChange={(e) => p.onCommit(setCellSpan(p.doc, String(row.id), i, Number(e.target.value)))} />
        </Field>
      ))}
    </Group>
  );
}

function ReportForm({ p }: { p: InspectorProps }) {
  const set = (path: (string | number)[], v: unknown) => p.onCommit(setPath(p.doc, path, v === "" ? undefined : v));
  return (
    <>
      {/* Where the data comes from is the first thing a new report needs, so it leads. */}
      {p.reportExtras}
      <Group title="Page and style">
        <div className="i-fields">
          <Field label="Report name"><TextInput value={p.doc.name} onChange={(v) => set(["name"], v)} /></Field>
          <Field label="Paper"><Select value={p.doc.page?.size ?? "a4"} onChange={(v) => set(["page", "size"], v)} options={[{ value: "a4", label: "A4" }, { value: "a3", label: "A3" }, { value: "us-letter", label: "US Letter" }]} empty={undefined} /></Field>
          <Field label="Orientation"><Segmented value={p.doc.page?.orientation ?? "portrait"} onChange={(v) => set(["page", "orientation"], v)} options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]} /></Field>
          <Field label="Margin" hint="e.g. 2cm"><TextInput value={p.doc.page?.margin} onChange={(v) => set(["page", "margin"], v)} placeholder="2cm" /></Field>
          <Field label="Accent color"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(String(p.doc.theme?.accent)) ? p.doc.theme.accent : "#0b5fff"} onChange={(e) => set(["theme", "accent"], e.target.value)} /></Field>
          <Field label="Language and number style" hint="e.g. en-US, en-GB, de-DE"><TextInput value={p.doc.locale} onChange={(v) => set(["locale"], v)} placeholder="en-US" /></Field>
          <Field label="Currency" hint="3-letter code, e.g. USD, EUR"><TextInput value={p.doc.currency} onChange={(v) => set(["currency"], v.toUpperCase().slice(0, 3))} placeholder="USD" /></Field>
        </div>
      </Group>
    </>
  );
}

// ---- panel --------------------------------------------------------------------------------------------

export function Inspector(p: InspectorProps) {
  const { doc, selection, onCommit } = p;
  const block = selection.kind === "block" ? (findBlock(doc, selection.id)?.block ?? null) : null;
  const row = selection.kind === "row" ? findRowOf(doc, selection.id) : selection.kind === "cell" ? findRowOf(doc, selection.rowId) : null;
  const band = selection.kind === "band" ? (arr(doc.body).find((b) => b.id === selection.id) ?? null) : null;

  const updateBlock = (patch: Json) => block && onCommit(updateNode(doc, String(block.id), patch));

  let title = "Report settings";
  let actions: ReactNode = null;
  let body: ReactNode = <ReportForm p={p} />;

  if (block) {
    title = `${TITLES[String(block.type)] ?? block.type} · ${block.id}`;
    const at = findBlock(doc, String(block.id));
    const cellBlocks = at ? arr(arr(findRowOf(doc, at.rowId)?.cells)[at.cellIndex]?.blocks) : [];
    const idx = cellBlocks.findIndex((b) => b.id === block.id);
    const shift = (d: number) => at && onCommit(moveBlock(doc, String(block.id), { kind: "cell", rowId: at.rowId, cellIndex: at.cellIndex, index: d < 0 ? idx - 1 : idx + 2 }), { kind: "block", id: String(block.id) });
    actions = (
      <>
        <button type="button" className="secondary" disabled={idx <= 0} onClick={() => shift(-1)} title="Move up within this column">↑</button>
        <button type="button" className="secondary" disabled={idx < 0 || idx >= cellBlocks.length - 1} onClick={() => shift(1)} title="Move down within this column">↓</button>
        <button type="button" className="secondary" onClick={() => { const r = duplicateBlock(doc, String(block.id)); r && onCommit(r.doc, { kind: "block", id: r.newId }); }}>Duplicate</button>
        <button type="button" className="secondary i-danger" onClick={() => onCommit(removeItem(doc, { kind: "block", id: String(block.id) })?.doc ?? null, { kind: "report" })}>Delete</button>
      </>
    );
    body =
      block.type === "text" ? <TextForm block={block} p={p} update={updateBlock} />
      : block.type === "kpi" ? <KpiForm block={block} p={p} update={updateBlock} />
      : block.type === "chart" ? <ChartForm block={block} p={p} update={updateBlock} />
      : block.type === "table" ? <TableForm block={block} p={p} update={updateBlock} />
      : block.type === "spacer" ? <Field label="Height (points)"><NumberInput value={parseFloat(String(block.height)) || 12} min={4} max={200} onChange={(v) => updateBlock({ height: `${v}pt` })} /></Field>
      : <p className="i-hint">Nothing to set for this block.</p>;
  } else if (selection.kind === "row" && row) {
    title = `Row · ${row.id}`;
    const pos = findRowPosition(doc, String(row.id));
    const shiftRow = (d: number) => pos && onCommit(moveRow(doc, String(row.id), pos.section, d < 0 ? pos.index - 1 : pos.index + 2), { kind: "row", id: String(row.id) });
    actions = (
      <>
        <button type="button" className="secondary" disabled={!pos || pos.index === 0} onClick={() => shiftRow(-1)} title="Move this row up">↑</button>
        <button type="button" className="secondary" disabled={!pos || pos.index >= pos.count - 1} onClick={() => shiftRow(1)} title="Move this row down">↓</button>
        <button type="button" className="secondary" onClick={() => { const r = duplicateRow(doc, String(row.id)); r && onCommit(r.doc, { kind: "row", id: r.newId }); }}>Duplicate</button>
        <button type="button" className="secondary i-danger" onClick={() => onCommit(removeRow(doc, String(row.id)), { kind: "report" })}>Delete</button>
      </>
    );
    body = <RowForm row={row} p={p} />;
  } else if (selection.kind === "cell" && row) {
    const cell = arr(row.cells)[selection.index];
    title = `Column ${selection.index + 1} of row ${row.id}`;
    body = (
      <Field label="Width" hint={`${Number(cell?.span) || 12} of 12`}>
        <Segmented
          value={String(Number(cell?.span) || 12)}
          onChange={(v) => onCommit(setCellSpan(doc, String(row.id), selection.index, Number(v)))}
          options={[{ value: "3", label: "¼" }, { value: "4", label: "⅓" }, { value: "6", label: "½" }, { value: "8", label: "⅔" }, { value: "9", label: "¾" }, { value: "12", label: "Full" }]}
        />
      </Field>
    );
  } else if (band) {
    title = `Section · ${band.id}`;
    actions = <button type="button" className="secondary i-danger" onClick={() => onCommit(removeItem(doc, { kind: "band", id: String(band.id) })?.doc ?? null, { kind: "report" })}>Delete section</button>;
    body = (
      <>
        <Field label="What this section is"><Select value={band.type} onChange={(v) => onCommit(updateNode(doc, String(band.id), { type: v }))} options={BAND_TYPES} empty={undefined} /></Field>
        <Field label="Only show when this data source has rows" hint="Leave empty to always show.">
          <Select value={band.dataset ?? ""} onChange={(v) => onCommit(updateNode(doc, String(band.id), { dataset: v === "" ? undefined : v }))} options={p.datasetIds.map((d) => ({ value: d, label: d }))} empty="Always" />
        </Field>
      </>
    );
  }

  return (
    <div className="inspector" data-kind={selection.kind}>
      <div className="inspector-head">
        <strong>{title}</strong>
        <span className="spacer" />
        {actions}
      </div>
      <div className="inspector-body">{body}</div>
    </div>
  );
}
