# Magnus Accord — pilot launch package (canonical)

This document is the **official in-repo definition** of what the **pilot launch set** includes and excludes. It is written for **business and operator** readers and is grounded in this repository’s behavior—not a sales brief.

**Related:** [Feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md) · [Product positioning](./MAGNUS_ACCORD_PRODUCT_POSITIONING.md) · [Maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md) · [Production truth checklist](../PRODUCTION_TRUTH_CHECKLIST.md) · [Autonomous Ops roadmap](../AUTONOMOUS_OPS_ROADMAP.md)

---

## 1. Launch package name

| Offering | When to use |
|----------|-------------|
| **Magnus Accord — Assisted Ops Pilot** | Smallest coherent pilot: **GROWTH** subscription, **ACTIVE** org. Emphasizes compliance + board-prep **watch** agents only. |
| **Magnus Accord — Autonomous Ops Headquarters Pilot** | Broader pilot: **ENTERPRISE** subscription, **ACTIVE** org. Adds financial watch, grant lifecycle, and grant intelligence agents—**with the caveats in §8**. |

Both pilots use the **pilot-labeled** protected web app (`apps/web`) and the same **client-facing Autonomous Ops surfaces** listed in §3. The difference is **which scheduled agents** subscription policy allows (`packages/subscription/src/autonomousOpsPolicy.ts`).

---

## 2. Included agents

Eligibility requires subscription **ACTIVE** and, for runs, the **agents service** enabled and correctly deployed (`apps/agents`, `AGENTS_ENABLED` where used).

### Assisted Ops Pilot (GROWTH)

| Agent (stable name) | Role (plain language) |
|---------------------|------------------------|
| `ComplianceWatchdog` | Internal compliance calendar and related **internal alerts** (STEWARD-style watch). |
| `BoardIntelligenceOracle` | Board / executive **prep** and digest-style **internal** outputs (ORACLE). |

### Autonomous Ops Headquarters Pilot (ENTERPRISE) — adds

| Agent (stable name) | Role (plain language) |
|---------------------|------------------------|
| `FinancialSentinel` | **Internal** financial and grant-pace **alerts** only—no money movement (SENTINEL). |
| `GrantLifecycleManager` | Grant lifecycle **monitoring / internal** signals (scheduled daily). |
| `GrantIntelligenceHerald` | Bounded grant **intelligence / prep** (scheduled weekly)—**no** autonomous submission (HERALD). |
| `WorkerIncomeOptimizer` | **Worker-scoped** automation—**not** part of the nonprofit **headquarters** promise for the pilot; treat as **internal / adjacent** (see [maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md)). |

**Not included as agents:** reflection / SOLARIS-style synthesis agent (**not implemented**).

---

## 3. Included client-facing surfaces

These are routes under the **authenticated** web app (`/app/...`) that staff can open in a browser **without** using APIs directly:

| Surface | Path (approx.) | Purpose |
|---------|----------------|---------|
| Dashboard (onboarding links) | `/app` | Links into Autonomous Ops setup areas. |
| Directory and memory | `/app/autonomous-ops/directory` | Org context files (`ORG_IDENTITY`, `ORG_SOUL`, `ORG_AGENTS`, `ORG_MEMORY`, `ORG_HEARTBEAT`). |
| Connectors (“operating doors”) | `/app/autonomous-ops/connectors` | Honest integration **status** view. |
| Authority rules | `/app/autonomous-ops/rules` | Org autonomy settings (max tier, enabled agents JSON) when present; platform caps explained. |
| Executive | `/app/autonomous-ops/executive` | “What matters now,” module attention, obligations (derived), financial **summary** strip (alerts + grants—**not** a forecast). |
| Control tower / accountability | `/app/autonomous-ops/control-tower` | Rollups (alerts, runs, handoffs, compliance counts). Nav may label this **Audit**—meaning **accountability visibility**, not a full audit **workflow** product. |

**Implemented but not client-facing in web:** donor event and volunteer event **APIs** on `org-dashboard-api` (no matching first-class pages in `apps/web` for ingestion or ledger browsing). See [feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md).

---

## 4. Included approval / guardrail behavior

| Behavior | Pilot truth |
|----------|-------------|
| **Platform autonomy tiers** | Documented in the roadmap (A / B / C). Org settings **cannot** exceed platform caps (`maxAutonomyTier` on org settings when configured). |
| **What agents do autonomously today** | **Tier A–style internal side effects only**: persist runs, alerts, handoffs, internal artifacts. They **do not** autonomously send email, file government forms, submit grants, or move money ([roadmap](../AUTONOMOUS_OPS_ROADMAP.md)). |
| **Human review flags** | Alerts and handoffs can carry **requires human review** semantics in data and services. |
| **Staff “approval product” in the browser** | **Not included** in the pilot: there is **no** dedicated web **inbox** to triage handoffs or a guided **approve/reject** flow for Tier B external actions—because agents are not performing those external actions autonomously today. |

