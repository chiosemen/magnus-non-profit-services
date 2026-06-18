# P0 Production Hardening Staging Smoke Results

Date: 2026-06-18
Environment name: `magnus-accord-staging`
Scope: private pilot smoke only
Status: staging infrastructure real; non-payment private-pilot flows verified live; native donation checkout intentionally disabled in payment-gated mode pending Stripe Connect platform verification
Final verdict: PRIVATE PILOT READY — PAYMENT-GATED MODE

## Merge And Deploy Context

- PR #7 merge commit on `main`: `2f4f92a85300ecfabb0710ba596c11e62cda2b38`
- Staging migration recovery merged via PR #8.
- Staging evidence refresh merged via PR #9:
  - Merge commit: `9030f8ba432e954aae3a0abd8ef3b1cd6b93092a`
- Current payment-gated pilot follow-up was deployed from the clean execution repo on 2026-06-18:
  - local execution repo: `/tmp/magnus-accord-p0-fix`
  - local branch: `codex/stripe-pilot-unblock-evidence`
  - purpose: keep private pilot open while Stripe Connect platform verification remains pending

This follow-up did not enable payments. It converted the remaining payment-path failure mode from an unsafe pilot blocker into an explicit gated pilot state:

- public campaign pages remain readable;
- dashboard, donor CRM, campaigns, accounting, board readiness, and other non-payment pilot surfaces remain usable;
- native checkout returns an expected non-500 gated response;
- no fake Stripe connected-account readiness is claimed.

## Railway Provisioning Evidence

Railway project:

- Project name: `MAGNUS NON PROFIT SERVICES`
- Project ID: `d2653c3e-29af-4e73-9297-bb7cef9f770e`
- Environment: `staging`
- Environment ID: `6df58eb6-fbbc-4be1-aaa8-f9ec60be940c`

Provisioned services:

| Service | Railway status | Latest deployment ID |
| --- | --- | --- |
| `accord-web-staging` | `SUCCESS` | `4d040ff8-ba3d-419e-a34c-dfa35eb9e3d6` |
| `accord-org-dashboard-api-staging` | `SUCCESS` | `9a7d4fee-33d3-457c-a666-128d81b96a28` |
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
- `PAYMENTS_ENABLED=false`
- `FEATURE_FLAG_MCP_LIVE=false`
- `FEATURE_FLAG_WORKER_FINANCIALS=false`
- `FEATURE_FLAG_MOBILE=false`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

Staging URL alignment:

- `NEXT_PUBLIC_APP_URL` on web: `https://staging.magnusnonprofitservices.com`
- `NEXT_PUBLIC_APP_URL` on org-dashboard-api: `https://staging.magnusnonprofitservices.com`
- `ORG_DASHBOARD_API_BASE_URL` on web points to the named staging org-dashboard-api URL

Payment-gated evidence:

- `PAYMENTS_ENABLED=false` is active on `accord-org-dashboard-api-staging`.
- `GET /api/public/campaigns/pilot-enterprise-public-live` now returns `paymentsEnabled:false`.
- Browser verification on `https://staging.magnusnonprofitservices.com/campaigns/pilot-enterprise-public-live` showed:
  - `Pilot Payment Status`
  - `Payments are not enabled in this private pilot.`
  - `Use your existing donation processor while Magnus Accord tracks campaign readiness.`
  - `Stripe Connect verification pending.`
  - disabled button text: `Payments Disabled For Pilot`
- `POST /api/public/campaigns/pilot-enterprise-public-live/checkout` now returns HTTP `503` with `PAYMENT_PROCESSING_NOT_ENABLED`, not HTTP `500`.
- `POST /api/public/campaigns/pilot-growth-connect-pending-live/checkout` also returns the same safe gated HTTP `503` response while pilot payments are disabled.

Stripe-mode evidence retained for future payment-live work:

