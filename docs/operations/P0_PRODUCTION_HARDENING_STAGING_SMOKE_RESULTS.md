# P0 Production Hardening Staging Smoke Results

Date: 2026-06-18
Environment name: `magnus-accord-staging`
Scope: private pilot smoke only
Status: staging infrastructure real; Stripe test-mode webhook and API secret refreshed; webhook delivery path proven with a real test-mode event; enterprise checkout still blocked because the Stripe account cannot yet create a real Connect account and the enterprise seed still points at a placeholder connected account
Final verdict: PRIVATE PILOT BLOCKED

## Merge And Deploy Context

- PR #7 merge commit on `main`: `2f4f92a85300ecfabb0710ba596c11e62cda2b38`
- Staging migration recovery already merged via PR #8.
- Staging follow-up evidence fixes merged via PR #9:
  - Merge commit: `9030f8ba432e954aae3a0abd8ef3b1cd6b93092a`
  - PR head: `0ebea72` `docs(accord): refresh staging smoke evidence`
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
| `accord-org-dashboard-api-staging` | `SUCCESS` | `6afc2f5d-ea41-494c-8148-8350efd998fa` |
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

Stripe-mode evidence after the Stripe pilot unblock rerun:

- Stripe CLI was re-authorized on 2026-06-18 and the local test account resolved to `acct_1SHXb9KqQqlLoDGp`.
- `STRIPE_SECRET_KEY` on `accord-org-dashboard-api-staging` was refreshed to a current `sk_test_...` value.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` on staging remains `pk_test_...`.
- `STRIPE_WEBHOOK_SECRET` on `accord-org-dashboard-api-staging` was rotated to a fresh registered test-mode webhook secret.
- The current registered webhook destination is:
  - URL: `https://accord-org-dashboard-api-staging-staging.up.railway.app/api/public/stripe/webhook`
  - Webhook destination ID: `we_1Tjl3...Ukrf`
  - Enabled event list: `checkout.session.completed`
- An older duplicate staging webhook destination was deleted so only the current webhook remains active for this URL.
- API redeploy ID carrying the fresh Stripe secret + webhook secret update: `6afc2f5d-ea41-494c-8148-8350efd998fa`
- Deploy log proof:
  - `No pending migrations to apply.`
  - `org-dashboard-api listening on 4010`
  - `[magnus:org-dashboard-rate-limit] Redis-backed rate limiter active (multi-instance safe).`
- No live Stripe keys were intentionally used for this staging evidence run.

Direct proof of the current Stripe blocker:

