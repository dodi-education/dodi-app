# syntax=docker/dockerfile:1.7
# @dodi/platform (platform.dodi.app) production image.
#
# Build context is the dodi-app repo ROOT (turbo prune needs the workspace):
#   docker build -f platform/Dockerfile \
#     --build-arg NEXT_PUBLIC_APP_URL=https://app.dodi.app \
#     -t dodi/platform .
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

# --- pruner: reduce the workspace to @dodi/platform and its deps -----------------
FROM base AS pruner
WORKDIR /repo
RUN pnpm add -g "turbo@^2"
COPY . .
# out/json: package.json files (+ lockfile/workspace file, depending on the turbo
# version they may land in out/ instead; normalise so the installer copies one dir).
RUN turbo prune @dodi/platform --docker \
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
    pnpm install --frozen-lockfile --filter "@dodi/platform..."
COPY --from=pruner /repo/out/full/ ./
# turbo prune does not copy root-level config files; platform/tsconfig.json
# extends this one.
COPY tsconfig.base.json ./tsconfig.base.json

# NEXT_PUBLIC_* values are inlined at build time. Keep this list in sync with
# `grep -r process.env.NEXT_PUBLIC_ platform/src`.
ARG NEXT_PUBLIC_APP_URL=https://app.dodi.app
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN pnpm --filter @dodi/platform build

# --- runner ----------------------------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# The standalone output mirrors the monorepo layout under outputFileTracingRoot
# (repo root): /app/platform/server.js, /app/node_modules, /app/core/*.
COPY --from=installer --chown=nextjs:nodejs /repo/platform/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /repo/platform/.next/static ./platform/.next/static
COPY --from=installer --chown=nextjs:nodejs /repo/platform/public ./platform/public

USER nextjs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "platform/server.js"]
