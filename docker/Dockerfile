# syntax=docker/dockerfile:1.7
# One image, two roles: `web` (SvelteKit, adapter-node) and `worker` (BullMQ + scanner).
# The worker role includes Chromium via the Playwright base image so screenshots work.
ARG PLAYWRIGHT_VERSION=1.63.0

# ---------- deps + build ----------
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
# Fingerprint DB (GPL-3.0, fetched at build time) — pass FINGERPRINTS_REF to pin.
ARG FINGERPRINTS_REF=main
RUN FINGERPRINTS_REF=$FINGERPRINTS_REF node scripts/fetch-fingerprints.mjs --force
RUN pnpm --filter @site-scanner/web build
# prune dev deps for the runtime images
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------- web ----------
FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 BODY_SIZE_LIMIT=1048576
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/web/build ./apps/web/build
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
# Same numeric uid as the worker's pwuser so both can read/write the shared screenshots volume.
RUN groupadd -g 1001 app && useradd -u 1001 -g 1001 -m app && mkdir -p /data/screenshots && chown -R app:app /data /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/build"]

# ---------- worker ----------
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS worker
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/scripts ./scripts
RUN [ "$(id -u pwuser)" = 1001 ] || usermod -u 1001 pwuser; mkdir -p /data/screenshots && chown -R pwuser /data /app
USER pwuser
# Run from the worker package so Node resolves `tsx` (and everything else) from its node_modules.
WORKDIR /app/apps/worker
CMD ["node", "--import", "tsx", "src/index.ts"]