- Railway SSH inspection of the seeded staging DB confirmed that `Pilot Enterprise Org` and `Pilot Growth Pending Org` still store placeholder Stripe account IDs under both `Organization.stripeAccountId` and `StripeConnectAccount.stripeAccountId`.
- `GET /api/org/stripe-connect/status` for the enterprise pilot org still reports `connected=true`, `onboardingStatus=ENABLED`, `chargesEnabled=true`, and `payoutsEnabled=true`, but the stored connected account ID remains the placeholder `acct_stage_enterprise_ready`.
- Stripe Workbench in the refreshed test account still shows no connected accounts: `stripe accounts list --limit 20` returned an empty `data` array before any correction attempt.
- Attempting to create a real test connected account with the freshly authorized Stripe test key failed with Stripe's Connect enrollment error: `You can only create new accounts if you've signed up for Connect`.
- Because `createDonationCheckoutSession` sends the stored connected account through the `Stripe-Account` header, the placeholder enterprise seed cannot create a real Checkout Session. A direct Stripe API reproduction with `Stripe-Account: acct_stage_enterprise_ready` returned `account_invalid`.
- Despite the Connect blocker, Stripe CLI successfully triggered a real test-mode `checkout.session.completed` event against the registered webhook endpoint. Railway HTTP logs recorded `POST /api/public/stripe/webhook 200`, and staging DB inspection confirmed:
  - donor `pilot.webhook.enterprise@example.com` was created for `Pilot Enterprise Org`
  - one donation ledger row was created with amount `25 USD`
  - one processed `StripeWebhookEvent` row was recorded for the event

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

- Enterprise org: `onboardingStatus=ENABLED`, `chargesEnabled=true`, `payoutsEnabled=true`, but connected account ID is a staging placeholder and not a real Stripe test connected account
- Growth pending org: `onboardingStatus=IN_PROGRESS`, `chargesEnabled=false`, `payoutsEnabled=false`, and its stored connected account ID is also still a staging placeholder

Additional seeded accounting/donor evidence:

- Enterprise org donors: `2`
- Enterprise org campaigns: `3`
- Enterprise org funds: `1`
- Enterprise org donation receipts: `1`
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
curl -sS -X POST https://staging.magnusnonprofitservices.com/api/public/campaigns/pilot-enterprise-public-live/checkout
curl -sS -X POST https://staging.magnusnonprofitservices.com/api/public/campaigns/pilot-growth-connect-pending-live/checkout
curl -sS https://staging.magnusnonprofitservices.com/api/public/campaigns/pilot-enterprise-draft
curl -sS https://staging.magnusnonprofitservices.com/api/public/campaigns/pilot-enterprise-archived
curl -sS -b /private/tmp/enterprise-stripe-status.cookies https://staging.magnusnonprofitservices.com/api/org/stripe-connect/status
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
| Registered test-mode webhook destination created | Pass | Stripe Workbench now shows a single active destination `we_1Tjl3...Ukrf`, URL `/api/public/stripe/webhook`, and one enabled event: `checkout.session.completed` |
| API redeployed after fresh Stripe secret + webhook secret update | Pass | Railway deployment `6afc2f5d-ea41-494c-8148-8350efd998fa` is `ACTIVE`; deploy logs show clean migrations, API startup on `4010`, and Redis-backed rate limiter active |
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
| Stripe test mode only | Pass | The staging API now runs with a current `sk_test_...` key, the staging web/API publishable value is `pk_test_...`, and the only active staging webhook destination is a non-live Stripe Workbench/test endpoint. |
| Enterprise connected account seed | Blocked | Authenticated enterprise `GET /api/org/stripe-connect/status` and Railway SSH DB inspection both confirmed the placeholder `acct_stage_enterprise_ready`; Stripe Workbench account listing returned no real connected accounts. |
| Enterprise public checkout creation | Blocked | `POST /api/public/campaigns/pilot-enterprise-public-live/checkout` returned HTTP `500`; direct Stripe API reproduction with `Stripe-Account: acct_stage_enterprise_ready` returned `account_invalid`, proving the placeholder account is unusable. |
| Webhook signature path exercised through registered destination | Pass | `stripe trigger checkout.session.completed` delivered a real test-mode event to `POST /api/public/stripe/webhook`, Railway HTTP logs recorded HTTP `200`, and staging DB inspection confirmed a donor row, donation ledger row, and processed `StripeWebhookEvent` record. |

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

- A real Stripe test-mode webhook destination now exists for `checkout.session.completed`.
- `accord-org-dashboard-api-staging` was redeployed after both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` were refreshed.
- The staging webhook verification path is now proven with a real processed `checkout.session.completed` test event.
- Enterprise checkout still returns HTTP `500`.
- The enterprise org's stored Stripe Connect account ID is `acct_stage_enterprise_ready`, which is a staging placeholder and not a real Stripe test connected account.
- Stripe Workbench still shows no connected accounts in the current test account.
- Codex successfully re-authorized Stripe CLI, but Stripe rejected connected-account creation because the Stripe platform account still cannot create Connect accounts.
- Until Stripe finishes that platform-side Connect enablement, Codex cannot create the real `acct_...` connected account needed to replace the placeholder enterprise seed.

To unblock the private pilot, a human with Stripe Dashboard access must:

1. Wait for Stripe to finish the current Connect verification / platform enablement on `https://dashboard.stripe.com/connect`.
2. Create or identify a real Stripe test connected account that can create test Checkout Sessions.
3. Update the enterprise staging org's `StripeConnectAccount.stripeAccountId` from `acct_stage_enterprise_ready` to that real test `acct_...`.
4. Keep the row `onboardingStatus=ENABLED`, `chargesEnabled=true`, and `payoutsEnabled=true` only if the Stripe test account is actually usable.
5. Rerun enterprise checkout creation and webhook delivery smoke.
6. Rotate the exposed webhook signing secret after verification because it appeared in the setup UI/tool transcript.

Production GA was not deployed.
Public beta was not claimed.
No fake smoke evidence was created.
