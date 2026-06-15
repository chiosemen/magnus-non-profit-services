# Magnus Accord — client sales sheet & landing copy (repo-truth pilot)

**Audience:** nonprofit leadership and operations buyers evaluating a **pilot**.  
**Rule:** this copy is **not** a performance claim, case study, or logo slide. It matches [commercial packages](./MAGNUS_ACCORD_PACKAGES.md), [pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md), and [feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md).

---

## Headline (options — pick one)

**A (default pilot):** Magnus Accord — Assisted Ops Pilot: internal watch, board prep, and operator visibility—without autonomous external action.

**B (enterprise expansion):** Magnus Accord — HQ Expansion: add financial watch and grant monitoring signals on top of Assisted Ops—still internal, still bounded.

---

## One-paragraph platform description

Magnus Accord is a **bounded operations layer** for nonprofits: scheduled **internal** agents and staff-facing surfaces **watch calendars and signals, draft internal prep, surface obligations, and route attention**—while **people retain authority** over anything external or irreversible (email on behalf of the org, filings, submissions, money movement). The pilot is delivered through an authenticated web app with explicit pilot labeling; some adjacent connector rows are **pilot-only** and must not be read as full self-serve integrations or external systems of record.

---

## Packages (what you are buying)

| Offer | Subscription (truthful gate) | What it adds |
| --- | --- | --- |
| **Assisted Ops Pilot** | **ACTIVE** org; **GROWTH** (or higher) for these agents | Core scheduled agents + core Autonomous Ops surfaces |
| **HQ Expansion** | **ACTIVE** org; **ENTERPRISE** | Adds financial watch + grant monitoring / bounded grant prep agents |

`STARTER` does **not** receive these scheduled agents under current subscription policy (`packages/subscription/src/autonomousOpsPolicy.ts`).

---

## Scheduled agents (implementation names)

**Count:** The nonprofit HQ story is **2 agents** (Assisted Ops) plus **3 additional agents** on Enterprise (HQ Expansion) = **5** scheduled implementations at full Enterprise scope, excluding `WorkerIncomeOptimizer` from the default HQ pilot promise. If an external brief asks for “four launch agents,” reconcile to this table—**four is not a repo-aligned package count.**

Agents below are **real scheduled implementations** in-repo; eligibility depends on subscription tier and deployment.

### Assisted Ops Pilot — included agents (2)

| Agent | Plain-language role |
| --- | --- |
| `ComplianceWatchdog` | Internal compliance calendar and related **internal alerts** (watch). |
| `BoardIntelligenceOracle` | Board / executive **prep** and digest-style **internal** outputs. |

### HQ Expansion (Enterprise) — additional agents (+3)

Adds to Assisted Ops:

| Agent | Plain-language role |
| --- | --- |
| `FinancialSentinel` | Internal financial and grant-pace **alerts only**—no money movement. |
| `GrantLifecycleManager` | Grant lifecycle **monitoring / internal** signals. |
| `GrantIntelligenceHerald` | Bounded grant **intelligence / prep**—**no autonomous submission**. |

### Not part of the nonprofit HQ pilot promise

- `WorkerIncomeOptimizer` exists as a **worker-scoped** internal scaffold; it is not scheduled by nonprofit subscription tier and is not a headquarters pilot commitment ([maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md)).

### Not implemented

- **SOLARIS / reflection synthesis agent** — **not implemented** ([feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md)).

---

## Command center, executive visibility, and active obligations

In the pilot web app, staff get **deterministic visibility** (not a forecast product):

- **Executive** (`/app/autonomous-ops/executive`): module attention, “what matters now,” and **derived active obligations** from internal sources (alerts, handoffs, compliance calendar) with explicit limitations on deep links.
- **Control tower / accountability** (`/app/autonomous-ops/control-tower`): rollups (alerts, runs, handoffs, compliance counts). Navigation may say **Audit**—meaning **accountability visibility**, not a full audit workflow product ([pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md)).

---

## Approvals and guardrails (what “approval” means here)

