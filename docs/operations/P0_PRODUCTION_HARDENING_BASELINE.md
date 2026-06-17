# P0 Production Hardening Baseline

Date: 2026-06-11
Branch: `chore/p0-production-hardening-accord`
Created from: `feature/s4np-donor-crm-phase-1` at `89676eb` (`merge(main): resolve conflicts for S4NP vertical and stripe connect integration`)

## Scope Guardrails

This baseline is evidence capture only. No product features, UI redesigns, business logic changes, schema changes, migrations, production data changes, payment data changes, or Stripe production data changes were made.

## Repository State

| Command | Result | Summary |
| --- | --- | --- |
| `pwd` | PASS | `/Users/chinyeosemene/Code/magnus-local` |
| `git status --short` | PASS | No output before report creation; working tree was clean. |
| `git branch --show-current` | PASS | `chore/p0-production-hardening-accord` |
| `git log --oneline -n 10 --decorate` | PASS | Head is `89676eb`; latest history includes S4NP donor CRM, campaign foundation, Stripe Connect foundation, and prior production-hardening certification docs. |
| `pnpm --version` | PASS | `10.29.3` |

Initial branch before creating the hardening branch was `feature/s4np-donor-crm-phase-1`, also clean at `89676eb`.

## Baseline Validation Commands

| Command | Pass/Fail | Exact failure summary | Likely owner |
| --- | --- | --- | --- |
| `pnpm --filter @magnus/subscription test` | FAIL | `pnpm build` succeeds, then `node --test dist/tests` fails with `MODULE_NOT_FOUND` for `/packages/subscription/dist/tests`. The emitted files are under `dist/tests/*.test.js`, but the script invokes the directory path. | `packages/subscription/package.json` test script |
| `pnpm --filter @magnus/config test` | FAIL | First attempt hit transient shell `spawn sh EAGAIN`; rerun produced real blocker: `packages/config/src/env.ts(229,5): error TS1117: An object literal cannot have multiple properties with the same name.` | `packages/config/src/env.ts` |
| `pnpm --filter @magnus/web test` | PASS | 29/29 Node tests pass. Important hardening note: current tests explicitly accept `RateLimiterMemory` fallback when `REDIS_URL` is absent. | `apps/web/src/lib/rate-limit.ts`, `apps/web/__tests__/wave2-security.test.js` |
| `pnpm --filter @magnus/mcp-connector test` | PASS | Build plus 22/22 smoke/truth-integrity tests pass. Search findings below still show hardening issues outside this command's assertions. | `apps/mcp-connector` |
| `pnpm --filter @magnus/org-dashboard-api test` | FAIL | Build fails before tests. TypeScript errors: `name` is not valid for `CreateCampaignInput`/`UpdateCampaignInput`; `donorCrmRoutes.ts` passes 3 args where 2 are expected; `stripe` module/types are missing in `server.ts` and `stripeConnectRoutes.ts`. | `apps/org-dashboard-api/src/conciergeRoutes.ts`, `donorCrmRoutes.ts`, `server.ts`, `stripeCampaignRoutes.ts`, `stripeConnectRoutes.ts`; package deps |
| `pnpm --filter @magnus/org-autonomous-ops-context build` | FAIL | First attempt hit transient shell `spawn sh EAGAIN`; rerun produced real blockers. Campaign service expects `title`, dates, `publishedAt`, `archivedAt`, and Stripe Connect `onboardingStatus`, but generated Prisma types expose campaign `name` and no onboarding status. Also missing export `getReceiptByDonationId`, missing `StripeConnectOnboardingStatus`, and tests still pass `name` where service types expect `title`. | `packages/org-autonomous-ops-context/src/campaignService.ts`, `stripeCampaignService.ts`, `stripeConnectService.ts`, `stripePaymentService.ts`, `index.ts`, tests; Prisma schema/generated types |
| `pnpm -r exec tsc --noEmit` | FAIL | Recursive typecheck stops at first package failure: `packages/config/src/env.ts(229,5): error TS1117` duplicate object property. | `packages/config/src/env.ts` |

