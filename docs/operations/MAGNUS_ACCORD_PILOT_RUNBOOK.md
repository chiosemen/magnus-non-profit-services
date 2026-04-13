# Magnus Accord — pilot launch runbook

**Purpose:** Repeatable operator procedure for a **disciplined human** to bring the Magnus Accord pilot online, verify it honestly, operate it, and shut it down safely.

**Truth sources:** [PRODUCTION_TRUTH_CHECKLIST.md](../PRODUCTION_TRUTH_CHECKLIST.md) · [MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md](../product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md) · [MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md](../product/MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md) · [MAGNUS_ACCORD_ORG_CONTEXT_FILES.md](../product/MAGNUS_ACCORD_ORG_CONTEXT_FILES.md) · [MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md](../product/MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md)

**Classification key (used in prelaunch checklist):**

| Tag | Meaning |
| --- | --- |
| `READY` | Automated or objective pass/fail |
| `READY_WITH_RUNBOOK` | Passes when a human follows this doc |
| `BLOCKED_BY_ENV` | Fix env / hosting before continuing |
| `BLOCKED_BY_CODE` | Product gap; document limitation, do not pretend green |
| `NO_GO_FOR_PILOT` | Do not claim that capability for this pilot |

---

## 1) Preflight checks

Run **before** any client-facing “go live” communication.

1. **Repository / build** — From repo root: `pnpm install` (or your lockfile-respecting install). Build packages that your deploy compiles (`apps/web`, `apps/org-dashboard-api`, `apps/agents` as applicable).
2. **Database reachable** — `DATABASE_URL` points at the **target** Postgres instance (not a dev machine by mistake). Quick check: `pnpm --filter @magnus/db exec prisma migrate status` (expects “Database schema is up to date” after deploy).
3. **Schema verification (Autonomous Ops profile)** — From repo root: `pnpm --filter @magnus/db verify:schema`  
   - **Pass:** process exits `0`.  
   - **Fail:** `DB_SCHEMA_INCOMPATIBLE:…` — apply migrations (see §2), then re-run.  
   - Alternatively run [`scripts/magnus-accord-pilot-preflight.sh`](../../scripts/magnus-accord-pilot-preflight.sh) (same command).
4. **Service boot guards** — `org-dashboard-api` and `apps/agents` call `assertDbShape` at startup (`apps/org-dashboard-api/src/server.ts`, `apps/agents/src/index.ts`). If the process exits immediately on boot, read stderr for `DB_SCHEMA_INCOMPATIBLE` and fix migrations first.
5. **JWT alignment** — `JWT_SECRET` used to sign **web session cookies** must match the secret used to verify **Bearer** tokens on `org-dashboard-api` if operators call dashboard APIs directly. Both must be **≥ 32 characters** (`packages/config/src/envValidator.ts` for `org-dashboard-api`; `apps/web/src/lib/auth.ts` throws if `JWT_SECRET` is missing or short).
6. **Agents process** — If `AGENTS_ENABLED` is not `true`, the agents service **does not start cron** (`apps/agents/src/index.ts`). Log line: `Agents disabled — AGENTS_ENABLED not set`. Treat pilot “watch” as **not running** until this is fixed.
7. **Production alert sink** — If `NODE_ENV=production`, `AGENTS_ALERT_SINK` must be **`db`**. `console` throws at startup (`apps/agents/src/config/env.ts`).

### 1a) Launch readiness report (deterministic)

Use **`buildLaunchReadinessReport`** (`packages/org-autonomous-ops-context/src/launchReadiness.ts`) for a **three-way** gate: **`READY`**, **`READY_WITH_CAVEATS`**, **`NOT_READY`**. It reuses **`buildPilotReadiness`**, runs **`buildExecutiveBoard`** and **`buildOperationsLog`** (failures → **`NOT_READY`**), and never treats empty obligations or memory **`NO_GO`** as the sole reason for **`READY`** (those are caveats unless other gaps exist).

- **CLI (operator):** from repo root, with `DATABASE_URL` set:  
  `pnpm --filter @magnus/org-autonomous-ops-context launch-readiness -- <orgId> [--require-ledger] [--claude-optional]`  
  Prints JSON to stdout (exit `0` on success, `1` on thrown error).
