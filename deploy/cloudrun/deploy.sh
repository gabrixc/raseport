#!/usr/bin/env bash
# Deploy the render service to Google Cloud Run, building the root Dockerfile with Cloud Build.
#
#   PROJECT_ID=my-project REGION=europe-west1 \
#   SUPABASE_URL=https://xyzcompany.supabase.co SUPABASE_ANON_KEY=... \
#   CORS_ORIGINS=https://reports.example.com \
#   ./deploy/cloudrun/deploy.sh
#
# Set DRY_RUN=1 to print the command without running it. See docs/deploy.md.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID (GCP project)}"
: "${REGION:?set REGION (pick the one closest to your Supabase project)}"
: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY (the public anon/publishable key, not the service-role key)}"
: "${CORS_ORIGINS:?set CORS_ORIGINS (comma-separated browser origins allowed to call the service)}"

SERVICE="${SERVICE:-raseport-render}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"     # 1 removes cold starts for the editor preview, at a constant cost
MAX_INSTANCES="${MAX_INSTANCES:-5}"     # caps cost and load on Supabase
ALLOW_INLINE_DEFINITION="${ALLOW_INLINE_DEFINITION:-false}"  # true is needed for the dev editor's unsaved preview

case "$SUPABASE_ANON_KEY" in
  *service_role*|sb_secret_*) echo "SUPABASE_ANON_KEY looks like a secret key; use the anon/publishable key." >&2; exit 1 ;;
esac

# The service authenticates every request with the caller's Supabase JWT, and its role is
# the caller's, so Row Level Security applies. Cloud Run IAM is therefore left open.
# ^;^ switches the env-var delimiter so CORS_ORIGINS can contain commas.
ARGS=(
  run deploy "$SERVICE"
  --project "$PROJECT_ID" --region "$REGION"
  --source .
  --allow-unauthenticated
  --cpu 2 --memory 1Gi --cpu-boost
  --concurrency 2            # one render is CPU-bound; keep this equal to MAX_CONCURRENCY below
  --timeout 60
  --min-instances "$MIN_INSTANCES" --max-instances "$MAX_INSTANCES"
  --set-env-vars "^;^SUPABASE_URL=${SUPABASE_URL};SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY};CORS_ORIGINS=${CORS_ORIGINS};ALLOW_INLINE_DEFINITION=${ALLOW_INLINE_DEFINITION};MAX_CONCURRENCY=2;RENDER_TIMEOUT_MS=30000"
)

if [ "${DRY_RUN:-}" = "1" ]; then
  printf 'gcloud'; printf ' %q' "${ARGS[@]}"; printf '\n'
  exit 0
fi

command -v gcloud >/dev/null || { echo "gcloud is not installed: https://cloud.google.com/sdk/docs/install" >&2; exit 1; }
cd "$(dirname "$0")/../.."
gcloud "${ARGS[@]}"
echo "Service URL:"
gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)'
