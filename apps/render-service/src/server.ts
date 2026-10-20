import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { createApp, supabaseClientFactory } from "./app.ts";
import { createRunner } from "./typst-runner.ts";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

const app = createApp({
  clientFor: supabaseClientFactory(need("SUPABASE_URL"), need("SUPABASE_ANON_KEY")),
  compile: createRunner({
    bin: process.env.TYPST_BIN ?? "typst",
    fontDir: process.env.FONT_DIR ?? fileURLToPath(new URL("../fonts", import.meta.url)),
    timeoutMs: Number(process.env.RENDER_TIMEOUT_MS ?? 30_000),
    maxConcurrent: Number(process.env.MAX_CONCURRENCY ?? 4),
  }),
  allowInlineDefinition: process.env.ALLOW_INLINE_DEFINITION === "true",
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`render-service listening on :${port}`);
