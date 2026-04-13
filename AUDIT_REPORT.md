# Magnus Accord Production Audit

Audit date: 2026-04-12

Scope note: the repository does not match the prompt's intended directory map exactly. The verified runtime surfaces in this repo are `apps/web`, `apps/org-dashboard-api`, `apps/agents`, `apps/claude-partner`, `apps/grant-generator`, `apps/mcp-connector`, `apps/worker-financial-layer`, and shared packages under `packages/`.

## 0. Pre-Audit Threat Model

### Multi-tenant SaaS attack surfaces

- Tenant isolation failure across org-scoped reads and writes. The most damaging path is any API or agent query that accepts a free-form ID and does not bind it back to the caller's `orgId`.
- Secret leakage from server env into web bundles, logs, or model prompts. This matters here because the stack holds database credentials, JWT secrets, Anthropic keys, Plaid secrets, and org-linked Plaid access tokens.
- Fabricated or stale compliance and finance data presented as truth. For nonprofit boards and compliance staff, false positives and false negatives are trust-destroying even when they are not classic "security" bugs.
- Prompt injection and tool injection through grant descriptions, org identity files, funder search terms, and MCP parameters.
- Excessive agent autonomy. Internal agents can create alerts, handoffs, operational memory, and board-ready summaries. If org scoping or review gates fail, that becomes a cross-tenant integrity problem.

### OWASP-most-likely risks for this repo

- `A01 Broken Access Control`: highest-likelihood issue because multiple services proxy org-scoped data and some code paths accept IDs from request params.
- `A02 Cryptographic Failures`: JWT auth is custom, secrets are stored in plaintext env files locally, and encrypted-at-rest claims exist in schema comments without verified field-level enforcement in the audited paths.
- `A03 Injection`: prompt construction with raw string interpolation is present in grant-generator MCP clients, and MCP/tool outputs are parsed from free-form model text.
- `A05 Security Misconfiguration`: missing CSP/HSTS/X-Frame headers in Next.js, missing `.dockerignore`, health endpoints with minimal hardening, inconsistent env validation.
- `A07 Identification and Authentication Failures`: the shipped auth stack is custom JWT + cookies, not Clerk, and there is no Google OAuth implementation despite the target architecture.
- `A09 Security Logging and Monitoring Failures`: audit middleware exists for MCP but is not mounted; login failures are rate-limited but not durably logged.

### Board-trust breach scenarios

- Board packet or dashboard shows fabricated revenue, expense, or runway outputs derived from `Math.random()` or hardcoded values.
- One org can retrieve another org's alerts, grants, handoffs, or board summaries by changing a route parameter or upstream target.
- Agents emit compliance or board alerts from incomplete context and those alerts are later treated as authoritative board materials.
- Plaid access tokens or Anthropic API keys are exposed via prompts, logs, or misrouted requests.

### MCP tool injection risks

- The grant-generator's Anthropic MCP clients send raw access tokens and search parameters inside model messages, which lets the model become part of the trust boundary.
- Several MCP service layers accept input validated only inside each tool module; the server itself does not enforce a central validation/authz/rate-limit pipeline.
- Model text is regex-extracted into JSON in `apps/grant-generator/services/CandidMCPClient.ts` and `apps/grant-generator/services/PlaidMCPClient.ts`, so a malicious tool or prompt response can poison downstream structured data.

### Agent autonomy risks

- STEWARD / `ComplianceWatchdog`: safe on org scoping, but scheduled fan-out runs globally across all active orgs. The kill switch is only `AGENTS_ENABLED` plus settings-based enablement; there is no per-agent circuit breaker env.
- HERALD / `GrantIntelligenceHerald`: org identity context is injected correctly, but non-production seed opportunity fallback exists in the fetcher and opportunity IDs can be synthesized with `Math.random()`.
- SENTINEL / `FinancialSentinel`: org-scoped and degrades gracefully when Plaid is absent, but only cash runway is live. It does not compute the richer financial controls described in the target architecture.
- ORACLE / `BoardIntelligenceOracle`: org-scoped and internal-only, but there is no explicit delivery approval workflow because no sending surface exists. It creates draft packets, not actual board delivery.