- **Web (staff):** `GET /api/autonomous-ops/launch-readiness` (authenticated). Optional query: `requireLedger=true`, `claudeOptional=true`.

**`--claude-optional`** — Claude **`NOT_ENABLED`** does not alone force **`NOT_READY`**; caveat recorded. **`--require-ledger`** — donor/volunteer ledger dimension must be **`READY`** or report is **`NOT_READY`**.

---

## 2) Required migrations

Apply **all** migrations in `packages/db/prisma/migrations/` in order. The Autonomous Ops–related folders after `init` are:

| Migration folder | Purpose (summary) |
| --- | --- |
| `20260331120000_autonomous_ops_foundation` | AgentRun, Alert, handoffs, memory, org context |
| `20260331140000_agent_handoff_audit` | Handoff audit trail |
| `20260331150000_autonomous_ops_memory_tiers` | Semantic/curated memory shape |
| `20260401120000_org_autonomous_ops_settings` | Per-org settings |
| `20260401123000_alert_agent_name` | Alert agent linkage |
| `20260401130000_alert_lifecycle_and_audit` | Alert lifecycle + audit |
| `20260402120000_donor_event` | Donor ledger slice |
| `20260402140000_volunteer_event` | Volunteer time ledger slice |

**Command (production):** from `packages/db` or via filter:

```bash
pnpm --filter @magnus/db prisma:deploy
```

(Use `prisma migrate deploy` in CI; do **not** use `migrate dev` against production.)

**Verification:** `pnpm --filter @magnus/db verify:schema` exits `0`.

---

## 3) Required environment variables and secrets

Values are **validated at process start** only where noted. `apps/web` now uses startup instrumentation (`apps/web/src/instrumentation.ts`) plus `apps/web/src/lib/env.ts`; set these in hosting explicitly.

### 3.1 `apps/org-dashboard-api`

Validated by `validateEnv('org-dashboard-api')` (`packages/config/src/envValidator.ts`):

| Variable | Rule |
| --- | --- |
| `DATABASE_URL` | Non-empty connection string to Postgres |
| `JWT_SECRET` | Non-empty, **minimum 32 characters** |

| Variable | Rule |
| --- | --- |
| `PORT` | Optional; default **`4010`** if unset (`apps/org-dashboard-api/src/server.ts`) |

**CORS:** `origin: false` — browser calls must go through **same-origin proxy** or non-browser clients.

### 3.2 `apps/agents`

| Variable | Rule |
| --- | --- |
| `DATABASE_URL` | Required; validated by `validateEnv('agents')` |
| `AGENTS_ENABLED` | Must be **`true`** for cron scheduler (`apps/agents/src/index.ts`) |
| `AGENTS_ALERT_SINK` | `db` or `console`; in **`production`**, only **`db`** is allowed (`apps/agents/src/config/env.ts`) |
| `NODE_ENV` | Set to `production` in production |
| `AGENTS_TIMEZONE` | Optional IANA timezone string for `node-cron` (e.g. `America/New_York`); if unset, host local timezone applies |

**Cron schedule (reference):** `apps/agents/src/scheduler/cron.ts` — e.g. ComplianceWatchdog `15 2 * * *`, BoardIntelligenceOracle `0 8 * * 1`, etc.

### 3.3 `apps/web` (Next.js)

Validated at app boot by `apps/web/src/instrumentation.ts`; **must** be set for server routes:

| Variable | Rule |
| --- | --- |
| `DATABASE_URL` | Required for Prisma in API routes and server components using `@magnus/db` |
| `JWT_SECRET` | Same secret as token signing; **≥ 32 characters** (`apps/web/src/lib/auth.ts`) |
| `ORG_DASHBOARD_API_BASE_URL` | Optional absolute `http(s)` URL; enables same-origin `/api/org/*` proxy to `org-dashboard-api` |

**If `DATABASE_URL` / `JWT_SECRET` are missing or invalid:** the app fails closed at startup.  
**If `ORG_DASHBOARD_API_BASE_URL` is intentionally not configured:** same-origin `/api/org/*` returns **`501 ORG_DASHBOARD_API_BASE_URL_NOT_CONFIGURED`**; use the dashboard API base URL directly for audit evidence.

### 3.4 Optional adjacent services (not required for core pilot surfaces)

