import { useEffect, useMemo, useRef, useState } from "react";
import type { Problem } from "../problems.ts";
import { PreviewPane, type PreviewTab } from "./PreviewPane.tsx";
import { channelName, isToViewer, type ToMain, type ViewerData, type ViewerState } from "./protocol.ts";

const EMPTY_DATA: ViewerData = { data: null, loading: false, error: null };

/** The preview window: shows what the editor window sends, and asks it to re-render or jump to a problem. */
export function PopoutViewer({ sid }: { sid: string }) {
  const [state, setState] = useState<ViewerState | null>(null);
  const [data, setData] = useState<ViewerData>(EMPTY_DATA);
  const [tab, setTab] = useState<PreviewTab>("preview");
  const [connected, setConnected] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);

  const send = (m: ToMain) => channel.current?.postMessage(m);

  useEffect(() => {
    document.title = "Report preview";
    const ch = new BroadcastChannel(channelName(sid));
    channel.current = ch;
    ch.onmessage = (e: MessageEvent) => {
      if (!isToViewer(e.data)) return;
      const m = e.data;
      if (m.t === "close") return window.close();
      if (m.t === "mainClosed") return setConnected(false);
      setConnected(true);
      if (m.t === "state") setState(m.state);
      if (m.t === "data") setData(m.data);
    };
    ch.postMessage({ t: "hello" } satisfies ToMain);
    // Keep asking until the editor answers (it may still be loading, or have been reloaded).
    const retry = setInterval(() => ch.postMessage({ t: "hello" } satisfies ToMain), 2000);
    const bye = () => ch.postMessage({ t: "closed" } satisfies ToMain);
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(retry);
      window.removeEventListener("pagehide", bye);
      ch.close();
    };
  }, [sid]);

  // Each PDF arrives as a Blob; give it a URL for the iframe and free the previous one.
  const pdfUrl = useMemo(() => (state?.pdf ? URL.createObjectURL(state.pdf) : null), [state?.pdf]);
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  const jump = (problem: Problem) => send({ t: "jump", problem });

  return (
    <div className="popout">
      <header className="popout-head">
        <strong>Report preview</strong>
        <span className="note">{state?.status === "rendering" ? "Rendering…" : state?.ms ? `${state.ms} ms · ${(state.bytes / 1024).toFixed(0)} KB` : ""}</span>
        <span className="spacer" />
        <button onClick={() => send({ t: "render" })} disabled={!connected || state?.status === "rendering" || (state?.missing.length ?? 0) > 0}>Render</button>
      </header>
      {!connected && (
        <p className="popout-banner">
          {state ? "The editor window was closed or reloaded. Waiting for it…" : "Waiting for the editor window… If you opened this window by hand, use “Open in new window” in the editor instead."}
        </p>
      )}
      <div className="popout-body">
        <PreviewPane
          tab={tab}
          onTab={setTab}
          pdfUrl={pdfUrl}
          error={state?.error ?? null}
          missing={state?.missing ?? []}
          data={data.data}
          dataLoading={data.loading}
          dataError={data.error}
          onRefreshData={() => send({ t: "refreshData" })}
          onJump={jump}
          emptyHint="Nothing rendered yet. Fix any problems in the editor window."
        />
      </div>
    </div>
  );
}
