# QueueGate — Deployment Guide

## Prerequisites

- Docker ≥ 24 and Docker Compose v2 (`docker compose version`)
- A populated `apps/api/.env` file (copy from `.env.example` and fill in all secrets)

```bash
cp .env.example apps/api/.env
# Edit apps/api/.env — fill in JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_WS_SECRET
# Generate secrets with: openssl rand -hex 32
```

---

## Deploy Sequence

### 1. Build images

```bash
docker compose build api web
```

Both images use a multi-stage build from the monorepo root. The `api` image embeds
the `prisma migrate deploy` step in its entrypoint (see below).

### 2. Start the stack

```bash
docker compose up -d
```

This is the **complete** deploy command. The api container's entrypoint automatically
runs `prisma migrate deploy` before starting the NestJS server, so no separate migration
step is needed.

**Service start order** (enforced by `depends_on: condition: service_healthy`):

```
postgres ──┐
redis   ──┤──▶ api ──▶ web
kafka   ──┘
```

Prometheus and Grafana start in parallel with the app services.

### 3. Verify

```bash
# All containers should reach healthy status within ~60 seconds:
docker compose ps

# API readiness (Postgres + Redis probed):
curl http://localhost:4000/ready

# Web frontend:
curl -I http://localhost:3000/

# Prometheus scraped metrics from the api service (not host.docker.internal):
curl "http://localhost:9090/api/v1/query?query=queue_depth_total"
```

---

## How Database Migrations Work

The `api` container runs `prisma migrate deploy` **every time it starts** via
`apps/api/docker-entrypoint.sh`. This is intentionally baked into the entrypoint
rather than a separate step because:

- **Idempotent**: Prisma checks the `_prisma_migrations` table and skips already-applied
  migrations. A redeploy with no new migrations is a clean no-op.
- **Multi-replica safe (with caveats)**: Prisma acquires a PostgreSQL advisory lock before applying
  migrations. If N replicas start simultaneously, they serialise on the lock. **Note:** The lock
  acquisition has a hardcoded 10-second timeout. If a migration takes longer than 10 seconds,
  concurrent replicas will crash on startup with a timeout error rather than waiting indefinitely.
  For massive scale-outs, a separate init-container/pre-deploy step is recommended.
- **No forgotten step**: `docker compose up` is the complete command. A separate
  `docker compose run --rm api prisma migrate deploy` would need to be remembered
  and sequenced correctly in every CI/CD pipeline.

### Running migrations manually (one-off)

If you need to apply migrations outside a full `docker compose up`:

```bash
# Against the Compose-managed postgres (container must be running):
docker compose run --rm api ./docker-entrypoint.sh

# Or directly with the npm script (from apps/api/, with DATABASE_URL set):
pnpm --filter api migrate:deploy
```

---

## What Is NOT Part of the Deploy

| Concern | Where it lives | Why NOT in deploy |
|---------|---------------|-------------------|
| `seed.ts` | `apps/api/prisma/seed.ts` | Local-dev only. Seeding reference data on every deploy would corrupt real user data. Run manually: `pnpm ts-node prisma/seed.ts` |
| `prisma migrate dev` | Dev workflow | Interactively prompts, can reset the DB. Never use in containers or CI. |
| `prisma migrate reset` | Dev workflow | Destroys all data. Never use against a production database. |
| `prisma db push` | Dev workflow | Bypasses migrations entirely. Not safe for shared environments. |

---

## Stopping / Teardown

```bash
# Stop all containers (data volumes preserved):
docker compose down

# Stop and remove volumes (DESTROYS all database data):
docker compose down --volumes
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `REDIS_URL` | ✓ | Redis connection URL |
| `KAFKA_BROKERS` | optional | Kafka broker list (app degrades gracefully) |
| `JWT_ACCESS_SECRET` | ✓ | Signs 15-min HTTP access tokens |
| `JWT_REFRESH_SECRET` | ✓ | Signs 7-day refresh tokens (must differ from access) |
| `JWT_WS_SECRET` | ✓ | Signs 5-min WebSocket ownership tokens (must differ) |
| `NEXT_PUBLIC_API_URL` | web only | Browser-visible API URL (default: `http://localhost:4000`) |

> **Inside Docker Compose**: `DATABASE_URL`, `REDIS_URL`, and `KAFKA_BROKERS` are
> automatically overridden by the `environment:` block in `docker-compose.yml` to use
> container service names (`postgres:5432`, `redis:6379`, `kafka:9092`). The values
> in `apps/api/.env` (which use `localhost`) are only used for native `pnpm dev` runs.

---

## Secrets Management (Future-Proofing)

The API service uses a centralized secrets abstraction to fetch sensitive configuration values.

- **The swap-in point**: `apps/api/src/config/secrets.ts` exposes a `getSecret(key)` function. Every part of the application (Auth, Database, Redis, etc.) uses this single function to obtain credentials.
- **Future Vendor Integration**: When moving to a production secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault, Doppler, Kubernetes Secrets), you only need to modify this single `getSecret` implementation. The rest of the codebase requires **zero changes**.
- **Local Development**: For local development, `getSecret()` continues to read directly from `process.env`. The `.env` file (loaded via `dotenv`) remains the standard, secure mechanism for injecting development secrets into `process.env`.
