import type { Problem } from "./problems.ts";
import { RENDER_URL } from "./supabase.ts";

export interface RenderResult {
  url: string;
  ms: number | null;
  bytes: number;
}

export class RenderError extends Error {
  readonly detail: string | undefined;
  /** jumpable problems (issues, or the single dataset/node the error is about) */
  readonly problems: Problem[];
  constructor(message: string, detail?: string, problems: Problem[] = []) {
    super(message);
    this.detail = detail;
    this.problems = problems;
  }
}

interface ErrorBody {
  error?: string;
  detail?: string;
  nodeId?: string;
  issues?: { path?: (string | number)[]; message: string; nodeId?: string }[];
}

async function toRenderError(res: Response, fallback: string): Promise<RenderError> {
  const err = (await res.json().catch(() => ({}))) as ErrorBody;
  const message = err.error ?? `${fallback} (${res.status})`;
  const problems: Problem[] = err.issues?.length
    ? err.issues.map((i) => ({ message: i.path ? `${i.path.join(".")}: ${i.message}` : i.message, path: i.path, nodeId: i.nodeId }))
    : err.nodeId
      ? [{ message, nodeId: err.nodeId }]
      : [];
  return new RenderError(message, err.detail, problems);
}

export async function renderPdf(
  body: { definition?: unknown; reportId?: string; params: Record<string, unknown> },
  token: string,
  signal: AbortSignal,
): Promise<RenderResult> {
  const res = await fetch(`${RENDER_URL}/render`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toRenderError(res, "Render failed");
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), ms: Number(res.headers.get("x-render-ms")) || null, bytes: blob.size };
}

export interface DatasetInfo {
  id: string;
  total: number;
  columns: { path: string; type: string; example: unknown }[];
  sample: Record<string, unknown>[];
}

export async function fetchData(body: { definition: unknown; params: Record<string, unknown> }, token: string, signal: AbortSignal): Promise<DatasetInfo[]> {
  const res = await fetch(`${RENDER_URL}/data`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toRenderError(res, "Data request failed");
  const json = (await res.json()) as { datasets?: DatasetInfo[] };
  return json.datasets ?? [];
}