## 1. Executive Summary

- Production readiness grade: `D`
- Previous audit baseline: `C / Beta`
- Delta: down one grade because the repo now contains verified fabricated financial outputs, non-mounted MCP security controls, and placeholder worker financial APIs in live code paths.
- Estimated remediation effort to reach a defensible paid launch: `20-28 person-days`

Top five blockers before any paid launch:

1. `apps/mcp-connector/src/services/FinancialService.ts` fabricates financial outputs with hardcoded values and `Math.random()`.
2. `apps/mcp-connector/src/server.ts` does not mount authentication, audit middleware, rate limiting, or any tool routes at all, despite the tool code existing.
3. `apps/worker-financial-layer/src/api/routes.ts` returns placeholder zero/null financial responses for authenticated workers.
4. `apps/web` ships a custom JWT cookie auth flow, not Clerk/Google OAuth, with no CSRF protection on mutation routes and only in-memory brute-force throttling.
5. `apps/web/next.config.js` does not define CSP, HSTS, or clickjacking headers.

## 2. Critical Blockers Table

| ID | Domain | File | Issue | Severity | Fix | Effort |
|---|---|---|---|---|---|---|
| B01 | Financial integrity | `apps/mcp-connector/src/services/FinancialService.ts:127-130,171-173,215-217,322,328-375` | Revenue, expense, and income summary paths fall back to estimated arrays and `Math.random()` monthly values while tool responses label them as IRS/Plaid-derived. | CRITICAL | Remove all fabricated fallback logic. If Plaid or filing data is unavailable, return explicit `503 DATA_SOURCE_NOT_CONFIGURED` and an onboarding action. | 8h |
| B02 | Financial integrity | `apps/mcp-connector/src/tools/financials/get-revenue-breakdown.ts:51`, `get-expense-allocation.ts:67`, `apps/mcp-connector/src/tools/workers/get-income-summary.ts:55` | Tool responses mislabel fabricated data as `"IRS Form 990"` or `"Estimated from Form 990"` with no source verification marker. | CRITICAL | Propagate authoritative source metadata from service layer and hard-fail when data is synthetic or unavailable. | 4h |
| B03 | MCP server integrity | `apps/mcp-connector/src/server.ts:8-21` | The shipped MCP server only exposes `/health` and a 404 handler. None of the tool handlers, auth, audit middleware, or rate limiting are mounted. | CRITICAL | Implement a real transport surface that registers every tool, enforces authz, mounts audit middleware, and centralizes validation. | 16h |
| B04 | MCP tenancy/security | `apps/mcp-connector/src/audit/AuditMiddleware.ts:11-49`, `apps/mcp-connector/src/audit/AuditLogger.ts:31-70` | Audit middleware exists but is not mounted, and audit storage is in-memory rather than immutable DB storage. | HIGH | Mount middleware on all tool routes and persist to append-only Prisma tables with request actor, org, IP, outcome, and latency. | 8h |
| B05 | MCP tenancy/security | `apps/mcp-connector/src/tools/workers/get-multi-org-profile.ts:10-22`, `apps/mcp-connector/src/services/WorkerService.ts:66-224` | Multi-org profile lookup is keyed only by arbitrary `user_id` and an in-memory registry/seed data store. There is no org authorization enforcement. | HIGH | Bind lookup to authenticated worker identity, replace in-memory registry with Prisma, and scope every org returned through verified membership checks. | 10h |
| B06 | Worker financial APIs | `apps/worker-financial-layer/src/api/routes.ts:14-40` | Authenticated worker endpoints return placeholder values such as `total90d: 0`, `federal: 0`, `state: 0`, `benchmark: null`, and `volatility: null`. | CRITICAL | Replace placeholders with real calculations backed by DB/Plaid or return `503 FEATURE_NOT_CONFIGURED`. Do not ship truth-bearing zeros. | 12h |
| B07 | Auth/mobile login | `apps/web/src/app/api/auth/login/route.ts`, `register/route.ts`, `refresh/route.ts`, `apps/web/src/app/(auth)` | Repo has no Clerk or Google OAuth implementation at all. The target auth architecture is absent, so Google/mobile login cannot be verified. | HIGH | Decide on one auth system. If Clerk is the target, remove custom JWT auth and implement Clerk callbacks, session binding, and mobile-safe redirect URLs. | 24h |
| B08 | Auth/CSRF | `apps/web/src/app/api/auth/login/route.ts:10-92`, `register/route.ts:12-88`, `logout/route.ts:7-43`, `refresh/route.ts:20-92` | Cookie-auth mutations have no CSRF token or origin enforcement. `SameSite=Lax` helps but is not a full CSRF control for all mutation flows. | HIGH | Add origin checking plus synchronizer or double-submit CSRF tokens for all state-changing cookie-auth routes. | 8h |
| B09 | Rate limiting | `apps/web/src/lib/rate-limit.ts:1-88`, `apps/web/src/app/api/auth/login/route.ts:11-20` | Login protection is memory-only and explicitly not multi-instance safe. No Redis-backed rate limiting exists on Claude partner, MCP, or grant-generator endpoints. | HIGH | Implement Redis-backed shared rate limiting for auth, Claude proxy, grant generation, and MCP invocation surfaces. | 12h |
| B10 | Security headers | `apps/web/next.config.js:1-7` | No CSP, HSTS, `X-Frame-Options`, or other hardened response headers are configured in Next.js. | HIGH | Add security headers in `next.config.js` and verify compatibility with Next assets and proxied API routes. | 4h |
| B11 | Prompt/tool injection | `apps/grant-generator/services/PlaidMCPClient.ts:36-47,81-88`, `apps/grant-generator/services/CandidMCPClient.ts:43-50,72-83` | Raw access tokens and user-derived search fields are embedded directly into model prompts, and JSON is regex-extracted from model text. | HIGH | Remove model-mediated access-token handling. Call MCP/tool servers directly from trusted code, or at minimum add prompt guards and signed tool-call mediation. | 12h |
| B12 | Secret hygiene | local `.env` and `apps/web/.env` | Real-looking `DATABASE_URL`, `JWT_SECRET`, and `ENCRYPTION_KEY` are stored in plaintext local env files. They are gitignored, but operational hygiene is weak. | MEDIUM | Rotate secrets if shared, move to secret manager for deployed environments, and keep local examples sanitized. | 2h |

