# Magnus Accord — strict pilot production-readiness audit

**Audit date:** 2026-04-02  
**Scope:** Whether the **pilot launch package** can be operated **safely and honestly** in a live client environment (not “feature complete product GA”).

**Method:** Repo inspection only—migrations, boot guards, routes, UI wiring, docs, and known non-truth surfaces. No deployment-specific secrets were validated.

---

## 1) Production readiness matrix

| Area | Classification | Notes (evidence-backed) |
| --- | --- | --- |
| **DB migrations applied** | **READY_WITH_RUNBOOK** | Autonomous Ops migrations exist under `packages/db/prisma/migrations/` (foundation through alert lifecycle, donor/volunteer events, org settings, memory tiers). **Operators must** run `prisma migrate deploy` and **`pnpm --filter @magnus/db verify:schema`** per [PRODUCTION_TRUTH_CHECKLIST.md](../PRODUCTION_TRUTH_CHECKLIST.md). |
| **Schema parity at runtime** | **READY** | `org-dashboard-api` and `apps/agents` call `assertDbShape(..., MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE)` at boot (`apps/org-dashboard-api/src/server.ts`, `apps/agents/src/index.ts`). Wrong schema → process exit. |
| **`org-dashboard-api` service** | **READY_WITH_RUNBOOK** | Express app registers identity files, handoffs, memory, settings, control tower, alerts, executive rollup, obligations, donor/volunteer events, operations log. **Requires** `DATABASE_URL`, `JWT_SECRET` (≥32) via `@magnus/config` (`packages/config/src/envValidator.ts`). **CORS** is `origin: false`—callers must proxy or same-origin. |
| **`apps/agents` scheduler** | **BLOCKED_BY_ENV** *unless runbook* | Boots with schema guard; `AGENTS_ENABLED` must be `true` for cron (`apps/agents/src/index.ts`). **Production forbids** `AGENTS_ALERT_SINK=console` (`apps/agents/src/config/env.ts`). Without enabled cron + `AGENTS_ALERT_SINK=db`, scheduled agents do not produce DB-backed alerts—**pilot “watch” claims are false.** |
| **`apps/web` Next app** | **BLOCKED_BY_ENV** *implicit* | No `validateEnv` at web startup; routes use `@magnus/db` Prisma and `JWT_SECRET` in `apps/web/src/lib/auth.ts`. **Missing `DATABASE_URL` / `JWT_SECRET` fails at runtime** on first DB/API use—not fail-fast at `next start`. Operators must set env explicitly in hosting. |
| **Protected routes / auth** | **READY** | Autonomous Ops pages use `requireAuthOrRedirect`; API routes verify cookie + session (`verifyAppToken`, `verifySession`) pattern in `apps/web/src/app/api/autonomous-ops/*/route.ts`. |
| **Executive board** | **READY_WITH_RUNBOOK** | `GET /api/autonomous-ops/executive/board` uses `buildExecutiveBoard` with direct Prisma in web (`apps/web/src/app/api/autonomous-ops/executive/board/route.ts`). Depends on DB + auth only—not `org-dashboard-api`. **Executive is not in the main app nav** (`apps/web/src/app/(protected)/app/layout.tsx`)—operators must deep-link `/app/autonomous-ops/executive`. |
| **Active obligations** | **READY_WITH_RUNBOOK** | `buildActiveObligations` returns data, but **alert obligations are filtered to board-prep types only** (`BoardIntelligenceOracle` + specific alert types) (`packages/org-autonomous-ops-context/src/activeObligations.ts`). Empty list is **honest**, not broken. |
| **Obligation / evidence deep links** | **NO_GO_FOR_PILOT** *(as browser UX)* / **READY_WITH_RUNBOOK** *(as API truth)* | Primary `destination` hrefs (`/app/autonomous-ops/alerts/:id`, `/app/autonomous-ops/handoffs/:id`, `/app/compliance/:id`) have **no corresponding `page.tsx` in `apps/web`**—marked `UNIMPLEMENTED_IN_REPO` in code. Evidence links use **`/api/org/...`** paths implemented on **`org-dashboard-api`**, not on Next—**there is no `apps/web/src/app/api/org/` tree.** Same-origin clicks **404** unless infra **reverse-proxies** `/api/org/*` to `org-dashboard-api`. |
| **Control tower / portfolio accountability** | **READY** | `ControlTowerClient` fetches **`/api/autonomous-ops/portfolio-accountability`** (Next route → Prisma). Rollups work without `org-dashboard-api` for this page. |
| **Operations log** | **READY** | Next: `GET /api/autonomous-ops/operations-log` builds log via Prisma. Duplicate API exists on dashboard (`registerOperationsLogRoutes`) for JWT clients. |
| **Readiness / onboarding** | **READY** | `GET /api/autonomous-ops/readiness` + `/app/autonomous-ops/readiness`; human checklist in [MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md](./MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md). |
| **Approval traceability** | **READY_WITH_RUNBOOK** | Handoff audit semantics documented in [MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md](./MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md). **`AgentRun.humanReviewedAt` / `humanReviewedBy` not written** in pilot—do not sell staff sign-off on runs. No Tier B “ask-first” product for external actions. |
| **Auditability (alerts)** | **READY_WITH_RUNBOOK** | Alert lifecycle + audit tables in schema guard; **no full browser audit workstation** per pilot packaging. APIs on `org-dashboard-api` for operator tools; **not** guaranteed in web UI. |
| **Connectors — Claude** | **READY_WITH_RUNBOOK** | Status from `Organization.claudeStatus`; activation is **ops-dependent**, not guaranteed self-serve ([MAGNUS_ACCORD_CONNECTOR_REGISTRY.md](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md)). |
| **Connectors — MCP / grant-gen / worker-financial** | **NO_GO_FOR_PILOT** *(as production truth)* | Explicit demo/stub/non-truth paths—[PRODUCTION_TRUTH_CHECKLIST.md §4](../PRODUCTION_TRUTH_CHECKLIST.md). **Pilot-labeled** rows only. |
| **Plaid / Candid (Enterprise agents)** | **BLOCKED_BY_ENV** | **INTERNAL_ONLY** in registry—no web connector card. FinancialSentinel / GrantIntelligenceHerald need **keys + data** configured outside self-serve UI; expect `NOT_CONFIGURED` / `INSUFFICIENT_DATA` in module states until runbook steps complete. |
| **Memory sufficiency / “reflection”** | **NO_GO_FOR_PILOT** *(reflection-grade)* | `evaluateMemorySufficiency` defaults require **30+** operational entries, **21+** day span, **2+** agents, **90%** source-ref coverage, curated items, **5+** semantic chunks (`packages/org-autonomous-ops-context/src/memorySufficiency.ts`). **Readiness exposes `NO_GO`** until met—do **not** market reflection/SOLARIS as live. |
| **MCP financial/compliance claims** | **NO_GO_FOR_PILOT** | Same as checklist §4—**do not** present MCP outputs as dashboard truth. |

