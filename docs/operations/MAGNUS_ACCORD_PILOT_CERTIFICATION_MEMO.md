# Magnus Accord — final pilot certification memo (strict, evidence-backed)

**Date:** 2026-04-02  
**Decision requested:** certify readiness for **internal demo only**, **controlled pilot**, **broader early access**, or declare **blocked**.  
**Rule:** no optimism inflation; only implemented repo truth + runbook/readiness evidence.

**Primary evidence:**

- Production truth checklist: `docs/PRODUCTION_TRUTH_CHECKLIST.md`
- Production-readiness audit: `docs/product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md`
- Pilot launch package canon: `docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md`
- Runbook + prelaunch checklist: `docs/operations/MAGNUS_ACCORD_PILOT_RUNBOOK.md`, `docs/operations/MAGNUS_ACCORD_PRELAUNCH_CHECKLIST.md`
- Deterministic readiness report: `packages/org-autonomous-ops-context/src/launchReadiness.ts` (CLI + web API)
- Connector registry (truth labels): `docs/product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md`
- Approval/audit semantics: `docs/product/MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md`

---

## 1) Launch scope certified

### Certified: INTERNAL demo (staff, scripted)

**Certified scope:**

- **Authenticated web surfaces** for Directory, Connectors, Rules, Control tower, Operations log, Readiness, Executive (deep link). See `docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md` §3.
- **Deterministic readiness posture** via `buildLaunchReadinessReport` (READY / READY_WITH_CAVEATS / NOT_READY) and `buildPilotReadiness` (dimensioned NOT_CONFIGURED/PARTIAL/READY) (`packages/org-autonomous-ops-context/src/launchReadiness.ts`, `.../pilotReadiness.ts`).
- **Truthful autonomy boundary**: internal side effects only; no autonomous external send/submit/money movement (`docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md` §4; approval traceability doc).

**Conditions:** demo operator runs migrations + env preflight and does not claim click-through workflows that are unimplemented.

### Certified: CONTROLLED pilot (operator-assisted, bounded)

**Certified scope (minimum safe perimeter):**

- A pilot can be operated **safely and honestly** if and only if the **preflight gates pass**: schema verification (`pnpm --filter @magnus/db verify:schema`), correct env secrets, and **agents actually running** with DB sink (see audit + checklist). Evidence: `docs/PRODUCTION_TRUTH_CHECKLIST.md` and `docs/product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md`.
- Pilot package must be sold/represented as **visibility + rollups + internal watch**; not as a full operations suite.

**Conditions:** see sections 3–6.

---

## 2) Launch scope explicitly excluded

### Excluded: LIMITED early access (broader, self-serve expectations)

**Not certified** for broader early access because the repo truth has several gaps that are acceptable in a controlled pilot (with a runbook) but unsafe for broad EA expectations:

- **Dead-end in-app destinations for obligations**: executive obligations point to `/app/autonomous-ops/alerts/:id`, `/app/autonomous-ops/handoffs/:id`, `/app/compliance/:id` which are explicitly `UNIMPLEMENTED_IN_REPO` and have no `page.tsx` implementations in `apps/web` (captured in `docs/product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md` matrix).
- **Evidence links need BFF config or API tooling**: executive evidence URLs use `/api/org/...` endpoints implemented on `apps/org-dashboard-api`. The web app can proxy them same-origin only when `ORG_DASHBOARD_API_BASE_URL` is configured; otherwise the route fails closed and operators must use the dashboard API directly (`docs/product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md`).
- **Connector self-serve is limited by design**: only Claude has real DB-backed status; MCP/grant-gen/worker-financial are pilot-only rows and MCP contains explicit stub/demo paths (production checklist §4; connector registry).
- **Reflection / SOLARIS not implemented**; memory sufficiency defaults frequently yield `NO_GO` until history accumulates (audit matrix; maturity map references).

### Excluded capabilities (hard NOs)

