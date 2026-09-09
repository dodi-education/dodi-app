# syntax=docker/dockerfile:1.7
# @dodi/web (app.dodi.app) production image.
#
# Build context is the dodi-app repo ROOT (turbo prune needs the workspace):
#   docker build -f clients/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://platform.dodi.app \
#     --build-arg NEXT_PUBLIC_APP_URL=https://app.dodi.app \
#     -t dodi/web .
# Usually built via dodi-com/ops/hosting/docker-compose.yml instead.
#
# Stages: base (node + pnpm) -> pruner (turbo prune) -> installer (deps + build)
# -> runner (standalone output only, non-root).

ARG NODE_IMAGE=node:22-alpine

# --- base ----------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=1
RUN apk add --no-cache libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@9.15.9 --activate

# --- pruner: reduce the workspace to @dodi/web and its deps ---------------------
FROM base AS pruner
WORKDIR /repo
RUN pnpm add -g "turbo@^2"
COPY . .
# out/json: package.json files (+ lockfile/workspace file, depending on the turbo
# version they may land in out/ instead; normalise so the installer copies one dir).
RUN turbo prune @dodi/web --docker \
 && for f in pnpm-lock.yaml pnpm-workspace.yaml; do \
      [ -f "out/json/$f" ] || cp "out/$f" "out/json/$f"; \
    done

# --- installer: install pruned deps, then build --------------------------------
FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
# Filtered install: skips the root importer (its devDependencies pull the
# CLI binaries the image never needs).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@dodi/web..."
COPY --from=pruner /repo/out/full/ ./
# turbo prune does not copy root-level config files; core/* tsconfigs extend it.
COPY tsconfig.base.json ./tsconfig.base.json

# NEXT_PUBLIC_* values are inlined into the client bundle at build time. Keep
# this list in sync with `grep -r NEXT_PUBLIC_ clients/web/src`. Database vars
# are intentionally absent (removed by the Postgres migration).
ARG NEXT_PUBLIC_API_URL=https://platform.dodi.app
ARG NEXT_PUBLIC_APP_URL=https://app.dodi.app
ARG NEXT_PUBLIC_DODI_AI_URL=https://ai.dodi.app
ARG NEXT_PUBLIC_SITE_URL=https://dodi.app
ARG NEXT_PUBLIC_ENABLE_SW=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_DODI_AI_URL=$NEXT_PUBLIC_DODI_AI_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_ENABLE_SW=$NEXT_PUBLIC_ENABLE_SW

RUN pnpm --filter @dodi/web build

# --- runner ----------------------------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# The standalone output mirrors the monorepo layout under outputFileTracingRoot
# (repo root): /app/clients/web/server.js, /app/node_modules, /app/core/*.
COPY --from=installer --chown=nextjs:nodejs /repo/clients/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /repo/clients/web/.next/static ./clients/web/.next/static
COPY --from=installer --chown=nextjs:nodejs /repo/clients/web/public ./clients/web/public

USER nextjs
EXPOSE 3000
# /robots.txt is served by app/robots.ts and excluded from the auth middleware
# matcher, so it answers 200 without a session or a database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/robots.txt" >/dev/null || exit 1
CMD ["node", "clients/web/server.js"]
