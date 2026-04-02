# Magnus Accord — internal executive launch decision memo

**Date:** 2026-04-02  
**Audience:** founder, operator, technical lead  
**Basis:** implemented repo behavior, production checklist, pilot runbook, and strict certification memo ([MAGNUS_ACCORD_PILOT_CERTIFICATION_MEMO.md](./MAGNUS_ACCORD_PILOT_CERTIFICATION_MEMO.md)). No marketing claims below are assumed without evidence in those sources.

---

## What Magnus Accord is

Magnus Accord is a **bounded internal operations layer** for nonprofits: scheduled agents and staff-facing surfaces produce **internal** alerts, prep, rollups, and visibility—while **humans retain authority** over anything external or irreversible (no autonomous outbound send, filings, submissions, or money movement). Truth is anchored in **Postgres + explicit readiness gates**, not in “green” UI alone.

---

## What is in the pilot

**Product surfaces (authenticated web):** Directory (org context files), Connectors (honest status), Rules (autonomy bounds), Control tower (rollups), Operations log, Readiness, Executive (deep link; not in main nav). See **`docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md` §3**.

**Agents (subscription-gated):**  
- **GROWTH:** `ComplianceWatchdog`, `BoardIntelligenceOracle`.  
- **ENTERPRISE (HQ expansion):** adds `FinancialSentinel`, `GrantLifecycleManager`, `GrantIntelligenceHerald`; worker-scoped agent exists but is **not** the nonprofit HQ promise. Same doc §2; `packages/subscription/src/autonomousOpsPolicy.ts`.

**Operational proof:** DB migrations + `verify:schema`; services fail closed on schema drift; deterministic **`buildLaunchReadinessReport`** (`READY` / `READY_WITH_CAVEATS` / `NOT_READY`) in `packages/org-autonomous-ops-context/src/launchReadiness.ts`. Runbook: **`docs/operations/MAGNUS_ACCORD_PILOT_RUNBOOK.md`**.

---

## What is excluded

- **Broader “early access”** with self-serve connector and full triage UX expectations. Evidence: **`docs/product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md`** (obligation destinations unimplemented; `/api/org/*` not on Next without proxy).
- **SOLARIS / reflection synthesis agent** — not implemented (`docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md` §7).
- **MCP as compliance/finance authority** — stub/demo paths; **`docs/PRODUCTION_TRUTH_CHECKLIST.md` §4**.
- **Full audit workstation** in the web app; **audit export packs**; **Tier B approval inbox** for external actions (`docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md` §4–5).
- **Donor/volunteer as full CRM/ops programs** — APIs exist; ledger-first slices; no full staff UIs for ingestion in `apps/web` (pilot launch package §7).

---

## What is proven

| Area | Proof |
| --- | --- |
| **Schema parity** | `pnpm --filter @magnus/db verify:schema`; boot-time `assertDbShape` on `org-dashboard-api` and `apps/agents` (`docs/PRODUCTION_TRUTH_CHECKLIST.md` §2). |
| **Persistence model** | Runs, alerts, handoffs, audit entries, org context files, settings — tables guarded in `packages/db/src/schemaGuards.ts`. |
| **Readiness is measurable** | `buildPilotReadiness` + `buildLaunchReadinessReport` with explicit blockers/caveats (`launchReadiness.ts`). |
| **Autonomy boundary** | Tier A–style internal side effects only in product truth; external actions not autonomous (`docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md` §4). |

---

## What remains bounded / pilot-only

- **Executive “Go next”** destinations for many obligations are **placeholders** (`UNIMPLEMENTED_IN_REPO`); evidence drilldown often requires **`org-dashboard-api`** + JWT or infra proxy, not same-origin Next alone (`docs/product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md`).
- **Connector rows** for MCP/grant-gen/worker-financial are **pilot-labeled**; not DB-backed product truth for adjacent apps (`docs/product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md`).
- **Memory** readiness for “reflection-grade” narrative is usually **`NO_GO`** until thresholds in `memorySufficiency.ts` are met (certification memo §6).
- **`apps/web`** does not validate all env at boot; misconfig surfaces at first API use (`docs/product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md`).

---

## Connector truth

- **Claude Partner:** truth is **`Organization.claudeStatus`** in DB; activation is **ops-dependent**, not guaranteed self-serve (`docs/product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md`).
- **MCP / grant-generator / worker-financial:** **PILOT**; MCP must **not** be sold or operated as financial/compliance truth (`docs/PRODUCTION_TRUTH_CHECKLIST.md` §4).
- **Plaid / Candid:** **INTERNAL_ONLY**; no self-serve connector cards; Enterprise agents need keys + data via human setup.