- **MCP as compliance/finance truth** (explicit non-truth surfaces). Evidence: `docs/PRODUCTION_TRUTH_CHECKLIST.md` §4.
- **Autonomous external send/submit** (email, Slack, filing, grant submission) and **money movement**. Evidence: `docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md` §4.
- **Full audit workstation** (web UI) and audit export packs. Evidence: pilot launch package §5 + production audit.
- **Tier B “approval inbox” in-browser** for external actions. Evidence: pilot launch package §4.
- **Volunteer roster/scheduling/in-kind valuation**; donor/volunteer are ledger-first slices. Evidence: pilot launch package §7 and executive disclaimers.

---

## 3) Required pilot operating constraints (must be true in production)

These are **non-negotiables** for controlled pilot certification.

- **DB schema parity**
  - Migrations applied and verified with `pnpm --filter @magnus/db verify:schema` (`docs/PRODUCTION_TRUTH_CHECKLIST.md` §2).  
  - Services `apps/org-dashboard-api` and `apps/agents` fail closed on schema mismatch (audit matrix).

- **Environment correctness**
  - `apps/org-dashboard-api`: `DATABASE_URL`, `JWT_SECRET` (≥ 32 chars) must validate at start (`packages/config/src/envValidator.ts`).
- `apps/web`: `DATABASE_URL` + `JWT_SECRET` must be set; the app now fails closed at startup if either is missing/invalid. `ORG_DASHBOARD_API_BASE_URL` is optional, but must be configured if same-origin `/api/org/*` drilldown is part of the pilot workflow (audit matrix; runbook §3.3).

- **Agents actually running**
  - `AGENTS_ENABLED=true` so cron scheduler runs; `AGENTS_ALERT_SINK=db`; `NODE_ENV=production` cannot use console sink (`docs/operations/MAGNUS_ACCORD_PILOT_RUNBOOK.md` §1; production audit top blockers).

- **Truthful readiness reporting**
  - Operator must run `buildLaunchReadinessReport` (CLI or web API) and archive the output before claiming launch-ready. Evidence: runbook §1a, readiness implementation in `packages/org-autonomous-ops-context/src/launchReadiness.ts`.

---

## 4) Required human-in-the-loop boundaries

These are the **certified** autonomy boundaries; violating them makes the pilot **not honest**.

- **Human authority over external actions**
  - No autonomous external send/submit; no money movement. Evidence: pilot launch package §4.

- **Human operator for connector activation**
  - Claude activation is ops-dependent; not guaranteed self-serve. Evidence: connector registry (`claudePartner` LIMITED; status from `Organization.claudeStatus`).

- **Human triage and audit use is API/runbook-driven**
  - There is no in-web triage UI for alerts/handoffs/compliance detail pages (unimplemented destinations). Operators must use the **operations log**, control tower rollups, and dashboard APIs where appropriate. Evidence: production audit matrix; approval traceability doc.

- **Human interpretation of “empty obligations”**
  - Obligations snapshot can be empty and is explicitly treated as `PARTIAL` in readiness; do not fabricate obligations. Evidence: `packages/org-autonomous-ops-context/src/pilotReadiness.ts` and production audit.

---

## 5) Required connector caveats

Mandatory caveats in any controlled pilot statement of work or launch brief.

- **Claude Partner**
  - `Organization.claudeStatus` is the truth; `NOT_ENABLED` or `CONFIGURING` must be represented as not fully ready. Evidence: connector registry + `buildPilotReadiness` dimension `claude_connector`.

- **MCP Connector / Grant Generator / Worker Financial Layer**
  - These are pilot-labeled rows; MCP includes demo/stub/random/in-memory paths and is **explicitly non-truth** for compliance/finance. Evidence: `docs/PRODUCTION_TRUTH_CHECKLIST.md` §4; connector registry.