- Autonomous agent behavior today is **Tier A–style internal side effects only**: persist runs, alerts, handoffs, and internal artifacts.
- The product **does not** autonomously send email, file government forms, submit grants, or move money ([pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md)).
- There is **no** dedicated staff **approval inbox** in the pilot web app for Tier B external actions—because agents are not performing those external actions autonomously today.
- Human review is represented as **flags and auditable internal workflow evidence** (e.g., handoff audit entries), not a bank-grade external authorization product ([approval traceability](./MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md)).

---

## Audit trail / governance (honest scope)

- **Included in pilot positioning:** visibility, rollups, and persistence of internal records (indirectly visible through executive/control tower aggregates).
- **Not included as a client workstation:** a full browser audit timeline for every alert, export audit pack, or complete triage UX ([pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md)).
- **APIs exist** for deeper operator workflows on `org-dashboard-api`; that is **not** the same as a finished client product UI for every workflow.

---

## Supported pilot connectors (client-visible panels)

The Connectors page shows **honest status** from the in-repo registry plus runtime status where available ([connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md)).

**Client-visible panels (web):**

- **Claude Partner** — status reflects `Organization.claudeStatus` (e.g., NOT_ENABLED / CONFIGURING / ACTIVE / SUSPENDED). **Enabling** the integration depends on deployment and configuration work outside a pure self-serve claim.

**Internal / not public panels:** MCP is operator-only; grant drafting is an AI Concierge capability first; worker financial is deferred/scaffolded. Do not market them as self-serve connectors.

---

## Donor and volunteer signals (ledger-first; not a full ops suite)

- Donor and volunteer **event APIs** exist on `org-dashboard-api` for append/list patterns.
- There are **no first-class donor/volunteer ledger browsing or ingestion pages** in `apps/web` in the pilot ([feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md)).
- Volunteer operations are **time-ledger scoped** in product semantics; do not claim roster, in-kind valuation, or scheduling as product truth ([volunteer status](../AUTONOMOUS_OPS_VOLUNTEER_STATUS.md)).

---

## Memory and reflection (do not oversell)

- Operational and curated memory tiers exist with explicit disclaimers.
- Tier 3 semantic memory search is **keyword/substring limited** until an embedding pipeline exists ([maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md)).
- **SOLARIS / reflection synthesis is not implemented**—do not market reflection as a live product module.

---

## Pilot-only caveat section (paste near footer)

1. **Pilot labeling** refers to program and surface maturity; it does not replace deploy validation ([production checklist](../PRODUCTION_TRUTH_CHECKLIST.md)).
2. **MCP / worker financial** are not public beta features or authoritative financial/compliance records.
3. **Executive “next steps”** may include placeholder destinations; value is **visibility**, not a finished task system for every link.
4. **HQ Expansion** outcomes depend on configuration and data; expect honest **not configured / insufficient data** states until prerequisites exist.
5. **No autonomous outbound communications, filings, submissions, or money movement.**

---

## Call to action (pilot)

**Primary CTA:** Request the **Magnus Accord — Assisted Ops Pilot** walkthrough: subscription eligibility, deployment prerequisites, org context setup, and a guided review of Executive + Control tower visibility.

**Secondary CTA (enterprise):** If you need financial watch and grant monitoring signals, scope **HQ Expansion** explicitly with configuration prerequisites and data dependencies—still **no autonomous submission**.

---

## Optional: minimal landing page section order

1. Headline + subhead (internal-only autonomy; no external send)
2. Who it’s for (nonprofit ops + leadership visibility)
3. Two-package diagram (Assisted Ops vs HQ Expansion)
4. Agents (tables above)
5. Screens narrative: Directory → Readiness → Connectors → Executive → Control tower
6. Approvals & guardrails (Tier A; no approval product)
7. Connectors (Claude real status; internal-only boundaries stated)
8. Caveats block
9. Pilot CTA

---

## Claim-to-source mapping

See [MAGNUS_ACCORD_CLIENT_COPY_SOURCE_MAP.md](./MAGNUS_ACCORD_CLIENT_COPY_SOURCE_MAP.md).