- Staging still uses Stripe test-mode variables only.
- The current registered webhook destination remains:
  - URL: `https://accord-org-dashboard-api-staging-staging.up.railway.app/api/public/stripe/webhook`
  - Webhook destination ID: `we_1Tjl3...Ukrf`
  - Enabled event list: `checkout.session.completed`
- No live Stripe keys were intentionally used for this staging evidence run.

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

- Enterprise org still carries a placeholder connected-account reference and must not be treated as payment-ready
- Growth pending org remains onboarding-incomplete and payment-blocked
- Those rows are no longer pilot blockers because `PAYMENTS_ENABLED=false` prevents native donor checkout for all public pilot traffic

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
```

Observed results:

| Check | Result | Evidence |
| --- | --- | --- |
| Web health | Pass | `GET https://staging.magnusnonprofitservices.com/api/health` returned HTTP `200` with `{"ok":true}` |
| Org-dashboard-api health | Pass | `GET https://accord-org-dashboard-api-staging-staging.up.railway.app/health` returned HTTP `200` with `{"ok":true}` |
| MCP connector health | Pass | `GET https://accord-mcp-connector-staging-staging.up.railway.app/health` returned HTTP `200` with `{"ok":true}` |
| Missing auth denied | Pass | `GET /api/auth/me` without cookies returned HTTP `401` with `{"error":"AUTH_REQUIRED"}` |
| Invalid auth denied | Pass | Invalid cookie and invalid bearer attempts were denied with HTTP `401`; no pilot route accepted malformed credentials |
| Enterprise custom-domain session works | Pass | Enterprise register/login flow on the custom domain returned HTTP `200`; authenticated org routes resolved successfully in staging |
| Starter custom-domain session works | Pass | Starter register/login flow on the custom domain returned HTTP `200`; starter-only routes remained readable while premium routes stayed gated |
| Donor CRM tier access | Pass | Enterprise `/api/org/donors` returned HTTP `200` with donor rows |
| Campaign admin access | Pass | Enterprise `/api/org/campaigns` returned HTTP `200` with `LIVE`, `DRAFT`, and `ARCHIVED` campaigns |
| Fund accounting gated by tier | Pass | Enterprise `/api/org/accounting/funds` returned HTTP `200`; starter `/api/org/accounting/funds` returned HTTP `403` `FEATURE_NOT_ENABLED` |
| Subscription gates enforced | Pass | Starter fund-accounting denial and enterprise allow-path were both observed on live staging |
| Public campaign read | Pass | `GET /api/public/campaigns/pilot-enterprise-public-live` returned HTTP `200` with the live campaign payload and `paymentsEnabled:false` |
| Public campaign page communicates payment-gated pilot state | Pass | Live browser verification showed `Pilot Payment Status`, the three payment-gated pilot guidance lines, and a disabled `Payments Disabled For Pilot` button |
| Unpublished campaign not donation-actionable | Pass | `GET /api/public/campaigns/pilot-enterprise-draft` returned HTTP `400` with `Campaign is not currently accepting donations.` |
| Archived campaign not donation-actionable | Pass | `GET /api/public/campaigns/pilot-enterprise-archived` returned HTTP `400` with `Campaign is not currently accepting donations.` |
| Native checkout intentionally disabled for pilot | Pass | `POST /api/public/campaigns/pilot-enterprise-public-live/checkout` returned HTTP `503` with `PAYMENT_PROCESSING_NOT_ENABLED` and the explicit pilot guidance message |
| Stripe Connect-dependent payment writes blocked safely | Pass | `POST /api/public/campaigns/pilot-growth-connect-pending-live/checkout` returned the same HTTP `503` gated pilot response instead of a server error |
| Registered test-mode webhook destination retained | Pass | Stripe Workbench still shows the active destination `we_1Tjl3...Ukrf`, URL `/api/public/stripe/webhook`, and one enabled event: `checkout.session.completed` |
| API redeployed after payment-gated update | Pass | Railway deployment `9a7d4fee-33d3-457c-a666-128d81b96a28` is `SUCCESS`; health checks stayed green after the payment-gated change |
| MCP missing auth denied | Pass | `POST /tools/execute` without auth returned HTTP `401` `AUTH_REQUIRED` |
| MCP invalid auth denied | Pass | `POST /tools/execute` with invalid bearer token returned HTTP `401` `AUTH_INVALID` |
| MCP denied for public/non-entitled tiers | Pass | Public and non-entitled pilot access remains denied; MCP is not exposed as a public pilot surface |
| MCP internal/operator-only allow path | N/A | No internal/operator entitlement seed exists in staging; optional allow-path not configured |
| Donation/payment write paths rate-limited | Pass | In-container burst against the payment-gated checkout path produced `300` HTTP `503` responses followed by `30` HTTP `429` responses |
| Redis-backed rate limiting active | Pass | API startup log contains `[magnus:org-dashboard-rate-limit] Redis-backed rate limiter active (multi-instance safe).` and the in-container burst hit HTTP `429` after the limit |
| Missing Redis production config fails closed | Pass | Blank `REDIS_URL` build failed with `Invalid environment configuration for web: REDIS_URL` |
| Positive production-like web build with Redis configured | Pass | `railway run -s accord-web-staging -e staging -- pnpm --filter @magnus/web build` completed successfully |
| Accounting page says `Pilot review mode` | Pass | Playwright-authenticated visit to `/app/accounting` plus `Board financial summary` tab showed `Status: Pilot review mode` |
| Unsupported `GREEN` / `certified` / `production-ready` / `no-blockers` claims absent | Pass | Root page and authenticated accounting-page text scans returned zero matches |
| Worker Financial Layer not public | Pass | `/api/autonomous-ops/connectors` returned only the `claudePartner` panel; no Worker Financial Layer panel was client-visible |
| Grant Generator not public standalone | Pass | `/api/autonomous-ops/connectors` returned only the `claudePartner` panel; no Grant Generator panel was client-visible |
| Native mobile not claimed as shipped | Pass | Root page and authenticated accounting-page text scans returned zero `native mobile` claim matches |
| Stripe test mode only | Pass | Staging uses test-mode Stripe variables only; no live Stripe keys were intentionally used for pilot evidence |
| Webhook signature path previously exercised through registered destination | Pass | Earlier same-day Stripe test-mode webhook evidence remains valid; keeping native checkout gated does not require fake payment completion evidence |

