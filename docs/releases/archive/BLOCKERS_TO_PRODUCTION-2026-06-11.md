# Blockers To Production

Current status as of 2026-06-11: **Production Certification: Not Yet Approved**. Magnus Accord may be evaluated in private pilot/staging only after the relevant P0 gates below are verified. Historical phase-verification documents are evidence, not launch approval.

## P0 Gate Matrix

| Gate | Current status | Required production-safe outcome |
| --- | --- | --- |
| Build/typecheck status | Remediated in hardening branch; keep as required CI gate | `pnpm -r exec tsc --noEmit` and scoped package builds/tests pass on the release commit |
| Subscription route gating | Known P0 blocker | Existing subscription middleware is wired to HTTP routes with allow/deny tests |
| Redis fail-closed behavior | Known P0 blocker | Production startup fails closed or blocks auth-sensitive rate limiting when shared Redis is absent |
| Campaign/Stripe consolidation | Known P0 blocker | Duplicate/divergent campaign and Stripe route/service paths are reconciled without changing payment semantics |
| Prisma schema/generated type alignment | Remediated for current branch; keep as required gate | Prisma generation and package builds pass from the checked-in schema |
| Staging smoke evidence | Not trusted yet | Smoke evidence is rerun only after build/typecheck, route gating, Redis, and payment gates pass |
| Observability integration | Known P0 blocker | App entrypoints and request error paths use the existing observability package or documented equivalent |
| Mobile scope | Deferred / not shipped | No mobile availability is claimed until source, auth, tests, and release path exist |
| Worker financial layer scope | Gated / scaffolded | Worker financial routes fail closed or remain explicitly gated until real calculations and tests exist |
| Grant generator scope | Scaffolded / internal | Grant generator is internal or operator-assisted until org-scoped API, tests, and data-source boundaries are verified |

## Stop-Ship Blockers

1. `apps/mcp-connector/src/services/FinancialService.ts`
   - Fabricates finance data with hardcoded values and `Math.random()`.
   - Production action: delete synthetic fallbacks and return explicit `503` until real sources are wired.

2. `apps/mcp-connector/src/server.ts`
   - No tool routes, auth, audit middleware, or rate limiting are mounted.
   - Production action: either implement the transport stack fully or remove MCP from launch scope.

3. `apps/worker-financial-layer/src/api/routes.ts`
   - Authenticated worker endpoints return placeholder zeros and nulls.
   - Production action: replace with real calculations or fail closed with `503 FEATURE_NOT_CONFIGURED`.

4. `apps/web` auth stack
   - No Clerk, no Google OAuth, no mobile login implementation, no CSRF protection on cookie-auth mutations.
   - Production action: either fully harden the custom JWT flow or migrate to the intended auth provider before launch.

5. `apps/web/src/lib/rate-limit.ts`
   - In-memory brute-force protection is not multi-instance safe.
   - Production action: move auth, Claude, grant, and MCP throttling to Redis-capable shared rate limits.

6. `apps/web/next.config.js`
   - Missing CSP, HSTS, and frame protections.
   - Production action: add security headers and verify them in staging.

## High-Risk Gaps

- `apps/grant-generator/services/PlaidMCPClient.ts` sends Plaid access tokens through LLM prompts.
- `apps/grant-generator/services/CandidMCPClient.ts` and `PlaidMCPClient.ts` parse structured output from model text via regex.
- `apps/mcp-connector/src/audit/AuditMiddleware.ts` exists but is dead code, and `AuditLogger` is in-memory only.
- `apps/web` and `apps/org-dashboard-api` have no source tests for critical auth and org-scoped API flows.
- `.dockerignore` is missing.

## Production Sequence

### Phase 1

1. Remove synthetic finance outputs.
2. Hard-disable unfinished worker finance and MCP live paths with explicit feature flags.
3. Add CSRF/origin checks and Redis rate limiting.

### Phase 2

1. Add security headers.
2. Add immutable audit persistence for MCP and sensitive auth/compliance actions.
3. Add tests for `apps/web` auth/proxy and `apps/org-dashboard-api`.

### Phase 3

1. Add per-agent kill switches and env-configurable concurrency.
2. Remove model-mediated secret/tool access from grant-generator.
3. Add staging deploy plus smoke tests to CI.

## Launch Standard

Nothing should ship while any truth-bearing route can:

- return random or placeholder financial values
- accept cross-org identifiers without membership checks
- mutate state through cookie auth without CSRF controls
- run production-critical features without durable audit trails
