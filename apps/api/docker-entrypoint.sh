#!/bin/sh
# docker-entrypoint.sh — QueueGate API container entrypoint
#
# Runs `prisma migrate deploy` before starting the NestJS server.
# This ensures the database schema is always up-to-date on every container
# start without requiring a separate orchestration step.
#
# Pattern chosen: (b) baked into the container entrypoint.
# Rationale:
#   - This project runs a single-replica Compose stack; no race between
#     replicas is possible in the current setup.
#   - prisma migrate deploy IS safe for multi-replica if replicas are ever
#     added: Prisma acquires a PostgreSQL advisory lock before applying any
#     migration, so concurrent calls from N replicas will serialise safely —
#     the second replica to acquire the lock will find all migrations already
#     applied and exit immediately. See: https://pris.ly/d/migrate-deploy
#   - Keeping migrations in the entrypoint means `docker compose up` is the
#     complete deploy command — no separate step to forget or mis-order.
#
# NOT included here:
#   - seed.ts — seeding is a local-dev-only concern. Running seed data on
#     every production deploy would corrupt real user data. See docs/DEPLOY.md.
#   - prisma migrate dev — only for local development; prompts interactively
#     and can reset the database. NEVER use in a container or CI context.

set -e  # abort immediately if any command fails

echo "[entrypoint] Applying pending database migrations..."
node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma

echo "[entrypoint] Migrations applied successfully. Starting API server..."
exec node dist/src/main.js