## Current Decision

Private pilot can proceed in payment-gated mode.

Allowed private-pilot surfaces:

- web access
- authenticated dashboard
- donor CRM
- campaign admin
- public campaign read pages
- fund accounting lite
- board packet readiness
- AI Concierge where already gated and available
- compliance reminders
- manual or off-platform donation tracking where already supported

Intentionally blocked or disabled for this pilot:

- native Magnus Accord checkout
- connected-account payouts
- Stripe Connect-dependent donation payment writes
- any UI implying payment processing is live
- any fake connected-account readiness

Why the pilot is now ready:

- all core staging services are healthy;
- authentication and tier gates are working;
- public campaign read paths work;
- draft and archived campaigns remain non-actionable;
- Redis fail-closed behavior remains intact;
- donation and payment write paths now fail safely with a clear gated pilot response instead of HTTP `500`;
- unsupported public claims remain absent;
- Stripe Connect placeholder state is contained behind the pilot payment gate rather than exposed to donors.

## Deferred Payment-Live Work

Native payments remain intentionally out of scope for this private pilot until a separate payments-live gate is completed.

Required future work before any payment-live claim:

1. Finish Stripe Connect platform verification / enablement.
2. Replace placeholder connected-account references with real test connected accounts.
3. Re-enable native checkout only after explicit approval and a separate payment-write smoke pass.
4. Re-verify webhook, checkout, and payout-adjacent behavior under the real connected-account path.
5. Continue to avoid live Stripe keys for donor/customer testing.

Production GA was not deployed.
Public beta was not claimed.
No fake smoke evidence was created.