## Targeted Search Findings

| Command | Result | Summary | Likely owner |
| --- | --- | --- | --- |
| `rg -n "MCP_CONNECTOR_URL" packages/config apps packages` | PASS | `packages/config/src/env.ts` declares/picks `MCP_CONNECTOR_URL` multiple times, including duplicate picks around lines 222 and 229. Grant generator MCP clients still default to `http://localhost:3001`; Claude partner requires `MCP_CONNECTOR_URL`. | `packages/config/src/env.ts`, `apps/grant-generator/services/*MCPClient.ts`, `apps/claude-partner/src/workflows/onboardingWorkflow.ts` |
| `rg -n "requireFeature\\(" apps packages` | PASS | Usage appears only in `packages/subscription/src/middleware/requireFeature.ts` and its tests. No app or HTTP route currently wires the middleware. | `packages/subscription`; route integration points in `apps/*` |
| Certification-language search | PASS | Multiple docs still overclaimed production readiness, historical score claims, and launch-color verification language. | `docs/operations/*`, `docs/verification/*`, `docs/security/EXTERNAL_PENTEST_READINESS.md` |
| `rg -n "registerStripeCampaignRoutes\|registerCampaignRoutes\|registerStripeConnectRoutes\|createCampaign\\(" apps packages` | PASS | `server.ts` registers `registerCampaignRoutes` and `registerStripeConnectRoutes`; `registerStripeCampaignRoutes` exists separately. There are multiple `createCampaign` service layers in API and org-autonomous context, with tests calling divergent DTO shapes. | `apps/org-dashboard-api/src/*Campaign*`, `packages/org-autonomous-ops-context/src/*Campaign*` |
| `rg -n "Unknown\|Unspecified\|healthScore: 50\|totalExpenses: 0\|netAssets: 0" apps/mcp-connector packages` | PASS | MCP WorkerService still emits `Unknown`, `Unspecified`, explicit zero financial metrics, and `healthScore: 50` defaults for org profile fields. | `apps/mcp-connector/src/services/WorkerService.ts` |
| `rg -n "@magnus/observability\|initObservability\|reportRequestError" apps packages` | PASS | Observability package exports `initObservability` and `reportRequestError`, but no app usage was found. | `packages/observability/src/index.ts`; app entrypoints |
| `rg -n "REDIS_URL\|RateLimiterMemory\|rate-limit\|rateLimit" apps packages` | PASS | Web and MCP both fall back to `RateLimiterMemory` when `REDIS_URL` is absent; web tests assert this fallback. Config marks `REDIS_URL` optional. | `apps/web/src/lib/rate-limit.ts`, `apps/mcp-connector/src/server.ts`, `packages/config/src/env.ts` |

## Recommended Order Of Fixes

1. Fix the `@magnus/config` duplicate `MCP_CONNECTOR_URL` pick first. This is the earliest repo-wide typecheck blocker and prevents `pnpm -r exec tsc --noEmit` from reaching later packages.
2. Resolve the campaign and Stripe Connect contract decision before code edits that depend on schema shape. Current generated types expose campaign `name` and lack `startsAt`, `endsAt`, `publishedAt`, `archivedAt`, and Stripe Connect `onboardingStatus`, while service/routes/tests expect a different contract. If this requires schema or migration changes, stop and document the safest non-destructive path before applying migrations.
3. Align duplicated campaign/Stripe route and service layers after the schema contract is chosen. Remove or quarantine divergent route/service entrypoints only if needed to restore existing intended behavior and tests.
4. Fix `@magnus/org-dashboard-api` build blockers: campaign DTO field mismatch, donor CRM function arity mismatch, and missing `stripe` dependency/type availability.
5. Fix `@magnus/org-autonomous-ops-context` build blockers against the chosen Prisma/service contract, including missing exports and stale tests.
6. Fix `@magnus/subscription` test invocation, then wire existing `requireFeature` middleware into HTTP routes only where it is already intended as a production gate. Add route-level verification for denied/allowed access.
7. Harden Redis behavior for production: fail closed or block startup when production lacks shared Redis, and update tests that currently certify memory fallback as acceptable.
8. Replace MCP fabricated profile defaults with explicit unavailable/null/error semantics that do not overstate financial or health data.
9. Wire existing observability hooks into app entrypoints/error paths once builds pass, with minimal smoke verification.
10. Correct production-readiness documentation claims after technical gates are green, then rerun staging smoke only after build, package tests, and repo typecheck pass.

