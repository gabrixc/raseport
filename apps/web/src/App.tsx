import Editor from "@monaco-editor/react";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import exampleJson from "../../../examples/sales-report.json?raw";
import { DataPanel } from "./DataPanel.tsx";
import { INSERT_LABELS, insertItem, type InsertKind } from "./insert.ts";
import { Designer } from "./designer/Designer.tsx";
import { Login } from "./Login.tsx";
import { ModeSwitch, readMode, writeMode, type EditorMode } from "./ModeSwitch.tsx";
import { listRemovable, removeItem, type RemoveGroup } from "./remove.ts";
import { check, lenientParams } from "./check.ts";
import { locateProblem } from "./locate.ts";
import { setCompletionDatasets } from "./monaco.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { useTheme } from "./ThemeProvider.tsx";
import { ProblemList } from "./ProblemList.tsx";
import type { Problem } from "./problems.ts";
import { fetchData, renderPdf, RenderError, type DatasetInfo, type RenderResult } from "./render.ts";
import { configured, supabase } from "./supabase.ts";

type Saved = { id: string; name: string; updated_at: string };

const DRAFT_KEY = "raseport.draft";
function loadDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null; // storage can be blocked; the editor still works without a draft
  }
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) return <p className="login">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env.local (see .env.example).</p>;
  if (session === undefined) return null;
  if (!session) return <Login />;
  return <Workspace session={session} />;
}

