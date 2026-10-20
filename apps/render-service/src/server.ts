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
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((o) => o.trim()),
});

const port = Number(process.env.PORT ?? 8787);
const server = serve({ fetch: app.fetch, port });
console.log(`render-service listening on :${port}`);

// Platforms send SIGTERM when scaling in or deploying: stop taking requests, let in-flight renders finish.
process.on("SIGTERM", () => {
  console.log("SIGTERM received, draining");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), Number(process.env.SHUTDOWN_GRACE_MS ?? 9_000)).unref();
});