## 3. MCP Tool Inventory

Only 9 tool handler files exist in `apps/mcp-connector/src/tools`, not 14.

| Tool | Handler | Verified source behavior |
|---|---|---|
| `get-filing-history` | `apps/mcp-connector/src/tools/compliance/get-filing-history.ts` | Real ProPublica-backed service path, but only if server is actually mounted. |
| `get-state-registrations` | `apps/mcp-connector/src/tools/compliance/get-state-registrations.ts` | Stubbed through `ComplianceService.getMockStateRegistrations()`. |
| `get-expense-allocation` | `apps/mcp-connector/src/tools/financials/get-expense-allocation.ts` | Fabricated fallback categories when Plaid absent. |
| `get-revenue-breakdown` | `apps/mcp-connector/src/tools/financials/get-revenue-breakdown.ts` | Fabricated fallback streams when Plaid absent. |
| `get-funder-research` | `apps/mcp-connector/src/tools/grants/get-funder-research.ts` | Real Candid path when available; fails closed on API error. |
| `get-grant-history` | `apps/mcp-connector/src/tools/grants/get-grant-history.ts` | Returns empty array when Candid fails. |
| `get-income-summary` | `apps/mcp-connector/src/tools/workers/get-income-summary.ts` | Fabricated `Math.random()` history when Plaid unavailable or errors. |
| `get-multi-org-profile` | `apps/mcp-connector/src/tools/workers/get-multi-org-profile.ts` | In-memory / seed data only. |
| `get-tax-estimates` | `apps/mcp-connector/src/tools/workers/get-tax-estimates.ts` | Hardcoded state filing fees and zero UBIT schedule. |

