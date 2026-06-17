# P0 Production Hardening Staging Smoke Plan

Date: 2026-06-17
Environment name: `magnus-accord-staging`
Scope: private pilot smoke only
Production GA: not in scope
Public beta: not in scope

## Current Staging Target

Preferred platform: Railway.

Railway project:

- Project name: `MAGNUS NON PROFIT SERVICES`
- Project ID: `d2653c3e-29af-4e73-9297-bb7cef9f770e`
- Staging environment: `staging`
- Staging environment ID: `6df58eb6-fbbc-4be1-aaa8-f9ec60be940c`

Staging services:

- Web: `accord-web`
- Org Dashboard API: `accord-org-dashboard-api`
- MCP Connector: `accord-mcp-connector`
- Postgres: `Postgres`
- Redis: `Redis`

Staging URLs:

- Web: `https://accord-web-staging.up.railway.app`
- Org Dashboard API: `https://accord-org-dashboard-api-staging.up.railway.app`
- MCP Connector: `https://accord-mcp-connector-staging.up.railway.app`
- Custom web domain: `https://staging.magnusnonprofitservices.com`

DNS scope:

- Cloudflare zone: `ac889d...35ce`
- Only `staging.magnusnonprofitservices.com` is configured.
- Root domain and `www` are out of scope and were not changed.

## Preconditions

- PR #7 is merged.
- PR #7 final branch HEAD before merge: `974936c490f75588feb8d6a4e9ba84109abbb345`.
- PR #7 merge commit on `main`: `2f4f92a85300ecfabb0710ba596c11e62cda2b38`.
- PR #7 CI and Docker Build Check passed on run `27709789967`.
- PR #8 migration recovery fix is merged.
- Current `main` after PR #8: `d8a995cb700c7f4b57cd40c756654c7890e0bd18`.
- PR #8 CI and Docker Build Check passed on run `27722691631`.
- Staging must use Railway `staging`, not Railway `production`.
- Production GA must not be deployed.
- Public beta must not be claimed.
- Smoke evidence must be real staging evidence only.

## Deployment Plan

1. Provision Railway `staging` environment in the existing Magnus project. Done.
2. Provision Railway managed Postgres and Redis in `staging`. Done.
3. Reserve Railway staging domains for web, org-dashboard-api, and mcp-connector. Done.
4. Configure non-Stripe staging variables:
   - `NODE_ENV=production`
   - `DATABASE_URL` using Railway Postgres reference
   - `REDIS_URL` using Railway Redis reference
   - generated staging-only `JWT_SECRET`
   - generated staging-only `ENCRYPTION_KEY`
   - `NEXT_PUBLIC_APP_URL`
   - `API_URL`
   - `MCP_CONNECTOR_URL`
   - governance flags keeping MCP/worker/mobile public exposure disabled
5. Configure Stripe test-mode variables before deploying org-dashboard-api:
   - `STRIPE_SECRET_KEY` with valid `sk_test` value
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` with valid `pk_test` value
   - `STRIPE_WEBHOOK_SECRET` for the staging webhook endpoint
   - `STRIPE_CONNECT_RETURN_URL`
   - `STRIPE_CONNECT_REFRESH_URL`
6. Apply Prisma migrations to staging Postgres. Done after PR #8 recovery fix.
7. Seed staging after API deployment prerequisites are complete:
   - Starter/non-entitled org
   - Growth or Enterprise entitled org
   - internal/operator MCP entitlement if configured
   - published campaign
   - unpublished/draft campaign
   - archived campaign
8. Deploy current merged `main` commit `d8a995cb700c7f4b57cd40c756654c7890e0bd18` to staging services.
9. Run private pilot smoke.
10. Record command evidence, timestamps, URLs, deployment IDs, HTTP statuses, and sanitized response snippets.
11. Commit the plan/results pair only as evidence artifacts; do not mark private pilot ready until all required smoke checks pass.

## Required Smoke Checks

- Web health/page responds successfully.
- Org-dashboard-api health responds successfully.
- MCP connector health responds successfully.
- Missing auth and invalid auth are denied.
- Subscription gates are enforced.
- MCP is denied for public or non-entitled tiers.
- MCP is allowed only for internal/operator entitlement, if that entitlement is configured.
- Donor CRM tier access is enforced.
- Campaign admin access is enforced.
- Public campaign read works for published campaigns.
- Unpublished and archived campaigns are not donation-actionable.
- Stripe is test mode only.
- Stripe Connect readiness is required for payment writes.
- Donation and payment write paths are rate-limited.
- Redis-backed rate limiting is active in staging.
- Missing Redis production configuration fails closed.
- Accounting page shows `Status: Pilot review mode`.
- No unsupported public/protected UI or docs claim deterministic `GREEN`, certification, production readiness, or no-blockers status.
- Worker Financial Layer is not public.
- Grant Generator is not public standalone.
- Native mobile is not claimed as shipped.

## Current Blockers

- Valid Stripe test-mode secrets are required before org-dashboard-api can be deployed truthfully:
  - `STRIPE_SECRET_KEY` must be a valid `sk_test` value.
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` must be a valid `pk_test` value.
  - `STRIPE_WEBHOOK_SECRET` must be a valid staging/test webhook secret.
- Live-mode Stripe keys were provided during provisioning, but were not used because staging requires Stripe test mode only.
- Org-dashboard-api is not deployed because production startup validation requires the missing Stripe test variables.
- Seed data is not created yet because API/payment readiness remains blocked by missing Stripe test-mode configuration.
- Full private pilot smoke remains blocked until API deployment and seed data exist.

## Evidence Rules

- Record only real staging evidence.
- Redact Railway tokens, database URLs, Redis URLs, JWT/encryption secrets, Stripe secrets, donor PII, payment details, and raw MCP tool params.
- Do not deploy production GA.
- Do not claim public beta.
- Do not mark private pilot ready while any required smoke check is blocked.
