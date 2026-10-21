import { removeItem } from "../remove.ts";
import { Check, CommitInput, Field, Group, IconButton, NumberInput, Select, TextInput } from "./Fields.tsx";
import { arr, type Json } from "./model.ts";
import { addDataSource, addParam, changeSource, mapArgument, renameDataset, renameParam, toIdent, updateParam, type SourceArg, type SourceInfo } from "./sources.ts";
import type { Catalog } from "./useCatalog.ts";
import { insertItem } from "../insert.ts";

interface PanelProps {
  doc: Json;
  catalog: Catalog;
  onCommit: (doc: Json | null) => void;
}

const PARAM_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "bool", label: "Yes / No" },
];

function confirmRemoval(what: string, dangling: string[]): boolean {
  return dangling.length === 0 || window.confirm(`${what} is still used by ${dangling.join(", ")}. Remove it anyway? You can undo with Ctrl+Z.`);
}

// ---- parameters ---------------------------------------------------------------------------------------

function ParamsEditor({ doc, onCommit }: Pick<PanelProps, "doc" | "onCommit">) {
  const params = arr(doc.params);
  return (
    <Group title="Parameters" action={<button type="button" className="secondary" onClick={() => onCommit(addParam(doc).doc)}>+ Add parameter</button>}>
      {params.length === 0 && <p className="i-hint">Parameters are the choices a person makes when running the report, such as a month. They appear above the preview.</p>}
      {params.map((p) => {
        const name = String(p.name);
        const type = String(p.type ?? "text");
        return (
          <div key={name} className="i-col">
            <div className="i-row-line">
              <CommitInput value={name} onCommit={(v) => onCommit(renameParam(doc, name, toIdent(v)))} placeholder="name" />
              <Select value={type} onChange={(v) => onCommit(updateParam(doc, name, { type: v, default: undefined }))} options={PARAM_TYPES} empty={undefined} />
              <IconButton
                label="Remove this parameter"
                danger
                onClick={() => {
                  const result = removeItem(doc, { kind: "param", name });
                  if (result && confirmRemoval(`Parameter "${name}"`, result.dangling)) onCommit(result.doc);
                }}
              >
                ✕
              </IconButton>
            </div>
            <div className="i-row-line i-sub">
              <Check value={p.required} onChange={(v) => onCommit(updateParam(doc, name, { required: v ? true : undefined }))} label="Required" />
              {type === "bool" ? (
                <Check value={p.default} onChange={(v) => onCommit(updateParam(doc, name, { default: v ? true : undefined }))} label="On by default" />
              ) : type === "number" ? (
                <NumberInput value={p.default} onChange={(v) => onCommit(updateParam(doc, name, { default: v }))} />
              ) : type === "date" ? (
                <input type="date" value={typeof p.default === "string" ? p.default : ""} onChange={(e) => onCommit(updateParam(doc, name, { default: e.target.value || undefined }))} aria-label="Default date" />
              ) : (
                <TextInput value={p.default} onChange={(v) => onCommit(updateParam(doc, name, { default: v === "" ? undefined : v }))} placeholder="Default value" />
              )}
            </div>
          </div>
        );
      })}
    </Group>
  );
}

// ---- data sources -------------------------------------------------------------------------------------

/** What each argument of the function is filled from. */
function ArgRow({ arg, current, paramNames, onMap }: { arg: SourceArg | { name: string; pgType?: string }; current: unknown; paramNames: string[]; onMap: (v: { param: string } | { fixed: string }) => void }) {
  const isParam = !!current && typeof current === "object" && "$param" in (current as Json);
  const fixed = !isParam;
  const label = `${arg.name}${arg.pgType ? ` (${arg.pgType})` : ""}`;
  return (
    <div className="i-row-line i-arg">
      <span className="i-arg-name" title={label}>{label}</span>
      <Select
        value={isParam ? String((current as Json).$param) : "__fixed"}
        onChange={(v) => (v === "__fixed" ? onMap({ fixed: "" }) : onMap({ param: v }))}
        options={[...paramNames.map((n) => ({ value: n, label: `Param: ${n}` })), { value: "__fixed", label: "A fixed value…" }]}
        empty={undefined}
      />
      {fixed && <TextInput value={current === null || current === undefined ? "" : String(current)} onChange={(v) => onMap({ fixed: v })} placeholder="value" />}
    </div>
  );
}