## Baseline Verdict

Staging smoke is not trustworthy yet. The current hardening branch has reproducible P0 validation failures in config, subscription tests, org dashboard API, org autonomous ops context, and repo-wide typecheck. The first safe repair target is the config duplicate key because it blocks broader TypeScript evidence collection.

## Build/Typecheck Remediation

Date: 2026-06-11
Branch: `chore/p0-production-hardening-accord`

### Changes Applied

| Area | Minimal remediation |
| --- | --- |
| Config validation | Removed the duplicate `MCP_CONNECTOR_URL` pick from `packages/config/src/env.ts` while leaving the existing optional schema field intact. Updated config test script to run emitted `dist/tests/*.test.js`. Updated Stripe Connect URL fixtures so tests match the current fail-closed validator. |
| Prisma generated types | Ran the existing `@magnus/db` Prisma generation script against the checked-in schema. No schema changes or migrations were created. |
| Campaign contract drift | Aligned stale TypeScript callers and tests from old `Campaign.name` usage to current schema field `Campaign.title`; preserved existing JSON/display labels where callers still expose `name` as a response label. |
| Stripe Connect contract drift | Regenerated Prisma types restored current `StripeConnectOnboardingStatus` and onboarding fields from the existing schema. |
| Donor receipt export drift | Added the missing `getReceiptByDonationId(db, orgId, donationId)` service helper used by existing API routes. |
| API test harness | Updated `@magnus/org-dashboard-api` test script to run emitted `dist/tests/*.test.js`. |
| Dependency link state | Ran `pnpm install --frozen-lockfile`; lockfile was unchanged and the missing declared `stripe` package was linked into `node_modules`. |
| Repo-wide typecheck | Fixed stale campaign reads in `@magnus/db` tests and MCP connector tools, and added a local type-only Jest mock declaration for an existing web TS test included by `tsc --noEmit`. |

### Commands Run

| Command | Result | Summary |
| --- | --- | --- |
| `pnpm --filter @magnus/config test` | PASS | Build succeeded; Node test ran 10 tests, 10 passed. |
| `pnpm --filter @magnus/db prisma:generate` | PASS | Prisma Client v5.22.0 generated from `packages/db/prisma/schema.prisma`. |
| `pnpm --filter @magnus/db build` | PASS | `tsc -p tsconfig.build.json` passed. |
| `pnpm --filter @magnus/org-autonomous-ops-context build` | PASS | `tsc -p tsconfig.json` passed. |
| `pnpm --filter @magnus/org-dashboard-api test` | PASS | Build succeeded; Node test ran 8 tests, 8 passed. |
| `pnpm -r exec tsc --noEmit` | PASS | Recursive workspace typecheck completed with exit code 0 and no diagnostics. |
| `pnpm install --frozen-lockfile` | PASS | Lockfile was already up to date; linked one missing declared package (`stripe`) without dependency changes. |

### Scope Note For Build/Typecheck Remediation

That remediation only targeted build/typecheck blockers. Subsequent sections in this hardening report separately document documentation truth reconciliation, subscription gate wiring, Redis production fail-closed behavior, and Campaign/Stripe consolidation. MCP fabricated defaults, observability wiring, and staging smoke evidence remain outside this specific build/typecheck remediation section.

## Documentation Truth Reconciliation

Date: 2026-06-11
Branch: `chore/p0-production-hardening-accord`

### Current Truth

Magnus Accord is **Pilot/Staging Verification: In Progress**.

**Production Certification: Not Yet Approved.** Known P0 blockers remain. Historical launch, certification, occupancy, and phase-verification documents are retained as evidence, but they are not current launch approval.

