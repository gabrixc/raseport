import type { ReactNode } from "react";
import type { Json } from "./model.ts";

export const FORMATS: { value: string; label: string }[] = [
  { value: "text", label: "As is" },
  { value: "integer", label: "Whole number" },
  { value: "decimal", label: "Number (2 decimals)" },
  { value: "currency", label: "Currency" },
  { value: "percent", label: "Percent" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date and time" },
  { value: "boolean", label: "Yes / No" },
];

export const AGGREGATES: { value: string; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "count", label: "Count" },
  { value: "min", label: "Smallest" },
  { value: "max", label: "Largest" },
  { value: "first", label: "First" },
  { value: "last", label: "Last" },
];

/** A format may be a name or {kind, digits}; the forms only edit the name. */
export const formatName = (f: unknown): string => (typeof f === "string" ? f : f && typeof f === "object" ? String((f as Json).kind) : "text");

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`i-field${wide ? " i-wide" : ""}`}>
      <span className="i-label">{label}</span>
      {children}
      {hint && <span className="i-hint">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder }: { value: unknown; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="text" value={typeof value === "string" ? value : ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function NumberInput({ value, onChange, min, max, step }: { value: unknown; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="number" value={typeof value === "number" || typeof value === "string" ? String(value) : ""} min={min} max={max} step={step} onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))} />;
}

export function Select({ value, onChange, options, empty }: { value: unknown; onChange: (v: string) => void; options: { value: string; label: string }[]; empty?: string }) {
  const current = typeof value === "string" ? value : "";
  const known = options.some((o) => o.value === current);
  return (
    <select value={current} onChange={(e) => onChange(e.target.value)}>
      {(empty !== undefined || !current) && <option value="">{empty ?? "Choose…"}</option>}
      {!known && current && <option value={current}>{current} (not found)</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Check({ value, onChange, label }: { value: unknown; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="i-check">
      <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

/** A segmented choice, e.g. left / centre / right. */
export function Segmented({ value, onChange, options }: { value: unknown; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="i-seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export interface ColumnOption {
  path: string;
  type: string;
}

/** Pick a column of the chosen data source (nested jsonb paths included); free text when none are known yet. */
export function ColumnPicker({ value, onChange, columns, empty }: { value: unknown; onChange: (v: string) => void; columns: ColumnOption[]; empty?: string }) {
  if (columns.length === 0) return <TextInput value={value} onChange={onChange} placeholder="column name" />;
  return <Select value={value} onChange={onChange} empty={empty ?? "Choose a column…"} options={columns.map((c) => ({ value: c.path, label: `${c.path}  ·  ${c.type}` }))} />;
}

export function IconButton({ onClick, label, children, disabled, danger }: { onClick: () => void; label: string; children: ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" className={`i-icon${danger ? " i-danger" : ""}`} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      {children}
    </button>
  );
}

export function Group({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <fieldset className="i-group">
      <legend>{title}</legend>
      {action && <div className="i-group-action">{action}</div>}
      {children}
    </fieldset>
  );
}
