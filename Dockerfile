FROM node:24-slim AS base
ARG TYPST_VERSION=0.15.1
RUN apt-get update && apt-get install -y --no-install-recommends curl xz-utils ca-certificates \
 && curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
  | tar -xJ -C /usr/local/bin --strip-components=1 "typst-x86_64-unknown-linux-musl/typst" \
 && apt-get purge -y curl xz-utils && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/schema packages/schema
COPY packages/render-core packages/render-core
COPY apps/render-service apps/render-service
RUN pnpm install --frozen-lockfile --filter @raseport/render-service...

ENV NODE_ENV=production PORT=8787
USER node
EXPOSE 8787
CMD ["node", "apps/render-service/src/server.ts"]