function Workspace({ session }: { session: Session }) {
  const { resolved: theme } = useTheme();
  const [text, setText] = useState(() => loadDraft() ?? exampleJson);
  const [tab, setTab] = useState<"preview" | "data">("preview");
  const [mode, setModeState] = useState<EditorMode>(readMode);
  const setMode = (next: EditorMode) => {
    setModeState(next);
    writeMode(next);
  };
  const [data, setData] = useState<DatasetInfo[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<{ message: string; problems: Problem[] } | null>(null);
  const dataAbort = useRef<AbortController | null>(null);
  const editorRef = useRef<Parameters<NonNullable<React.ComponentProps<typeof Editor>["onMount"]>>[0] | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const [params, setParams] = useState<Record<string, string | boolean>>({});
  const [auto, setAuto] = useState(true);
  const [status, setStatus] = useState<"idle" | "rendering">("idle");
  const [result, setResult] = useState<RenderResult | null>(null);
  const [renderError, setRenderError] = useState<{ message: string; detail?: string | undefined; problems: Problem[] } | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastUrl = useRef<string | null>(null);

  const { def, problems } = useMemo(() => check(text), [text]);
  // The params form must keep working while the definition has errors elsewhere.
  const paramInputs = useMemo(() => def?.params ?? lenientParams(text), [def, text]);

  // Fill in declared defaults for params the user has not touched.
  const effectiveParams = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const p of paramInputs) out[p.name] = params[p.name] ?? p.default ?? "";
    return out;
  }, [paramInputs, params]);

  const missing = useMemo(() => paramInputs.filter((p) => p.required && (effectiveParams[p.name] === "" || effectiveParams[p.name] === undefined)).map((p) => p.name), [paramInputs, effectiveParams]);

  const render = useCallback(async () => {
    if (!def || missing.length) return;
    abort.current?.abort();
    const ctrl = (abort.current = new AbortController());
    setStatus("rendering");
    try {
      const r = await renderPdf({ definition: JSON.parse(text), params: effectiveParams }, session.access_token, ctrl.signal);
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = r.url;
      setResult(r);
      setRenderError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setRenderError({ message: (e as Error).message, detail: e instanceof RenderError ? e.detail : undefined, problems: e instanceof RenderError ? e.problems : [] });
    } finally {
      if (abort.current === ctrl) setStatus("idle");
    }
  }, [def, missing, text, effectiveParams, session.access_token]);

  // Debounced live preview.
  useEffect(() => {
    if (!auto || !def || missing.length) return;
    const t = setTimeout(render, 900);
    return () => clearTimeout(t);
  }, [auto, def, missing, render]);

  const loadData = useCallback(async () => {
    if (!def || missing.length) return;
    dataAbort.current?.abort();
    const ctrl = (dataAbort.current = new AbortController());
    setDataLoading(true);
    try {
      setData(await fetchData({ definition: JSON.parse(text), params: effectiveParams }, session.access_token, ctrl.signal));
      setDataError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setDataError({ message: (e as Error).message, problems: e instanceof RenderError ? e.problems : [] });
    } finally {
      if (dataAbort.current === ctrl) setDataLoading(false);
    }
  }, [def, missing, text, effectiveParams, session.access_token]);

  // Load datasets in the background whenever what they depend on changes (not the layout), so the Data tab
  // and field-path completion are always current.
  const dataKey = def && !missing.length ? JSON.stringify([def.datasets, effectiveParams]) : null;
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  useEffect(() => {
    if (!dataKey) return;
    const t = setTimeout(() => void loadDataRef.current(), 600);
    return () => clearTimeout(t);
  }, [dataKey]);

  useEffect(() => {
    setCompletionDatasets((data ?? []).map((d) => ({ id: d.id, columns: d.columns })));
  }, [data]);

  /** Select the spot a problem is about and scroll it into view. */
  const jump = useCallback((p: Problem) => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!ed || !model) return;
    const t = locateProblem(model.getValue(), p);
    if (!t) return setNote("Could not find that spot in the JSON");
    const a = model.getPositionAt(t.offset);
    const b = model.getPositionAt(t.offset + t.length);
    const range = { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column };
    ed.setSelection(range);
    ed.revealRangeInCenter(range);
    ed.focus();
  }, []);

  // Keep an unsaved draft across reloads. Debounced while typing, and flushed when the page is hidden
  // or closed so the last edits are not lost.
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(DRAFT_KEY, textRef.current);
      } catch {
        /* ignore: drafts are a convenience */
      }
    };
    const t = setTimeout(flush, 500);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [text]);

  function insert(kind: InsertKind) {
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(text);
    } catch {
      return setNote("Fix the JSON before inserting.");
    }
    setText(JSON.stringify(insertItem(doc, kind), null, 2));
    setNote(`Inserted ${INSERT_LABELS[kind].toLowerCase()}`);
  }

  // Everything removable, read leniently so the menu works while the definition has errors elsewhere.
  const removable = useMemo(() => {
    try {
      return listRemovable(JSON.parse(text));
    } catch {
      return [];
    }
  }, [text]);

  function remove(index: number) {
    const item = removable[index];
    if (!item) return;
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(text);
    } catch {
      return setNote("Fix the JSON before removing.");
    }
    const result = removeItem(doc, item.target);
    if (!result) return setNote("That item no longer exists.");
    setText(JSON.stringify(result.doc, null, 2));
    setNote(`Removed ${result.removed}${result.dangling.length ? `; still used by ${result.dangling.join(", ")}` : ""}. Ctrl+Z undoes it.`);
  }

  const loadList = useCallback(async () => {
    const { data } = await supabase.from("report_definitions").select("id,name,updated_at").order("updated_at", { ascending: false });
    setSaved((data as Saved[] | null) ?? []);
  }, []);
  useEffect(() => void loadList(), [loadList]);

  async function save() {
    if (!def) return;
    const row = { name: def.name, definition: JSON.parse(text), updated_at: new Date().toISOString() };
    const q = currentId ? supabase.from("report_definitions").update(row).eq("id", currentId).select("id").single() : supabase.from("report_definitions").insert(row).select("id").single();
    const { data, error } = await q;
    if (error) return setNote(`Save failed: ${error.message}`);
    setCurrentId((data as { id: string }).id);
    setNote(`Saved "${def.name}"`);
    loadList();
  }

  saveRef.current = save;

  async function open(id: string) {
    if (!id) {
      setCurrentId(null);
      return;
    }
    const { data, error } = await supabase.from("report_definitions").select("definition").eq("id", id).single();
    if (error) return setNote(`Open failed: ${error.message}`);
    setText(JSON.stringify((data as { definition: unknown }).definition, null, 2));
    setCurrentId(id);
    setNote(null);
  }

  return (
    <div className="app">
      <header>
        <strong>Report editor</strong>
        <ModeSwitch mode={mode} onChange={setMode} />
        <select value={currentId ?? ""} onChange={(e) => open(e.target.value)} aria-label="Saved reports">
          <option value="">Unsaved / example</option>
          {saved.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button onClick={save} disabled={!def}>{currentId ? "Save" : "Save as new"}</button>
        {mode === "json" && <>
        <select value="" onChange={(e) => e.target.value && insert(e.target.value as InsertKind)} aria-label="Insert">
          <option value="">Insert…</option>
          <optgroup label="Block (new row)">
            {(["text", "kpi", "chart", "table", "divider", "spacer", "pageBreak"] as const).map((k) => <option key={k} value={k}>{INSERT_LABELS[k]}</option>)}
          </optgroup>
          <optgroup label="Structure">
            {(["band", "dataset", "param"] as const).map((k) => <option key={k} value={k}>{INSERT_LABELS[k]}</option>)}
          </optgroup>
        </select>
        <select
          value=""
          onChange={(e) => e.target.value !== "" && remove(Number(e.target.value))}
          disabled={removable.length === 0}
          aria-label="Remove"
        >
          <option value="">Remove…</option>
          {(["Datasets", "Params", "Bands", "Blocks"] as RemoveGroup[]).map((group) => {
            const items = removable.map((item, index) => ({ item, index })).filter(({ item }) => item.group === group);
            return items.length ? (
              <optgroup key={group} label={group}>
                {items.map(({ item, index }) => <option key={index} value={index}>{item.label}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        <button className="secondary" onClick={() => editorRef.current?.getAction("editor.action.formatDocument")?.run()}>Format</button>
        </>}
        <span className="spacer" />
        {note && <span className="note">{note}</span>}
        <ThemeToggle />
        <span className="note">{session.user.email}</span>
        <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <div className="toolbar">
        {paramInputs.map((p) => (
          <label key={p.name}>
            {p.name}
            {p.type === "bool" ? (
              <input type="checkbox" checked={params[p.name] === true} onChange={(e) => setParams({ ...params, [p.name]: e.target.checked })} />
            ) : (
              <input
                type={p.type === "date" ? "date" : p.type === "number" ? "number" : "text"}
                value={String(params[p.name] ?? p.default ?? "")}
                onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}
              />
            )}
          </label>
        ))}
        <span className="spacer" />
        {problems.length > 0 && <span className="note warn">Preview paused: {problems.length} problem{problems.length > 1 ? "s" : ""} in the JSON</span>}
        <label className="inline"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Live preview</label>
        <button onClick={render} disabled={!def || missing.length > 0 || status === "rendering"}>{status === "rendering" ? "Rendering…" : "Render"}</button>
        {result && <span className="note">{result.ms ?? "?"} ms · {(result.bytes / 1024).toFixed(0)} KB</span>}
      </div>

      <main>
        <section className="pane">
          <div className="json-pane" hidden={mode !== "json"}>
            <div className="editor-wrap">
              <Editor
                path="report.json"
                language="json"
                value={text}
                onChange={(v: string | undefined) => setText(v ?? "")}
                onMount={(ed, m) => {
                  editorRef.current = ed;
                  ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => saveRef.current());
                }}
                options={{ quickSuggestions: { strings: true, other: true, comments: false }, minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false, automaticLayout: true }}
                theme={theme === "dark" ? "vs-dark" : "vs"}
              />
            </div>
            {problems.length > 0 && (
              <div className="problems">
                <ProblemList problems={problems} onJump={jump} />
              </div>
            )}
          </div>
          {mode === "design" && (
            <Designer
              text={text}
              onChange={setText}
              data={missing.length ? null : data}
              dataLoading={dataLoading}
              params={effectiveParams}
              problems={problems}
              onSwitchToJson={() => setMode("json")}
              onShowProblem={(p) => {
                setMode("json");
                requestAnimationFrame(() => jump(p));
              }}
            />
          )}
        </section>
        <section className="pane preview">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>Preview</button>
            <button role="tab" aria-selected={tab === "data"} onClick={() => setTab("data")}>Data</button>
          </div>
          <div className="preview-body" hidden={tab !== "preview"}>
            {renderError && (
              <div className="error-box">
                {renderError.problems.length ? <ProblemList problems={renderError.problems} onJump={jump} /> : <strong>{renderError.message}</strong>}
                {renderError.detail && <pre>{renderError.detail}</pre>}
              </div>
            )}
            {result ? <iframe title="Report preview" src={result.url} /> : <p className="empty">{missing.length ? `Set ${missing.join(", ")} to render.` : "Fix any problems on the left, then Render."}</p>}
          </div>
          {tab === "data" && <DataPanel datasets={missing.length ? null : data} loading={dataLoading} error={dataError} onJump={jump} onRefresh={loadData} />}
        </section>
      </main>
    </div>
  );
}
