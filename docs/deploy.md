# Deploying the render service

The render service is a stateless container: Node plus the native Typst binary. It is called by the
editor (and later by schedulers) with a user's Supabase JWT, reads data from Supabase with that JWT
(so row-level security applies) and returns a PDF.

## Recommendation: Google Cloud Run

Supabase Edge Functions cannot host it (see [phase0-edge-function-spike.md](phase0-edge-function-spike.md)), so it
needs a container host. Cloud Run fits this workload best:

| Need | Why Cloud Run fits |
|---|---|
| Bursty, mostly idle (a report is rendered a few times an hour) | scales to zero, pay per request |
| CPU-bound request/response (about 2 s of one core per render) | scales out on concurrency with no machine management |
| Stateless, no volumes | exactly its model |
| Browser callers with their own auth | public HTTPS URL, our own JWT check, CORS allow-list |

Measured with the production image, 2,000 rows, local machine: 439 MB image, 0.6 s from container start to healthy,
about 1.8 s per render, about 320 MiB peak memory, 4 concurrent renders in 2.2-2.9 s. Hence the instance size
in the script: **2 vCPU, 1 GiB, concurrency 2**.

Alternatives, if you prefer:

- **Fly.io**: cheapest always-on, simple `fly.toml`. It starts and stops machines you have already created but does not
  create new ones under load, so you size capacity by hand. Good if you want one or two always-on machines.
- **Railway / Render**: simplest dashboard deploy from the Dockerfile, flat monthly cost, always on. Fine for a first
  deployment; no scale-to-zero or per-request scaling.

Check current pricing for your region before committing; at this load all three should be small, but I have not verified
current prices.

## One-time setup

1. Create a GCP project with billing, and install the [gcloud CLI](https://cloud.google.com/sdk/docs/install).
2. `gcloud auth login` and `gcloud config set project YOUR_PROJECT`.
3. Enable the APIs: `gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com`.
4. Pick the region closest to your Supabase project. Each 1,000 rows is one round trip to Supabase, so distance adds up.

## Deploy

```bash
PROJECT_ID=my-project REGION=europe-west1 \
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon or publishable key> \
CORS_ORIGINS=https://reports.example.com \
./deploy/cloudrun/deploy.sh
```

Add `DRY_RUN=1` to print the `gcloud` command first. The script builds the root `Dockerfile` with Cloud Build, so no local
Docker is needed. It prints the service URL at the end.

**Not tested end to end**: I could only validate the script's syntax, its input checks and its dry-run output, because
`gcloud` and a GCP account were not available. Expect to fix small things on the first real run.

Then set `VITE_RENDER_URL` in the editor's build to that URL and add the editor's origin to `CORS_ORIGINS`.

## Settings

| Variable | Default in `deploy.sh` | Notes |
|---|---|---|
| `SUPABASE_ANON_KEY` | required | The public key. The script refuses a service-role or secret key. Never give the service a key that bypasses RLS. |
| `CORS_ORIGINS` | required | Exact browser origins, comma-separated. |
| `ALLOW_INLINE_DEFINITION` | `false` | `true` lets any signed-in user render an unsaved definition (the editor's live preview and Data tab). They can only call `report_*` RPCs as themselves, but each render costs CPU. Use `true` for an editor environment, `false` for a viewer-only one that renders stored reports by id. |
| `MIN_INSTANCES` | `0` | `1` removes cold starts (a few seconds, mostly image pull) at a constant cost. |
| `MAX_INSTANCES` | `5` | Caps cost and the load placed on Supabase. |
| `MAX_CONCURRENCY` / `--concurrency` | `2` | Keep equal to the CPU count. |

## Why the service is public

The service checks the caller's Supabase JWT before doing any work and runs every query as that user, so Cloud Run IAM
is left open (`--allow-unauthenticated`). A request without a valid token returns 401 without touching the database or
Typst. A signed-in user can still make requests that cost CPU, which is what `MAX_INSTANCES`, the per-request timeout
(`RENDER_TIMEOUT_MS`) and the 1 MiB body limit bound. Add a GCP budget alert too.

## Operations

- **Logs**: one line per request (method, path, status, time); no headers or bodies.
- **Health**: `GET /healthz` returns `ok` (the image also has a Docker `HEALTHCHECK`).
- **Shutdown**: on `SIGTERM` the service stops accepting requests and finishes in-flight renders, for up to
  `SHUTDOWN_GRACE_MS` (default 9 s, matching Cloud Run's 10 s).
- **Updating Typst**: bump `TYPST_VERSION` and `TYPST_SHA256` in the `Dockerfile` together; the build fails if the
  checksum does not match.

## Hosting the editor

`apps/web` is a static bundle (`pnpm --filter @raseport/web build`, output in `apps/web/dist`). Host it on any static
host (Cloudflare Pages, Netlify, Vercel, Cloud Storage), with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and
`VITE_RENDER_URL` set at build time. Its URL goes in `CORS_ORIGINS`.