| Service | Validated vars (see `packages/config/src/envValidator.ts`) |
| --- | --- |
| `claude-partner` | `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY` |
| `grant-generator` | `DATABASE_URL`, `ANTHROPIC_API_KEY` |
| `mcp-connector` | `DATABASE_URL`, `JWT_SECRET` |

**If these are not deployed:** Claude Partner / grant-gen / MCP rows may show **pilot** or **stub** status—see §4.

---

## 4) Connector setup steps

| Connector | What to verify | If intentionally not configured |
| --- | --- | --- |
| **Magnus HQ (DB)** | Implicit: `DATABASE_URL` works; org-scoped tables exist | N/A — pilot cannot run |
| **Claude Partner** | `Organization.claudeStatus` in DB → **ACTIVE** for “ready” narratives; **CONNECTORS** UI: `/app/autonomous-ops/connectors` | **PARTIAL** pilot: document that agent-assisted Claude paths are limited; do not claim full automation |
| **MCP Connector** | **Pilot-only**; demo/stub paths in `apps/mcp-connector` | **Do not** use MCP output as compliance/finance truth ([PRODUCTION_TRUTH_CHECKLIST.md §4](../PRODUCTION_TRUTH_CHECKLIST.md)). Record “MCP not used for decisions” in client notes |
| **Grant Generator / Worker Financial** | Pilot-labeled rows in UI | Treat as **visibility only** until product state is wired |
| **Plaid / Candid** | **INTERNAL_ONLY** — no web connector card ([MAGNUS_ACCORD_CONNECTOR_REGISTRY.md](../product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md)) | **Enterprise agents** (FinancialSentinel, GrantIntelligenceHerald) may show **NOT_CONFIGURED** / **INSUFFICIENT_DATA** in executive modules—expected; document |

---

## 5) Org onboarding steps

1. **Subscription** — Org row must have `subscriptionStatus: ACTIVE`. Tier **GROWTH** enables `ComplianceWatchdog` + `BoardIntelligenceOracle`; **ENTERPRISE** adds `FinancialSentinel`, `GrantLifecycleManager`, `GrantIntelligenceHerald`, `WorkerIncomeOptimizer` (`packages/subscription/src/autonomousOpsPolicy.ts`).
2. **Org context files** — five kinds in `OrgContextFile`: `ORG_IDENTITY`, `ORG_SOUL`, `ORG_AGENTS`, `ORG_MEMORY`, `ORG_HEARTBEAT`. Use **Directory** `/app/autonomous-ops/directory` — validation report shows per-kind status. Remove or replace template markers (`<!-- magnus:template … -->`) and add substantive content per [MAGNUS_ACCORD_ORG_CONTEXT_FILES.md](../product/MAGNUS_ACCORD_ORG_CONTEXT_FILES.md).
3. **ORG_IDENTITY for HERALD** — If `GrantIntelligenceHerald` is in scope: `## Mission`, `## Sector / NTEE` (NTEE code), `## State footprint` (US state); set **`Organization.annualRevenue`** to a positive number in DB.
4. **Readiness API** — `GET /api/autonomous-ops/readiness` (authenticated) returns `dimensions`, `overall`, `memoryEvaluation`. **If `overall.summary` is `PARTIAL` or `NOT_CONFIGURED`:** record blockers in operator log; do not claim “all green.”
5. **Memory sufficiency** — `memoryEvaluation.readiness` is **`NO_GO`** until thresholds in `packages/org-autonomous-ops-context/src/memorySufficiency.ts` are met. **If reflection-grade features are out of scope for this pilot:** state explicitly in client comms; **do not** market SOLARIS/reflection.

---

## 6) Launch-agent enablement steps

1. **Persist settings** — `OrgAutonomousOpsSettings` must list enabled agents **by exact string name** (see scheduler: `ComplianceWatchdog`, `BoardIntelligenceOracle`, …).  
   - **GET:** `GET /api/org/autonomous-ops/settings` (Bearer JWT, org from token) — `apps/org-dashboard-api/src/autonomousOpsSettingsRoutes.ts`  
   - **PUT:** `PUT /api/org/autonomous-ops/settings` with JSON `{ "enabledAgents": ["ComplianceWatchdog", "BoardIntelligenceOracle"], "maxAutonomyTier": "TIER_A_AUTONOMOUS" }` (adjust list; tier must be valid enum)
