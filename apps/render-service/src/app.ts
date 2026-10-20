import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateTypst } from "@raseport/render-core";
import { DefinitionError, parseDefinition, ZodError, type DatasetRows, type ParamValues, type ParsedReport } from "@raseport/schema";
import { fetchDatasets } from "./data.ts";
import { describeRows } from "./describe.ts";
import { BadRequest, resolveParams } from "./params.ts";
import { TypstError } from "./typst-runner.ts";

const SAMPLE_ROWS = 25;

export interface AppDeps {
  /** Client acting as the caller, so RLS applies. */
  clientFor(token: string): SupabaseClient;
  compile(source: string): Promise<Buffer>;
  /** Allow posting an inline definition (dev editor preview). */
  allowInlineDefinition: boolean;
  /** Browser origins allowed to call the service. */
  corsOrigins: string[];
}

export function supabaseClientFactory(url: string, anonKey: string) {
  return (token: string) =>
    createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  // Auth is a bearer token (no cookies), so an origin allow-list is enough.
  app.use("*", cors({ origin: deps.corsOrigins, allowHeaders: ["authorization", "content-type"], allowMethods: ["POST", "GET", "OPTIONS"], exposeHeaders: ["x-render-ms"] }));

  app.get("/healthz", (c) => c.text("ok"));

  /** Auth, load the definition (stored or inline), resolve params and fetch datasets, then hand off. */
  async function withReport(c: Context, run: (ctx: { def: ParsedReport; params: ParamValues; data: DatasetRows }) => Promise<Response>): Promise<Response> {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return c.json({ error: "Missing bearer token" }, 401);
    const client = deps.clientFor(token);
    const { data: user, error: authError } = await client.auth.getUser(token);
    if (authError || !user.user) return c.json({ error: "Invalid token" }, 401);

    try {
      const body = (await c.req.json()) as { reportId?: string; definition?: unknown; params?: Record<string, unknown> };
      let raw: unknown;
      if (body.reportId) {
        const { data, error } = await client.from("report_definitions").select("definition").eq("id", body.reportId).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return c.json({ error: "Report not found" }, 404); // also what RLS looks like
        raw = data.definition;
      } else if (body.definition && deps.allowInlineDefinition) {
        raw = body.definition;
      } else {
        throw new BadRequest("Provide reportId" + (deps.allowInlineDefinition ? " or definition" : ""));
      }

      const def = parseDefinition(raw);
      const params = resolveParams(def, body.params);
      const data = await fetchDatasets(client, def, params);
      return await run({ def, params, data });
    } catch (e) {
      if (e instanceof BadRequest) return c.json({ error: e.message, nodeId: e.nodeId }, 400);
      if (e instanceof ZodError) return c.json({ error: "Invalid report definition", issues: e.issues }, 422);
      if (e instanceof DefinitionError) return c.json({ error: e.message, issues: e.issues }, 422);
      if (e instanceof TypstError) return c.json({ error: "Render failed", detail: e.message }, 500);
      console.error(e);
      return c.json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
    }
  }

  app.post("/render", (c) =>
    withReport(c, async ({ def, params, data }) => {
      const t0 = Date.now();
      const pdf = await deps.compile(generateTypst(def, data, params));
      return new Response(new Uint8Array(pdf), {
        headers: {
          "x-render-ms": String(Date.now() - t0),
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="${def.name.replace(/[^\w.-]+/g, "_")}.pdf"`,
        },
      });
    }),
  );

  /** Sample rows and addressable columns per dataset, so authors can see real field paths. */
  app.post("/data", (c) =>
    withReport(c, async ({ def, data }) =>
      c.json({
        datasets: def.datasets.map((ds) => {
          const rows = data[ds.id] ?? [];
          return { id: ds.id, total: rows.length, columns: describeRows(rows), sample: rows.slice(0, SAMPLE_ROWS) };
        }),
      }),
    ),
  );

  return app;
}