### Blocker Matrix

| Gate | Current status | Documentation action |
| --- | --- | --- |
| Build/typecheck status | Remediated in hardening branch; keep as release gate | Baseline now records passing scoped commands and repo typecheck. |
| Subscription route gating | P0 blocker remains | Do not claim subscription enforcement on HTTP routes until wired and tested. |
| Redis fail-closed production behavior | Remediated for `apps/web` and `apps/mcp-connector`; keep as release gate | Production Redis requirements and runtime fail-closed behavior are now verified by scoped tests. |
| Campaign/Stripe consolidation | Remediated in hardening branch; keep as release gate | Canonical campaign admin, Stripe Connect, and public donation paths are now documented below with scoped tests. |
| Prisma generated type/schema alignment | Remediated for current branch; keep as release gate | Docs describe this as a current gate, not permanent certification. |
| Staging smoke evidence | Not trusted yet | Docs state smoke should run only after P0 gates pass. |
| Observability integration | P0 blocker remains | Historical observability claims are qualified as evidence, not universal app coverage. |
| Mobile scope | Deferred / not shipped | README and feature directory state mobile is absent until source, auth, tests, and release path exist. |
| Worker financial layer scope | Gated / scaffolded | Feature directory and README describe it as gated/scaffolded, not production capability. |
| Grant generator scope | Scaffolded / internal | Feature directory and README describe it as scaffolded/internal unless org-scoped API/tests are verified. |

### Files Reconciled

- `README.md`
- `BLOCKERS_TO_PRODUCTION.md`
- `docs/verification/S4NP_VERTICAL_CERTIFICATE_OF_OCCUPANCY.md`
- `docs/operations/FINAL_PRODUCTION_CERTIFICATION_AUDIT.md`
- `docs/operations/MAGNUS_ACCORD_EXECUTIVE_LAUNCH_MEMO.md`
- `docs/operations/MAGNUS_ACCORD_EXECUTIVE_LAUNCH_DECISION_MEMO.md`
- `docs/security/EXTERNAL_PENTEST_READINESS.md`
- `docs/security/SECURITY_EVIDENCE_PACK.md`
- `docs/product/MAGNUS_ACCORD_FEATURE_DIRECTORY.md`
- Historical verification docs under `docs/verification/` were mechanically relabeled from launch-color language to historical pass/fail evidence.

## Subscription Gate Wiring

Date: 2026-06-11
Branch: `chore/p0-production-hardening-accord`

### Changes Applied

| Area | Minimal remediation |
| --- | --- |
| Shared subscription middleware | Extended `requireFeature(featureKey)` to prefer upstream `req.auth.orgId`, reject conflicting client-provided `orgId`, preserve fail-closed JWT fallback behavior, and attach subscription context after successful policy evaluation. |
| Route/tool feature mapping | Added a central route/tool feature map in `@magnus/subscription` for org-dashboard premium route groups, Claude Partner routes, and MCP tool execution. Unknown MCP tool mappings default deny. |
| Org dashboard API | Added route-level gates after JWT auth and before handlers for campaign admin, fund accounting, concierge/proposal, grant, board/executive packet, executive rollup, and Stripe Connect admin routes. Public donation routes were not gated. |
| MCP connector | Added `/tools/execute` feature enforcement after existing auth/audit/rate-limit middleware and before tool handlers. Unknown tools now fail closed with `FEATURE_NOT_ENABLED`; auth errors use `AUTH_REQUIRED` / `AUTH_INVALID`. |
| Claude Partner API | Added route-level `claude_partner` enforcement after JWT auth and before onboarding, config, prompts, deploy, and message handlers. Existing service-level tier checks remain as defense in depth. |
| Audit logging | Denials log org id, subject/worker id, route/tool, required feature, tier/status when available, decision, timestamp, and request id. Logs avoid tokens, secrets, donor PII, payment details, and request payloads. |
| Tests | Added shared middleware/map tests, org-dashboard route denial tests, MCP mapping/deny tests, and Claude Partner gate tests including no subscription lookup before auth. |