Permission guard result: no `PermissionGuard` implementation is present in `apps/mcp-connector/src`.

Server-side input validation result: each tool parses its own Zod schema, but the server does not enforce centralized validation because no tool routes are mounted.

Per-org rate limiting result: not present.

## 4. Security Findings

### A01 Broken Access Control

- `HIGH` `apps/mcp-connector/src/tools/workers/get-multi-org-profile.ts:10-22` and `apps/mcp-connector/src/services/WorkerService.ts:66-224`
  - Arbitrary `user_id` drives a multi-org lookup against an in-memory registry.
  - Remediation: require authenticated worker identity from JWT/session, verify memberships in Prisma, and remove seed registry logic.
- `LOW` `apps/org-dashboard-api/src/controlTowerRoutes.ts:38-57`
  - Positive finding: scope authorization is explicitly enforced for `ORG`, `WORKER`, and `GRANT`.
- `LOW` `apps/web/src/app/api/org/[...path]/route.ts:25-33`
  - Positive finding: JWT, session, and membership are revalidated before proxying.

### A02 Cryptographic Failures

- `MEDIUM` `packages/db/prisma/schema.prisma:141,265-266`
  - Sensitive fields are marked "`encrypted`" in comments, but the audited runtime paths do not prove field-level encryption wrappers are enforced on read/write.
  - Remediation: verify Prisma extension coverage and document exactly which fields are encrypted at rest.
- `MEDIUM` local `.env` and `apps/web/.env`
  - Secrets are plaintext on disk. They are ignored by git, but not protected by any local secret manager.

### A03 Injection

- `HIGH` `apps/grant-generator/services/CandidMCPClient.ts:43-60,72-95`
  - User-supplied EIN / search terms are interpolated into model prompts and JSON is extracted from free-form model output.
- `HIGH` `apps/grant-generator/services/PlaidMCPClient.ts:36-58,81-99`
  - Access tokens are embedded directly in model prompts.
- `MEDIUM` `apps/claude-partner/src/api/routes.ts:128-150`
  - `userText` is forwarded directly to Anthropic with no prompt-injection screening or content policy layer.

### A05 Security Misconfiguration

- `HIGH` `apps/web/next.config.js:1-7`
  - Missing CSP, HSTS, clickjacking headers.
- `MEDIUM` repo root
  - No `.dockerignore` file exists.
- `LOW` `apps/*/src/index.ts`
  - CORS defaults to `origin: false`, which is safer than wildcard, but production origin handling is still undocumented and untested.

### A07 Identification and Authentication Failures

- `HIGH` architecture mismatch
  - No Clerk, no Google OAuth, no callback URL handling, no mobile-specific auth flow.
- `HIGH` `apps/web/src/lib/rate-limit.ts:1-88`
  - Brute-force controls are single-process only.

### A09 Security Logging and Monitoring Failures

- `HIGH` `apps/mcp-connector/src/audit/AuditMiddleware.ts:11-49`
  - Middleware exists but is dead code.
- `MEDIUM` `apps/web/src/app/api/auth/login/route.ts`
  - Failures are rate-limited but not durably logged with actor/IP/outcome for detection.
- `MEDIUM` `apps/claude-partner/src/services/UsageAuditService.ts:65-96`
  - Usage caps are enforced, but no anomaly alerting or token-spike monitoring exists.

## 5. Agent Readiness Matrix