function SourcesEditor({ doc, catalog, onCommit }: PanelProps) {
  const datasets = arr(doc.datasets);
  const paramNames = arr(doc.params).map((p) => String(p.name));
  const sources = catalog.sources ?? [];
  const usable = sources.filter((s) => s.usable);
  const byName = new Map(sources.map((s) => [s.name, s]));
  const options = (current?: string): { value: string; label: string }[] => [
    ...usable.map((s) => ({ value: s.name, label: s.label })),
    ...(current && !byName.has(current) ? [{ value: current, label: `${current} (not in the catalogue)` }] : []),
  ];

  const add = (name: string) => {
    const src = byName.get(name);
    if (src) onCommit(addDataSource(doc, src).doc);
  };

  return (
    <Group
      title="Data sources"
      action={
        catalog.sources ? (
          <select value="" onChange={(e) => e.target.value && add(e.target.value)} aria-label="Add a data source">
            <option value="">+ Add data source…</option>
            {usable.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
          </select>
        ) : (
          <button type="button" className="secondary" onClick={() => onCommit(insertItem(doc, "dataset"))}>+ Add data source</button>
        )
      }
    >
      {catalog.error && (
        <p className="i-hint i-warn">
          The list of data sources could not be loaded ({catalog.error}). You can still type a function name.{" "}
          <button type="button" className="link" onClick={catalog.reload}>Try again</button>
        </p>
      )}
      {!catalog.error && catalog.loading && !catalog.sources && <p className="i-hint">Loading data sources…</p>}
      {datasets.length === 0 && !catalog.loading && <p className="i-hint">A data source supplies the rows for your tables and charts. Add one to get started.</p>}

      {datasets.map((d) => {
        const id = String(d.id);
        const fn = String(d.source?.name ?? "");
        const info: SourceInfo | undefined = byName.get(fn);
        const args = (d.args ?? {}) as Json;
        const argList: (SourceArg | { name: string })[] = info ? info.args : Object.keys(args).map((name) => ({ name }));
        return (
          <div key={id} className="i-col i-source">
            <div className="i-row-line">
              <CommitInput value={id} onCommit={(v) => onCommit(renameDataset(doc, id, toIdent(v)))} placeholder="name" />
              {catalog.sources ? (
                <Select
                  value={fn}
                  onChange={(v) => {
                    const src = byName.get(v);
                    if (src) onCommit(changeSource(doc, id, src));
                  }}
                  options={options(fn)}
                  empty="Choose a source…"
                />
              ) : (
                <TextInput value={fn} onChange={(v) => onCommit(updateDatasetFn(doc, id, v))} placeholder="report_…" />
              )}
              <IconButton
                label="Remove this data source"
                danger
                onClick={() => {
                  const result = removeItem(doc, { kind: "dataset", id });
                  if (result && confirmRemoval(`Data source "${id}"`, result.dangling)) onCommit(result.doc);
                }}
              >
                ✕
              </IconButton>
            </div>
            {argList.length > 0 && (
              <div className="i-args">
                {argList.map((a) => (
                  <ArgRow key={a.name} arg={a} current={args[a.name]} paramNames={paramNames} onMap={(v) => onCommit(mapArgument(doc, id, a.name, v))} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Group>
  );
}

function updateDatasetFn(doc: Json, id: string, fn: string): Json {
  const next = structuredClone(doc);
  const ds = arr(next.datasets).find((d) => d.id === id);
  if (ds) ds.source = { kind: "rpc", name: fn };
  return next;
}

/** Parameters and data sources: the "where does the data come from" half of the report. */
export function ReportPanel(props: PanelProps) {
  return (
    <>
      <SourcesEditor {...props} />
      <ParamsEditor doc={props.doc} onCommit={props.onCommit} />
    </>
  );
}

export { Field };
