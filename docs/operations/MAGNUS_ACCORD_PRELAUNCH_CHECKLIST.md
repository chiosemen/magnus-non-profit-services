# Magnus Accord — prelaunch checklist

Use this **tick list** immediately before a pilot go-live or demo. Each item is **verifiable** (command, URL, or observable outcome). Full procedure: [MAGNUS_ACCORD_PILOT_RUNBOOK.md](./MAGNUS_ACCORD_PILOT_RUNBOOK.md).

**Legend:** `READY` · `READY_WITH_RUNBOOK` · `BLOCKED_BY_ENV` · `BLOCKED_BY_CODE` · `NO_GO_FOR_PILOT`

---

## A — Preflight

- [ ] **A1** — Repo dependencies installed; deploy build includes `apps/web`, `apps/org-dashboard-api`, `apps/agents` as applicable. `CLASS: READY_WITH_RUNBOOK`
- [ ] **A2** — `DATABASE_URL` for the **target** Postgres is set for every service that uses Prisma (`apps/web`, `org-dashboard-api`, `agents`). `CLASS: BLOCKED_BY_ENV` if wrong DB
- [ ] **A3** — `pnpm --filter @magnus/db verify:schema` exits **0** (from repo root). `CLASS: READY` or `BLOCKED_BY_ENV`
- [ ] **A3b** — Launch readiness JSON: `pnpm --filter @magnus/org-autonomous-ops-context launch-readiness -- <orgId>` with `DATABASE_URL` set returns `launchStatus` of **`READY`**, **`READY_WITH_CAVEATS`**, or **`NOT_READY`** (never empty). If **`NOT_READY`**, read `blockers`. `CLASS: READY`
- [ ] **A4** — `pnpm --filter @magnus/db exec prisma migrate status` reports schema **up to date** (no pending migrations). `CLASS: READY`
- [ ] **A5** — `JWT_SECRET` is **≥ 32 characters** wherever tokens are signed or verified (`apps/web`, `org-dashboard-api`). `CLASS: BLOCKED_BY_ENV` if missing/short
- [ ] **A6** — `org-dashboard-api` starts and listens (default **`4010`** if `PORT` unset); `GET /health` returns `{"ok":true}`. `CLASS: READY`
- [ ] **A7** — `apps/agents` with `AGENTS_ENABLED=true` does **not** log `Agents disabled`. `CLASS: BLOCKED_BY_ENV` if disabled
- [ ] **A8** — Production: `NODE_ENV=production` ⇒ `AGENTS_ALERT_SINK=db` (not `console`). `CLASS: BLOCKED_BY_ENV` if violated

---

## B — Migrations (reference)

All folders under `packages/db/prisma/migrations/` through `20260402140000_volunteer_event` applied via `prisma migrate deploy`. If **A3** passes, **B** is satisfied.

- [ ] **B1** — Confirmed `verify:schema` success **after** `migrate deploy` on target DB. `CLASS: READY`

---

## C — Environment matrix (spot-check)

| Location | `DATABASE_URL` | `JWT_SECRET` (≥32) | Other |
| --- | --- | --- | --- |
| `apps/web` | required | required | — |
| `apps/org-dashboard-api` | required | required | `PORT` optional (4010) |
| `apps/agents` | required | — | `AGENTS_ENABLED`=`true`, `AGENTS_ALERT_SINK`=`db` |

- [ ] **C1** — Web env in hosting config includes `DATABASE_URL` + `JWT_SECRET` (not only local `.env`). `CLASS: BLOCKED_BY_ENV` if missing
- [ ] **C2** — `org-dashboard-api` env matches validator (`packages/config/src/envValidator.ts`). `CLASS: READY`

---

## D — Connectors

- [ ] **D1** — `/app/autonomous-ops/connectors` loads; Claude row shows **actual** `Organization.claudeStatus` from DB. `CLASS: READY_WITH_RUNBOOK`
- [ ] **D2** — If Claude is **not** `ACTIVE`: documented as **PARTIAL** for pilot; no claim of full Claude automation. `CLASS: READY_WITH_RUNBOOK`
- [ ] **D3** — MCP / grant-gen / worker-financial rows understood as **pilot**; team agrees **not** to treat MCP as compliance/finance truth. `CLASS: NO_GO_FOR_PILOT` if client insists on MCP truth
- [ ] **D4** — If Enterprise agents (Plaid/Candid) are **not** configured: **expected** `NOT_CONFIGURED` / `INSUFFICIENT_DATA` in executive modules—documented. `CLASS: READY_WITH_RUNBOOK`

---

## E — Org onboarding