| Agent | Org-Scoped | Real Data | Heartbeat | Kill Switch | Ready? |
|---|---|---|---|---|---|
| STEWARD / `ComplianceWatchdog` | Yes | Partially. Compliance calendar and grants are real DB reads; no external filing execution. | Yes, daily at `02:15` in `apps/agents/src/scheduler/cron.ts:9-15` | Partial: global `AGENTS_ENABLED` plus org settings; no dedicated per-agent breaker env | Conditional |
| HERALD / `GrantIntelligenceHerald` | Yes | Partial. Real org context, real external fetch in prod; dev seed fallback remains in fetcher. | Yes, weekly Tue `07:30` | Partial: org settings only | Conditional |
| SENTINEL / `FinancialSentinel` | Yes | Partial. Grant DB reads are real; cash runway uses live Plaid if configured and gracefully degrades if not. | Yes, daily `10:00` | Partial: org settings only | Conditional |
| ORACLE / `BoardIntelligenceOracle` | Yes | Partial. Synthesizes real DB rows into internal draft packets. | Yes, weekly Mon `08:00` | Partial: org settings only | Conditional |

Notes:

- No agent currently sends external emails or board packets from the audited code, which reduces blast radius.
- No per-agent env kill switch such as `AGENT_DISABLE_ORACLE=true` exists.
- Scheduler concurrency is hardcoded to `5` in `apps/agents/src/scheduler/scheduler.ts:143-169`, not env-controlled.

## 6. Test Coverage Report

The requested workspace command `pnpm -r --if-present test -- --coverage` failed before producing coverage because several packages define `test` as `node --test dist/tests`, and the extra `-- --coverage` argument is interpreted as a path:

- Failure observed: `packages/config test: Could not find '/Users/chinyeosemene/Code/magnus-local/packages/config/--'`
- Result: no trustworthy repo-wide coverage percentages were generated in this audit.

Per-surface testability status:

| Surface | Source tests present? | Coverage output available? | Audit verdict |
|---|---|---|---|
| `apps/web` | No | No | Critical auth and proxy paths have no automated test coverage. |
| `apps/org-dashboard-api` | No | No | Org-scoped dashboard APIs have no source tests. |
| `apps/agents` | Yes | No repo-wide % | Best-tested runtime in repo, but no quantified coverage export in this audit. |
| `apps/claude-partner` | Yes | No repo-wide % | Some service tests exist; endpoint and prompt-safety coverage is incomplete. |
| `apps/grant-generator` | Smoke only | No | Material generation logic lacks meaningful automated coverage. |
| `apps/mcp-connector` | Smoke only | No | Tool behavior, auth, and tenancy are effectively untested. |
| `apps/worker-financial-layer` | Minimal | No | Placeholder worker APIs are barely tested. |
| `packages/db` | Yes | No repo-wide % | Schema guard tests exist; runtime tenancy and encryption need more proof. |
| `packages/config` | Yes | No repo-wide % | Env validator tests exist, but new consolidated env schema still needs adoption tests. |

Critical path at effectively `0%` source-test coverage:

- `apps/web` auth flows
- `apps/org-dashboard-api` route layer
- real MCP invocation paths
- mobile login flow

## 7. Env Variable Inventory

Legend:

- `✅ Configured`: present in template and/or startup validation
- `⚠️ Missing`: absent from templates and startup validation
- `🔴 Hardcoded`: secret or operational value present in tracked or local file in a way that should not ship
- `❓ Unknown`: named in target architecture, but not referenced in this repo

