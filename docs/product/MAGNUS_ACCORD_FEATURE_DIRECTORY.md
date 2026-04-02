# Magnus Accord — feature directory

This directory lists **capabilities** and whether they are **client-facing in the pilot web app**, **implemented for APIs/operators only**, or **not available**. It complements [commercial packages](./MAGNUS_ACCORD_PACKAGES.md), [client feature matrix](./MAGNUS_ACCORD_CLIENT_FEATURE_MATRIX.md), the [connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md), [pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md), and [maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md).

**Rules used here**

- **Client-facing pilot:** Staff can use it via **`apps/web`** authenticated routes without calling `org-dashboard-api` directly.
- **Implemented but internal:** Exists in repo (often `org-dashboard-api` or `apps/agents`) but **not** a first-class **web** experience for the pilot—or is **operator/engineering** only.
- **Pilot-supported integration:** Shown in product with **pilot** labeling or known non-truth paths; not a **fully self-serve** connector product.
- **Fully self-serve connector (target):** Org-scoped configuration and status in product, aligned with dashboard truth—not claimed for MCP/grant-gen/worker-financial in the current pilot.

---

## Personas and agents (implementation names)

| Persona (roadmap) | Implementation (`agentName`) | Client pilot HQ promise |
|-------------------|----------------------------|-------------------------|
| STEWARD | `ComplianceWatchdog` | Yes (GROWTH+) |
| ORACLE | `BoardIntelligenceOracle` | Yes (GROWTH+) |
| SENTINEL | `FinancialSentinel` | ENTERPRISE only; heavy data/env caveats |
| HERALD (grant lifecycle) | `GrantLifecycleManager` | ENTERPRISE; not submission |
| HERALD (grant intelligence) | `GrantIntelligenceHerald` | ENTERPRISE; bounded prep |
| (worker scope) | `WorkerIncomeOptimizer` | **No** for HQ pilot positioning |
| SOLARIS | — | **Not implemented** |

---

## Web surfaces (`apps/web`)

| Feature | Client-facing pilot | Notes |
|---------|---------------------|--------|
| Autonomous Ops — Directory and memory | Yes | Raw markdown / `NOT_CONFIGURED` chips |
| Autonomous Ops — Connectors | Yes | Registry-driven panels; Claude from DB + **PILOT_ONLY** rows |
| Autonomous Ops — Authority rules | Yes | JSON for enabled agents when row exists |
| Autonomous Ops — Executive | Yes | Obligations, what matters, module states, financial summary strip |
| Autonomous Ops — Control tower | Yes | Rollups; nav may say “Audit” |
| Dashboard onboarding card | Yes | Links only—thin onboarding |
| Marketing landing, tools, book-audit | Yes | Not Autonomous Ops–specific |
| Alert list, alert history, resolve/assign in UI | **No** | API on `org-dashboard-api` |
| Handoff inbox, handoff audit browser | **No** | API + rollups only |
| Donor events UI | **No** | API only |
| Volunteer events UI | **No** | API only |

---

## Backend capabilities (`org-dashboard-api` and packages)

| Feature | Client-facing pilot | Notes |
|---------|---------------------|--------|
| Org overview, compliance calendar, grants read | Partial | Used by agents/orchestration; not all exposed as dedicated web pages |
| Identity files CRUD | Via web proxy API | Web has directory view |
| Memory tiers (operational, curated, semantic chunk) | Partial | Directory + APIs; semantic search **keyword-limited** |
| Handoffs + handoff audit | Internal / API | Rollup counts in Control tower |
| Alert lifecycle (transition, owner) | Internal / API | JWT routes |
| Control tower summary | Via web proxy | |
| Executive / obligations payloads | Via web proxy | |
| Donor events API | Internal / API | |
| Volunteer events API | Internal / API | Time ledger scope per volunteer status doc |

---

## Connectors

Canonical fields (maturity, actions, approval, disclaimers) live in the [connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md) and in code (`packages/org-autonomous-ops-context/src/connectorRegistry.ts`).

| Connector | Client sees in web | Classification |
|-----------|--------------------|----------------|
| Claude Partner | Yes (registry panel + status from DB) | **LIMITED** in registry; enablement depends on deployment |
| MCP Connector | Yes (`PILOT_ONLY`) | **Pilot**; not production truth for finance/compliance |
| Grant Generator | Yes (`PILOT_ONLY`) | **Pilot-supported integration** |
| Worker Financial Layer | Yes (`PILOT_ONLY`) | **Pilot-supported integration** |
| Plaid, Candid, Stripe linkage, Magnus HQ, Slack | Per registry | Mostly **INTERNAL_ONLY** / **NOT_IMPLEMENTED**; see registry table |

---

## Guardrails and approvals

| Feature | Client-facing pilot | Notes |
|---------|---------------------|--------|
| View max autonomy tier and settings | Yes | Rules page |
| Tier B/C “approval UX” for external actions | **No** | Agents do not perform those actions autonomously today |
| `requiresHumanReview` visibility | Partial | Counts on Control tower; no triage UI |

---

## Audit and accountability

| Feature | Client-facing pilot | Notes |
|---------|---------------------|--------|
| Rollups (alerts, runs, handoffs, compliance) | Yes | Control tower |
| Per-alert audit story in browser | **No** | |
| Export audit package | **No** | |

---

## Maintenance

When adding a web route or API, update this directory and the [pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) if the **pilot boundary** changes.