---

## 2) Top blockers (prioritized)

1. **Agents not actually running** — `AGENTS_ENABLED` unset or alerts sinking to console in production → no meaningful scheduled agent output; pilot “watch” is hollow. (*BLOCKED_BY_ENV / ops*)  
2. **Broken same-origin paths for `/api/org/*` from the browser** — Executive obligation “evidence” links point at dashboard API paths; **without reverse proxy**, operators get 404s. (*BLOCKED_BY_ENV* for unified UX; *honest* if APIs used via curl/Postman with JWT against dashboard host.)  
3. **Dead-end “Go next” obligation destinations** — No alerts/handoffs/compliance **pages** in web; code marks `UNIMPLEMENTED_IN_REPO`. Expect **runbook + future UI** or accept API-only triage. (*BLOCKED_BY_CODE* for end-user navigation; *documented* truth.)  
4. **Web env not validated at boot** — Misconfigured `DATABASE_URL` / `JWT_SECRET` → opaque 500s at first use. (*BLOCKED_BY_ENV* + *remediation: hosting checklist.*)  
5. **Memory sufficiency** — Default thresholds make **reflection-grade readiness `NO_GO`** for typical fresh tenants until history is accumulated—**correct behavior**, not a bug; must be **disclosed** in pilot. (*NO_GO_FOR_PILOT* for reflection claims only.)  
6. **MCP / pilot connector truth** — Any client belief that MCP equals compliance/finance reality is an **honesty failure**—operational **no-go** for that narrative ([PRODUCTION_TRUTH_CHECKLIST.md §4](../PRODUCTION_TRUTH_CHECKLIST.md)).

---

## 3) Required manual setup steps (operator / ops)

1. Apply **all** Prisma migrations to the target database; run **`pnpm --filter @magnus/db verify:schema`** in CI or pre-go-live.  
2. Configure **`DATABASE_URL`** and **`JWT_SECRET` (≥32)** for **`apps/web`**, **`apps/org-dashboard-api`**, and any service that issues or verifies the same JWTs.  
3. Deploy **`apps/agents`** with **`AGENTS_ENABLED=true`**, **`AGENTS_ALERT_SINK=db`**, production **`NODE_ENV=production`**.  
4. Configure **cron / scheduler** for the agents process per your hosting (not automatic from repo).  
5. **Claude Partner**: drive `claudeStatus` to **`ACTIVE`** via existing Claude-partner deployment flows (not self-serve guaranteed).  
6. **Org context files**: populate all five canonical kinds with non-template content; use Directory + validation report ([MAGNUS_ACCORD_ORG_CONTEXT_FILES.md](./MAGNUS_ACCORD_ORG_CONTEXT_FILES.md)).  
7. **Persist `OrgAutonomousOpsSettings`** with enabled agents allowed by subscription tier.  
8. **Enterprise expansion**: Plaid/Candid API keys and data prerequisites via **custom setup**—not implied by web connector cards.  
9. **If** staff must click audit links from Executive: **reverse-proxy** `/api/org/*` from the web origin to **`org-dashboard-api`**, or document **API hostname** + JWT usage instead.  
10. Walk [MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md](./MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md) before client demo.

