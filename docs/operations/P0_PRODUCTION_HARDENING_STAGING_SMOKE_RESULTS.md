# P0 Production Hardening Staging Smoke Results

Date: 2026-06-17
Environment name: `magnus-accord-staging`
Scope: private pilot smoke only
Status: partial staging provisioned; DB migrations recovered; full pilot smoke blocked
Final verdict: PRIVATE PILOT BLOCKED

## Merge Evidence

- PR #7: `chore(accord): harden P0 production gates`
- PR #7 final branch HEAD before merge: `974936c490f75588feb8d6a4e9ba84109abbb345`
- PR #7 final CI/Docker run: `27709789967`
- PR #7 merge commit on `main`: `2f4f92a85300ecfabb0710ba596c11e62cda2b38`
- PR #8: `fix(accord): make stripe enum migration staging-safe`
- PR #8 head before merge: `096fd641ee149193c7f168e8d03db8192afcca74`
- PR #8 CI/Docker run: `27722691631`
- PR #8 checks: CI success, Docker Build Check success
- Current merged `main`: `d8a995cb700c7f4b57cd40c756654c7890e0bd18`

## Railway Provisioning Evidence

Railway project:

- Project name: `MAGNUS NON PROFIT SERVICES`
- Project ID: `d2653c3e-29af-4e73-9297-bb7cef9f770e`
- Environment: `staging`
- Environment ID: `6df58eb6-fbbc-4be1-aaa8-f9ec60be940c`

Provisioned services:

| Service | Railway status | Latest deployment |
| --- | --- | --- |
| `Postgres` | `SUCCESS` | `ec61b066-a12d-4355-9fda-9eafd9ea0177` |
| `Redis` | `SUCCESS` | `3bd3d0f8-6bd8-417c-8475-62e953a8d41f` |
| `accord-web` | `SUCCESS` | `12f99181-6fa8-4ed7-ac9c-34bdc7b8f154` |
| `accord-mcp-connector` | `SUCCESS` | `58dce067-62cc-4584-8c14-fab073dc7857` |
| `accord-org-dashboard-api` | Not deployed | blocked by missing Stripe test-mode secrets |

Staging URLs:

- Web: `https://accord-web-staging.up.railway.app`
- Org Dashboard API: `https://accord-org-dashboard-api-staging.up.railway.app`
- MCP Connector: `https://accord-mcp-connector-staging.up.railway.app`
- Custom web domain: `https://staging.magnusnonprofitservices.com`

Custom domain / DNS:

- Desired custom domain: `staging.magnusnonprofitservices.com`
- Cloudflare zone ID: `ac889d...35ce`
- DNS records created: yes
- Railway custom-domain ID: `d7bc521b...5af0`
- Railway required CNAME: `staging.magnusnonprofitservices.com` -> `a8jp35gf.up.railway.app`
- Railway required TXT: `_railway-verify.staging.magnusnonprofitservices.com` -> Railway verification token, value redacted
- Cloudflare CNAME record: `79777388...07e6f3` `CNAME` `staging.magnusnonprofitservices.com` -> `a8jp35gf.up.railway.app`, DNS only, TTL auto
- Cloudflare TXT record: `2d80ec92...e25017` `TXT` `_railway-verify.staging.magnusnonprofitservices.com` -> Railway verification token, value redacted, TTL auto
- Cloudflare API re-read: both records present with expected names, types, targets, DNS-only proxy status, and TTL auto
- `dig +short CNAME staging.magnusnonprofitservices.com`: `a8jp35gf.up.railway.app.`
- `nslookup staging.magnusnonprofitservices.com`: CNAME resolves to `a8jp35gf.up.railway.app`, which resolved to an IP address
- Custom domain HTTPS status: pass
- `GET https://staging.magnusnonprofitservices.com/`: HTTP `200`, title `Magnus`, body size `12184` bytes
- Root domain touched: no
- `www` touched: no

Configured non-secret/non-value evidence:

