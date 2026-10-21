export type EditorMode = "design" | "json";

export const MODE_KEY = "raseport.mode";

export function readMode(): EditorMode {
  try {
    return localStorage.getItem(MODE_KEY) === "design" ? "design" : "json";
  } catch {
    return "json"; // storage can be blocked
  }
}

export function writeMode(mode: EditorMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore: the choice just will not persist */
  }
}

/** Design (drag and drop) or JSON: two views of the same document. */
export function ModeSwitch({ mode, onChange }: { mode: EditorMode; onChange: (m: EditorMode) => void }) {
  return (
    <div className="theme-toggle mode-switch" role="radiogroup" aria-label="Editor mode">
      {(["design", "json"] as const).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => onChange(m)}>
          {m === "design" ? "Design" : "JSON"}
        </button>
      ))}
    </div>
  );
}