- **Plaid / Candid**
  - Marked `INTERNAL_ONLY`; require human-operated setup and data. Enterprise agent outcomes may be `NOT_CONFIGURED`/`INSUFFICIENT_DATA` until prerequisites exist. Evidence: connector registry + production audit.

---

## 6) Required reflection / SOLARIS boundary

- **SOLARIS / reflection synthesis agent is not implemented.** Evidence: pilot launch package §7 + feature directory references.
- **Memory sufficiency is an explicit gate**: `evaluateMemorySufficiency` defaults (operational entries/span/agents/sourceRef coverage + curated + semantic chunks) often yield `NO_GO` until history exists (production audit; `packages/org-autonomous-ops-context/src/memorySufficiency.ts`).
- **Certification rule:** reflection-grade claims are **NO-GO** unless `buildLaunchReadinessReport.reflectionMemory.readiness === GO` **and** the business pitch matches the actually shipped behavior (keyword semantic search; no embeddings pipeline claim).

---

## 7) Recommended launch status (strict)

### Recommended: **CONTROLLED_PILOT_READY**

**Why (evidence-based):**

- The repo has fail-closed guards for schema parity (`verify:schema` + runtime `assertDbShape`) and deterministic readiness reporting (`buildPilotReadiness`, `buildLaunchReadinessReport`) that explicitly avoids fake green.
- The pilot can be run as an operator-assisted program with truthful boundaries (internal side effects only; MCP non-truth; no audit workstation).

**Not recommended:**

- **LIMITED_EARLY_ACCESS_READY** is **not certified** due to unimplemented obligation destinations and the need for proxy/API tooling for evidence drilldowns, plus pilot-only connectors and reflection gates.

---

## Exact blocker ladder (no-go language)

If any item below fails, the recommendation becomes **NOT_READY** (for controlled pilot) until remediated.

1. **Schema parity fails**: `pnpm --filter @magnus/db verify:schema` non-zero, or services fail boot with `DB_SCHEMA_INCOMPATIBLE`.  
   - **No-go language:** “We cannot operate Accord in production because database schema truth is not verified.”
2. **Env invalid / secrets missing**: missing/short `JWT_SECRET` or missing `DATABASE_URL` for web/dashboard/agents.  
   - **No-go language:** “We cannot claim pilot readiness while core services can 500/401 due to missing secrets.”
3. **Agents not running with DB sink**: `AGENTS_ENABLED` not true or `AGENTS_ALERT_SINK` not `db` in production.  
   - **No-go language:** “We cannot claim watch agents are live if scheduled runs are not producing DB-backed alerts/runs.”
4. **Connector truth violated**: any narrative or UI copy treats MCP as authoritative compliance/finance truth.  
   - **No-go language:** “MCP demo/stub paths make this an honesty failure; do not launch under that claim.”
5. **Reflection overclaim**: any pitch includes reflection/SOLARIS or “semantic memory” as live while readiness shows memory `NO_GO`.  
   - **No-go language:** “Reflection is not shipped and memory gates are unmet; do not launch under that claim.”
6. **UX expectation mismatch**: stakeholders expect click-through obligation triage pages; they are unimplemented.  
   - **No-go language:** “This pilot requires operator-run drilldown via logs/APIs; if the client expects full UI, do not launch.”

---

## Summary (safe perimeter)

- **Certified perimeter:** operator-assisted controlled pilot delivering **internal watch + executive visibility + rollups**, with deterministic readiness reporting and explicit non-truth connector caveats.
- **Explicitly excluded:** broader early access / self-serve connector posture; reflection; MCP-as-truth; external autonomous actions; full audit workstation; donor/volunteer ops suite.

**Final recommendation:** **CONTROLLED_PILOT_READY** (not Early Access).

**See also:** [Executive launch decision memo](./MAGNUS_ACCORD_EXECUTIVE_LAUNCH_DECISION_MEMO.md) (concise internal summary for leadership).
