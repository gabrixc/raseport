# Render service: Node (runs the TypeScript directly via type stripping) + native Typst.
# Multi-stage so the final image has no package-manager caches, curl or build tools.

# --- Typst binary, checksum-verified ---------------------------------------------
FROM node:24-slim AS typst
ARG TYPST_VERSION=0.15.1
# sha256 of typst-x86_64-unknown-linux-musl.tar.xz for TYPST_VERSION (matches GitHub's published asset digest)
ARG TYPST_SHA256=a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c
RUN apt-get update && apt-get install -y --no-install-recommends curl xz-utils ca-certificates \
 && curl -fsSL -o /tmp/typst.tar.xz "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
 && echo "${TYPST_SHA256}  /tmp/typst.tar.xz" | sha256sum -c - \
 && mkdir /out && tar -xJf /tmp/typst.tar.xz -C /out --strip-components=1 "typst-x86_64-unknown-linux-musl/typst"

# --- Production dependencies -------------------------------------------------------
FROM node:24-slim AS deps
RUN corepack enable
WORKDIR /app
# manifests first so the install layer is cached until dependencies change
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/schema/package.json packages/schema/
COPY packages/render-core/package.json packages/render-core/
COPY apps/render-service/package.json apps/render-service/
RUN pnpm install --frozen-lockfile --prod --filter @raseport/render-service...
COPY packages/schema packages/schema
COPY packages/render-core packages/render-core
COPY apps/render-service apps/render-service

# --- Runtime -----------------------------------------------------------------------
FROM node:24-slim
COPY --from=typst /out/typst /usr/local/bin/typst
WORKDIR /app
COPY --from=deps /app /app
ENV NODE_ENV=production PORT=8787
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/render-service/src/server.ts"]