---

## 4) Required no-go boundaries (what you must not claim)

- **MCP / grant-generator / worker-financial** as systems of record or full self-serve integrations.  
- **Reflection / SOLARIS** as live product features.  
- **Autonomous** email, Slack, filings, grant submission, or **money movement**.  
- **Full audit workstation** or **export pack** in the web app.  
- **Human “approval product”** for external actions—Tier A internal persistence only; handoff resolution is **workflow evidence**, not external authorization ([MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md](./MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md)).  
- **Donor/volunteer** as complete CRM/ops suites—ledger/event APIs and module states are **slices**, not full programs.  
- **Green readiness** while memory evaluation is **`NO_GO`** if the pitch depends on reflection-grade memory.

---

## 5) Minimal remediation plan (pilot-safe launch)

| Step | Type | Outcome |
| --- | --- | --- |
| A | **Ops / env** | Migrations + `verify:schema`; set all required secrets; enable agents with DB sink. |
| B | **Ops / networking** | Either proxy `/api/org/*` to dashboard API **or** remove/replace in-UI evidence links with documented API base URL (product decision). |
| C | **Docs / sales** | Align pitch with [MAGNUS_ACCORD_CLIENT_SALES_SHEET.md](./MAGNUS_ACCORD_CLIENT_SALES_SHEET.md) and [PRODUCTION_TRUTH_CHECKLIST.md](../PRODUCTION_TRUTH_CHECKLIST.md). |
| D | **Optional code** | Add minimal web pages or BFF routes for alerts/handoffs/compliance **or** change obligation destinations to existing surfaces only—**only if** pilot requires in-app navigation (otherwise runbook-only). |
| E | **Optional code** | Fail-fast env validation in `apps/web` startup—reduces silent misconfig. |

---

## Exact blocker ladder (order to clear)

1. **Schema + DB connectivity** (migrations, `verify:schema`, boot guards pass).  
2. **Web + auth secrets** (`DATABASE_URL`, `JWT_SECRET`) so sessions and API routes work.  
3. **Agents process** enabled with DB alert sink in production.  
4. **Networking truth** for `/api/org/*` vs operator tooling (proxy or documented API-only workflow).  
5. **Connector / data prerequisites** for any Enterprise agent claims (Plaid/Candid/etc.)—human-operated setup.  
6. **Narrative alignment**—MCP pilot-only, memory `NO_GO` for reflection, obligation UI gaps explicit.

---

## GO / NO-GO

| Verdict | Condition |
| --- | --- |
| **GO (pilot)** | Migrations + schema verify **done**; **web + dashboard + DB** env set; **agents running** with **`AGENTS_ALERT_SINK=db`**; **sales/operator narrative** matches no-go boundaries; **MCP not sold as truth**; **obligation dead-ends and `/api/org` proxy** either **accepted in runbook** or **remediated**; clients informed that **memory reflection is `NO_GO` until thresholds** met. |
| **NO-GO** | Schema drift or agents **off** while promising watch agents; **MCP or pilot rows** presented as production compliance/finance truth; **unified browser UX assumed** without `/api/org` routing; **reflection** marketed as shipped. |

**Bottom line:** The stack can be **GO for an honest, operator-assisted pilot** when env, migrations, and agent scheduling are real and **marketing matches documented limits**. It is **NO-GO** if the client expects **self-serve connectors**, **click-through triage** for every obligation, **unified audit UI**, or **reflection** without meeting memory gates.

---

## References (source of truth)

- [PRODUCTION_TRUTH_CHECKLIST.md](../PRODUCTION_TRUTH_CHECKLIST.md)  
- [MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md)  
- [MAGNUS_ACCORD_PACKAGES.md](./MAGNUS_ACCORD_PACKAGES.md)  
- [MAGNUS_ACCORD_CONNECTOR_REGISTRY.md](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md)  
- [MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md](./MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md)  
- [MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md](./MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md)  
- `packages/db/src/schemaGuards.ts` · `packages/config/src/envValidator.ts` · `apps/agents/src/index.ts` · `apps/org-dashboard-api/src/server.ts` · `packages/org-autonomous-ops-context/src/activeObligations.ts` · `apps/web/src/app/(protected)/app/layout.tsx`
