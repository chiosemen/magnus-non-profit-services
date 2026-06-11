# P0 Production Hardening Local Verification

Date/time: 2026-06-11 16:21:31 EDT
Branch: `chore/p0-production-hardening-accord`
Commit hash: `89676eb90f9c6dedc63b335bb8531485a8002a51`

## Verdict

**LOCAL P0 GATE PASSED**

This is a local hardening gate only. It does not certify GA/production readiness and does not replace staging smoke evidence.

## Command Results

| Command | Result | Summary |
| --- | --- | --- |
| `git status --short` | PASS | Dirty hardening branch captured; no commit made. |
| `pnpm --version` | PASS | `10.29.3`. |
| `pnpm --filter @magnus/config test` | PASS | Build succeeded; 12 tests passed. |
| `pnpm --filter @magnus/subscription test` | PASS | Build succeeded; 17 tests passed, including fail-closed entitlement checks. |
| `pnpm --filter @magnus/db prisma:generate` | PASS | Prisma Client v5.22.0 generated from `packages/db/prisma/schema.prisma`; no migration created. |
| `pnpm --filter @magnus/db build` | PASS | `tsc -p tsconfig.build.json` passed. |
| `pnpm --filter @magnus/org-autonomous-ops-context build` | PASS | `tsc -p tsconfig.json` passed. |
| `pnpm --filter @magnus/org-autonomous-ops-context test` | PASS | Build succeeded; 86 tests total: 77 passed, 9 skipped because `DATABASE_URL` was unreachable. |
| `pnpm --filter @magnus/org-dashboard-api test` | PASS | Build succeeded; 11 tests passed. Subscription denial audit logs were emitted by expected gate tests. |
| `pnpm --filter @magnus/web test` | PASS | 34 tests passed, including Redis fail-closed assertions. |
| `pnpm --filter @magnus/mcp-connector test` | PASS | Build succeeded; 30 tests passed, including MCP subscription and Redis fail-closed assertions. |
| `pnpm -r exec tsc --noEmit` | PASS | Full monorepo typecheck completed with no diagnostics. |
| Docs overclaim search | PASS | No matches for unsupported production-certification language. |
| `rg -n "requireFeature\\(" apps packages` | PASS | App-layer usage found in Claude Partner, MCP connector, and org-dashboard subscription gates, plus package source/tests. |
| `NODE_ENV=production REDIS_URL= pnpm --filter @magnus/web test` | PASS | 34 tests passed; production missing Redis is asserted to fail closed. |
| `NODE_ENV=production REDIS_URL= pnpm --filter @magnus/mcp-connector test` | PASS | Build succeeded; 30 tests passed; production missing Redis is asserted to fail closed. |

## Inspection Notes

### Build/Typecheck

- `@magnus/db`, `@magnus/org-autonomous-ops-context`, `@magnus/org-dashboard-api`, `@magnus/web`, and `@magnus/mcp-connector` all passed required local checks.
- Full recursive TypeScript validation passed with no diagnostics.

### Documentation Truth

- The required docs search returned no active matches for the unsupported launch-readiness claim phrases listed in the hardening prompt.

### Subscription Gate Wiring

- `requireFeature` is wired through app-layer adapters:
  - `apps/org-dashboard-api/src/subscriptionGate.ts`
  - `apps/mcp-connector/src/subscriptionGate.ts`
  - `apps/claude-partner/src/api/subscriptionGate.ts`
- MCP `/tools/execute` uses auth/audit/rate-limit middleware before `mcpToolSubscriptionGate()`, and the gate runs before the tool handler.
- Unknown MCP tool mappings default deny with `FEATURE_NOT_ENABLED`.

### Redis Production Fail-Closed

- Web and MCP production-empty-Redis test commands passed because tests assert production boot/limiter failure, not because memory fallback is allowed.
- Runtime limiter backend errors are covered by package tests and return/fail closed instead of silently allowing traffic.

### Campaign/Stripe Canonical Model

- `apps/org-dashboard-api/src/server.ts` registers:
  - `registerStripeConnectRoutes(app, jwtAuth, { gateway: stripeGateway })`
  - `registerCampaignRoutes(app, jwtAuth)`
  - `registerPublicDonationRoutes(app)`
- The obsolete combined `stripeCampaignRoutes`/`stripeCampaignService` layer is removed from the active compile surface; remaining search matches are regression assertions.
- Campaign admin routes use `Campaign.title` and route through `campaignService`.
- Stripe Connect onboarding/status routes use `stripeConnectService`.
- Public donation routes remain separate and public.

### Public Donation Safety

- Public campaign read requires a live campaign.
- Public checkout requires:
  - valid slug,
  - positive amount,
  - donor email/name,
  - redirect URLs,
  - live campaign,
  - Stripe Connect account with `onboardingStatus === 'ENABLED'`,
  - `chargesEnabled === true`,
  - configured `STRIPE_SECRET_KEY`.
- Webhook route fails closed when `STRIPE_WEBHOOK_SECRET` is missing and verifies Stripe signatures before processing.

### Prisma Schema/Service Alignment

- Prisma generate passed using the repo script.
- Schema remains the source of truth for `Campaign.title`, `publishedAt`, `archivedAt`, and `StripeConnectAccount.onboardingStatus`.
- App/domain direct `@prisma/client` boundary leaks were not present outside the DB package after cleanup; direct imports remain in `packages/db` source/tests where the Prisma boundary is owned.
- No destructive migration or schema change was created.

## Remaining Known Gaps

- Staging smoke has not been run and should not be treated as complete from this local gate.
- DB-bound integration suites in `@magnus/org-autonomous-ops-context` skipped 9 tests because local `DATABASE_URL` was unreachable; this is documented and should be covered in an environment with a reachable test database.
- This report verifies the local P0 hardening gate only; it does not claim GA readiness.

## Staging Smoke Decision

Local P0 verification passed. Staging smoke may proceed after the operator reviews the dirty branch contents and confirms the target staging environment is isolated from live customer, donor, payment, and Stripe production data.
