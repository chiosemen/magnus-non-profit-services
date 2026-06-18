# P0 Production Hardening Staging Smoke Results

Date: 2026-06-18
Environment name: `magnus-accord-staging`
Scope: private pilot smoke only
Status: staging infrastructure real; authenticated pilot smoke mostly complete; enterprise Stripe checkout still blocked
Final verdict: PRIVATE PILOT BLOCKED

## Merge And Deploy Context

- PR #7 merge commit on `main`: `2f4f92a85300ecfabb0710ba596c11e62cda2b38`
- Staging migration recovery already merged via PR #8.
- Current local staging follow-up fixes deployed directly to Railway on 2026-06-18:
  - `302054d` `fix(db): preserve Prisma scalar prototypes during decryption`
  - `3523352` `fix(web): honor configured JWT issuer and audience`

These two follow-up fixes were required to make the named staging environment truthfully usable for private pilot smoke:

- `302054d` stopped the DB decryption layer from stripping `Date` and Prisma scalar prototypes, which restored donor/campaign/fund reads in live staging.
- `3523352` made web-issued JWTs honor the configured issuer/audience, which restored custom-domain session compatibility with the API.

## Railway Provisioning Evidence

Railway project:

- Project name: `MAGNUS NON PROFIT SERVICES`
- Project ID: `d2653c3e-29af-4e73-9297-bb7cef9f770e`
- Environment: `staging`
- Environment ID: `6df58eb6-fbbc-4be1-aaa8-f9ec60be940c`

Provisioned services:

| Service | Railway status | Latest deployment ID |
| --- | --- | --- |
| `accord-web-staging` | `SUCCESS` | `e4ffe590-1aea-485a-b0c7-9b0a033cfad2` |
| `accord-org-dashboard-api-staging` | `SUCCESS` | `974984dd-69d6-4447-ab1e-11d3862e9681` |
| `accord-mcp-connector-staging` | `SUCCESS` | `4a236d0c-0ae2-4c53-a353-a9b846a4a220` |
| `accord-postgres-staging` | `SUCCESS` | `6f8c0c97-a783-4d98-b34b-cf39d534f060` |
| `accord-redis-staging` | `SUCCESS` | `a80ea809-c0b6-40ea-83f0-120145ff1d4b` |

Legacy/non-pilot staging service:

- `magnus-non-profit-services`: `FAILED`, stopped, not part of the current staging pilot path

Staging URLs:

- Web: `https://accord-web-staging-staging.up.railway.app`
- Org Dashboard API: `https://accord-org-dashboard-api-staging-staging.up.railway.app`
- MCP Connector: `https://accord-mcp-connector-staging-staging.up.railway.app`
- Custom web domain: `https://staging.magnusnonprofitservices.com`

Custom domain / DNS:

- Cloudflare zone ID: `ac889d...35ce`
- Cloudflare CNAME record: `79777388...07e6f3` `staging.magnusnonprofitservices.com` -> `a8jp35gf.up.railway.app`
- Cloudflare TXT record: `2d80ec92...e25017` `_railway-verify.staging.magnusnonprofitservices.com` -> Railway verification token, redacted
- `dig +short CNAME staging.magnusnonprofitservices.com`: `a8jp35gf.up.railway.app.`
- `GET https://staging.magnusnonprofitservices.com/`: HTTP `200`
- Root domain touched: no
- `www` touched: no

## Config Evidence

Configured staging variables, names only:

- `NODE_ENV=production`
- `APP_ENV=staging`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`
- `ORG_DASHBOARD_API_BASE_URL`
- `MCP_CONNECTOR_URL`
- `FEATURE_FLAG_MCP_LIVE=false`
- `FEATURE_FLAG_WORKER_FINANCIALS=false`
- `FEATURE_FLAG_MOBILE=false`

Staging URL alignment:

- `NEXT_PUBLIC_APP_URL` on web: `https://staging.magnusnonprofitservices.com`
- `NEXT_PUBLIC_APP_URL` on org-dashboard-api: `https://staging.magnusnonprofitservices.com`
- `ORG_DASHBOARD_API_BASE_URL` on web points to the named staging org-dashboard-api URL

Stripe-mode evidence:

- `STRIPE_SECRET_KEY` on the API has an `sk_test_` prefix, but it is a placeholder and is invalid against Stripe.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` on staging has a `pk_test_` prefix, but is also placeholder-valued.
- `STRIPE_WEBHOOK_SECRET` is present with a `whsec_` prefix.
- No live Stripe keys were used in this staging evidence run.

Direct proof of the current Stripe blocker:

- In-container call from `accord-org-dashboard-api-staging` to `https://api.stripe.com/v1/balance` with the current `STRIPE_SECRET_KEY` returned HTTP `401`.
- Stripe response reported `Invalid API Key provided: sk_test_...450f` (masked by Stripe in the response).