### Commands Run

| Command | Result | Summary |
| --- | --- | --- |
| `rg -n "requireFeature\\(" apps packages` | PASS | Confirmed app-layer usage in `apps/org-dashboard-api/src/subscriptionGate.ts`, `apps/mcp-connector/src/subscriptionGate.ts`, and `apps/claude-partner/src/api/subscriptionGate.ts`, plus package tests/source. |
| `pnpm --filter @magnus/subscription test` | PASS | Build succeeded; Node test ran 17 tests, 17 passed. |
| `pnpm --filter @magnus/org-dashboard-api test` | PASS | Build succeeded; Node test ran 10 tests, 10 passed. |
| `pnpm --filter @magnus/mcp-connector test` | PASS | Build succeeded; Node test ran 25 tests, 25 passed. |
| `pnpm --filter @magnus/claude-partner test` | PASS | Build succeeded; Node test ran 10 tests, 10 passed. |
| `pnpm -r exec tsc --noEmit` | PASS | Recursive workspace typecheck completed with exit code 0 and no diagnostics. |
| `pnpm install` | PASS | Workspace dependency metadata refreshed after adding `@magnus/subscription` to app package manifests; lockfile updated for the new workspace importer edges. |

### Current Enforcement Notes

- Missing auth is rejected before subscription lookup in shared, org-dashboard, MCP, and Claude Partner tests.
- Starter orgs receive `403 FEATURE_NOT_ENABLED` for tested premium APIs.
- Inactive subscriptions receive `403 SUBSCRIPTION_NOT_ACTIVE`.
- Public donation checkout routes were left outside subscription auth scope.
- No production credentials, donor payloads, payment payloads, or full request bodies are logged by the new denial audit events.

## Redis Production Fail-Closed Gate

Date: 2026-06-11
Branch: `chore/p0-production-hardening-accord`

### Changes Applied

| Area | Minimal remediation |
| --- | --- |
| Web login rate limiter | `apps/web/src/lib/rate-limit.ts` now requires Redis in production. Missing `REDIS_URL` or Redis boot connection failure raises `RATE_LIMIT_BACKEND_UNAVAILABLE`; dev/test retain memory fallback with a visible warning. |
| Web auth route | `apps/web/src/app/api/auth/login/route.ts` maps rate-limit backend failures to `503 RATE_LIMIT_BACKEND_UNAVAILABLE` before credential processing or failure recording can proceed. |
| MCP rate limiter | `apps/mcp-connector/src/rateLimit.ts` centralizes Redis-backed limiter construction. Production missing Redis or Redis boot check failure throws before `listen`; dev/test retain memory fallback with a visible warning. Runtime backend errors return `503 RATE_LIMIT_BACKEND_UNAVAILABLE`; true limit exhaustion remains `429 TOO_MANY_REQUESTS`. |
| MCP boot path | `apps/mcp-connector/src/server.ts` now initializes the rate limiter before listening when run as the app entrypoint. |
| Config validation | `packages/config/src/env.ts` requires `REDIS_URL` for unified `web` production validation, and `packages/config/src/envValidator.ts` requires `REDIS_URL` for `mcp-connector` in production. |
| Tests | Added web rate-limit tests for production missing Redis, production Redis connection failure, dev fallback warning, test injection, and login 503 mapping. Added MCP rate-limit tests for production missing Redis, production Redis connection failure, dev/test fallback, configured Redis path, and runtime error classification. Added config tests for production-only Redis requirements. |

### Commands Run

