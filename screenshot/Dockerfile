# syntax=docker/dockerfile:1.7
# @dodi/screenshot: the headless-browser screenshot worker behind the platform's
# POST /api/games/screenshot (and self-hostable as a "custom screenshot service").
#
# Build context is the dodi-app repo ROOT (turbo prune needs the workspace):
#   docker build -f screenshot/Dockerfile -t dodi/screenshot .
# Usually built via dodi-com/ops/hosting/docker-compose.yml instead.
#
# Base: Microsoft's Playwright image, which ships Chromium and its system deps
# for exactly one Playwright version. Its tag MUST match the "playwright"
# version in screenshot/package.json, or the browser revision is missing.

ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble

# --- base ----------------------------------------------------------------------
FROM ${PLAYWRIGHT_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=1
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# --- pruner: reduce the workspace to @dodi/screenshot and its deps -----------------
FROM base AS pruner
WORKDIR /repo
RUN pnpm add -g "turbo@^2"
COPY . .
RUN turbo prune @dodi/screenshot --docker \
 && for f in pnpm-lock.yaml pnpm-workspace.yaml; do \
      [ -f "out/json/$f" ] || cp "out/$f" "out/json/$f"; \
    done

# --- runner: install pruned prod deps and run through tsx ------------------------
# The core packages export TypeScript sources, so the worker runs under tsx
# (a production dependency) instead of a build step.
FROM base AS runner
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@dodi/screenshot..."
COPY --from=pruner /repo/out/full/ ./
COPY tsconfig.base.json ./tsconfig.base.json

ENV NODE_ENV=production \
    PORT=3006
# The image's browsers live in /ms-playwright (PLAYWRIGHT_BROWSERS_PATH is preset).
USER pwuser
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@dodi/screenshot", "start"]
