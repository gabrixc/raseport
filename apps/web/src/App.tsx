import Editor from "@monaco-editor/react";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseDefinition, type ParsedReport } from "@raseport/schema";
import exampleJson from "../../../examples/sales-report.json?raw";
import { Login } from "./Login.tsx";
import "./monaco.ts";
import { renderPdf, RenderError, type RenderResult } from "./render.ts";
import { configured, supabase } from "./supabase.ts";

type Saved = { id: string; name: string; updated_at: string };

function check(text: string): { def: ParsedReport | null; error: string | null } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { def: null, error: `JSON: ${(e as Error).message}` };
  }
  try {
    return { def: parseDefinition(json), error: null };
  } catch (e) {
    const err = e as { issues?: { path: (string | number)[]; message: string }[]; message: string };
    return { def: null, error: err.issues ? err.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n") : err.message };
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
  const [text, setText] = useState(exampleJson);
  const [params, setParams] = useState<Record<string, string | boolean>>({});
  const [auto, setAuto] = useState(true);
  const [status, setStatus] = useState<"idle" | "rendering">("idle");
  const [result, setResult] = useState<RenderResult | null>(null);
  const [renderError, setRenderError] = useState<{ message: string; detail?: string | undefined } | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const lastUrl = useRef<string | null>(null);

  const { def, error: definitionError } = useMemo(() => check(text), [text]);

  // Fill in declared defaults for params the user has not touched.
  const effectiveParams = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const p of def?.params ?? []) out[p.name] = params[p.name] ?? p.default ?? "";
    return out;
  }, [def, params]);

  const missing = useMemo(() => (def?.params ?? []).filter((p) => p.required && (effectiveParams[p.name] === "" || effectiveParams[p.name] === undefined)).map((p) => p.name), [def, effectiveParams]);

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
      setRenderError({ message: (e as Error).message, detail: e instanceof RenderError ? e.detail : undefined });
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
        <select value={currentId ?? ""} onChange={(e) => open(e.target.value)} aria-label="Saved reports">
          <option value="">Unsaved / example</option>
          {saved.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button onClick={save} disabled={!def}>{currentId ? "Save" : "Save as new"}</button>
        <span className="spacer" />
        {note && <span className="note">{note}</span>}
        <span className="note">{session.user.email}</span>
        <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <div className="toolbar">
        {(def?.params ?? []).map((p) => (
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
        <label className="inline"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Live preview</label>
        <button onClick={render} disabled={!def || missing.length > 0 || status === "rendering"}>{status === "rendering" ? "Rendering…" : "Render"}</button>
        {result && <span className="note">{result.ms ?? "?"} ms · {(result.bytes / 1024).toFixed(0)} KB</span>}
      </div>

      <main>
        <section className="pane">
          <Editor
            path="report.json"
            language="json"
            value={text}
            onChange={(v: string | undefined) => setText(v ?? "")}
            options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false, automaticLayout: true }}
            theme="vs-dark"
          />
          {definitionError && <pre className="problems">{definitionError}</pre>}
        </section>
        <section className="pane preview">
          {renderError && (
            <div className="error-box">
              <strong>{renderError.message}</strong>
              {renderError.detail && <pre>{renderError.detail}</pre>}
            </div>
          )}
          {result ? <iframe title="Report preview" src={result.url} /> : <p className="empty">{missing.length ? `Set ${missing.join(", ")} to render.` : "Fix any problems on the left, then Render."}</p>}
        </section>
      </main>
    </div>
  );
}