---

## 5. Included audit features

| Capability | Client pilot (web) | Internal / API |
|------------|-------------------|------------------|
| **Persistence of runs and alerts** | Indirectly visible via Executive and Control tower **aggregates** | Full records in database; `AgentRun`, `Alert` |
| **Handoff audit trail** | Rollup **counts** on Control tower | Append-only audit API on `org-dashboard-api` per handoff |
| **Alert lifecycle (status, owner)** | **Not** a first-class web product in pilot | **Implemented** on `org-dashboard-api` (JWT org scope)—e.g. transition and owner routes |
| **Export / formal audit pack** | **Not included** | — |

**Plain language:** the pilot offers **visibility and rollups**, not a **complete client audit workstation** in the web app.

---

## 6. Connectors by tier

Authoritative per-connector actions, maturity, approval flags, and disclaimers: [MAGNUS_ACCORD_CONNECTOR_REGISTRY.md](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md) (and `connectorRegistry.ts`).

### Available now (self-serve visibility in product)

| Connector | Pilot truth |
|-----------|-------------|
| **Claude Partner** | Org `claudeStatus` in the database (`NOT_ENABLED`, `CONFIGURING`, `ACTIVE`, `SUSPENDED`). The Connectors page reflects that state. **Enabling** the integration still depends on deploying and configuring the Claude partner service and credentials—outside this document. |

### Pilot integration only (not dashboard truth; not fully self-serve product connectors)

| Connector | Pilot truth |
|-----------|-------------|
| **MCP Connector** | Web API returns **pilot-only** for this row. Known MCP paths include **demo/stub** behavior—**must not** be sold as production compliance or financial **truth** ([production checklist §4](../PRODUCTION_TRUTH_CHECKLIST.md)). |
| **Grant Generator** | Web API returns **pilot-only** until org-scoped product state matches dashboard truth. |
| **Worker Financial Layer** | Web API returns **pilot-only** for this product row. |

### Later (not promised in this pilot)

- **Fully self-serve** connector onboarding and health **for all** adjacent apps with org-scoped, DB-backed status aligned to executive modules.
- **Authoritative** financial/compliance narratives sourced from MCP **without** the stub caveats above.

---

## 7. Excluded features / not offered yet

- Autonomous **outbound email** or messaging on behalf of the org.
- Autonomous **grant submission** or **government filing**.
- **Moving money** or mutating **authoritative** external financial records via agents.
- **MCP demo/stub** outputs as **client** financial or compliance **authority**.
- **SOLARIS** / reflection synthesis agent.
- **True semantic / vector** memory as the client story (keyword-only search until embeddings pipeline exists).
- **Volunteer roster, in-kind valuation, scheduling** as ledger truth ([volunteer status](../AUTONOMOUS_OPS_VOLUNTEER_STATUS.md)).
- **Complete** web **audit workstation** (alert history browser, resolution UX, handoff triage UI, export pack).
- **Donor / volunteer ledger** staff UIs in `apps/web` (APIs exist separately).

---

## 8. Explicit caveats (bounded functionality)

1. **Deploy and database:** Pilot readiness requires migrations, env validation, and smoke checks per the [production truth checklist](../PRODUCTION_TRUTH_CHECKLIST.md)—not assumed from feature list alone.
2. **Subscription:** **STARTER** has **no** scheduled Autonomous Ops agents under current policy.
3. **Executive “next steps”:** Some links may point to **placeholder** or **unimplemented** destinations in this repo; the value is **visibility**, not a finished task UI for every link.
4. **Financial strip on Executive:** Subtitle states **alerts + grants only**; it is **not** a financial **projection** or forecast product.
5. **SENTINEL / HERALD (ENTERPRISE):** Outcomes depend on **configuration and data** (e.g. external APIs, Plaid)—expect honest **not configured / insufficient data / unavailable** style outcomes in product semantics.
6. **Semantic memory:** Tier 3 search is **limited** to substring/keyword behavior until embedding-backed search exists.
7. **Worker agent:** Do not describe `WorkerIncomeOptimizer` as part of the **nonprofit HQ** pilot promise unless you explicitly expand scope and caveats.

---

## Pilot package recommendation (summary)

- **Default smallest sellable pilot:** **Assisted Ops Pilot (GROWTH)** — §2 first table + §3 surfaces + §§4–6 as written.
- **Expanded pilot:** **Autonomous Ops Headquarters Pilot (ENTERPRISE)** — add §2 second table agents with §8 caveats.

**GO / NO-GO:** **GO** to treat this file as the canonical **pilot launch set** definition in-repo. **NO-GO** to claim **full** client audit or approval **workflows** in the web app without additional UI (or a contracted API-only professional scope).