---

## Guardrail truth

- Agents today: **internal persistence** (runs, alerts, handoffs, artifacts). **No** autonomous email, Slack, filings, grant submission, money movement (`docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md` §4).
- **Human review** is data flags + workflow evidence, not a bank-grade external authorization product (`docs/product/MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md`).
- Handoff **RESOLVED** is auditable closure, **not** “approved to act externally.”

---

## Auditability truth

- **Append-only** audit trails exist for **handoffs** (and alert lifecycle APIs on `org-dashboard-api`). Operators can use **operations log** + APIs; there is **no** full browser audit workstation for every entity (`docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md` §5; certification memo).
- **`AgentRun.humanReviewedAt` / `humanReviewedBy`** are **not** written by agents/dashboard in this pilot—do not claim per-run staff sign-off (`docs/product/MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md`).

---

## Onboarding truth

- Five canonical **`ORG_*`** files must be substantive (not template-only) for readiness; Directory + validation report drive this (`docs/product/MAGNUS_ACCORD_ORG_CONTEXT_FILES.md`).
- **`OrgAutonomousOpsSettings`** must list enabled agents consistent with subscription tier; empty list disables org-scoped agents that respect settings (scheduler nuance for grant/worker agents documented in runbook §6).
- **Readiness API** and **launch readiness** report are explicit gates; **`PARTIAL`** or **`NOT_READY`** are valid outcomes, not failures to hide.

---

## Operator burden

**Cannot be zero.** A controlled pilot requires a **disciplined operator** who:

- Runs migrations + `verify:schema`, validates env for web + dashboard + agents, enables **`AGENTS_ENABLED`** + **`AGENTS_ALERT_SINK=db`** in production.
- Archives **`buildLaunchReadinessReport`** output before claiming launch-ready.
- Runs **API or proxied** access for `/api/org/*` audit drilldown when needed.
- Communicates **boundaries** in every client touch (no MCP truth, no reflection, no full triage UI).

Burden is **runbook-driven**, not self-serve product-complete (`docs/operations/MAGNUS_ACCORD_PILOT_RUNBOOK.md`).

---

## Launch recommendation

**Approve:** **Controlled pilot** — operator-assisted, **not** broad early access.

**Do not approve yet:** **Limited early access** or any launch narrative implying self-serve connectors, full obligation triage in-app, or MCP as authority.

**Alignment with certification:** **`CONTROLLED_PILOT_READY`** in **`docs/operations/MAGNUS_ACCORD_PILOT_CERTIFICATION_MEMO.md`**.

---

## Next 30 / 60-day hardening priorities

**30 days (truth + ops safety)**

1. **Enforce or document** `/api/org/*` routing for staff (reverse proxy or documented API base URL) — removes 404 confusion on evidence links.
2. **Fail-fast env** for `apps/web` (optional code) or **mandatory** hosting checklist sign-off — reduces silent misconfig.
3. **One pilot org** with archived `launch-readiness` JSON + `verify:schema` in CI on every deploy.

**60 days (product completeness vs pilot)**

4. **Minimal** alert / handoff / compliance **detail** routes or BFF—only if pilot contracts require in-app triage; otherwise keep API-only and document.
5. **MCP truth posture:** either isolate demo paths from production narrative or **remove** pilot-row claims until DB-backed state exists.
6. **Memory / reflection:** if reflection is ever a roadmap item, **ship thresholds + embeddings story** before external messaging; until then, keep **`NO_GO`** as the honest default.

---

## What we will not say publicly yet

- That MCP or pilot connector rows are **compliance or financial systems of record**.
- That **reflection / SOLARIS** exists or that semantic memory is **fully** live.
- That staff can **approve external actions** in-product like a Tier B workflow.
- That **early access** is “self-serve” without operator runbook and infra prerequisites.
- That **donor/volunteer** is a complete program suite—**ledger/API slices** only.

---

## References

- `docs/operations/MAGNUS_ACCORD_PILOT_CERTIFICATION_MEMO.md`
- `docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md`
- `docs/product/MAGNUS_ACCORD_PILOT_PRODUCTION_READINESS_AUDIT.md`
- `docs/operations/MAGNUS_ACCORD_PILOT_RUNBOOK.md`
- `docs/PRODUCTION_TRUTH_CHECKLIST.md`
- `docs/product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md`
- `docs/product/MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md`
