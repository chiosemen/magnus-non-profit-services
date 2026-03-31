# Staging Runbook

**Primary integration branch (Wave 2 + Wave 3 + MCP test contract):** `integration/wave3-canonicalize` (or `docs/release-truth-tightening` if docs-only delta is merged).  
Legacy reference: `feat/platform-unification` remains the historical base; staging should track the **latest integrated** branch your team promotes.  
Service env: `staging`

## Scope
This runbook defines how to stand up and operate a staging environment for the Magnus monorepo using:
- Neon Postgres (staging database)
- pnpm monorepo builds
- One or more deployed services (API and/or web)

## Environment Variables
Start from `.env.staging.template`.

Required staging variables:
- `SERVICE_ENV=staging`
- `DATABASE_URL_STAGING`
- `JWT_SECRET_STAGING`
- `STRIPE_SECRET_KEY_STAGING`

Compatibility note:
- Prisma commonly expects `DATABASE_URL`. If your deploy platform cannot run Prisma with `DATABASE_URL_STAGING`,
  set `DATABASE_URL` to the same value as `DATABASE_URL_STAGING` in the platform environment variables.

## Database: Migrate (Deploy-Mode)
Run migrations against the staging database:

```bash
pnpm --filter @magnus/db prisma migrate deploy
```

## Validate Env (Fail-Closed)
Env validation is expected to fail fast at process startup if required vars are missing/invalid.

Validation approach:
1. Ensure staging env vars are set in the platform (or exported locally).
2. Start the service(s).
3. Confirm startup does not exit with an env validation error.

## Smoke Tests
After deploy and migrations, hit basic health endpoints.

Examples (adjust hostnames/ports as deployed):

```bash
curl -fsS https://<staging-host>/health
```

**MCP connector (`apps/mcp-connector`):** in production (`NODE_ENV=production`), set **`REDIS_URL`** for session durability; in-memory sessions are disabled in production.

Known health routes in this repo (service-dependent):
- `@magnus/org-dashboard-api`: `GET /health`
- `@magnus/grant-generator`: `GET /health`
- `@magnus/mcp-connector`: `GET /health`
- `@magnus/billing`: `GET /health`
- `@magnus/claude-partner`: `GET /health`
- `@magnus/worker-financial-layer`: `GET /health` — in **`production`**, the process exits unless `ALLOW_WORKER_FINANCIAL_LAYER=true` (release-subset gate; local dev/test unchanged).

## Deployment Options

### Option A: Vercel (Web)
Use this if you have a Next.js app in the monorepo (for example `apps/web` when present).

Steps:
1. Create a new Vercel project named `staging`.
2. Connect it to this repo and set the production branch to your promoted integration branch (e.g. `integration/wave3-canonicalize`).
3. Configure the monorepo root / app root directory as appropriate for the Next.js app.
4. Set environment variables for the project (staging values).
5. Deploy.

### Option B: Render (API/Services)
Steps:
1. Create a new Render service:
   - Service name: `magnus-staging`
   - Branch: `integration/wave3-canonicalize` (or current promoted integration branch)
2. Build command:
```bash
pnpm install && pnpm build
```
3. Start command: choose the service you are deploying. Examples:
```bash
pnpm --filter @magnus/org-dashboard-api start
```
```bash
pnpm --filter @magnus/grant-generator start
```
4. Set environment variables (staging values) in Render.
5. Deploy.

## Rollback
Rollback strategy depends on whether DB migrations were applied.

1. Code rollback:
   - Redeploy the last known-good commit/tag to staging.
2. Database rollback:
   - Prefer roll-forward migrations over rollback migrations.
   - For staging-only incidents, it is acceptable to reset/recreate the staging database/branch in Neon,
     then re-run `pnpm --filter @magnus/db prisma migrate deploy`.