| Variable | Service | Required? | Secret? | Status | Description | Source |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | all server apps | Yes | Yes | `✅` | Primary Postgres connection | `.env.template`, `packages/config/src/envValidator.ts`, Prisma schema |
| `DATABASE_URL_UNPOOLED` | db migrations | Optional target | Yes | `⚠️` | Direct migration URL | not referenced |
| `REDIS_URL` | rate limit / queue | Optional target | Yes | `⚠️` | Shared Redis | only mentioned in `apps/mcp-connector/.env.template`; not used in runtime |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | web | Target | No | `⚠️` | Clerk public key | not referenced |
| `CLERK_SECRET_KEY` | web/api | Target | Yes | `⚠️` | Clerk server secret | not referenced |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | web | Target | No | `⚠️` | Clerk sign-in path | not referenced |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | web | Target | No | `⚠️` | Clerk sign-up path | not referenced |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | web | Target | No | `⚠️` | Clerk redirect | not referenced |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | web | Target | No | `⚠️` | Clerk redirect | not referenced |
| `CLERK_WEBHOOK_SECRET` | web/api | Target | Yes | `⚠️` | Clerk sync webhook | not referenced |
| `ANTHROPIC_API_KEY` | claude-partner, grant-generator | Yes for those apps | Yes | `✅` | Anthropic access | validated in `packages/config/src/envValidator.ts` |
| `ANTHROPIC_MODEL` | grant-generator | Optional | No | `✅` | Default model | template + runtime read |
| `ANTHROPIC_MAX_TOKENS` | grant-generator | Optional | No | `✅` | Token cap | template + runtime read |
| `CLAUDE_PARTNER_USAGE_CAP` | claude-partner | Target | No | `⚠️` | Org token budget env | budget comes from DB instead |
| `PLAID_CLIENT_ID` | mcp, agents, grant-generator | Optional/live | Yes | `⚠️` | Plaid client id | read in code, not centrally validated |
| `PLAID_SECRET` | mcp, agents, grant-generator | Optional/live | Yes | `⚠️` | Plaid secret | read in code, not centrally validated |
| `PLAID_ENV` | grant-generator/mcp target | Optional | No | `⚠️` | Plaid env selector | only templates |
| `PLAID_WEBHOOK_URL` | target | Optional | No | `⚠️` | Plaid webhook | not referenced |
| `PROPUBLICA_API_KEY` | mcp target | Optional/live | Yes | `⚠️` | ProPublica auth | template only; runtime client does not send it |
| `CANDID_API_KEY` | mcp, agents, grant-generator | Optional/live | Yes | `⚠️` | Candid auth | read in code, not centrally validated |
| `GUIDESTAR_API_KEY` | target | Optional | Yes | `⚠️` | GuideStar auth | not referenced |
| `MCP_SERVER_URL` | target | Optional | No | `⚠️` | target internal MCP URL | repo uses `MCP_CONNECTOR_URL` instead |
| `MCP_SERVER_SECRET` | target | Optional | Yes | `⚠️` | MCP auth secret | not referenced |
| `MCP_RATE_LIMIT_WINDOW_MS` | target | Optional | No | `⚠️` | per-window limit | not referenced |
| `MCP_RATE_LIMIT_MAX` | target | Optional | No | `⚠️` | per-window cap | not referenced |
| `SMTP_HOST` | target | Optional | No | `⚠️` | SMTP host | not referenced |
| `SMTP_PORT` | target | Optional | No | `⚠️` | SMTP port | not referenced |
| `SMTP_USER` | target | Optional | Yes | `⚠️` | SMTP user | not referenced |
| `SMTP_PASS` | target | Optional | Yes | `⚠️` | SMTP password | not referenced |
| `FROM_EMAIL` | target | Optional | No | `⚠️` | sender address | not referenced |
| `SENDGRID_API_KEY` | target | Optional | Yes | `⚠️` | SendGrid | not referenced |
| `RESEND_API_KEY` | target | Optional | Yes | `⚠️` | Resend | not referenced |
| `NEXT_PUBLIC_SUPABASE_URL` | target | Optional | No | `⚠️` | Supabase public URL | not referenced |
| `SUPABASE_SERVICE_ROLE_KEY` | target | Optional | Yes | `⚠️` | Supabase service key | not referenced |
| `AWS_ACCESS_KEY_ID` | grant-generator target | Optional | Yes | `⚠️` | S3 access key | only in template |
| `AWS_SECRET_ACCESS_KEY` | grant-generator target | Optional | Yes | `⚠️` | S3 secret | only in template |
| `AWS_S3_BUCKET` | target | Optional | No | `⚠️` | S3 bucket | code reads `AWS_BUCKET` instead |
| `AWS_REGION` | grant-generator target | Optional | No | `⚠️` | AWS region | template only |
| `SENTRY_DSN` | target | Optional | Yes | `⚠️` | error tracking | not referenced |
| `SENTRY_AUTH_TOKEN` | CI target | Optional | Yes | `⚠️` | source-map upload | not referenced |
| `POSTHOG_API_KEY` | target | Optional | Yes | `⚠️` | analytics | not referenced |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | target | Optional | No | `⚠️` | telemetry sink | not referenced |
| `OTEL_SERVICE_NAME` | target | Optional | No | `⚠️` | telemetry service name | not referenced |
| `LOGTAIL_TOKEN` | target | Optional | Yes | `⚠️` | structured log sink | not referenced |
| `STRIPE_SECRET_KEY` | billing | Yes for billing | Yes | `✅` | Stripe server key | template + validation |
| `STRIPE_PUBLISHABLE_KEY` | target | Optional | No | `⚠️` | Stripe public key | not referenced |
| `STRIPE_WEBHOOK_SECRET` | billing | Yes for billing | Yes | `⚠️` | required by local loader, but missing from shared validator | `apps/billing/src/config/env.ts` only |
| `STRIPE_PRICE_ID_STARTER` | target | Optional | No | `⚠️` | billing plan id | not referenced |
| `STRIPE_PRICE_ID_GROWTH` | target | Optional | No | `⚠️` | billing plan id | not referenced |
| `STRIPE_PRICE_ID_ENTERPRISE` | target | Optional | No | `⚠️` | billing plan id | not referenced |
| `NEXT_PUBLIC_APP_URL` | target | Optional | No | `⚠️` | public app base URL | not referenced |
| `API_URL` | target | Optional | No | `⚠️` | internal API base URL | not referenced |
| `NODE_ENV` | all | Yes in practice | No | `✅` | runtime mode | template + code |
| `LOG_LEVEL` | target | Optional | No | `⚠️` | log level | template only |
| `FEATURE_FLAG_MCP_LIVE` | target | Optional | No | `⚠️` | feature gate | not referenced |
| `FEATURE_FLAG_MOBILE` | target | Optional | No | `⚠️` | feature gate | not referenced |
| `FEATURE_FLAG_PLAID` | target | Optional | No | `⚠️` | feature gate | not referenced |
| `AGENT_HEARTBEAT_ENABLED` | target | Optional | No | `⚠️` | agent enablement | repo uses `AGENTS_ENABLED` instead |
| `AGENT_MAX_ORG_CONCURRENCY` | target | Optional | No | `⚠️` | agent fan-out cap | not referenced; concurrency hardcoded to `5` |
| `JWT_SECRET` | web, org-dashboard-api, mcp-connector, worker-financial-layer, billing, auth package | Yes | Yes | `🔴` | required secret exists locally in plaintext `.env` and `apps/web/.env` | runtime read + local plaintext files |
| `ORG_DASHBOARD_API_BASE_URL` | web proxy | Optional | No | `✅` | same-origin proxy target | `.env.template`, `apps/web/src/lib/env.ts` |
| `AGENTS_ENABLED` | agents | Optional | No | `✅` | global scheduler enable | `.env.template`, `apps/agents/src/index.ts` |
| `AGENTS_ALERT_SINK` | agents | Required in prod | No | `✅` | db vs console sink | `.env.template`, `apps/agents/src/config/env.ts` |
| `AGENTS_TIMEZONE` | agents | Optional | No | `⚠️` | scheduler timezone | referenced, not in template |
| `MCP_CONNECTOR_URL` | claude-partner onboarding | Required for onboarding flow | No | `✅` | connector health target | `.env.template`, `apps/claude-partner/src/index.ts` indirect workflows |
| `ENCRYPTION_KEY` | local only right now | Should be required if encryption is enforced | Yes | `🔴` | present in local `.env` but not validated centrally | local env only |

