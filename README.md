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
deploy/                  Cloud Run deploy script
docs/                    spike notes (why a container) and deploy guide (docs/deploy.md)
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

Node runs the service's TypeScript directly (type stripping), so `erasableSyntaxOnly` is on: no enums or constructor parameter properties.

Run these from the repo root, with the local Supabase stack up (`npx supabase start && npx supabase db reset`).

```bash
# 1. editor config (writes the anon key for you)
printf 'VITE_SUPABASE_URL=http://127.0.0.1:55321\nVITE_SUPABASE_ANON_KEY=%s\nVITE_RENDER_URL=http://localhost:8788\n' \
  "$(npx supabase status -o env | grep ^ANON_KEY | cut -d'"' -f2)" > apps/web/.env.local

# 2. render service on :8788 (needs `typst` on PATH, or use the Docker image)
(cd apps/render-service && PORT=8788 ALLOW_INLINE_DEFINITION=true SUPABASE_URL=http://127.0.0.1:55321 \
  SUPABASE_ANON_KEY="$(cd ../.. && npx supabase status -o env | grep ^ANON_KEY | cut -d'"' -f2)" node src/server.ts)

# 3. the editor (another terminal): http://localhost:5173
pnpm --filter @raseport/web dev
```

Sign in (or create an account), edit the JSON on the left (autocomplete and validation come from the
shared schema) and set the report params; the PDF preview refreshes as you type.

- **Insert** adds a block (as a new row in the last body band), band, dataset or param, with a fresh id.
- **Data** tab shows each dataset's real columns, including nested jsonb paths (click one to copy it), and sample rows.
- **Autocomplete** suggests real column paths (including nested jsonb) for `field`, `x`, `groupBy` and series fields, plus dataset ids and param names. Column lists come from the Data tab's loaded datasets (or the dataset's declared `columns` when no data is loaded).
- **Click a problem to jump** to it: JSON syntax errors, schema and reference errors, and server-side dataset errors all select the offending spot in the editor.
- **Format** pretty-prints the JSON; **Ctrl+S** saves to `report_definitions` (row-level security applies).
- An unsaved draft is kept in the browser across reloads.

The service must allow the editor's origin (`CORS_ORIGINS`, default `http://localhost:5173`) and
`ALLOW_INLINE_DEFINITION=true` for unsaved previews and the Data tab.
