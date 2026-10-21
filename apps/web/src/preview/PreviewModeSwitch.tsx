import type { ReactNode } from "react";

/** Where the preview lives: beside the editor, in its own window, or out of the way. */
export type PreviewMode = "docked" | "window" | "hidden";

export const PREVIEW_KEY = "raseport.preview";

export function readPreviewMode(): PreviewMode {
  try {
    const v = localStorage.getItem(PREVIEW_KEY);
    return v === "window" || v === "hidden" ? v : "docked";
  } catch {
    return "docked"; // storage can be blocked
  }
}

export function writePreviewMode(mode: PreviewMode): void {
  try {
    localStorage.setItem(PREVIEW_KEY, mode);
  } catch {
    /* ignore: the choice just will not persist */
  }
}

const svg = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const OPTIONS: { value: PreviewMode; label: string; title: string; icon: ReactNode }[] = [
  { value: "docked", label: "Beside", title: "Show the preview beside the editor", icon: svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M13 4v16" /></>) },
  { value: "window", label: "Window", title: "Show the preview in its own window, so the editor gets the full width", icon: svg(<><rect x="3" y="5" width="13" height="12" rx="2" /><path d="M8 21h9a2 2 0 0 0 2-2V10" /></>) },
  { value: "hidden", label: "Hide", title: "Hide the preview to give the editor the full width", icon: svg(<><path d="M3 3l18 18" /><path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3.2 3.7M6.3 6.3A17 17 0 0 0 3 12s4 6 9 6a9.7 9.7 0 0 0 3.7-.7" /></>) },
];

export function PreviewModeSwitch({ mode, onChange }: { mode: PreviewMode; onChange: (m: PreviewMode) => void }) {
  return (
    <div className="theme-toggle preview-switch" role="radiogroup" aria-label="Preview placement">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={mode === o.value} title={o.title} onClick={() => onChange(o.value)}>
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
