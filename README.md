# raseport

Typst-based reports and statistics from Supabase data. Report layouts are JSON definitions
(`@raseport/schema`); a small container running native Typst renders them to PDF.

```
packages/schema          Zod schema for report definitions (bands -> 12-col rows -> blocks)
packages/render-core     definition + data -> Typst source (pure, tested)
apps/web                 Dev editor: React + Vite+, Monaco with the JSON Schema, live PDF preview
apps/render-service      Hono service: JWT passthrough (RLS), RPC fetch, native `typst compile`
supabase/migrations      report_definitions table (RLS), demo sales table, report_sales_by_region RPC
examples/                sample definition
docs/                    spike notes (why a container, not an Edge Function)
```

Rules: data sources are Postgres RPCs named `report_*` that return a deterministic order
(the service pages through them, 1000 rows at a time). Data and text enter Typst only as escaped string literals.

## Run locally

```bash
pnpm install && pnpm test
npx supabase start && npx supabase db reset      # applies migrations + seeds 2000 orders
docker build -t raseport-render .
docker run --network host -e SUPABASE_URL=http://127.0.0.1:55321 \
  -e SUPABASE_ANON_KEY="$(npx supabase status -o env | grep ^ANON_KEY | cut -d'"' -f2)" \
  -e ALLOW_INLINE_DEFINITION=true raseport-render
```

`POST /render` with `Authorization: Bearer <user JWT>` and `{ "reportId": "...", "params": { "month": "2026-01-01" } }`
(or an inline `definition` when `ALLOW_INLINE_DEFINITION=true`, for the dev editor preview).

## Dev editor

```bash
cp apps/web/.env.example apps/web/.env.local     # fill in VITE_SUPABASE_ANON_KEY (npx supabase status)
(cd apps/render-service && ALLOW_INLINE_DEFINITION=true SUPABASE_URL=... SUPABASE_ANON_KEY=... node src/server.ts)
pnpm --filter @raseport/web dev                  # http://localhost:5173
```

Sign in (or create an account), edit the JSON on the left (autocomplete and validation come from the
shared schema), set the report params, and the PDF preview refreshes as you type. Save/open uses the
`report_definitions` table, so row-level security applies. The service must allow the editor's origin
(`CORS_ORIGINS`, default `http://localhost:5173`) and `ALLOW_INLINE_DEFINITION=true` for unsaved previews.
