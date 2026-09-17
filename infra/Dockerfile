# syntax=docker/dockerfile:1.7
# One application image serves the API (with the built web client), the worker and the operator commands.
# Build context is the repository root:  docker build -f infra/Dockerfile --build-arg RELEASE_VERSION=$(git rev-parse --short HEAD) .
# Multi-platform index digests verified against Docker Hub on 2026-09-15.
ARG NODE_IMAGE=node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
ARG POSTGRES_IMAGE=postgres:18.4-bookworm@sha256:882236b897e39051d2368c5ccc6cda944904723506b2dfc97f2a8f5bc9afa382

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV npm_config_update_notifier=false
# Install exactly the lockfile with workspace manifests first so dependency layers cache across source changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/ui/package.json packages/ui/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# The web client is the only compiled artifact; API/worker run their TypeScript sources through the pinned tsx loader.
RUN npm run build -w @nursery/web && npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
 && rm -rf apps/web/src apps/web/public apps/web/node_modules/.vite .git docs phases prompts tests output

FROM ${POSTGRES_IMAGE} AS runtime
ARG RELEASE_VERSION=unknown
# The exact PostgreSQL image supplies pg_dump/pg_restore; only the exact Node binary is copied from the build base.
COPY --from=build /usr/local/bin/node /usr/local/bin/node
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --shell /usr/sbin/nologin --create-home node \
 && install -d -o node -g node -m 0700 /data/private-files /data/backups /data/restore-check
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 WEB_DIST_DIR=/app/apps/web/dist \
    PRIVATE_FILES_DIR=/data/private-files BACKUP_DIR=/data/backups RELEASE_VERSION=${RELEASE_VERSION} PG_BIN_DIR=/usr/lib/postgresql/18/bin
# No secrets are baked in: DATABASE_URL, SESSION_SECRET, BACKUP_ENCRYPTION_KEY and friends arrive from the deployment environment.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/readiness').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "-c", "node --import tsx packages/db/scripts/migrate.ts && node --import tsx apps/api/src/seed-superadmin.ts && node --import tsx apps/api/src/server.ts"]
