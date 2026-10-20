# raseport

Typst-based reports and statistics from Supabase data. Report layouts are JSON definitions
(`@raseport/schema`); a small container running native Typst renders them to PDF.

```
packages/schema          Zod schema for report definitions (bands -> 12-col rows -> blocks)
packages/render-core     definition + data -> Typst source (pure, tested)
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
