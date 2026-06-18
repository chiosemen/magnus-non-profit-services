# P0 Production Hardening Staging Smoke Plan

Date: 2026-06-18
Environment name: `magnus-accord-staging`
Scope: private pilot smoke only
Production GA: not in scope
Public beta: not in scope

## Current Staging Target

Preferred platform: Railway.

Railway project:

- Project name: `MAGNUS NON PROFIT SERVICES`
- Project ID: `d2653c3e-29af-4e73-9297-bb7cef9f770e`
- Environment: `staging`
- Environment ID: `6df58eb6-fbbc-4be1-aaa8-f9ec60be940c`

Active staging services:

- Web: `accord-web-staging`
- Org Dashboard API: `accord-org-dashboard-api-staging`
- MCP Connector: `accord-mcp-connector-staging`
- Postgres: `accord-postgres-staging`
- Redis: `accord-redis-staging`

Staging URLs:

- Web: `https://accord-web-staging-staging.up.railway.app`
- Org Dashboard API: `https://accord-org-dashboard-api-staging-staging.up.railway.app`
- MCP Connector: `https://accord-mcp-connector-staging-staging.up.railway.app`
- Custom web domain: `https://staging.magnusnonprofitservices.com`

DNS scope:

- Cloudflare zone: `ac889d...35ce`
- Only `staging.magnusnonprofitservices.com` is configured.
- Root domain and `www` remain out of scope and were not changed.

## Preconditions

- PR #7 merged to `main`; production GA remains closed.
- PR #8 merged and unblocked staging Prisma migration recovery.
- Staging follow-up fixes were deployed on 2026-06-18:
  - `302054d` `fix(db): preserve Prisma scalar prototypes during decryption`
  - `3523352` `fix(web): honor configured JWT issuer and audience`
- Staging must use Railway `staging`, not Railway `production`.
- Smoke evidence must be real staging evidence only.

## Completed Setup

- Railway managed Postgres and Redis are online.
- Web, org-dashboard-api, and mcp-connector are deployed and healthy.
- `NEXT_PUBLIC_APP_URL` is aligned to `https://staging.magnusnonprofitservices.com` on web and API.
- JWT issuer/audience are aligned across web, API, and MCP:
  - `JWT_ISSUER=magnus-accord-staging`
  - `JWT_AUDIENCE=magnus-accord-private-pilot`
- Prisma migrations are current in staging Postgres.
- The named pilot seed fixtures exist in staging.
- The custom domain is verified and serving the web app over HTTPS.

## Seeded Pilot Fixtures

Organizations:

- Starter org: `Pilot Starter Org` (`11-1111111`) tier `STARTER`
- Enterprise org: `Pilot Enterprise Org` (`22-2222222`) tier `ENTERPRISE`
- Growth pending org: `Pilot Growth Pending Org` (`33-3333333`) tier `GROWTH`

Campaigns:

- Published live: `pilot-enterprise-public-live`
- Draft/unpublished: `pilot-enterprise-draft`
- Archived: `pilot-enterprise-archived`
- Live but Stripe Connect pending: `pilot-growth-connect-pending-live`

Stripe Connect fixture state:

- Enterprise org: onboarding `ENABLED`, charges enabled
- Growth pending org: onboarding `IN_PROGRESS`, charges disabled

## Remaining Objective

1. Keep all private-pilot gating evidence current.
2. Replace the placeholder Stripe secret on `accord-org-dashboard-api-staging` with a real `sk_test_...` secret from the user-owned Stripe test account.
3. Redeploy the API after the real Stripe test secret is set.
4. Rerun enterprise checkout and webhook-adjacent payment checks.
5. Keep production GA and public beta closed.

## Required Smoke Matrix

- Web health/page responds successfully.
- Org-dashboard-api health responds successfully.
- MCP connector health responds successfully.
- Missing auth and invalid auth are denied.
- Subscription gates are enforced.
- MCP is denied for public or non-entitled tiers.
- MCP is allowed only for internal/operator entitlement, if that entitlement is configured later.
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

- `accord-org-dashboard-api-staging` currently carries a placeholder `STRIPE_SECRET_KEY` with an `sk_test_...` prefix, but the key is not valid against Stripe and causes enterprise checkout to fail with a server-side payment error.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is also still a placeholder test-mode value on staging.
- `STRIPE_WEBHOOK_SECRET` is present, but webhook handling is not trusted as final pilot evidence until a real enterprise checkout can be created with valid Stripe test credentials.
- No internal/operator MCP allow-org is seeded in staging, so the optional MCP allow-path remains `N/A unless configured later`.

## Evidence Rules

- Record only real staging evidence.
- Redact Railway tokens, database URLs, Redis URLs, JWT/encryption secrets, Stripe secrets, donor PII, payment details, and raw MCP tool params.
- Do not deploy production GA.
- Do not claim public beta.
- Do not mark private pilot ready while enterprise Stripe checkout remains blocked.