2. **Subscription gate** — Scheduler skips orgs where `subscriptionAllowsScheduledAgent` is false (`apps/agents/src/scheduler/scheduler.ts`). Enabling an agent in settings **does not** override tier—e.g. `GrantLifecycleManager` on **GROWTH** org never runs.
3. **Boundary mode** — `filterOrgsByAutonomySettings` skips agents when boundary mode resolves to **`never`** (`apps/agents/src/scheduler/scheduler.ts`). Keep `maxAutonomyTier` and overrides consistent with pilot policy (typically **Tier A** internal persistence only).
4. **Process** — Agents must run with **`AGENTS_ENABLED=true`** and cron active. **Verification:** after a scheduled window, new `AgentRun` rows and/or `Alert` rows appear for the org (query DB or use Control tower rollups).

**Implementation note (`apps/agents/src/scheduler/scheduler.ts`):**  
- **Org-scoped** scheduled agents (`ComplianceWatchdog`, `BoardIntelligenceOracle`, `FinancialSentinel`, `GrantIntelligenceHerald`) are filtered by **`enabledAgents`** and boundary mode via `filterOrgsByAutonomySettings`.  
- **`GrantLifecycleManager`** is scheduled per **`grant` scope** and **does not** pass through `filterOrgsByAutonomySettings`—the cron tick runs it for every grant whose org passes **subscription** only. **Disabling it in `enabledAgents` does not stop GrantLifecycleManager** in the current code. If GrantLifecycleManager must be off for a pilot, use **subscription tier** (not ENTERPRISE), **remove/avoid `Grant` rows**, or stop the agents process—document the chosen approach in operator notes.  
- **`WorkerIncomeOptimizer`** is scheduled per **worker** scope and **does not** consult org `enabledAgents` in `runScheduled` (same pattern as GrantLifecycleManager—subscription gate only on the worker–org relationship query).

**If an org-scoped agent is intentionally disabled:** remove its name from `enabledAgents` (empty array `[]` disables **org-scoped** agents that respect the filter). Cron still fires globally but those orgs are skipped for filtered agents.

---

## 7) Approval policy verification

1. Open **Rules** in web: `/app/autonomous-ops/rules` — shows `maxAutonomyTier`, `enabledAgents`, and policy copy from API.
2. **Read** [MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md](../product/MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md): **no** autonomous external send/submit; handoff resolution is **workflow evidence**, not external authorization.
3. **Confirm in data:** `AgentRun.humanReviewedAt` / `humanReviewedBy` are **not** populated by agents service in pilot—do not claim per-run staff sign-off.
4. **Tier B ask-first** for external actions is **not** a shipped web product—do not test for “approve email” buttons.

---

## 8) Executive board verification

1. **Browser:** Navigate to `/app/autonomous-ops/executive` (not linked from main nav in `apps/web/src/app/(protected)/app/layout.tsx`).
2. **API:** `GET /api/autonomous-ops/executive/board?take=50` — returns JSON with `moduleStates`, `topItems`, `activeObligations`, `financialSummary`, `disclaimers`.
3. **Expectations:**  
   - Disclaimers include “UI destinations … may be unimplemented” (`packages/org-autonomous-ops-context/src/executiveBoard.ts`).  
   - **Active obligations** alert slice may be **empty** if there are no board-prep alerts (`BoardIntelligenceOracle` + types `BOARD_WEEKLY_EXEC_SUMMARY` / `BOARD_PRE_BOARD_BRIEFING` in `packages/org-autonomous-ops-context/src/activeObligations.ts`)—empty is **valid**, not a failure.

---

## 9) Active obligations verification