| Command | Result | Summary |
| --- | --- | --- |
| `NODE_ENV=production REDIS_URL= pnpm --filter @magnus/web test` | PASS | Node test ran 34 tests, 34 passed; includes explicit production missing Redis and Redis connection failure assertions. |
| `NODE_ENV=production REDIS_URL= pnpm --filter @magnus/mcp-connector test` | PASS | Build succeeded; Node test ran 30 tests, 30 passed; includes explicit production missing Redis and Redis boot failure assertions. |
| `pnpm --filter @magnus/web test` | PASS | Node test ran 34 tests, 34 passed. |
| `pnpm --filter @magnus/mcp-connector test` | PASS | Build succeeded; Node test ran 30 tests, 30 passed. |
| `pnpm --filter @magnus/config test` | PASS | Build succeeded; Node test ran 12 tests, 12 passed. |
| `pnpm -r exec tsc --noEmit` | PASS | Recursive workspace typecheck completed with exit code 0 and no diagnostics. |

### Current Enforcement Notes

- `NODE_ENV=production` without `REDIS_URL` no longer silently uses `RateLimiterMemory` for web or MCP.
- Production Redis connection failures fail closed instead of falling back to memory.
- Dev/test without `REDIS_URL` still works locally and emits a warning.
- No rate-limit thresholds were weakened: web remains 5 failures per 15 minutes; MCP remains 100 requests per 60 seconds.

## Campaign/Stripe Consolidation

Date: 2026-06-11
Branch: `chore/p0-production-hardening-accord`

### Changes Applied

| Area | Minimal remediation |
| --- | --- |
| Route registration | Confirmed `apps/org-dashboard-api/src/server.ts` registers `registerCampaignRoutes`, `registerStripeConnectRoutes`, and `registerPublicDonationRoutes`; it does not register the retired combined Stripe campaign route layer. |
| Campaign admin | Kept `apps/org-dashboard-api/src/campaignRoutes.ts` and `packages/org-autonomous-ops-context/src/campaignService.ts` as the canonical campaign admin path. DTOs remain aligned to the current Prisma `Campaign.title`, `slug`, `publishedAt`, and `archivedAt` schema. |
| Stripe Connect | Kept `apps/org-dashboard-api/src/stripeConnectRoutes.ts` and `packages/org-autonomous-ops-context/src/stripeConnectService.ts` as the canonical onboarding/status path. The service continues to use an injected Stripe gateway, avoiding direct live Stripe calls in tests. |
| Public donation checkout | Kept `apps/org-dashboard-api/src/publicDonationRoutes.ts` and `packages/org-autonomous-ops-context/src/stripePaymentService.ts` as the canonical public donation path. Checkout now requires a live campaign plus Stripe Connect `onboardingStatus === ENABLED` and `chargesEnabled`. |
| Obsolete duplicate layer | Removed the unregistered `apps/org-dashboard-api/src/stripeCampaignRoutes.ts` and retired `packages/org-autonomous-ops-context/src/stripeCampaignService.ts` from the compile/export surface. Added source-level regression tests so the stale route/service layer cannot quietly re-enter. |
| Web client alignment | Updated the legacy protected campaigns page to call `/api/org/stripe-connect/onboarding-link`, consume `{ status }`, send `title`, and use `/api/org/campaigns/:id/archive` instead of the unregistered unpublish route. |
| Test command repair | Corrected the `@magnus/org-autonomous-ops-context` test script to execute emitted `dist/tests/*.test.js`, matching the package build output. |

### Commands Run

| Command | Result | Summary |
| --- | --- | --- |
| `rg -n "registerStripeCampaignRoutes|registerCampaignRoutes|registerStripeConnectRoutes|publicDonation|createCampaign\\(|stripeCampaignService|campaignService|stripeConnectService" apps packages` | PASS | Confirmed registered server path uses canonical campaign, Stripe Connect, and public donation modules; obsolete matches were removed except regression-test assertions. |
| `pnpm --filter @magnus/db prisma:generate` | PASS | Prisma Client v5.22.0 generated from the checked-in schema; no schema or migration changes. |
| `pnpm --filter @magnus/org-autonomous-ops-context build` | PASS | `tsc -p tsconfig.json` passed. |
| `pnpm --filter @magnus/org-autonomous-ops-context test` | PASS | Build succeeded; Node test ran 86 tests: 77 passed, 9 skipped due unreachable `DATABASE_URL`. |
| `pnpm --filter @magnus/org-dashboard-api test` | PASS | Build succeeded; Node test ran 11 tests, 11 passed. |
| `pnpm --filter @magnus/web test` | PASS | Node test ran 34 tests, 34 passed. |
| `pnpm -r exec tsc --noEmit` | PASS | Recursive workspace typecheck completed with exit code 0 and no diagnostics. |