Env audit conclusions:

- `.env.template` covers only a small subset of the variables that runtime code references.
- Shared validation in `packages/config/src/envValidator.ts` is materially incomplete for Plaid, Candid, MCP connector settings, Stripe webhook secret, and agent scheduler settings.
- `NEXT_PUBLIC_*` secret leakage was not found because this repo currently has almost no `NEXT_PUBLIC_*` usage.
- `git log --all --full-history -- .env .env.example .env.template` showed history for `.env.template`, not a committed `.env`.

## 8. Production Deployment Checklist

### Phase 1: Critical blockers

1. Remove fabricated financial outputs from `mcp-connector` and `worker-financial-layer`.
2. Decide whether `mcp-connector` is real or dead code; either fully implement transport/auth/audit/rate limits or remove it from launch scope.
3. Replace custom auth architecture or explicitly scope launch to the current JWT system and harden it with CSRF, shared rate limiting, and tests.
4. Add security headers in Next.js.
5. Add source tests for `apps/web` auth/proxy and `apps/org-dashboard-api`.

### Phase 2: Security hardening

1. Introduce Redis-backed rate limiting across login, Claude, grant generation, and MCP.
2. Add immutable audit persistence for MCP and auth-sensitive actions.
3. Remove model-mediated access-token handling in grant-generator MCP clients.
4. Add prompt-injection guards and content moderation strategy for `claude-partner`.

