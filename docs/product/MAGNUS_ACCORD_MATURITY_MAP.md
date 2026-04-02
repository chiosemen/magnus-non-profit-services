# Magnus Accord — maturity map

This map classifies **implemented capabilities** by **product maturity**. It is **not** a deploy health report: for greenfield production claims, use the [production truth checklist](../PRODUCTION_TRUTH_CHECKLIST.md) and schema verification.

**Related:** [Commercial packages](./MAGNUS_ACCORD_PACKAGES.md) · [Client feature matrix](./MAGNUS_ACCORD_CLIENT_FEATURE_MATRIX.md) · [Pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) · [Feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md) · [Connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md) · [Action matrix](./MAGNUS_ACCORD_ACTION_MATRIX.md) · [Product positioning](./MAGNUS_ACCORD_PRODUCT_POSITIONING.md) · [Autonomous Ops roadmap](../AUTONOMOUS_OPS_ROADMAP.md) · [Handoff and memory](../AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md) · [Volunteer operations status](../AUTONOMOUS_OPS_VOLUNTEER_STATUS.md)

---

## How to use this map

- **Maturity** answers: “Is this shipped in-repo, pilot-labeled, constrained, missing, or internal-only?”
- **It does not replace** database migration checks, environment validation, or smoke routes. A feature marked **LIVE** still requires correct deployment and often **subscription tier** and **org configuration**.

Eligibility for which **scheduled agents** may run is enforced in subscription policy (`packages/subscription/src/autonomousOpsPolicy.ts`): tier must be **ACTIVE**, and agent names must be allowed for that tier. Cron schedules live in `apps/agents/src/scheduler/cron.ts`.

---

## Taxonomy

| Label | Meaning |
|--------|---------|
| **LIVE** | Implemented in this repository and usable in a correctly configured deployment. May require entitlement (e.g. subscription), org settings, or external API keys. |
| **PILOT** | Exposed with **explicit pilot labeling** in product surfaces, **or** known paths that are **not** production truth (e.g. demo/stub behavior in MCP services per production checklist §4). |
| **LIMITED** | Implemented but **materially constrained** relative to the long-term product story (capabilities are real; expectations must be narrower). |
| **NOT_YET_AVAILABLE** | Not implemented as a product capability in this repo. |
| **INTERNAL_ONLY** | Implemented for **worker-scoped** or operator/engineering use; **not** positioned as a core “headquarters” persona in v1 Autonomous Ops positioning (see roadmap note on worker optimizer). |

---

## Agents (stable `agentName` values)

Names below match what is persisted on runs and alerts. Scheduling and policy determine whether a given org actually runs each agent.

| Agent | Maturity | Notes |
|--------|----------|--------|
| `ComplianceWatchdog` | LIVE | Scheduled nightly. Allowed on **GROWTH** and **ENTERPRISE** when subscription is ACTIVE. |
| `BoardIntelligenceOracle` | LIVE | Scheduled weekly. Allowed on **GROWTH** and **ENTERPRISE** when ACTIVE. |
| `FinancialSentinel` | LIVE | Scheduled daily. **ENTERPRISE** only when ACTIVE. Produces **internal alerts** (watch), not autonomous money movement. |
| `GrantLifecycleManager` | LIVE | Scheduled daily. **ENTERPRISE** only when ACTIVE. |
| `GrantIntelligenceHerald` | LIVE | Scheduled weekly (separate job from grant lifecycle). **ENTERPRISE** only when ACTIVE. Bounded grant intelligence; no autonomous submission. |
| `WorkerIncomeOptimizer` | INTERNAL_ONLY | Scheduled weekly for eligible scopes. **Worker-scoped**; outside the v1 Autonomous Ops persona set for headquarters positioning per roadmap. |

| Capability | Maturity | Notes |
|------------|----------|--------|
| SOLARIS / reflection synthesis agent | NOT_YET_AVAILABLE | Described in roadmap as stage 2+; no implemented agent under that persona. |

---

## Connectors and adjacent applications

| Item | Maturity | Notes |
|------|----------|--------|
| **Claude Partner** (org `claudeStatus` in database) | LIVE | Integration exists; orgs progress through states **NOT_ENABLED**, **CONFIGURING**, **ACTIVE**, **SUSPENDED**. Only **ACTIVE** (and operational claude-partner deployment) represents a fully enabled integration path. |
| **MCP Connector** (as shown in web connectors API) | PILOT | Web API returns **pilot-only** for this connector row. Separately, known MCP services include **demo/stub** behavior—**do not** treat as dashboard or compliance truth; see [production checklist §4](../PRODUCTION_TRUTH_CHECKLIST.md). |
| **Grant Generator** (as shown in web connectors API) | PILOT | Web API returns **pilot-only** until wired to org-scoped product state aligned with dashboard truth. |
| **Worker Financial Layer** (as shown in web connectors API) | PILOT | Web API returns **pilot-only** for this product row. |

---

## Autonomous Ops product surfaces (web and backing APIs)

These are **staff-facing** surfaces in `apps/web` and related APIs, subject to deployment.

| Surface | Maturity | Notes |
|---------|----------|--------|
| Directory and memory (org context files) | LIVE | Five curated kinds; defaults seeded on first read where implemented. |
| Authority rules (autonomy settings) | LIVE | Platform caps apply; safe defaults when unset. |
| Executive board, active obligations, “what matters now” | LIVE | Deterministic summaries from org data. Some “next step” links may target placeholders—treat as **headquarters-style visibility**, not a guarantee that every deep link is a finished workflow screen. |
| Control tower / portfolio accountability | LIVE | Rollups and semantics; oriented to operators and accountable visibility. |
| Donor operations module (ledger + executive signals) | LIVE | Tied to **DonorEvent** and org Stripe linkage rules in context services. |
| Volunteer operations module | LIVE | **Time ledger only**; not roster, in-kind valuation, or scheduling truth—see [volunteer status](../AUTONOMOUS_OPS_VOLUNTEER_STATUS.md). |

---

## Memory tiers

| Tier | Maturity | Notes |
|------|----------|--------|
| Tier 1 — operational memory | LIVE | Append-only log with disclaimers. |
| Tier 2 — curated memory | LIVE | Structured items with curation rules. |
| Tier 3 — semantic chunks | LIMITED | Chunks and search exist; search uses **case-insensitive substring** matching until embeddings and vector search are implemented; responses carry **semantic readiness** disclaimers per handoff/memory doc. |

---

## Refusal language (do not overstate)

- **MCP Connector** paths documented as mock/in-memory/random in the production checklist are **not** client financial or compliance authority.
- **Agents** do **not** autonomously submit grants, file forms, or send external mail—see roadmap autonomy section.
- **Volunteer** module does **not** imply deduplicated people, in-kind valuation, or attendance systems—see volunteer status doc.