### Current Architecture Notes

- One campaign admin route/service path remains canonical: `campaignRoutes.ts` -> `campaignService.ts`.
- One Stripe Connect route/service path remains canonical: `stripeConnectRoutes.ts` -> `stripeConnectService.ts`.
- Public campaign read, checkout, and Stripe webhook handling remain separate under `publicDonationRoutes.ts` -> `stripePaymentService.ts`.
- No live Stripe calls are made by the new tests; Stripe Connect service tests use an injected gateway and checkout tests mock `fetch`.

## Prisma Schema/Service Alignment

Date: 2026-06-11
Branch: `chore/p0-production-hardening-accord`

### Findings

| Area | Result |
| --- | --- |
| Schema contract | `packages/db/prisma/schema.prisma` remains the source of truth. It includes `Campaign.title`, `Campaign.publishedAt`, `Campaign.archivedAt`, and `StripeConnectAccount.onboardingStatus`. |
| Prisma workflow | `@magnus/db` uses `pnpm prisma generate`, which invokes `packages/db/scripts/prisma.cjs` with the checked-in schema. |
| Generated artifacts | Prisma Client v5.22.0 regenerated into `node_modules/.pnpm/@prisma/client...`; no tracked generated artifact changed and no commit-only generated file is required by current repo convention. |
| Migrations | No migration was created. `packages/db/prisma` still contains only `schema.prisma` and the existing migration lock file. |
| Service/route alignment | Campaign and Stripe Connect services/routes compile against the current generated types and schema-backed DTOs. |
| Prisma boundary imports | App-level direct `@prisma/client` enum imports found in MCP code were moved to `@magnus/db/types`. Remaining direct `@prisma/client` imports are inside `packages/db` source/tests, where the DB package owns the Prisma boundary. |
| DB-bound integration tests | `@magnus/org-autonomous-ops-context test` passed with 9 explicit skips because `DATABASE_URL` was unreachable; these are DB-dependent suites, not silent passes. |

### Commands Run

| Command | Result | Summary |
| --- | --- | --- |
| `pnpm --filter @magnus/db prisma:generate` | PASS | Prisma Client v5.22.0 generated from `packages/db/prisma/schema.prisma`. |
| `pnpm --filter @magnus/db build` | PASS | `tsc -p tsconfig.build.json` passed. |
| `pnpm --filter @magnus/org-autonomous-ops-context build` | PASS | `tsc -p tsconfig.json` passed. |
| `pnpm --filter @magnus/org-dashboard-api test` | PASS | Build succeeded; Node test ran 11 tests, 11 passed. |
| `pnpm --filter @magnus/web test` | PASS | Node test ran 34 tests, 34 passed. |
| `pnpm -r exec tsc --noEmit` | PASS | Recursive workspace typecheck completed with exit code 0 and no diagnostics. |
| `rg -n "from '@prisma/client'|from \"@prisma/client\"|from '@magnus/db'|from \"@magnus/db\"" packages apps` | PASS | Remaining direct `@prisma/client` imports are scoped to `packages/db`; app/domain code uses `@magnus/db` or `@magnus/db/types`. |
| `pnpm --filter @magnus/mcp-connector test` | PASS | Additional boundary-cleanup verification; build succeeded and Node test ran 30 tests, 30 passed. |
| `pnpm --filter @magnus/org-autonomous-ops-context test` | PASS | Build succeeded; Node test ran 86 tests: 77 passed, 9 skipped due unreachable `DATABASE_URL`. |

### Current Alignment Notes

- No schema edits or destructive migrations were made for this gate.
- No stale generated type errors remain in the requested build/typecheck commands.
- Donor, payment, and Stripe runtime behavior was not broadened; changes were limited to generated-type alignment and DB import boundary hygiene.