### Phase 3: Agent activation

1. Add per-agent kill-switch envs and env-configurable concurrency.
2. Verify every agent path against explicit org-scoped integration tests.
3. Add review/audit surfacing for human-review-required handoffs.

### Phase 4: Enterprise features

1. Wire real Plaid onboarding or explicitly gate it behind `503` + onboarding UX.
2. Implement real Google OAuth / Clerk if that remains the product requirement.
3. Add mobile auth flow only after callback/redirect coverage exists.

### Phase 5: GA launch

1. Add staging deploy and smoke tests to CI/CD.
2. Add `.dockerignore`, secret-management docs, backup + migration runbook.
3. Run an external pentest focused on tenancy, auth, and agent/data integrity.

## 9. Feature Flag Strategy

| Feature | Flag | Default | Rollout trigger | Env gate | Graceful degradation |
|---|---|---|---|---|---|
| Live MCP transport | `FEATURE_FLAG_MCP_LIVE` | `false` | Server mounts auth, audit, rate limit, and all tools | `FEATURE_FLAG_MCP_LIVE` | Return `503 MCP_LIVE_DISABLED` and hide connector UX |
| Plaid-backed financials | `FEATURE_FLAG_PLAID` | `false` | Plaid onboarding, credential validation, and source attribution are live | `FEATURE_FLAG_PLAID` | Show onboarding CTA; never synthesize cash/runway values |
| Worker financial APIs | `FEATURE_FLAG_WORKER_FINANCIALS` | `false` | `worker-financial-layer` returns real calculations | `FEATURE_FLAG_WORKER_FINANCIALS` | Return `503 FEATURE_NOT_CONFIGURED` |
| Mobile login | `FEATURE_FLAG_MOBILE_AUTH` | `false` | callback URLs, device tests, and CSRF/origin checks are passing | `FEATURE_FLAG_MOBILE_AUTH` | Keep mobile on web login fallback |
| Claude partner send path | `FEATURE_FLAG_CLAUDE_MESSAGES` | `false` | prompt-injection guard, anomaly alerts, and usage caps verified | `FEATURE_FLAG_CLAUDE_MESSAGES` | Keep config screens only; no live generation |
| Agent scheduler | `AGENTS_ENABLED` | `false` in prod until hardened | per-agent kill switches and alert runbooks exist | `AGENTS_ENABLED` | agents do not run automatically |

## 10. Requested Deliverable: Env Validation Spec

A ready-to-commit consolidated schema was added at:

- `packages/config/src/env.ts`

This file distinguishes public vs server variables, validates service-specific requirements, and is intended to replace the fragmented validation now split across `envValidator.ts` and per-app loaders.

