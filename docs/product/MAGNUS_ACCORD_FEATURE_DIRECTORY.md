# Magnus Accord — feature directory

This directory lists **capabilities** and whether they are **client-facing in the pilot web app**, **implemented for APIs/operators only**, or **not available**. It complements [commercial packages](./MAGNUS_ACCORD_PACKAGES.md), [client feature matrix](./MAGNUS_ACCORD_CLIENT_FEATURE_MATRIX.md), the [connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md), [pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md), and [maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md).

Current status as of 2026-06-11: **Production Certification: Not Yet Approved**. This directory is a pilot/staging truth map, not a GA launch claim.

**Rules used here**

- **Live:** Implemented and available in the current repo surface, still subject to P0 production gates.
- **Pilot:** Available only in controlled pilot/staging framing.
- **Gated:** Code path exists but requires feature flags, environment configuration, or explicit operator enablement.
- **Scaffolded:** Repo structure exists, but it is not a self-serve product capability.
- **Deferred:** Not shipped.
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

| Feature | Status | Client-facing pilot | Notes |
|---------|--------|---------------------|--------|
| Autonomous Ops — Directory and memory | Pilot | Yes | Raw markdown / `NOT_CONFIGURED` chips |
| Autonomous Ops — Connectors | Pilot | Yes | Registry-driven panels; Claude status from DB. MCP/grant-generator/worker-financial are not client-visible panels. |
| Autonomous Ops — Authority rules | Pilot | Yes | JSON for enabled agents when row exists |
| Autonomous Ops — Executive | Pilot | Yes | Obligations, what matters, module states, financial summary strip |
| Autonomous Ops — Control tower | Pilot | Yes | Rollups; nav may say “Audit” |
| Dashboard onboarding card | Pilot | Yes | Links only; thin onboarding |
| Marketing landing, tools, book-audit | Live | Yes | Not Autonomous Ops-specific; not a production certification signal |
| Mobile app | Deferred | No | No shipped mobile app is claimed until source, auth, tests, and release path exist |
| Alert list, alert history, resolve/assign in UI | Scaffolded | No | API on `org-dashboard-api` |
| Handoff inbox, handoff audit browser | Scaffolded | No | API + rollups only |
| Donor events UI | Scaffolded | No | API only |
| Volunteer events UI | Scaffolded | No | API only |

---

## Backend capabilities (`org-dashboard-api` and packages)

## Subscription feature keys

Feature keys are exact entitlements; tier bundles are collections of those keys.

| Feature key | Minimum public tier | Public scope |
|-------------|---------------------|--------------|
| `donor_crm` | STARTER | Donors, manual donations, receipts/import records |
| `campaigns` | STARTER | Basic campaign admin |
| `stripe_connect_campaigns` | GROWTH | Stripe Connect onboarding/readiness and campaign payment publishing |
| `fund_accounting_lite` | GROWTH | Fund accounting lite and reports |
| `compliance_reminders` | GROWTH | Compliance reminder CRUD/status workflows |
| `ai_concierge` | GROWTH | Limited AI Concierge pilot workflows |
| `board_packets` | GROWTH | Board/executive packet drafts |
| `grant_generator` | GROWTH | Internal AI Concierge / grant drafting pilot capability |
| `mcp_tools` | Internal only | Operator-only; not public tiered |
| `worker_financial_layer` | Not public | Internal scaffold/deferred |

Legacy platform keys such as `autonomous_ops_assisted`, `autonomous_ops_standard`, and `agents_layer` remain for scheduled-agent policy and should not replace the product feature keys above.

| Feature | Status | Client-facing pilot | Notes |
|---------|--------|---------------------|--------|
| Org overview, compliance calendar, grants read | Pilot | Partial | Used by agents/orchestration; not all exposed as dedicated web pages |
| Identity files CRUD | Pilot | Via web proxy API | Web has directory view |
| Memory tiers (operational, curated, semantic chunk) | Pilot | Partial | Directory + APIs; semantic search **keyword-limited** |
| Handoffs + handoff audit | Scaffolded | Internal / API | Rollup counts in Control tower |
| Alert lifecycle (transition, owner) | Scaffolded | Internal / API | JWT routes |
| Control tower summary | Pilot | Via web proxy | |
| Executive / obligations payloads | Pilot | Via web proxy | |
| Donor events API | Scaffolded | Internal / API | |
| Volunteer events API | Scaffolded | Internal / API | Time ledger scope per volunteer status doc |

---

## Connectors

Canonical fields (maturity, actions, approval, disclaimers) live in the [connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md) and in code (`packages/org-autonomous-ops-context/src/connectorRegistry.ts`).

| Connector | Status | Client sees in web | Classification |
|-----------|--------|--------------------|----------------|
| Claude Partner | Gated | Yes (registry panel + status from DB) | **LIMITED** in registry; enablement depends on deployment |
| MCP Connector | Internal / operator-only | No | Block public exposure until permissions, audit redaction, rate limiting, and staging smoke are proven |
| Grant Generator | Internal / AI Concierge | No standalone panel | Gated behind AI Concierge / grant drafting pilot capability |
| Worker Financial Layer | Scaffolded / deferred | No | Must stay `FEATURE_NOT_CONFIGURED`, omitted, or isolated from public claims |
| Plaid, Candid, Stripe linkage, Magnus HQ, Slack | Gated / deferred | Per registry | Mostly **INTERNAL_ONLY** / **NOT_IMPLEMENTED**; see registry table |

---

## Guardrails and approvals

| Feature | Status | Client-facing pilot | Notes |
|---------|--------|---------------------|--------|
| View max autonomy tier and settings | Pilot | Yes | Rules page |
| Tier B/C approval UX for external actions | Deferred | No | Agents do not perform those actions autonomously today |
| `requiresHumanReview` visibility | Scaffolded | Partial | Counts on Control tower; no triage UI |

---

## Audit and accountability

| Feature | Status | Client-facing pilot | Notes |
|---------|--------|---------------------|--------|
| Rollups (alerts, runs, handoffs, compliance) | Pilot | Yes | Control tower |
| Per-alert audit story in browser | Deferred | No | |
| Export audit package | Deferred | No | |

---

## Maintenance

When adding a web route or API, update this directory and the [pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) if the **pilot boundary** changes.
