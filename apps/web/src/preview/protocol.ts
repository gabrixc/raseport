import type { Problem } from "../problems.ts";
import type { DatasetInfo } from "../render.ts";

/** Everything the preview window needs to draw the PDF side. */
export interface ViewerState {
  pdf: Blob | null;
  /** which render the PDF is; a copy of the same render keeps its id, so the viewer need not reload it */
  pdfId: number;
  ms: number | null;
  bytes: number;
  status: "idle" | "rendering";
  error: { message: string; detail?: string | undefined; problems: Problem[] } | null;
  /** required params that are still empty, so nothing can render yet */
  missing: string[];
}

/** Everything it needs for the Data tab. */
export interface ViewerData {
  data: DatasetInfo[] | null;
  loading: boolean;
  error: { message: string; problems: Problem[] } | null;
}

/** editor window -> preview window */
export type ToViewer = { t: "state"; state: ViewerState } | { t: "data"; data: ViewerData } | { t: "mainClosed" } | { t: "close" };

/** preview window -> editor window. The editor stays the single source of truth; the viewer only asks. */
export type ToMain = { t: "hello" } | { t: "render" } | { t: "refreshData" } | { t: "jump"; problem: Problem } | { t: "closed" };

export const POPOUT_NAME = "raseport-preview";
export const SID_KEY = "raseport.sid";

export const channelName = (sid: string): string => `raseport-preview:${sid}`;

export function popoutUrl(sid: string, base: string = location.href): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("popout", "preview");
  url.searchParams.set("sid", sid);
  return url.toString();
}

/** Is this page the preview window? Returns its pairing id if so. */
export function readPopout(search: string = location.search): { sid: string } | null {
  const q = new URLSearchParams(search);
  const sid = q.get("sid");
  return q.get("popout") === "preview" && sid && /^[\w-]{8,64}$/.test(sid) ? { sid } : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

/** Messages cross a channel any same-origin page can write to, so check their shape before trusting them. */
export function isToMain(v: unknown): v is ToMain {
  if (!isObj(v)) return false;
  switch (v.t) {
    case "hello":
    case "render":
    case "refreshData":
    case "closed":
      return true;
    case "jump":
      return isObj(v.problem) && typeof v.problem.message === "string";
    default:
      return false;
  }
}

export function isToViewer(v: unknown): v is ToViewer {
  if (!isObj(v)) return false;
  return v.t === "mainClosed" || v.t === "close" || (v.t === "state" && isObj(v.state)) || (v.t === "data" && isObj(v.data));
}
