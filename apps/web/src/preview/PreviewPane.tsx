import type { ReactNode } from "react";
import { DataPanel } from "../DataPanel.tsx";
import { ProblemList } from "../ProblemList.tsx";
import type { Problem } from "../problems.ts";
import type { ViewerData, ViewerState } from "./protocol.ts";

export type PreviewTab = "preview" | "data";

export interface PreviewPaneProps {
  tab: PreviewTab;
  onTab: (t: PreviewTab) => void;
  pdfUrl: string | null;
  error: ViewerState["error"];
  missing: string[];
  data: ViewerData["data"];
  dataLoading: boolean;
  dataError: ViewerData["error"];
  onRefreshData: () => void;
  onJump: (p: Problem) => void;
  /** text shown while there is nothing to draw and nothing is missing */
  emptyHint: string;
  /** buttons at the right end of the tab bar */
  actions?: ReactNode;
}

/** The PDF preview and the Data tab. Used docked beside the editor and in the pop-out window. */
export function PreviewPane({ tab, onTab, pdfUrl, error, missing, data, dataLoading, dataError, onRefreshData, onJump, emptyHint, actions }: PreviewPaneProps) {
  return (
    <>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "preview"} onClick={() => onTab("preview")}>Preview</button>
        <button role="tab" aria-selected={tab === "data"} onClick={() => onTab("data")}>Data</button>
        <span className="spacer" />
        {actions}
      </div>
      <div className="preview-body" hidden={tab !== "preview"}>
        {error && (
          <div className="error-box">
            {error.problems.length ? <ProblemList problems={error.problems} onJump={onJump} /> : <strong>{error.message}</strong>}
            {error.detail && <pre>{error.detail}</pre>}
          </div>
        )}
        {pdfUrl ? <iframe title="Report preview" src={pdfUrl} /> : <p className="empty">{missing.length ? `Set ${missing.join(", ")} to render.` : emptyHint}</p>}
      </div>
      {tab === "data" && <DataPanel datasets={missing.length ? null : data} loading={dataLoading} error={dataError} onJump={onJump} onRefresh={onRefreshData} />}
    </>
  );
}
