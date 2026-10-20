import { RENDER_URL } from "./supabase.ts";

export interface RenderResult {
  url: string;
  ms: number | null;
  bytes: number;
}

export class RenderError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
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
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; issues?: { path: (string | number)[]; message: string }[] };
    const issues = err.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new RenderError(err.error ?? `Render failed (${res.status})`, err.detail ?? issues);
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), ms: Number(res.headers.get("x-render-ms")) || null, bytes: blob.size };
}