1. Same payload as §8: `activeObligations` array.  
2. **Handoffs and compliance** rows appear when matching DB rows exist; **alert** obligations only for board-prep filter.  
3. **Primary `destination` links** (`/app/autonomous-ops/alerts/…`, `/app/compliance/…`) are marked **`UNIMPLEMENTED_IN_REPO`** in code—**no** matching `page.tsx` in `apps/web`.  
4. **Evidence links** (`/api/org/autonomous-ops/alerts/:id/audit`, `/api/org/autonomous-ops/handoffs/:id/audit`) are implemented on **`org-dashboard-api`** and exposed through the web BFF at `apps/web/src/app/api/org/[...path]/route.ts`. **If** `ORG_DASHBOARD_API_BASE_URL` is configured, same-origin browser clicks forward the authenticated session token to the dashboard service. **If not**, the route returns **`501 ORG_DASHBOARD_API_BASE_URL_NOT_CONFIGURED`**—use **curl** with `Authorization: Bearer <jwt>` against the dashboard **base URL** instead (`apps/org-dashboard-api/src/alertLifecycleRoutes.ts`, `agentHandoffRoutes.ts`).

---

## 10) Audit log verification

1. **Operations log (unified)** — `GET /api/autonomous-ops/operations-log?take=50` (Next, cookie auth) — `apps/web/src/app/api/autonomous-ops/operations-log/route.ts`.  
2. **Duplicate API** — `GET /api/org/autonomous-ops/operations-log` on `org-dashboard-api` (`registerOperationsLogRoutes`) for JWT clients.  
3. **Alert audit trail** — `GET /api/org/autonomous-ops/alerts/:id/audit` (dashboard JWT).  
4. **Handoff audit trail** — `GET /api/org/autonomous-ops/handoffs/:id/audit` (dashboard JWT).  
5. **No full web “audit workstation”** — there is no single page that lists every audit row for all entities; verification is **API + DB** level.

---

## 11) No-go checks (stop and fix narrative or config)

- [ ] Presenting **MCP** or **pilot connector rows** as financial/compliance **truth**  
- [ ] Claiming **reflection / SOLARIS** while `memoryEvaluation.readiness === NO_GO`  
- [ ] **Agents process** off or `AGENTS_ALERT_SINK=console` in production while promising scheduled alerts  
- [ ] Promising **click-through** triage on **Executive** destinations before dedicated pages or proxy exist  
- [ ] Claiming **Tier B** external approvals in-product  

---

## 12) Rollback and disable steps

1. **Stop scheduled agents globally** — Set `AGENTS_ENABLED=false` (or unset), restart `apps/agents` process. Cron does not start (`apps/agents/src/index.ts`).  
2. **Disable per-org (org-scoped agents only)** — `PUT /api/org/autonomous-ops/settings` with `"enabledAgents": []` and valid `maxAutonomyTier`. Scheduler skips **org-scoped** agents that use `filterOrgsByAutonomySettings`. **Does not** stop `GrantLifecycleManager` or `WorkerIncomeOptimizer` ticks—see §6.  
3. **Subscription downgrade** — Moving org to **STARTER** or non-**ACTIVE** prevents all scheduled agents via `subscriptionAllowsScheduledAgent` (no code change to settings required).  
4. **Dashboard API** — Stop `org-dashboard-api` process; JWT clients lose access to `/api/org/*`.  
5. **Web** — Stop Next deployment; staff lose UI. **Data** remains in Postgres until separately deleted.

---

## 13) Daily / weekly operator rhythm (pilot)

| Cadence | Action | Pass criterion |
| --- | --- | --- |
| **Daily** | Confirm `apps/agents` process is running (process manager / health) | Log shows scheduler started; no crash loop |
| **Daily** | Spot-check `/app/autonomous-ops/readiness` — read `overall.summary` and `blockers` | Blockers documented if new |
| **Daily** | `/app/autonomous-ops/control-tower` — rollups non-zero or explainably empty (new org) | No unexplained 500s |
| **Weekly** | `/app/autonomous-ops/executive` — `disclaimers` read; `activeObligations` interpreted per §9 | Client update notes aligned |
| **Weekly** | `GET /api/autonomous-ops/operations-log?take=100` — recent entries present if agents ran | If empty, confirm agents enabled + org in scope |
| **Weekly** | Review connector truth: MCP ≠ production record | Documented |

---

## Related

- [MAGNUS_ACCORD_PRELAUNCH_CHECKLIST.md](./MAGNUS_ACCORD_PRELAUNCH_CHECKLIST.md) — tickable gate list  
- [scripts/magnus-accord-pilot-preflight.sh](../../scripts/magnus-accord-pilot-preflight.sh) — schema-only preflight
