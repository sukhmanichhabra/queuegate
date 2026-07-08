# ──────────────────────────────────────────────────────────────────────────────
# apps/api/Dockerfile — QueueGate API (NestJS + Prisma)
#
# Multi-stage build for a pnpm workspace monorepo.
# Build context must be the monorepo ROOT (not apps/api/) so pnpm can access
# pnpm-workspace.yaml, pnpm-lock.yaml, and all workspace members' package.json
# files. See docker-compose.yml: context: .
#
# pnpm symlink topology (critical for the runner stage):
#   apps/api/node_modules/<pkg>
#     → symlink to ../../../node_modules/.pnpm/<pkg@ver>/node_modules/<pkg>
#
# This means the runtime image must preserve the SAME absolute path hierarchy
# (/workspace/apps/api/node_modules → /workspace/node_modules/.pnpm/) or the
# relative symlinks break. We keep WORKDIR at /workspace/apps/api in the
# runner and copy both node_modules trees to their original paths.
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /workspace

# Install pnpm at a fixed major.minor (matches the version used in dev;
# corepack activates the version from packageManager field if present, or
# the requested version).
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace manifests first — Docker layer cache means pnpm install
# only re-runs when these files change, not on every source code edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# pnpm requires ALL workspace members' package.json files before running
# install so it can build the full dependency graph.
COPY apps/api/package.json  ./apps/api/package.json
COPY apps/web/package.json  ./apps/web/package.json

# Install all workspace dependencies (including devDeps needed for build).
# --frozen-lockfile ensures the lockfile is never mutated inside Docker.
RUN pnpm install --frozen-lockfile

# Copy api source after install to maximise cache hit rate.
COPY apps/api/src                  ./apps/api/src
COPY apps/api/prisma               ./apps/api/prisma
COPY apps/api/prisma.config.ts     ./apps/api/prisma.config.ts
COPY apps/api/nest-cli.json        ./apps/api/nest-cli.json
COPY apps/api/tsconfig.json        ./apps/api/tsconfig.json
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

# Generate the Prisma client. Must run before nest build because the generated
# types are imported by the NestJS services. The prisma CLI is a devDependency
# so it is available in the builder stage.
WORKDIR /workspace/apps/api
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build the NestJS app. nest-cli.json sourceRoot=src → output at dist/src/.
WORKDIR /workspace
RUN pnpm --filter api run build


# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# curl is not in alpine by default; required for the HEALTHCHECK directive.
RUN apk add --no-cache curl

# ── Preserve the pnpm path structure ─────────────────────────────────────────
# pnpm stores packages in a virtual store at node_modules/.pnpm/ and gives
# each workspace member a node_modules/ containing RELATIVE SYMLINKS that
# point three levels up into the root .pnpm/ store:
#
#   apps/api/node_modules/<pkg>  →  ../../../node_modules/.pnpm/<pkg@ver>/...
#
# Moving these symlinks to a different absolute path (e.g. /app/node_modules)
# breaks the relative resolution. We copy both trees to the same paths they
# had in the builder so all symlinks remain valid.
WORKDIR /workspace

# Root-level .pnpm virtual store — contains the actual package files.
# Symlinks in apps/api/node_modules/ point INTO this tree.
COPY --from=builder /workspace/node_modules ./node_modules

# api-specific symlinks: one per declared dependency of apps/api.
# This is separate from the root node_modules — pnpm does not hoist
# packages to root unless they are direct deps of the root workspace.
COPY --from=builder /workspace/apps/api/node_modules ./apps/api/node_modules

# Compiled NestJS output (dist/src/main.js is the real entry point;
# package.json's start:prod "node dist/main" is stale — sourceRoot=src
# places output at dist/src/).
COPY --from=builder /workspace/apps/api/dist ./apps/api/dist

# Prisma schema + config are required at runtime:
# - prisma/schema.prisma: read by @prisma/client query engine
# - prisma.config.ts: read by the Prisma CLI (`prisma migrate deploy`) to get
#   the datasource URL. Prisma v7 moved the URL OUT of schema.prisma and into
#   this config file. The CLI executes it with its own bundled TS loader.
COPY --from=builder /workspace/apps/api/prisma         ./apps/api/prisma
COPY --from=builder /workspace/apps/api/prisma.config.ts ./apps/api/prisma.config.ts

# RedisService loads Lua scripts at startup via:
#   fs.readFileSync(path.join(process.cwd(), 'src', 'admission', 'lua', 'admit.lua'))
# process.cwd() is /workspace/apps/api (the WORKDIR), so the script must be
# present at src/admission/lua/ relative to that — even in the runtime image.
COPY --from=builder /workspace/apps/api/src/admission/lua ./apps/api/src/admission/lua

# Run from the api package directory so Node's module resolution walks:
# apps/api/dist/src/ → apps/api/dist/ → apps/api/ → apps/api/node_modules/
# → node_modules/ → / (correct order, finds all pnpm-linked packages)
WORKDIR /workspace/apps/api

# Copy the entrypoint script and make it executable.
# The script runs `prisma migrate deploy` before starting the NestJS server,
# ensuring the database schema is always current without a separate step.
COPY --from=builder /workspace/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 4000

# Readiness probe — checks Postgres + Redis via Phase 18's /ready endpoint.
# start_period is long enough for migrate deploy + NestJS bootstrap.
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD curl -f http://localhost:4000/ready || exit 1

CMD ["./docker-entrypoint.sh"]