- [ ] **E1** — Org `subscriptionStatus` = `ACTIVE`; tier **GROWTH** or **ENTERPRISE** per pilot scope. `CLASS: BLOCKED_BY_ENV` / policy if wrong tier
- [ ] **E2** — `/app/autonomous-ops/directory` — all five `ORG_*` files **READY** or blockers explicitly listed (see validation `report`). `CLASS: READY_WITH_RUNBOOK`
- [ ] **E3** — If HERALD in scope: `ORG_IDENTITY` sections + `annualRevenue` per [MAGNUS_ACCORD_ORG_CONTEXT_FILES.md](../product/MAGNUS_ACCORD_ORG_CONTEXT_FILES.md). `CLASS: READY_WITH_RUNBOOK`
- [ ] **E4** — `GET /api/autonomous-ops/readiness` — read `overall.summary` and `blockers` array; screenshot or log for file. `CLASS: READY`

---

## F — Launch agents

- [ ] **F1** — `GET /api/org/autonomous-ops/settings` returns `enabledAgents` containing **only** agents allowed by subscription tier (`packages/subscription/src/autonomousOpsPolicy.ts`). `CLASS: READY`
- [ ] **F2** — `maxAutonomyTier` appropriate for pilot (typically **`TIER_A_AUTONOMOUS`** for internal-only autonomy). `CLASS: READY_WITH_RUNBOOK`
- [ ] **F3** — After a scheduled window, **AgentRun** and/or **Alert** rows exist for the org (SQL or dashboard API). **If none:** confirm org ID in scope, `enabledAgents` non-empty (for **org-scoped** agents), tier allows agent, `AGENTS_ENABLED=true`. **Note:** `GrantLifecycleManager` ignores `enabledAgents` in `scheduler.ts`—see runbook §6. `CLASS: BLOCKED_BY_ENV` if agents never run

---

## G — Approval policy

- [ ] **G1** — `/app/autonomous-ops/rules` loads; shows policy surface and `maxAutonomyTier`. `CLASS: READY`
- [ ] **G2** — Team agrees: no autonomous external outbound; handoff “resolution” is **not** external authorization ([MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md](../product/MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md)). `CLASS: READY_WITH_RUNBOOK`

---

## H — Executive board

- [ ] **H1** — `/app/autonomous-ops/executive` — `GET /api/autonomous-ops/executive/board?take=50` returns **200** and JSON with `moduleStates`, `disclaimers`. `CLASS: READY`
- [ ] **H2** — Empty `activeObligations` accepted if no board-prep alerts / no matching handoffs / no due-soon compliance. `CLASS: READY`

---

## I — Active obligations

- [ ] **I1** — Obligation **destination** links (`/app/autonomous-ops/alerts/…`, `/app/compliance/…`) known **unimplemented** in web—no false expectation of detail pages. `CLASS: BLOCKED_BY_CODE` for full UI; **honest** if disclosed
- [ ] **I2** — If using audit evidence: `GET /api/org/autonomous-ops/alerts/:id/audit` (or handoff audit) **200** when called against **`org-dashboard-api` base URL** with `Authorization: Bearer <jwt>`. If only same-origin web: `CLASS: BLOCKED_BY_ENV` unless `/api/org` proxy exists

---

## J — Audit / operations log

- [ ] **J1** — `GET /api/autonomous-ops/operations-log?take=50` returns **200** JSON (cookie auth). `CLASS: READY`
- [ ] **J2** — `GET /api/org/autonomous-ops/operations-log?take=50` (JWT) **200** against dashboard. `CLASS: READY`

---

## K — No-go gates (stop the launch narrative)

- [ ] **K1** — No stakeholder comms claiming MCP as **authoritative** financial/compliance record. `CLASS: NO_GO_FOR_PILOT` if violated
- [ ] **K2** — No comms claiming **reflection** / SOLARIS while `memoryEvaluation.readiness === NO_GO`. `CLASS: NO_GO_FOR_PILOT` if violated
- [ ] **K3** — No Tier B “approve external email” workflow promised. `CLASS: NO_GO_FOR_PILOT` if violated

---

## L — Rollback readiness

- [ ] **L1** — Documented how to set `AGENTS_ENABLED=false` (or unset) and restart agents. `CLASS: READY_WITH_RUNBOOK`
- [ ] **L2** — Documented `PUT /api/org/autonomous-ops/settings` with `"enabledAgents": []` for **org-scoped** agent kill switch; documented that **GrantLifecycleManager** / **WorkerIncomeOptimizer** are not gated by this field in `scheduler.ts`. `CLASS: READY_WITH_RUNBOOK`

---

## Sign-off

| Role | Name | Date | Notes |
| --- | --- | --- | --- |
| Operator | | | |
| Pilot owner | | | |

---

## References

- [MAGNUS_ACCORD_PILOT_RUNBOOK.md](./MAGNUS_ACCORD_PILOT_RUNBOOK.md)  
- [scripts/magnus-accord-pilot-preflight.sh](../../scripts/magnus-accord-pilot-preflight.sh)  
- [MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md](../product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md)