## DB Migration And Seed Evidence

Prisma migration state:

- Final status: `Database schema is up to date!`
- Canonical schema proof:
  - `Campaign.title`: present, non-null
  - `Campaign.name`: not used as the canonical campaign contract
  - `Campaign.publishedAt`: present
  - `Campaign.archivedAt`: present
  - `Campaign_orgId_slug_key`: present
  - `StripeConnectAccount.onboardingStatus`: present
  - `StripeConnectAccount.requirementsCurrentlyDue`: present

Seeded staging orgs:

- Starter org: `Pilot Starter Org` (`11-1111111`) tier `STARTER`
- Enterprise org: `Pilot Enterprise Org` (`22-2222222`) tier `ENTERPRISE`
- Growth pending org: `Pilot Growth Pending Org` (`33-3333333`) tier `GROWTH`

Seeded staging workers:

- Starter admin: `pilot.starter+staging@magnusaccord.test`
- Enterprise admin: `pilot.enterprise+staging@magnusaccord.test`
- Growth admin: `pilot.growth+staging@magnusaccord.test`

Seeded staging campaigns:

- Published live: `pilot-enterprise-public-live`
- Draft: `pilot-enterprise-draft`
- Archived: `pilot-enterprise-archived`
- Live with incomplete Stripe Connect: `pilot-growth-connect-pending-live`

Stripe Connect seed state:

- Enterprise org: `onboardingStatus=ENABLED`, `chargesEnabled=true`, `payoutsEnabled=true`
- Growth pending org: `onboardingStatus=IN_PROGRESS`, `chargesEnabled=false`, `payoutsEnabled=false`

Additional seeded accounting/donor evidence:

- Enterprise org donors: `1`
- Enterprise org campaigns: `3`
- Enterprise org funds: `1`
- Starter org donors: `0`
- Starter org campaigns: `0`

## Local Verification Tied To Staging Env

Positive production-like web build with staging env:

```bash
railway run -s accord-web-staging -e staging -- pnpm --filter @magnus/web build
```

Result:

- Pass. Next.js production build completed successfully with the Railway staging environment variables.

Negative fail-closed check:

```bash
railway run -s accord-web-staging -e staging -- env REDIS_URL= pnpm --filter @magnus/web build
```

Result:

- Expected fail-closed behavior confirmed.
- Build failed before startup with `Invalid environment configuration for web: REDIS_URL`.

## Smoke Results

Representative commands used:

```bash
curl -sS https://staging.magnusnonprofitservices.com/api/health
curl -sS https://accord-org-dashboard-api-staging-staging.up.railway.app/health
curl -sS https://accord-mcp-connector-staging-staging.up.railway.app/health
curl -sS https://staging.magnusnonprofitservices.com/api/auth/me
curl -sS -b /private/tmp/enterprise.cookies https://staging.magnusnonprofitservices.com/api/org/donors
curl -sS -b /private/tmp/starter.cookies https://staging.magnusnonprofitservices.com/api/org/accounting/funds
curl -sS https://staging.magnusnonprofitservices.com/api/public/campaigns/pilot-enterprise-public-live
curl -sS https://staging.magnusnonprofitservices.com/api/public/campaigns/pilot-growth-connect-pending-live/checkout
```

Observed results:

| Check | Result | Evidence |
| --- | --- | --- |
| Web health | Pass | `GET https://staging.magnusnonprofitservices.com/api/health` returned HTTP `200` with `{"ok":true}` |
| Org-dashboard-api health | Pass | `GET https://accord-org-dashboard-api-staging-staging.up.railway.app/health` returned HTTP `200` with `{"ok":true}` |
| MCP connector health | Pass | `GET https://accord-mcp-connector-staging-staging.up.railway.app/health` returned HTTP `200` with `{"ok":true}` |
| Missing auth denied | Pass | `GET /api/auth/me` without cookies returned HTTP `401` with `{"error":"AUTH_REQUIRED"}` |
| Invalid auth denied | Pass | `GET /api/auth/me` with invalid cookies returned HTTP `401` with `{"error":"AUTH_INVALID"}` |
| Enterprise custom-domain session works | Pass | Enterprise register/login flow on the custom domain returned HTTP `200`; `/api/auth/me` returned `{"ok":true,...}` |
| Starter custom-domain session works | Pass | Starter register/login flow on the custom domain returned HTTP `200`; `/api/auth/me` returned `{"ok":true,...}` |
| Donor CRM tier access | Pass | Starter `/api/org/donors` returned HTTP `200`; enterprise `/api/org/donors` returned HTTP `200` with one donor row |
| Campaign admin access | Pass | Enterprise `/api/org/campaigns` returned HTTP `200` with `LIVE`, `DRAFT`, and `ARCHIVED` campaigns |
| Fund accounting gated by tier | Pass | Enterprise `/api/org/accounting/funds` returned HTTP `200`; starter `/api/org/accounting/funds` returned HTTP `403` `FEATURE_NOT_ENABLED` |
| Subscription gates enforced | Pass | Starter fund-accounting denial and enterprise allow-path were both observed on live staging |
| Public campaign read | Pass | `GET /api/public/campaigns/pilot-enterprise-public-live` returned HTTP `200` with the live campaign payload |
| Unpublished campaign not donation-actionable | Pass | `GET /api/public/campaigns/pilot-enterprise-draft` returned HTTP `400` with `Campaign is not currently accepting donations.` |
| Archived campaign not donation-actionable | Pass | `GET /api/public/campaigns/pilot-enterprise-archived` returned HTTP `400` with `Campaign is not currently accepting donations.` |
| Stripe Connect readiness required for payment writes | Pass | `POST /api/public/campaigns/pilot-growth-connect-pending-live/checkout` returned HTTP `400` with `Organization payments onboarding is incomplete.` |
| MCP missing auth denied | Pass | `POST /tools/execute` without auth returned HTTP `401` `AUTH_REQUIRED` |
| MCP invalid auth denied | Pass | `POST /tools/execute` with invalid bearer token returned HTTP `401` `AUTH_INVALID` |
| MCP denied for public/non-entitled tiers | Pass | Starter and enterprise signed staging JWTs both returned HTTP `403` `FEATURE_NOT_ENABLED` for `get-donor-summary` |
| MCP internal/operator-only allow path | N/A | No internal/operator entitlement seed exists in staging; optional allow-path not configured |
| Donation/payment write paths rate-limited | Pass | In-container burst against growth-pending checkout path produced `300` HTTP `400` responses followed by `30` HTTP `429` responses |
| Redis-backed rate limiting active | Pass | API startup log contains `[magnus:org-dashboard-rate-limit] Redis-backed rate limiter active (multi-instance safe).` |
| Missing Redis production config fails closed | Pass | Blank `REDIS_URL` build failed with `Invalid environment configuration for web: REDIS_URL` |
| Positive production-like web build with Redis configured | Pass | `railway run -s accord-web-staging -e staging -- pnpm --filter @magnus/web build` completed successfully |
| Accounting page says `Pilot review mode` | Pass | Playwright-authenticated visit to `/app/accounting` plus `Board financial summary` tab showed `Status: Pilot review mode` |
| Unsupported `GREEN` / `certified` / `production-ready` / `no-blockers` claims absent | Pass | Root page and authenticated accounting-page text scans both returned zero matches |
| Worker Financial Layer not public | Pass | `/api/autonomous-ops/connectors` returned only the `claudePartner` panel; no Worker Financial Layer panel was client-visible |
| Grant Generator not public standalone | Pass | `/api/autonomous-ops/connectors` returned only the `claudePartner` panel; no Grant Generator panel was client-visible |
| Native mobile not claimed as shipped | Pass | Root page and authenticated accounting-page text scans returned zero `native mobile` claim matches |
| Stripe test mode only | Partial pass | All configured Stripe staging variables use test-mode prefixes (`sk_test_`, `pk_test_`, `whsec_`), but the current API secret is placeholder-valued and not usable for live test checkout creation |
| Enterprise public checkout creation | Blocked | `POST /api/public/campaigns/pilot-enterprise-public-live/checkout` returned HTTP `500`; in-container Stripe call proved the current `sk_test_...` secret is invalid |

## Current Decision

Private pilot is still blocked, but the blocker is now narrow and concrete:

- staging web is healthy;
- staging org-dashboard-api is healthy;
- staging mcp-connector is healthy;
- custom-domain authentication is working;
- seed data is real;
- public/non-entitled gating is working;
- Redis-backed rate limiting is proven;
- unsupported public launch claims remain absent;
- Worker Financial Layer, Grant Generator, and MCP are not public surfaces.

The remaining blocker is enterprise payment readiness:

- `accord-org-dashboard-api-staging` must receive a real user-owned Stripe test secret (`sk_test_...`) instead of the current placeholder value.
- Once that is done, enterprise checkout creation and webhook-adjacent payment smoke must be rerun.

Production GA was not deployed.
Public beta was not claimed.
No fake smoke evidence was created.
