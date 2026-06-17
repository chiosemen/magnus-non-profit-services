# Staging Runbook

Branch: `feat/platform-unification`
Service env: `staging`
Named evidence environment: `magnus-accord-staging`

## Scope
This runbook defines how to stand up and operate a staging environment for the Magnus monorepo using:
- Neon Postgres (staging database)
- Shared staging Redis
- Stripe test mode only
- pnpm monorepo builds
- One or more deployed services (API and/or web)

Do not use local machines or casual preview deployments as signed launch evidence. A preview deployment only qualifies if it is configured with staging-grade env vars, separate staging DB, Redis, Stripe test mode, seeded orgs, test JWTs, and durable evidence capture.

## Environment Variables
Start from `.env.staging.template`.

Required staging variables:
- `SERVICE_ENV=staging`
- `DATABASE_URL_STAGING`
- `REDIS_URL`
- `JWT_SECRET_STAGING`
- `STRIPE_SECRET_KEY_STAGING`

Compatibility note:
- Prisma commonly expects `DATABASE_URL`. If your deploy platform cannot run Prisma with `DATABASE_URL_STAGING`,
  set `DATABASE_URL` to the same value as `DATABASE_URL_STAGING` in the platform environment variables.
- Staging Stripe keys must be test-mode keys only. Abort if any live Stripe key or live Connect account appears in staging configuration.

## Seed Data

Before signed smoke evidence, seed or verify:

- Starter or inactive org for negative entitlement checks.
- Growth or Enterprise eligible org for positive entitlement checks.
- Published campaign.
- Unpublished campaign.
- Archived campaign if supported by the route under test.
- Test JWTs for the seeded orgs.

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

Known health routes in this repo (service-dependent):
- `@magnus/org-dashboard-api`: `GET /health`
- `@magnus/grant-generator`: `GET /health`
- `@magnus/mcp-connector`: `GET /health`
- `@magnus/billing`: `GET /health`
- `@magnus/claude-partner`: `GET /health`
- `@magnus/worker-financial-layer`: `GET /health`

## Approval

- Codex implements changes and fixes.
- Hermes Agent performs technical verification and signs the checklist evidence.
- GrandMaster Chi / Product Owner owns the launch checklist and gives final approval.
- No agent self-approves its own implementation.

## Deployment Options

### Option A: Vercel (Web)
Use this if you have a Next.js app in the monorepo (for example `apps/web` when present).

Steps:
1. Create a new Vercel project named `staging`.
2. Connect it to this repo and set the production branch to `feat/platform-unification` (staging branch).
3. Configure the monorepo root / app root directory as appropriate for the Next.js app.
4. Set environment variables for the project (staging values).
5. Deploy.

### Option B: Render (API/Services)
Steps:
1. Create a new Render service:
   - Service name: `magnus-staging`
   - Branch: `feat/platform-unification`
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
