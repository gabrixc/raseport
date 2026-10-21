# raseport

Typst-based reports and statistics from Supabase data. Report layouts are JSON definitions
(`@raseport/schema`); a small container running native Typst renders them to PDF.

```
packages/schema          Zod schema for report definitions (bands -> 12-col rows -> blocks)
packages/render-core     definition + data -> Typst source (pure, tested)
apps/web                 Dev editor: React + Vite+, Monaco with the JSON Schema, live PDF preview
apps/render-service      Hono service: JWT passthrough (RLS), RPC fetch, native `typst compile`
supabase/migrations      report_definitions table (RLS), demo sales table, report_sales_by_region RPC, report_catalog()
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

## Designer (drag and drop, for non-technical authors)

Switch **Design | JSON** in the editor header. Both views edit the same document, so changes show up in both,
and Ctrl+Z / Ctrl+Shift+Z (or the Undo / Redo buttons) step through one shared history.

- **Palette** (Text, KPI, Chart, Table, Divider, Space, Page break, + Section): drag a block onto the page, or click to add it at the end.
  Drop on a gap between rows for a new row, on a cell's left or right edge to place blocks side by side, or on the top or bottom of
  a block to insert before or after it in that column. A drop away from the page does nothing.
- **Move** a block by its tag (top-left on hover) and a row by its ⋮⋮ tab. Drag the boundary between two columns to resize them.
  The inspector also has move up / down buttons, and Delete, Ctrl+D (duplicate) and Esc work on the selection.
- **Canvas** draws the real data with the same formatting, aggregation and chart code as the PDF, so what you see is what prints.
- **Inspector** (below the canvas) has a plain-language form for whatever is selected. Nothing to select shows the report settings:
  data sources and parameters first, then page, colors, language and currency.
- **Data sources** are picked by name. The list comes from the database's `report_catalog()`, which lists every `report_*` function
  with its arguments; pick one and the parameters it needs are created and mapped for you. Give a function a friendly name with
  `comment on function report_x(...) is 'Sales by region for a month';`.
- **Room to work:** the **Beside | Window | Hide** switch in the toolbar decides where the PDF preview and the Data tab live. *Window* opens them in
  their own browser window (it stays live: it updates as you edit, and its Render button, Refresh and problem links drive the editor), which gives the
  designer the full width. Closing that window puts the preview back beside the editor, and the choice is remembered. When the designer is wide enough,
  the inspector becomes a side panel so the canvas keeps its full height; when it is narrow it sits below. Allow pop-ups for the site for *Window* to work.
- New tables, charts and KPIs start with real columns (a chart picks a category with few distinct values).
- **New** starts a blank report.

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
- **Remove** deletes a dataset, param, band or block (blocks leave no empty rows behind). Anything that still used a removed dataset or param is listed and shows up as a clickable problem. Ctrl+Z undoes a removal.
- **Data** tab shows each dataset's real columns, including nested jsonb paths (click one to copy it), and sample rows.
- **Autocomplete** suggests real column paths (including nested jsonb) for `field`, `x`, `groupBy` and series fields, plus dataset ids and param names. Column lists come from the Data tab's loaded datasets (or the dataset's declared `columns` when no data is loaded).
- **Hover a squiggle** for a specific message plus a short explanation; hover any field name (`groupBy`, `aggregate`, `span`, dataset `args`, ...) for what it does.
- **Click a problem to jump** to it: JSON syntax errors, schema and reference errors, and server-side dataset errors all select the offending spot in the editor.
- **Format** pretty-prints the JSON; **Ctrl+S** saves to `report_definitions` (row-level security applies).
- An unsaved draft is kept in the browser across reloads.
- The sun / moon / monitor switch picks light, dark or follow-the-OS theme (Monaco follows too). The choice is remembered, and an inline script in `index.html` applies it before first paint so there is no flash.

The service must allow the editor's origin (`CORS_ORIGINS`, default `http://localhost:5173`) and
`ALLOW_INLINE_DEFINITION=true` for unsaved previews and the Data tab.