- `DATABASE_URL`: set through Railway Postgres reference for app services
- `REDIS_URL`: set through Railway Redis reference for app services
- `JWT_SECRET`: generated staging-only value, redacted
- `ENCRYPTION_KEY`: generated staging-only value, redacted
- `NEXT_PUBLIC_APP_URL`: staging web URL
- `API_URL`: staging org-dashboard-api URL
- `MCP_CONNECTOR_URL`: staging MCP URL
- `FEATURE_FLAG_MCP_LIVE=false`
- `FEATURE_FLAG_WORKER_FINANCIALS=false`
- `FEATURE_FLAG_MOBILE=false`

Missing Stripe variables for org-dashboard-api:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Rejected Stripe inputs:

- Live-mode Stripe publishable and restricted keys were provided during the staging provisioning thread.
- They were not used because this pilot requires Stripe test mode only.
- The exposed live-mode keys should be revoked/rotated in Stripe before any further production activity.

## Deployment Evidence

Web:

- First staging web deploy with no config used Railway default `node /app/index.js` and failed.
- Second staging web deploy built but failed at runtime because the temporary start command passed `-- -p 8080` to Next.js.
- Final staging web deploy `12f99181-6fa8-4ed7-ac9c-34bdc7b8f154` succeeded after using `pnpm --filter @magnus/web exec next start -p $PORT -H 0.0.0.0`.

MCP:

- Staging MCP deploy `58dce067-62cc-4584-8c14-fab073dc7857` succeeded with `/health` as the Railway healthcheck.

Org Dashboard API:

- Not deployed.
- Reason: `NODE_ENV=production` startup validation requires valid Stripe test-mode env vars.
- Live-mode Stripe keys were intentionally not configured.

## Staging DB Migration Evidence

Initial failure:

- Command attempted with Railway Postgres public staging URL: `pnpm --filter @magnus/db prisma:deploy`.
- Migration `20260527181000_add_s4np_phase_2_stripe_connect` failed with Prisma `P3018`.
- Database error code: `42710`.
- Database error: duplicate enum label `STRIPE`.
- Root cause: `20260527174500_add_s4np_models` already creates `DonationSource.STRIPE`, while `20260527181000_add_s4np_phase_2_stripe_connect` tried to add it again.

Recovery fix:

- PR #8 made the stale Phase 2 migration idempotent and kept the final canonical schema aligned to `Campaign.title`.
- PR #8 made later Stripe Connect and Campaign migrations tolerate pre-existing canonical objects.
- Local verification before merge:
  - `pnpm --filter @magnus/db prisma:generate`: pass
  - `pnpm --filter @magnus/db build`: pass
  - `pnpm --filter @magnus/org-dashboard-api test`: pass
  - `pnpm -r exec tsc --noEmit`: pass
  - temporary local Postgres `pnpm --filter @magnus/db prisma:deploy`: all 20 migrations applied successfully
  - compiled DB tests with explicit file glob: pass, 28 passing and 2 expected skips for unavailable/stale local DB integration targets

Staging recovery commands:

```bash
DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm --filter @magnus/db prisma migrate resolve --rolled-back 20260527181000_add_s4np_phase_2_stripe_connect
DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm --filter @magnus/db prisma:deploy
DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm --filter @magnus/db prisma migrate status
```

Staging recovery results:

- Failed migration marked rolled back: pass
- Patched migration deploy: pass
- Applied migrations during recovery:
  - `20260527181000_add_s4np_phase_2_stripe_connect`
  - `20260527221311_seed_organizations_if_needed`
  - `20260528190000_add_stripe_connect_foundation`
  - `20260528210000_add_campaign_admin_foundation`
- Final Prisma status: `Database schema is up to date!`

Post-recovery schema inspection:

- `Campaign.title`: present, non-null
- `Campaign.name`: absent from selected canonical inspection
- `Campaign.publishedAt`: present
- `Campaign.archivedAt`: present
- `Campaign_orgId_slug_key`: present
- `Campaign_slug_key`: absent
- `StripeConnectAccount.onboardingStatus`: present, non-null
- `StripeConnectAccount.requirementsCurrentlyDue`: present
- `StripeConnectAccount.onboardingLinkExpiresAt`: present

## Staging Smoke Results

Commands used for successful web/MCP checks:

```bash
curl -sS -D /tmp/accord-web-headers.txt -o /tmp/accord-web-body.html https://accord-web-staging.up.railway.app/
curl -sS -o /tmp/mcp-health.json -w '%{http_code}' https://accord-mcp-connector-staging.up.railway.app/health
curl -sS -o /tmp/mcp-no-auth.json -w '%{http_code}' \
  -H 'content-type: application/json' \
  -d '{"toolName":"get-donor-summary","params":{}}' \
  https://accord-mcp-connector-staging.up.railway.app/tools/execute
curl -sS -o /tmp/mcp-invalid-auth.json -w '%{http_code}' \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer invalid-token' \
  -d '{"toolName":"get-donor-summary","params":{}}' \
  https://accord-mcp-connector-staging.up.railway.app/tools/execute
```

Observed results:

| Check | Result | Evidence |
| --- | --- | --- |
| Web page responds | Pass | `GET /` on web returned HTTP `200`, title `Magnus`, body size `12184` bytes |
| Custom domain web page responds | Pass | `GET https://staging.magnusnonprofitservices.com/` returned HTTP `200`, title `Magnus`, body size `12184` bytes |
| Unsupported launch claim scan on web HTML | Pass | `GREEN`, `certified`, `production-ready`, `no-blockers`, and native-mobile-shipped pattern count: `0` |
| Unsupported launch claim scan on custom domain HTML | Pass | `GREEN`, `certified`, `production-ready`, `no-blockers`, and native-mobile-shipped checks were clear |
| MCP connector health | Pass | `GET /health` returned HTTP `200` with `{"ok":true}` |
| MCP missing auth denied | Pass | `POST /tools/execute` without auth returned HTTP `401` with `{"error":"AUTH_REQUIRED"}` |
| MCP invalid auth denied | Pass | `POST /tools/execute` with invalid bearer token returned HTTP `401` with `{"error":"AUTH_INVALID"}` |
| Postgres service online | Pass | Railway service status `SUCCESS` |
| Redis service online | Pass | Railway service status `SUCCESS` |
| Prisma migration status | Pass | `Database schema is up to date!` |
| Campaign canonical schema | Pass | `Campaign.title` present, org-scoped slug index present |
| Stripe Connect canonical schema | Pass | `StripeConnectAccount.onboardingStatus` present |
| Org-dashboard-api health | Blocked | API not deployed because valid Stripe test secrets are missing |
| Subscription gates enforced | Blocked | Requires API deployment and seeded orgs |
| MCP denied for public/non-entitled tiers | Blocked | Requires seeded orgs/JWTs |
| MCP internal/operator-only allow path | Blocked | Requires internal/operator entitlement seed |
| Donor CRM tier access | Blocked | Requires API deployment and seeded orgs |
| Campaign admin access | Blocked | Requires API deployment and seeded campaigns |
| Public campaign read | Blocked | Requires API deployment and seeded campaigns |
| Unpublished/archived campaign not donation-actionable | Blocked | Requires API deployment and seeded campaigns |
| Stripe test mode only | Blocked | Valid Stripe test secrets missing |
| Stripe Connect readiness required | Blocked | Requires API deployment and seeded campaigns |
| Donation/payment write paths rate-limited | Blocked | Requires API deployment |
| Redis proof for API write paths | Blocked | Redis exists, but API write paths are not deployed |
| Missing Redis production config fails closed | Not rerun in staging sprint | Previously covered by branch verification; not a live staging service check |
| Accounting page says `Pilot review mode` | Not run | Requires authenticated web session/seed |
| Worker Financial Layer not public | Not run | Requires authenticated/product surface traversal |
| Grant Generator not public standalone | Not run | Requires authenticated/product surface traversal |
| Native mobile not claimed as shipped | Partially pass | Web HTML scan found no native-mobile-shipped claim; full docs/UI pass not run |

## Current Decision

Private pilot smoke is not complete.

Staging infrastructure is real and partially verified:

- Railway staging exists.
- Postgres and Redis are online.
- Prisma migrations are up to date after PR #8.
- Web is deployed and responding on Railway and the custom domain.
- MCP is deployed and correctly denies missing/invalid auth.
- Root domain and `www` were not changed.

Pilot remains blocked by:

- missing valid Stripe test-mode secrets;
- org-dashboard-api not deployed;
- missing seed data;
- authenticated/API smoke not run.

Production GA was not deployed.
Public beta was not claimed.
No fake smoke evidence was created.
